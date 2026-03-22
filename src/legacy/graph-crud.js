/**
 * graph-crud.js
 *
 * Extracted node/edge creation, sketch initialisation, field-validation,
 * and incomplete-node helpers from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 */

import { S, F } from './shared-state.js';
import {
  NODE_MATERIAL_OPTIONS,
  EDGE_TYPES,
  EDGE_MATERIAL_OPTIONS,
} from '../state/constants.js';
import { DEFAULT_INPUT_FLOW_CONFIG } from '../state/constants.js';
import { getMapReferencePoint } from '../map/govmap-layer.js';
import { wizardGetVisibleTabs, wizardIsFieldFilled } from './wizard-helpers.js';

const NODE_MATERIALS = NODE_MATERIAL_OPTIONS.map(o => o.label);
const EDGE_MATERIALS = EDGE_MATERIAL_OPTIONS.map(o => o.label);

// Convenience wrapper
const t = (...args) => F.t(...args);

// ── Sketch lifecycle ─────────────────────────────────────────────────────────

/**
 * Initialize a brand new sketch and reset all transient state.
 * @param {string} date - ISO date string used for exported filenames
 * @param {string} projectId - Optional project ID to associate with this sketch
 * @param {Object} inputFlowConfig - Optional input flow configuration (copied from project)
 */
export function newSketch(date, projectId = null, inputFlowConfig = null) {
  S.nodes = [];
  S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
  S.edges = [];
  F.clearUndoStack();
  F.markEdgeLabelCacheDirty(); // sketch cleared
  S.nextNodeId = 1;
  S.selectedNode = null;
  S.selectedEdge = null;
  S.isDragging = false;
  S.pendingEdgeTail = null;
  S.pendingEdgeStartPosition = null;
  S.creationDate = date;
  S.currentSketchId = null; // new unsaved sketch
  S.currentSketchName = null;
  S.currentProjectId = projectId;
  S.currentInputFlowConfig = inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
  F.updateSketchNameDisplay();
  F.saveToStorage();
  F.updateCanvasEmptyState();
  F.draw();
  F.renderDetails();
}

// ── Node creation ────────────────────────────────────────────────────────────

/**
 * Create a node at the provided canvas coordinates.
 * Chooses the next available numeric id and stores it as a string.
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {{id:string,x:number,y:number,note:string,material:string,type:string}} The created node
 */
export function createNode(x, y) {
  const candidateStr = F.findSmallestAvailableNumericId();
  const used = F.collectUsedNumericIds();
  used.add(parseInt(candidateStr, 10));
  let nextCandidate = 1;
  while (used.has(nextCandidate)) nextCandidate += 1;
  S.nextNodeId = nextCandidate;
  const node = {
    id: candidateStr,
    x: x,
    y: y,
    note: '',
    material: (S.adminConfig.nodes?.defaults?.material ?? NODE_MATERIALS[0]),
    coverDiameter: (S.adminConfig.nodes?.defaults?.cover_diameter ?? ''),
    type: 'type1',
    nodeType: 'Manhole',
    access: (S.adminConfig.nodes?.defaults?.access ?? 0),
    accuracyLevel: (S.adminConfig.nodes?.defaults?.accuracy_level ?? 0),
    nodeEngineeringStatus: (S.adminConfig.nodes?.defaults?.engineering_status ?? 0),
    maintenanceStatus: (S.adminConfig.nodes?.defaults?.maintenance_status ?? 0),
    createdAt: new Date().toISOString(),
    createdBy: F.getCurrentUsername(),
    gnssFixQuality: 6, // Manual Float — user placed on canvas
  };
  // Compute manual ITM coordinates from canvas position (not survey-grade)
  const ref = getMapReferencePoint();
  if (ref && ref.itm && ref.canvas && S.coordinateScale > 0) {
    node.manual_x = ref.itm.x + (x - ref.canvas.x) / S.coordinateScale;
    node.manual_y = ref.itm.y - (y - ref.canvas.y) / S.coordinateScale;
  }
  // Apply custom default fields
  if (Array.isArray(S.adminConfig.nodes?.customFields)) {
    S.adminConfig.nodes.customFields.forEach((f) => {
      if (!f || !f.key) return;
      node[f.key] = f.default ?? '';
    });
  }
  S.nodes.push(node);
  S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;

  // Check for nearby dangling edges and auto-connect
  const nearbyDangling = F.findDanglingEdgeNear(x, y);
  if (nearbyDangling) {
    F.connectDanglingEdge(nearbyDangling.edge, node.id, nearbyDangling.type);
    F.showToast(t('toasts.danglingEdgeConnected'));
  }

  F.computeNodeTypes();
  F.pushUndo({ type: 'nodeCreate', nodeId: node.id });
  F.saveToStorage();
  F.updateCanvasEmptyState();
  // Trigger placement animation + haptic feedback
  S._animatingNodes.set(String(node.id), performance.now());
  navigator.vibrate?.(10);
  F.scheduleDraw();
  return node;
}

