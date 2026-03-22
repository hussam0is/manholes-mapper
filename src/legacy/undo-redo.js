/**
 * undo-redo.js
 *
 * Extracted undo/redo system, dangling-edge helpers, and shared
 * delete logic from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 */

import { S, F } from './shared-state.js';

// Convenience wrapper so calls inside this module look like plain t() calls
const t = (...args) => F.t(...args);

// ── Constants ────────────────────────────────────────────────────────────────
const UNDO_STACK_MAX = 50;

// ── Undo / Redo stack operations ─────────────────────────────────────────────

export function pushUndo(action) {
  S.undoStack.push(action);
  if (S.undoStack.length > UNDO_STACK_MAX) S.undoStack.shift();
  // New action forks the timeline — clear redo
  S.redoStack.length = 0;
  updateUndoButton();
  updateRedoButton();
}

/** Push directly onto undo stack without clearing redo (used by performRedo). */
export function pushUndoDirect(action) {
  S.undoStack.push(action);
  if (S.undoStack.length > UNDO_STACK_MAX) S.undoStack.shift();
  updateUndoButton();
}

/** Clear the undo and redo stacks (on sketch load/new/switch). */
export function clearUndoStack() {
  S.undoStack.length = 0;
  S.redoStack.length = 0;
  updateUndoButton();
  updateRedoButton();
}

/** Enable/disable the undo button based on stack state. */
export function updateUndoButton() {
  if (S.undoBtn) {
    S.undoBtn.disabled = S.undoStack.length === 0 || !!window.__sketchReadOnly;
  }
}