// ── Edge creation ────────────────────────────────────────────────────────────

/**
 * Create a directed edge between two nodes.
 * Prevents duplicates regardless of direction (A→B or B→A).
 * Supports dangling edges where either tailId or headId is null.
 * @param {string|number|null} tailId - Source node id (null for inbound dangling edge)
 * @param {string|number|null} headId - Target node id (null for outbound dangling edge)
 * @param {object} options - Optional: { danglingEndpoint: {x, y}, tailPosition: {x, y} }
 * @returns {object|null} The created edge, or null if duplicate exists
 */
export function createEdge(tailId, headId, options = {}) {
  const tailStr = tailId != null ? String(tailId) : null;
  const headStr = headId != null ? String(headId) : null;
  const isDanglingHead = headStr === null;
  const isDanglingTail = tailStr === null;
  const isDangling = isDanglingHead || isDanglingTail;

  if (!isDangling) {
    const exists = S.edges.some((e) =>
      (String(e.tail) === tailStr && String(e.head) === headStr) ||
      (String(e.tail) === headStr && String(e.head) === tailStr)
    );
    if (exists) {
      return null;
    }
  }

  const edge = {
    id: Date.now() + Math.random(),
    tail: tailStr,
    head: headStr,
    isDangling: isDangling,
    danglingEndpoint: isDanglingHead ? (options.danglingEndpoint || null) : null,
    tailPosition: isDanglingTail ? (options.tailPosition || null) : null,
    tail_measurement: (S.adminConfig.edges?.defaults?.tail_measurement ?? ''),
    head_measurement: (S.adminConfig.edges?.defaults?.head_measurement ?? ''),
    fall_depth: (S.adminConfig.edges?.defaults?.fall_depth ?? ''),
    fall_position: (S.adminConfig.edges?.defaults?.fall_position ?? ''),
    line_diameter: (S.adminConfig.edges?.defaults?.line_diameter ?? ''),
    edge_type: (S.adminConfig.edges?.defaults?.edge_type ?? EDGE_TYPES[0]),
    material: (S.adminConfig.edges?.defaults?.material ?? EDGE_MATERIALS[0]),
    maintenanceStatus: 0,
    engineeringStatus: (S.adminConfig.edges?.defaults?.engineering_status ?? 0),
    createdAt: new Date().toISOString(),
    createdBy: F.getCurrentUsername(),
  };
  if (Array.isArray(S.adminConfig.edges?.customFields)) {
    S.adminConfig.edges.customFields.forEach((f) => {
      if (!f || !f.key) return;
      edge[f.key] = f.default ?? '';
    });
  }
  S.edges.push(edge);
  F.computeNodeTypes();
  F.pushUndo({ type: 'edgeCreate', edgeId: edge.id });
  F.saveToStorage();
  // Trigger snap animation + haptic feedback
  S._animatingEdges.set(edge.id, performance.now());
  navigator.vibrate?.(10);
  F.scheduleDraw();
  return edge;
}

/**
 * Create an outbound dangling edge (from node to open end).
 */
export function createDanglingEdge(tailId, endX, endY) {
  return createEdge(tailId, null, { danglingEndpoint: { x: endX, y: endY } });
}

/**
 * Create an inbound dangling edge (from open end to node).
 */
export function createInboundDanglingEdge(startX, startY, headId) {
  return createEdge(null, headId, { tailPosition: { x: startX, y: startY } });
}

/**
 * Find all incomplete/dangling edges (edges with only one connected node).
 * @returns {Array<object>} Array of dangling edges
 */
export function findIncompleteEdges() {
  return S.edges.filter(edge => edge.isDangling || edge.head === null || edge.tail === null);
}

// ── Required Field Validation ────────────────────────────────────────────────

/**
 * Mark required fields in a details container with visual indicators.
 * @param {HTMLElement} container - The form container
 * @param {Set|Array} requiredFields - Field keys that are required (snake_case)
 */
export function markRequiredFields(container, requiredFields) {
  if (!requiredFields || requiredFields.size === 0) return;
  const required = requiredFields instanceof Set ? requiredFields : new Set(requiredFields);

  const fieldIdMap = {
    'accuracy_level': 'accuracyLevelSelect',
    'maintenance_status': 'nodeMaintenanceStatusSelect',
    'material': 'materialSelect',
    'cover_diameter': 'coverDiameterSelect',
    'access': 'accessSelect',
    'note': 'noteInput',
    'edge_type': 'edgeTypeSelect',
    'engineering_status': 'edgeEngineeringStatusSelect',
    'line_diameter': 'edgeDiameterSelect',
    'tail_measurement': 'tailInput',
    'head_measurement': 'headInput',
    'fall_depth': 'fallDepthInput',
    'fall_position': 'fallPositionSelect',
  };

  for (const fieldKey of required) {
    const elId = fieldIdMap[fieldKey];
    if (!elId) continue;
    const el = container.querySelector('#' + elId);
    if (!el) continue;

    const field = el.closest('.field');
    if (field) {
      const label = field.querySelector('label');
      if (label && !label.querySelector('.field-required-mark')) {
        const mark = document.createElement('span');
        mark.className = 'field-required-mark';
        mark.textContent = ' *';
        label.appendChild(mark);
      }
    }

    const isEmpty = el.tagName === 'TEXTAREA'
      ? !el.value.trim()
      : (el.tagName === 'SELECT' ? (!el.value || el.value === '') : !el.value.trim());

    if (isEmpty) {
      el.classList.add('invalid');
      if (field && !field.querySelector('.field-error')) {
        const err = document.createElement('div');
        err.className = 'field-error';
        err.innerHTML = `<span class="material-icons" style="font-size:14px">error_outline</span> ${t('validation.required')}`;
        field.appendChild(err);
      }
    }

    el.addEventListener('change', () => {
      const nowEmpty = el.tagName === 'TEXTAREA'
        ? !el.value.trim()
        : (el.tagName === 'SELECT' ? (!el.value || el.value === '') : !el.value.trim());
      el.classList.toggle('invalid', nowEmpty);
      const errEl = field?.querySelector('.field-error');
      if (nowEmpty && !errEl && field) {
        const err = document.createElement('div');
        err.className = 'field-error';
        err.innerHTML = `<span class="material-icons" style="font-size:14px">error_outline</span> ${t('validation.required')}`;
        field.appendChild(err);
      } else if (!nowEmpty && errEl) {
        errEl.remove();
      }
    });
  }
}

// ── Incomplete node helpers ──────────────────────────────────────────────────

/**
 * Check if a node has incomplete wizard tabs (any visible tab not filled).
 */
export function isNodeIncomplete(node) {
  if (node.nodeType === 'Home' || node.nodeType === 'ForLater' || node.nodeType === 'למדידה מאוחרת' || node.nodeType === 'Issue') return false;
  const visibleTabs = wizardGetVisibleTabs(node);
  return visibleTabs.some(key => !wizardIsFieldFilled(node, key));
}

/**
 * Find the next incomplete node after the given node.
 * Priority: BFS through connected nodes first, then by ID order.
 */
export function findNextIncompleteNode(currentNode) {
  const visited = new Set([String(currentNode.id)]);
  const queue = [currentNode];
  while (queue.length > 0) {
    const n = queue.shift();
    for (const edge of S.edges) {
      let neighborId = null;
      if (String(edge.tail) === String(n.id) && edge.head != null) neighborId = String(edge.head);
      else if (String(edge.head) === String(n.id) && edge.tail != null) neighborId = String(edge.tail);
      if (neighborId && !visited.has(neighborId)) {
        visited.add(neighborId);
        const neighbor = S.nodeMap.get(neighborId);
        if (neighbor) {
          if (isNodeIncomplete(neighbor)) return neighbor;
          queue.push(neighbor);
        }
      }
    }
  }
  for (const node of S.nodes) {
    if (String(node.id) === String(currentNode.id)) continue;
    if (isNodeIncomplete(node)) return node;
  }
  return null;
}

/**
 * Center the viewport on a given node.
 */
export function centerOnNode(node) {
  const canvasW = S.canvas.width / (window.devicePixelRatio || 1);
  const canvasH = S.canvas.height / (window.devicePixelRatio || 1);
  const tx = canvasW / 2 - S.viewScale * S.viewStretchX * node.x;
  const ty = canvasH / 2 - S.viewScale * S.viewStretchY * node.y;
  window.__setViewState?.(S.viewScale, tx, ty);
}