/** Enable/disable the redo button based on stack state. */
export function updateRedoButton() {
  if (S.redoBtn) {
    S.redoBtn.disabled = S.redoStack.length === 0 || !!window.__sketchReadOnly;
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

/**
 * Deep-copy a node or edge for undo storage.
 */
export function deepCopyObj(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ── Data-value checks ────────────────────────────────────────────────────────

/** Check if a node has valuable GNSS data (Fixed or Device Float). */
export function nodeHasValuableData(node) {
  return node && (node.gnssFixQuality === 4 || node.gnssFixQuality === 5);
}

/** Check if an edge has measurement data (in/out). */
export function edgeHasValuableData(edge) {
  return edge && (
    (edge.tail_measurement && String(edge.tail_measurement).trim() !== '') ||
    (edge.head_measurement && String(edge.head_measurement).trim() !== '')
  );
}

// ── Shared delete helpers ────────────────────────────────────────────────────

/**
 * Delete a node with smart edge preservation.
 * Connected edges become dangling (open-ended) instead of being removed,
 * unless both ends would be null.
 * @param {object} node - The node to delete
 * @param {boolean} pushToUndo - Whether to push an undo action (default true)
 * @returns {boolean} true if deleted, false if cancelled
 */
export function deleteNodeShared(node, pushToUndo = true, skipConfirm = false) {
  const nodeIdStr = String(node.id);
  const connectedEdges = S.edges.filter(e =>
    String(e.tail) === nodeIdStr || String(e.head) === nodeIdStr
  );

  if (!skipConfirm) {
    // Build a detailed confirmation listing what will be lost
    const dataLost = [];
    if (node.note) dataLost.push(t('confirms.dataNote') || 'Note');
    if (node.surveyX || node.surveyY) dataLost.push(t('confirms.dataSurvey') || 'Survey coordinates');
    if (node.maintenanceStatus) dataLost.push(t('confirms.dataMaintenance') || 'Maintenance status');
    if (node.material) dataLost.push(t('confirms.dataMaterial') || 'Material');
    if (node.coverDiameter || node.coverShape) dataLost.push(t('confirms.dataCover') || 'Cover info');
    if (connectedEdges.length > 0) dataLost.push((t('confirms.dataEdges') || 'Connected edges') + ` (${connectedEdges.length})`);

    let msg;
    if (dataLost.length > 0) {
      msg = (t('confirms.deleteNodeDetailed') || 'Delete node {id}? The following data will be lost:')
        .replace('{id}', node.id)
        + '\n\n• ' + dataLost.join('\n• ');
    } else if (connectedEdges.length > 0) {
      msg = t('confirms.deleteNodeWithEdges');
    } else {
      msg = (t('confirms.deleteNode') || 'Delete this node?');
    }
    if (!confirm(msg)) return false;
  }

  const removedEdges = []; // edges fully removed (both ends would be null)
  const convertedEdges = []; // edges converted to dangling

  for (const edge of connectedEdges) {
    const isTail = String(edge.tail) === nodeIdStr;
    const isHead = String(edge.head) === nodeIdStr;

    // Check if the OTHER end is also null/missing — if so, remove entirely
    const otherEnd = isTail ? edge.head : edge.tail;
    const otherIsNull = otherEnd == null;

    if (otherIsNull) {
      // Both ends would be null — remove edge entirely
      removedEdges.push(deepCopyObj(edge));
    } else {
      // Convert to dangling — save old state for undo
      const oldState = {
        edgeId: edge.id,
        wasTail: isTail,
        oldTail: edge.tail,
        oldHead: edge.head,
        oldIsDangling: edge.isDangling,
        oldDanglingEndpoint: edge.danglingEndpoint ? { ...edge.danglingEndpoint } : null,
        oldTailPosition: edge.tailPosition ? { ...edge.tailPosition } : null,
      };
      convertedEdges.push(oldState);

      // Convert the edge to dangling
      if (isTail) {
        // Node was tail — set tail to null, store position
        edge.tailPosition = { x: node.x, y: node.y };
        edge.tail = null;
      } else {
        // Node was head — set head to null, store position
        edge.danglingEndpoint = { x: node.x, y: node.y };
        edge.head = null;
      }
      edge.isDangling = true;
    }
  }

  // Remove fully-dead edges
  const removedEdgeIds = new Set(removedEdges.map(e => e.id));
  S.edges = S.edges.filter(e => !removedEdgeIds.has(e.id));

  // Remove the node
  S.nodes = S.nodes.filter(n => n !== node);
  S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;

  if (pushToUndo) {
    // Push undo action with all info needed to restore
    pushUndo({
      type: 'nodeDelete',
      node: deepCopyObj(node),
      removedEdges,
      convertedEdges,
    });
  }

  // Clear selection if deleted node was selected
  if (S.selectedNode && String(S.selectedNode.id) === nodeIdStr) {
    S.selectedNode = null;
    S.selectedEdge = null;
    F.renderDetails();
  }

  F.computeNodeTypes();
  updateIncompleteEdgeTracker();
  F.saveToStorage();
  F.updateCanvasEmptyState();
  F.scheduleDraw();
  F.showToast(t('toasts.nodeDeleted'));
  return true;
}

/**
 * Delete an edge.
 * @param {object} edge - The edge to delete
 * @param {boolean} pushToUndo - Whether to push an undo action (default true)
 * @returns {boolean} true if deleted, false if cancelled
 */
export function deleteEdgeShared(edge, pushToUndo = true, skipConfirm = false) {
  if (!skipConfirm && !confirm(t('confirms.deleteEdge'))) return false;

  if (pushToUndo) {
    pushUndo({ type: 'edgeDelete', edge: deepCopyObj(edge) });
  }

  S.edges = S.edges.filter(e => e !== edge);

  if (S.selectedEdge && S.selectedEdge.id === edge.id) {
    S.selectedEdge = null;
    S.selectedNode = null;
    F.renderDetails();
  }

  F.computeNodeTypes();
  updateIncompleteEdgeTracker();
  F.saveToStorage();
  F.scheduleDraw();
  F.showToast(t('toasts.edgeDeleted'));
  return true;
}

// ── Perform Undo / Redo ──────────────────────────────────────────────────────

/**
 * Perform the undo of the last action on the stack.
 * Shows confirmation dialog if the item contains valuable data.
 * Pushes a corresponding redo action onto the redo stack.
 */
export function performUndo() {
  if (S.undoStack.length === 0) {
    F.showToast(t('toasts.undoEmpty'));
    return;
  }
  const action = S.undoStack[S.undoStack.length - 1];

  if (action.type === 'nodeCreate') {
    const node = S.nodes.find(n => String(n.id) === String(action.nodeId));
    if (!node) { S.undoStack.pop(); updateUndoButton(); return; }
    const connectedEdges = S.edges.filter(e =>
      String(e.tail) === String(action.nodeId) || String(e.head) === String(action.nodeId)
    );
    const hasValuable = nodeHasValuableData(node) ||
      connectedEdges.some(e => edgeHasValuableData(e));
    if (hasValuable) {
      if (!confirm(t('confirms.undoNodeWithData'))) return;
    }
    // Save for redo before removing
    const redoAction = {
      type: 'nodeRestore',
      node: deepCopyObj(node),
      edges: connectedEdges.map(e => deepCopyObj(e)),
    };
    // Remove node and connected edges
    const removedEdgeIds = new Set(connectedEdges.map(e => e.id));
    S.nodes = S.nodes.filter(n => n !== node);
    S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
    S.edges = S.edges.filter(e => !removedEdgeIds.has(e.id));
    S.undoStack.pop();
    // Clean stale edge undo entries from the stack
    for (let i = S.undoStack.length - 1; i >= 0; i--) {
      if (S.undoStack[i].type === 'edgeCreate' && removedEdgeIds.has(S.undoStack[i].edgeId)) {
        S.undoStack.splice(i, 1);
      }
    }
    S.redoStack.push(redoAction);
    if (S.selectedNode && String(S.selectedNode.id) === String(action.nodeId)) {
      S.selectedNode = null;
      S.selectedEdge = null;
      F.renderDetails();
    }
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.undoNodeCreate'));

  } else if (action.type === 'edgeCreate') {
    const edge = S.edges.find(e => e.id === action.edgeId);
    if (!edge) { S.undoStack.pop(); updateUndoButton(); return; }
    if (edgeHasValuableData(edge)) {
      if (!confirm(t('confirms.undoEdgeWithData'))) return;
    }
    // Save for redo before removing
    S.redoStack.push({ type: 'edgeRestore', edge: deepCopyObj(edge) });
    S.edges = S.edges.filter(e => e !== edge);
    S.undoStack.pop();
    if (S.selectedEdge && S.selectedEdge.id === action.edgeId) {
      S.selectedEdge = null;
      S.selectedNode = null;
      F.renderDetails();
    }
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.undoEdgeCreate'));

  } else if (action.type === 'nodeMove') {
    const node = S.nodes.find(n => String(n.id) === String(action.nodeId));
    if (!node) { S.undoStack.pop(); updateUndoButton(); return; }
    if (nodeHasValuableData(node)) {
      if (!confirm(t('confirms.undoNodeWithData'))) return;
    }
    // Save current position for redo
    S.redoStack.push({
      type: 'nodeMove',
      nodeId: action.nodeId,
      oldX: node.x,
      oldY: node.y,
      oldSurveyX: node.surveyX,
      oldSurveyY: node.surveyY,
    });
    node.x = action.oldX;
    node.y = action.oldY;
    if (action.oldSurveyX !== undefined) node.surveyX = action.oldSurveyX;
    if (action.oldSurveyY !== undefined) node.surveyY = action.oldSurveyY;
    S.undoStack.pop();
    F.updateNodeTimestamp(node);
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.undoNodeMove'));

  } else if (action.type === 'nodeDelete') {
    // Restore the deleted node
    S.nodes.push(deepCopyObj(action.node));
    S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
    // Restore fully removed edges
    for (const edgeCopy of action.removedEdges) {
      S.edges.push(deepCopyObj(edgeCopy));
    }
    // Revert converted edges back to connected
    for (const conv of action.convertedEdges) {
      const edge = S.edges.find(e => e.id === conv.edgeId);
      if (edge) {
        edge.tail = conv.oldTail;
        edge.head = conv.oldHead;
        edge.isDangling = conv.oldIsDangling;
        edge.danglingEndpoint = conv.oldDanglingEndpoint;
        edge.tailPosition = conv.oldTailPosition;
      }
    }
    S.undoStack.pop();
    // Push same action data to redo so redo can re-delete
    S.redoStack.push(deepCopyObj(action));
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.undoNodeDelete'));

  } else if (action.type === 'edgeDelete') {
    // Restore the deleted edge
    S.edges.push(deepCopyObj(action.edge));
    S.undoStack.pop();
    S.redoStack.push(deepCopyObj(action));
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.undoEdgeDelete'));

  } else if (action.type === 'danglingEndpointMove') {
    const edge = S.edges.find(e => e.id === action.edgeId);
    if (!edge) { S.undoStack.pop(); updateUndoButton(); return; }
    const prop = action.danglingType === 'outbound' ? 'danglingEndpoint' : 'tailPosition';
    const current = edge[prop];
    S.redoStack.push({
      type: 'danglingEndpointMove',
      edgeId: action.edgeId,
      danglingType: action.danglingType,
      oldX: current ? current.x : action.oldX,
      oldY: current ? current.y : action.oldY,
    });
    edge[prop] = { x: action.oldX, y: action.oldY };
    S.undoStack.pop();
    F.markEdgeLabelCacheDirty();
    F.saveToStorage();
    F.scheduleDraw();

  } else if (action.type === 'danglingMerge') {
    // Undo merge: restore edgeA to pre-merge state and re-add edgeB
    const edgeA = S.edges.find(e => e.id === action.edgeABefore.id);
    if (!edgeA) { S.undoStack.pop(); updateUndoButton(); return; }
    // Capture current merged state for redo
    S.redoStack.push({ type: 'danglingMerge', edgeABefore: deepCopyObj(edgeA), edgeBBefore: action.edgeBBefore });
    // Restore edgeA
    Object.assign(edgeA, action.edgeABefore);
    // Re-add edgeB
    S.edges.push(deepCopyObj(action.edgeBBefore));
    S.undoStack.pop();
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.markEdgeLabelCacheDirty();
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.undoEdgeCreate'));

  } else {
    // Unknown action type — just remove it
    S.undoStack.pop();
  }
  updateUndoButton();
  updateRedoButton();
}

/**
 * Perform the redo of the last undone action.
 * Re-applies the action and pushes it back onto the undo stack.
 */
export function performRedo() {
  if (S.redoStack.length === 0) {
    F.showToast(t('toasts.redoEmpty'));
    return;
  }
  const action = S.redoStack.pop();

  if (action.type === 'nodeRestore') {
    // Redo of "undo nodeCreate" — restore the node and edges
    S.nodes.push(deepCopyObj(action.node));
    S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
    for (const edgeCopy of action.edges) {
      S.edges.push(deepCopyObj(edgeCopy));
    }
    // Push nodeCreate back onto undo (with the node id)
    pushUndoDirect({ type: 'nodeCreate', nodeId: action.node.id });
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.redoNodeCreate'));

  } else if (action.type === 'edgeRestore') {
    // Redo of "undo edgeCreate" — restore the edge
    S.edges.push(deepCopyObj(action.edge));
    pushUndoDirect({ type: 'edgeCreate', edgeId: action.edge.id });
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.redoEdgeCreate'));

  } else if (action.type === 'nodeMove') {
    // Redo of "undo nodeMove" — move node to the redo position
    const node = S.nodes.find(n => String(n.id) === String(action.nodeId));
    if (!node) { updateRedoButton(); return; }
    // Save current pos for undo
    pushUndoDirect({
      type: 'nodeMove',
      nodeId: action.nodeId,
      oldX: node.x,
      oldY: node.y,
      oldSurveyX: node.surveyX,
      oldSurveyY: node.surveyY,
    });
    node.x = action.oldX;
    node.y = action.oldY;
    if (action.oldSurveyX !== undefined) node.surveyX = action.oldSurveyX;
    if (action.oldSurveyY !== undefined) node.surveyY = action.oldSurveyY;
    F.updateNodeTimestamp(node);
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.redoNodeMove'));

  } else if (action.type === 'nodeDelete') {
    // Redo of "undo nodeDelete" — re-delete the node using same logic
    const nodeIdStr = String(action.node.id);
    const node = S.nodes.find(n => String(n.id) === nodeIdStr);
    if (!node) { updateRedoButton(); return; }

    // Re-apply the same edge conversions and removals
    const removedEdgeIds = new Set(action.removedEdges.map(e => e.id));
    S.edges = S.edges.filter(e => !removedEdgeIds.has(e.id));

    for (const conv of action.convertedEdges) {
      const edge = S.edges.find(e => e.id === conv.edgeId);
      if (edge) {
        if (conv.wasTail) {
          edge.tailPosition = { x: node.x, y: node.y };
          edge.tail = null;
        } else {
          edge.danglingEndpoint = { x: node.x, y: node.y };
          edge.head = null;
        }
        edge.isDangling = true;
      }
    }

    S.nodes = S.nodes.filter(n => n !== node);
    S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
    // Push the nodeDelete action back onto undo
    pushUndoDirect(deepCopyObj(action));
    if (S.selectedNode && String(S.selectedNode.id) === nodeIdStr) {
      S.selectedNode = null;
      S.selectedEdge = null;
      F.renderDetails();
    }
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.redoNodeDelete'));

  } else if (action.type === 'edgeDelete') {
    // Redo of "undo edgeDelete" — re-delete the edge
    const edgeId = action.edge.id;
    S.edges = S.edges.filter(e => e.id !== edgeId);
    pushUndoDirect(deepCopyObj(action));
    if (S.selectedEdge && S.selectedEdge.id === edgeId) {
      S.selectedEdge = null;
      S.selectedNode = null;
      F.renderDetails();
    }
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.saveToStorage();
    F.scheduleDraw();
    F.showToast(t('toasts.redoEdgeDelete'));

  } else if (action.type === 'danglingEndpointMove') {
    const edge = S.edges.find(e => e.id === action.edgeId);
    if (!edge) { updateRedoButton(); return; }
    const prop = action.danglingType === 'outbound' ? 'danglingEndpoint' : 'tailPosition';
    const current = edge[prop];
    pushUndoDirect({
      type: 'danglingEndpointMove',
      edgeId: action.edgeId,
      danglingType: action.danglingType,
      oldX: current ? current.x : action.oldX,
      oldY: current ? current.y : action.oldY,
    });
    edge[prop] = { x: action.oldX, y: action.oldY };
    F.markEdgeLabelCacheDirty();
    F.saveToStorage();
    F.scheduleDraw();

  } else if (action.type === 'danglingMerge') {
    // Redo merge: re-apply merge (edgeA already exists, delete edgeB again, restore merged state)
    const edgeA = S.edges.find(e => e.id === action.edgeABefore.id);
    if (!edgeA) { updateRedoButton(); return; }
    // Save current (un-merged) state for undo
    pushUndoDirect({ type: 'danglingMerge', edgeABefore: deepCopyObj(edgeA), edgeBBefore: action.edgeBBefore });
    // Remove edgeB
    S.edges = S.edges.filter(e => e.id !== action.edgeBBefore.id);
    // Restore edgeA to merged state (use edgeABefore which was the merged state at redo time)
    Object.assign(edgeA, action.edgeABefore);
    F.computeNodeTypes();
    updateIncompleteEdgeTracker();
    F.markEdgeLabelCacheDirty();
    F.saveToStorage();
    F.scheduleDraw();
  }

  updateUndoButton();
  updateRedoButton();
}

// ── Incomplete / Dangling edge helpers ───────────────────────────────────────

/**
 * Update the incomplete edge tracker UI with the current count.
 */
export function updateIncompleteEdgeTracker() {
  const tracker = document.getElementById('incompleteEdgeTracker');
  const countEl = document.getElementById('incompleteEdgeCount');
  if (!tracker || !countEl) return;

  const incompleteCount = F.findIncompleteEdges().length;
  countEl.textContent = String(incompleteCount);

  // Update aria-label with dynamic count for screen readers
  const label = typeof t === 'function'
    ? t('a11y.incompleteEdges', incompleteCount)
    : `${incompleteCount} incomplete edges`;
  tracker.setAttribute('aria-label', label);

  // Show/hide tracker based on count
  if (incompleteCount > 0) {
    tracker.style.display = 'inline-flex';
  } else {
    tracker.style.display = 'none';
  }
}

/**
 * Find a dangling edge whose open endpoint is within snap distance of the given position.
 * Checks both outbound (danglingEndpoint) and inbound (tailPosition) dangling edges.
 * @param {number} x - X coordinate to check
 * @param {number} y - Y coordinate to check
 * @param {number} snapDistance - Maximum distance to consider for snapping (default 30)
 * @returns {{edge: object, distance: number, type: 'outbound'|'inbound'}|null} The closest dangling edge within range, or null
 */
export function findDanglingEdgeNear(x, y, snapDistance = 30) {
  const incompleteEdges = F.findIncompleteEdges();
  let closest = null;
  let minDist = snapDistance;

  for (const edge of incompleteEdges) {
    // Check outbound dangling edges (head is null, danglingEndpoint has position)
    if (edge.danglingEndpoint) {
      const dx = edge.danglingEndpoint.x - x;
      const dy = edge.danglingEndpoint.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = { edge, distance: dist, type: 'outbound' };
      }
    }
    // Check inbound dangling edges (tail is null, tailPosition has position)
    if (edge.tailPosition) {
      const dx = edge.tailPosition.x - x;
      const dy = edge.tailPosition.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = { edge, distance: dist, type: 'inbound' };
      }
    }
  }

  return closest;
}

/**
 * Hit-test dangling edge free endpoints (the open circle at the unconnected end).
 * Returns { edge, type } or null.
 */
export function findDanglingEndpointAt(x, y) {
  const sv = S.autoSizeEnabled ? S.viewScale : 1;
  const hitRadius = 10 * S.sizeScale / sv;
  const incompleteEdges = F.findIncompleteEdges();
  let closest = null;
  let minDist = hitRadius;
  for (const edge of incompleteEdges) {
    if (edge.danglingEndpoint) {
      const dist = Math.hypot(edge.danglingEndpoint.x - x, edge.danglingEndpoint.y - y);
      if (dist < minDist) { minDist = dist; closest = { edge, type: 'outbound' }; }
    }
    if (edge.tailPosition) {
      const dist = Math.hypot(edge.tailPosition.x - x, edge.tailPosition.y - y);
      if (dist < minDist) { minDist = dist; closest = { edge, type: 'inbound' }; }
    }
  }
  return closest;
}

/**
 * Detect snap targets for a dragged dangling endpoint.
 * Checks nodes first, then other dangling edge free endpoints.
 * Excludes the edge being dragged itself.
 * @returns {{ type: 'node', node: object } | { type: 'dangling', edge: object, danglingType: string } | null}
 */
export function findDanglingSnapTarget(x, y, excludeEdge) {
  const sv = S.autoSizeEnabled ? S.viewScale : 1;
  const snapDist = 25 * S.sizeScale / sv;

  // Check nodes first (higher priority)
  const node = F.findNodeAt(x, y);
  if (node) {
    // For outbound: the dragged edge's tail must not be this node (self-loop)
    // For inbound: the dragged edge's head must not be this node
    const isSelf = (S.draggingDanglingType === 'outbound' && String(excludeEdge?.tail) === String(node.id)) ||
                   (S.draggingDanglingType === 'inbound' && String(excludeEdge?.head) === String(node.id));
    if (!isSelf) return { type: 'node', node };
  }

  // Check other dangling edge free endpoints
  const incompleteEdges = F.findIncompleteEdges();
  let closest = null;
  let minDist = snapDist;
  for (const edge of incompleteEdges) {
    if (edge === excludeEdge) continue;
    if (edge.danglingEndpoint) {
      const dist = Math.hypot(edge.danglingEndpoint.x - x, edge.danglingEndpoint.y - y);
      if (dist < minDist) { minDist = dist; closest = { type: 'dangling', edge, danglingType: 'outbound' }; }
    }
    if (edge.tailPosition) {
      const dist = Math.hypot(edge.tailPosition.x - x, edge.tailPosition.y - y);
      if (dist < minDist) { minDist = dist; closest = { type: 'dangling', edge, danglingType: 'inbound' }; }
    }
  }
  return closest;
}

/**
 * Merge two dangling edges that meet at their free ends into a single complete edge.
 * Keeps edgeA, deletes edgeB. Merges measurements directionally.
 */
export function mergeDanglingEdges(edgeA, typeA, edgeB, typeB) {
  // Capture pre-merge state for undo BEFORE any mutation
  const edgeABefore = deepCopyObj(edgeA);
  const edgeBBefore = deepCopyObj(edgeB);

  // Determine tail and head for the merged edge
  let tailId, headId;
  if (typeA === 'outbound') {
    tailId = edgeA.tail;
  } else {
    headId = edgeA.head;
  }
  if (typeB === 'outbound') {
    if (tailId == null) tailId = edgeB.tail; else headId = edgeB.tail;
  } else {
    if (headId == null) headId = edgeB.head; else tailId = edgeB.head;
  }

  // Directional measurements: tail-side from the edge contributing the tail node
  const tailEdge = (typeA === 'outbound') ? edgeA : edgeB;
  const headEdge = (typeA === 'outbound') ? edgeB : edgeA;

  edgeA.tail = tailId;
  edgeA.head = headId;
  edgeA.isDangling = false;
  edgeA.danglingEndpoint = null;
  edgeA.tailPosition = null;
  edgeA.tail_measurement = tailEdge.tail_measurement || headEdge.tail_measurement || '';
  edgeA.head_measurement = headEdge.head_measurement || tailEdge.head_measurement || '';

  // Shared fields: prefer non-empty from either edge
  const sharedFields = ['edge_type', 'material', 'line_diameter', 'fall_depth', 'fall_position', 'engineeringStatus'];
  for (const field of sharedFields) {
    if (!edgeA[field] && edgeB[field]) edgeA[field] = edgeB[field];
  }

  // Remove edgeB
  S.edges = S.edges.filter(e => e !== edgeB);

  pushUndo({
    type: 'danglingMerge',
    edgeABefore,
    edgeBBefore,
  });

  F.computeNodeTypes();
  updateIncompleteEdgeTracker();
  F.markEdgeLabelCacheDirty();
  F.saveToStorage();
  F.scheduleDraw();
}

/**
 * Connect a dangling edge to a newly created node.
 * @param {object} edge - The dangling edge to connect
 * @param {string} nodeId - The node ID to connect to
 * @param {'outbound'|'inbound'} type - Type of dangling edge
 */
export function connectDanglingEdge(edge, nodeId, type = 'outbound') {
  if (type === 'outbound') {
    // Outbound: connect the open head end to the new node
    edge.head = String(nodeId);
    edge.danglingEndpoint = null;
  } else {
    // Inbound: connect the open tail end to the new node
    edge.tail = String(nodeId);
    edge.tailPosition = null;
  }
  edge.isDangling = false;
  F.saveToStorage();
}

/**
 * Finalize a dangling endpoint drag: push undo if moved, save, and reset state.
 */
export function finalizeDanglingEndpointDrag() {
  const snap = S.danglingSnapTarget;
  S.danglingSnapTarget = null;

  if (S.draggingDanglingEdge && snap) {
    if (snap.type === 'node') {
      // Snap to node — connect the dangling edge
      connectDanglingEdge(S.draggingDanglingEdge, snap.node.id, S.draggingDanglingType);
      F.showToast(t('toasts.danglingEndpointSnapped'));
      // Push undo as edgeCreate-like (undo would need to re-dangle — handled by nodeDelete undo pattern)
      // For simplicity, just save — the connectDanglingEdge already saves
    } else if (snap.type === 'dangling') {
      // Merge two dangling edges
      mergeDanglingEdges(S.draggingDanglingEdge, S.draggingDanglingType, snap.edge, snap.danglingType);
      F.showToast(t('toasts.danglingEdgesMerged'));
    }
  } else if (S.draggingDanglingEdge && S.draggingDanglingStart) {
    // No snap — just a plain move
    const pos = S.draggingDanglingType === 'outbound'
      ? S.draggingDanglingEdge.danglingEndpoint : S.draggingDanglingEdge.tailPosition;
    if (pos) {
      const dx = pos.x - S.draggingDanglingStart.x;
      const dy = pos.y - S.draggingDanglingStart.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        pushUndo({
          type: 'danglingEndpointMove',
          edgeId: S.draggingDanglingEdge.id,
          danglingType: S.draggingDanglingType,
          oldX: S.draggingDanglingStart.x,
          oldY: S.draggingDanglingStart.y,
        });
        F.saveToStorage();
      }
    }
  }
  S.isDraggingDanglingEnd = false;
  S.draggingDanglingEdge = null;
  S.draggingDanglingType = null;
  S.draggingDanglingStart = null;
  S.canvas.style.cursor = '';
  F.scheduleDraw();
}
