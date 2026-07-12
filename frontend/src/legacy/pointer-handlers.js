/**
 * pointer-handlers.js
 *
 * Extracted pointer/touch/mouse event handlers from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * Exported init function `initPointerHandlers()` wires up canvas event listeners.
 */

import { S, F } from './shared-state.js';
import { distanceToSegment } from '../utils/geometry.js';
import { NODE_RADIUS } from '../state/constants.js';
import { commitIdInputIfFocused } from '../dom/dom-utils.js';

// ── Local constants ─────────────────────────────────────────────────────────
const LONG_PRESS_MS = 600;
const DOUBLE_TAP_MS = 300;
const MIN_SCALE = 0.0005;
const MAX_SCALE = 5.0;
const TOUCH_TAP_MOVE_THRESHOLD = 5;
const TOUCH_SELECT_EXPANSION = 14;
const TOUCH_EDGE_HIT_THRESHOLD = 14;
const MOUSE_TAP_MOVE_THRESHOLD = 6;
// Touch drags on a node that still carries a measurement must be deliberate:
// below this screen-px travel the move is treated as glove jitter and ignored
// (an 8px smear used to null the survey coords and demote fix quality).
// Mouse drags are precise and keep the replace-on-drag product rule as-is.
const TOUCH_MEASURED_DRAG_THRESHOLD = 22;

// ── Module-local state ──────────────────────────────────────────────────────
let longPressTimer = null;
let _longPressEdgeTail = null;
// True when pendingEdgeTail was re-armed by chaining (edge just created)
// rather than by an explicit first tap. A chained tail ends quietly on an
// empty tap; an explicitly armed tail keeps the dangling-edge feature.
let _chainArmed = false;
let _lastTapNodeId = null;
let _lastTapTime = 0;
let dragStartNodeState = null;
let pinchStartDistance = null;
let pinchStartScale = null;
let pinchCenterWorld = null;
let touchAddPending = false;
let touchAddPoint = null;
let touchPanCandidate = false;
let mousePanCandidate = false;
let mouseAddPending = false;
let mouseAddPoint = null;
let pendingDetailsForSelectedNode = false;
let selectedNodeDownScreen = null;
let selectedNodeMoveThreshold = MOUSE_TAP_MOVE_THRESHOLD;
let lastPointerType = 'mouse';

// Reference layer tooltip
let _refTooltipEl = null;
let _refTooltipVisible = false;

function _ensureRefTooltip() {
  if (_refTooltipEl) return _refTooltipEl;
  _refTooltipEl = document.createElement('div');
  _refTooltipEl.className = 'ref-layer-tooltip';
  _refTooltipEl.style.cssText = 'display:none;position:fixed;z-index:9999;pointer-events:none;' +
    'background:rgba(15,23,42,0.92);color:#e2e8f0;padding:6px 10px;border-radius:6px;' +
    'font-size:12px;line-height:1.4;max-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:pre-line;';
  document.body.appendChild(_refTooltipEl);
  return _refTooltipEl;
}

function _updateRefLayerTooltip(screenX, screenY, world) {
  try {
    if (typeof F.hitTestReferenceLayers !== 'function') return;

    const hitRadius = 15 / S.viewScale;
    const hit = F.hitTestReferenceLayers(
      world.x / S.viewStretchX,
      world.y / S.viewStretchY,
      hitRadius,
      S.coordinateScale
    );

    const tip = _ensureRefTooltip();
    if (hit) {
      const p = hit.properties;
      let lines = [];
      if (p.name) lines.push(`ID: ${p.name}`);
      lines.push(`Layer: ${hit.layerName}`);
      if (p.x != null) lines.push(`X: ${Number(p.x).toFixed(3)}`);
      if (p.y != null) lines.push(`Y: ${Number(p.y).toFixed(3)}`);
      if (p.z != null && p.z !== 0) lines.push(`Z: ${Number(p.z).toFixed(3)}`);
      if (p.sourceFile) lines.push(`File: ${p.sourceFile}`);
      tip.textContent = lines.join('\n');
      tip.style.display = '';
      const rect = S.canvas.getBoundingClientRect();
      tip.style.left = `${rect.left + screenX + 14}px`;
      tip.style.top = `${rect.top + screenY - 10}px`;
      _refTooltipVisible = true;
    } else if (_refTooltipVisible) {
      tip.style.display = 'none';
      _refTooltipVisible = false;
    }
  } catch (_) {
    // hitTestReferenceLayers not available yet
  }
}
let pendingDeselect = false;

// ── Convenience aliases via F ───────────────────────────────────────────────
const t = (...args) => F.t(...args);

// ── Hit-testing helpers ─────────────────────────────────────────────────────

export function findNodeAt(x, y) {
  const sv = S.autoSizeEnabled ? S.viewScale : 1;
  const nodeR = NODE_RADIUS * S.sizeScale / sv;
  const pad = 2 / sv;
  const nodes = S.nodes;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node._hidden) continue;
    if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
      const halfWidth = nodeR * 1.8 / 2 + pad;
      const halfHeight = nodeR * 1.3 / 2 + pad;
      if (Math.abs(x - node.x) <= halfWidth && Math.abs(y - node.y) <= halfHeight) return node;
    } else {
      const dx = x - node.x;
      const dy = y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= nodeR + pad) return node;
    }
  }
  return null;
}

export function findNodeAtWithExpansion(x, y, extraRadius) {
  const sv = S.autoSizeEnabled ? S.viewScale : 1;
  const nodeR = NODE_RADIUS * S.sizeScale / sv;
  const extra = typeof extraRadius === 'number' ? extraRadius / sv : 0;
  const pad = 2 / sv;
  const nodes = S.nodes;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node._hidden) continue;
    if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
      const halfWidth = nodeR * 1.8 / 2 + pad + extra;
      const halfHeight = nodeR * 1.3 / 2 + pad + extra;
      if (Math.abs(x - node.x) <= halfWidth && Math.abs(y - node.y) <= halfHeight) return node;
    } else {
      const dx = x - node.x;
      const dy = y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= nodeR + pad + extra) return node;
    }
  }
  return null;
}

export function findEdgeAt(x, y, threshold) {
  let closest = null;
  const rawThreshold = (typeof threshold === 'number') ? threshold : 8;
  const sv = S.autoSizeEnabled ? S.viewScale : 1;
  let minDist = rawThreshold / sv;
  const nodes = S.nodes;
  S.edges.forEach((edge) => {
    let tailX, tailY, headX, headY;
    if (edge.head === null && edge.tail != null) {
      const tailNode = nodes.find((n) => n.id === edge.tail);
      if (!tailNode || !edge.danglingEndpoint) return;
      tailX = tailNode.x; tailY = tailNode.y;
      headX = edge.danglingEndpoint.x; headY = edge.danglingEndpoint.y;
    } else if (edge.tail === null && edge.head != null) {
      const headNode = nodes.find((n) => n.id === edge.head);
      if (!headNode || !edge.tailPosition) return;
      tailX = edge.tailPosition.x; tailY = edge.tailPosition.y;
      headX = headNode.x; headY = headNode.y;
    } else {
      const tailNode = nodes.find((n) => n.id === edge.tail);
      const headNode = nodes.find((n) => n.id === edge.head);
      if (!tailNode || !headNode) return;
      tailX = tailNode.x; tailY = tailNode.y;
      headX = headNode.x; headY = headNode.y;
    }
    const dist = distanceToSegment(x, y, tailX, tailY, headX, headY);
    if (dist < minDist) {
      minDist = dist;
      closest = edge;
    }
  });
  return closest;
}

// ── Context menu ────────────────────────────────────────────────────────────

export function showNodeContextMenu(node, screenX, screenY) {
  hideNodeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'canvas-context-menu';
  menu.id = 'canvasContextMenu';

  const editBtn = document.createElement('button');
  editBtn.className = 'canvas-context-menu__item';
  editBtn.innerHTML = `<span class="material-icons">edit</span><span>${t('contextMenu.edit')}</span>`;
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    S.selectedNode = node;
    S.selectedEdge = null;
    S.__wizardActiveTab = null;
    F.renderDetails();
    F.scheduleDraw();
    hideNodeContextMenu();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'canvas-context-menu__item canvas-context-menu__item--danger';
  deleteBtn.innerHTML = `<span class="material-icons">delete</span><span>${t('contextMenu.delete')}</span>`;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideNodeContextMenu();
    F.deleteNodeShared(node);
  });

  menu.appendChild(editBtn);
  menu.appendChild(deleteBtn);

  const canvas = S.canvas;
  const pad = 8;
  let left = screenX + canvas.getBoundingClientRect().left;
  let top = screenY + canvas.getBoundingClientRect().top;
  document.body.appendChild(menu);
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  if (left + mw > window.innerWidth - pad) left = window.innerWidth - mw - pad;
  if (top + mh > window.innerHeight - pad) top = window.innerHeight - mh - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  setTimeout(() => {
    document.addEventListener('pointerdown', _contextMenuDismiss, { once: true });
  }, 0);
}

export function _contextMenuDismiss(e) {
  const menu = document.getElementById('canvasContextMenu');
  if (menu && !menu.contains(e.target)) {
    hideNodeContextMenu();
  } else if (menu) {
    document.addEventListener('pointerdown', _contextMenuDismiss, { once: true });
  }
}

export function hideNodeContextMenu() {
  const existing = document.getElementById('canvasContextMenu');
  if (existing) existing.remove();
  document.removeEventListener('pointerdown', _contextMenuDismiss);
}

export function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

// ── Core pointer handlers ───────────────────────────────────────────────────

function pointerDown(x, y) {
  const world = F.screenToWorld(x, y);
  const node = findNodeAt(world.x, world.y);
  if (S.currentMode === 'edge') {
    const edgeAt = findEdgeAt(world.x, world.y);
    if (!S.pendingEdgeTail && !S.pendingEdgeStartPosition) {
      if (node) {
        S.pendingEdgeTail = node;
        S.pendingEdgePreview = { x: world.x, y: world.y };
        _chainArmed = false;
        F.showToast(t('toasts.chooseTarget'));
        F.scheduleDraw();
        return;
      }
      if (edgeAt) {
        S.selectedEdge = edgeAt;
        S.selectedNode = null;
        F.renderDetails();
        F.scheduleDraw();
        return;
      }
      if (window.__projectCanvas?.isProjectCanvasMode()) {
        const bgNode = window.__projectCanvas.findNodeInBackground(world.x, world.y, S.sizeScale, S.autoSizeEnabled ? S.viewScale : 1);
        if (bgNode) {
          window.__projectCanvas.switchActiveSketch(bgNode.sketchId);
          const switched = findNodeAt(world.x, world.y);
          if (switched) {
            S.pendingEdgeTail = switched;
            S.pendingEdgePreview = { x: world.x, y: world.y };
            _chainArmed = false;
            F.showToast(t('toasts.chooseTarget'));
            F.scheduleDraw();
            return;
          }
        }
        const bgEdge = window.__projectCanvas.findEdgeInBackground(world.x, world.y, S.autoSizeEnabled ? S.viewScale : 1);
        if (bgEdge) {
          window.__projectCanvas.switchActiveSketch(bgEdge.sketchId);
          const switchedEdge = findEdgeAt(world.x, world.y);
          if (switchedEdge) {
            S.selectedEdge = switchedEdge;
            S.selectedNode = null;
            F.renderDetails();
            F.scheduleDraw();
            return;
          }
        }
      }
      S.pendingEdgeStartPosition = { x: world.x, y: world.y };
      S.pendingEdgePreview = { x: world.x, y: world.y };
      F.showToast(t('toasts.chooseTargetInbound'));
      F.scheduleDraw();
      return;
    }
    if (S.pendingEdgeTail) {
      if (node) {
        if (String(node.id) === String(S.pendingEdgeTail.id)) {
          // Same node: keep the chain armed (a re-tap used to cancel, which
          // broke the tap-A-tap-B, tap-B-tap-C rhythm). Explicit cancels:
          // Escape, mode switch, or the on-screen chain-cancel chip.
          F.scheduleDraw();
          return;
        }
        const created = F.createEdge(S.pendingEdgeTail.id, node.id);
        // Chain: the head becomes the next tail, so a run of manholes costs
        // one tap per node instead of two.
        S.pendingEdgeTail = node;
        S.pendingEdgePreview = { x: world.x, y: world.y };
        _chainArmed = true;
        if (created) {
          F.showToast(t('toasts.edgeCreated'), 1200);
        } else {
          F.showToast(t('toasts.edgeExists'));
        }
        F.scheduleDraw();
        return;
      }
      if (edgeAt) {
        S.pendingEdgeTail = null;
        S.pendingEdgePreview = null;
        S.selectedEdge = edgeAt;
        S.selectedNode = null;
        F.renderDetails();
        F.scheduleDraw();
        return;
      }
      // A CHAINED tail ends quietly on an empty tap: with the tail staying
      // armed across a whole run, every stray miss would otherwise mint a
      // dangling edge, and two disconnected runs (A-B then C-D) could never
      // be drawn without a spurious fused segment. The explicit first-tap
      // arm keeps the dangling-edge feature exactly as before.
      if (_chainArmed) {
        S.pendingEdgeTail = null;
        S.pendingEdgePreview = null;
        _chainArmed = false;
        F.showToast(t('toasts.chainEnded'), 1200);
        F.scheduleDraw();
        return;
      }
      const danglingEdge = F.createDanglingEdge(S.pendingEdgeTail.id, world.x, world.y);
      S.pendingEdgeTail = null;
      S.pendingEdgePreview = null;
      if (danglingEdge) {
        F.showToast(t('toasts.danglingEdgeCreated'));
        F.updateIncompleteEdgeTracker();
      }
      F.scheduleDraw();
      return;
    }
    if (S.pendingEdgeStartPosition) {
      if (node) {
        const inboundEdge = F.createInboundDanglingEdge(
          S.pendingEdgeStartPosition.x,
          S.pendingEdgeStartPosition.y,
          node.id
        );
        S.pendingEdgeStartPosition = null;
        S.pendingEdgePreview = null;
        if (inboundEdge) {
          F.showToast(t('toasts.danglingEdgeCreated'));
          F.updateIncompleteEdgeTracker();
        }
        F.scheduleDraw();
        return;
      }
      if (edgeAt) {
        S.pendingEdgeStartPosition = null;
        S.pendingEdgePreview = null;
        S.selectedEdge = edgeAt;
        S.selectedNode = null;
        F.renderDetails();
        F.scheduleDraw();
        return;
      }
      S.pendingEdgeStartPosition = null;
      S.pendingEdgePreview = null;
      F.showToast(t('toasts.edgeCancelled'), 1200);
      F.scheduleDraw();
      return;
    }
  }
  // Project-canvas auto-switch
  if (!node && window.__projectCanvas?.isProjectCanvasMode() &&
      (S.currentMode === 'node' || S.currentMode === 'home' || S.currentMode === 'drainage')) {
    const bgHit = window.__projectCanvas.findNodeInBackground(world.x, world.y, S.sizeScale, S.autoSizeEnabled ? S.viewScale : 1);
    if (bgHit) {
      window.__projectCanvas.switchActiveSketch(bgHit.sketchId);
      const switched = findNodeAt(world.x, world.y);
      if (switched) {
        S.selectedNode = switched;
        S.selectedEdge = null;
        F.renderDetails();
        F.scheduleDraw();
        return;
      }
    }
  }
  // Contextual edit in Node/Home/Drainage mode
  if ((S.currentMode === 'node' || S.currentMode === 'home' || S.currentMode === 'drainage') && node) {
    if (S.selectedNode && String(S.selectedNode.id) === String(node.id)) {
      pendingDeselect = true;
    } else {
      S.selectedNode = node;
      S.selectedEdge = null;
      pendingDeselect = false;
      S.__wizardActiveTab = null;
    }
    S.dragOffset.x = world.x - node.x;
    S.dragOffset.y = world.y - node.y;
    S.isDragging = true;
    dragStartNodeState = {
      id: node.id,
      oldX: node.x,
      oldY: node.y,
      oldSurveyX: node.surveyX,
      oldSurveyY: node.surveyY,
      oldSurveyZ: node.surveyZ,
      oldSchematicX: node.schematicX,
      oldSchematicY: node.schematicY,
      oldGnssFixQuality: node.gnssFixQuality,
      oldHasCoordinates: node.hasCoordinates,
      measurementCleared: false,
    };
    pendingDetailsForSelectedNode = true;
    selectedNodeDownScreen = { x, y };
    selectedNodeMoveThreshold = (lastPointerType === 'touch') ? TOUCH_TAP_MOVE_THRESHOLD : MOUSE_TAP_MOVE_THRESHOLD;
    F.scheduleDraw();
    return;
  }
  // Create new node when clicking empty space
  if (S.currentMode === 'node') {
    const created = F.createNode(world.x, world.y);
    F.scheduleDraw();
  } else if (S.currentMode === 'home') {
    const created = F.createNode(world.x, world.y);
    created.nodeType = 'Home';
    S.selectedNode = created;
    F.draw();
    F.renderDetails();
    setTimeout(() => {
      const firstInput = S.detailsContainer.querySelector('input:not([type="checkbox"]), select, textarea');
      if (firstInput) firstInput.focus();
    }, 0);
  } else if (S.currentMode === 'drainage') {
    const created = F.createNode(world.x, world.y);
    created.nodeType = 'Drainage';
    F.scheduleDraw();
  } else if (S.currentMode === 'issue') {
    const created = F.createNode(world.x, world.y);
    created.nodeType = 'Issue';
    created.issueStatus = 'open';
    created.issueComments = [];
    S.selectedNode = created;
    F.draw();
    F.renderDetails();
    setTimeout(() => {
      const firstInput = S.detailsContainer.querySelector('textarea, input:not([type="checkbox"])');
      if (firstInput) firstInput.focus();
    }, 0);
  }
}

/**
 * Pan (never zoom) so the given node sits in the middle of the canvas band
 * NOT covered by the unified sidebar. On short-landscape devices the open
 * sidebar overlays ~42vw of the canvas and routinely hides the very node
 * being edited. No-op when the node is already inside the visible band.
 *
 * Uses the sidebar's offsetWidth + document direction (not its live rect):
 * the open/close transition is a transform, so mid-animation rects lie
 * while offsetWidth and the final anchored side are stable.
 */
function centerSelectedNodeInVisibleCanvas(node) {
  try {
    const canvas = S.canvas;
    if (!canvas || !node) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    let visLeft = rect.left;
    let visRight = rect.right;
    const sidebar = document.getElementById('unifiedSidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      const w = sidebar.offsetWidth || 0;
      const rtl = (document.documentElement.dir || 'ltr') === 'rtl';
      if (rtl) visLeft = Math.max(visLeft, w); // sidebar docks left in RTL
      else visRight = Math.min(visRight, window.innerWidth - w);
    }
    if (visRight - visLeft < 80) return; // no meaningful canvas visible
    const dpr = canvas.width / rect.width;
    const nodeScreenX = (node.x * S.viewScale * S.viewStretchX + S.viewTranslate.x) / dpr + rect.left;
    // Already comfortably visible? Leave the view alone.
    const margin = 30;
    if (nodeScreenX >= visLeft + margin && nodeScreenX <= visRight - margin) return;
    const targetX = (visLeft + visRight) / 2;
    const targetYCss = rect.top + rect.height / 2;
    const nodeScreenY = (node.y * S.viewScale * S.viewStretchY + S.viewTranslate.y) / dpr + rect.top;
    const tx = S.viewTranslate.x + (targetX - nodeScreenX) * dpr;
    // Keep vertical position unless the node is off-canvas vertically
    const ty = (nodeScreenY < rect.top + margin || nodeScreenY > rect.bottom - margin)
      ? S.viewTranslate.y + (targetYCss - nodeScreenY) * dpr
      : S.viewTranslate.y;
    window.__setViewState?.(S.viewScale, tx, ty);
  } catch (_) { /* view pan is best-effort */ }
}

/**
 * True when the node still carries measurement/schematic data that a drag
 * would clear (mirrors the one-time clear in pointerMove).
 */
function nodeHasProtectedMeasurement(node) {
  return (
    node.surveyX != null ||
    node.surveyY != null ||
    node.surveyZ != null ||
    node.schematicX != null ||
    node.schematicY != null ||
    (node.gnssFixQuality != null && node.gnssFixQuality !== 6)
  );
}

function pointerMove(x, y) {
  const world = F.screenToWorld(x, y);
  if (pendingDetailsForSelectedNode && selectedNodeDownScreen) {
    const dxScreen = x - selectedNodeDownScreen.x;
    const dyScreen = y - selectedNodeDownScreen.y;
    if (Math.hypot(dxScreen, dyScreen) > selectedNodeMoveThreshold) {
      pendingDetailsForSelectedNode = false;
      pendingDeselect = false;
      clearLongPressTimer();
    }
  }
  if (S.isDragging && S.selectedNode) {
    // Protect only RTK-Fixed (quality 4) survey points from being overwritten
    // by a drag — that's the gold-standard measurement. RTK-Float (quality 5)
    // and all lower-quality fixes are REPLACEABLE by manual drag per product
    // rule: "adding a new coordinate replaces any prior schematic or float
    // measurement."
    if (
      S.selectedNode.surveyX != null &&
      S.selectedNode.surveyY != null &&
      S.selectedNode.gnssFixQuality === 4
    ) {
      S.isDragging = false;
      return;
    }
    if (S.selectedNode.positionLocked && S.selectedNode.manual_x != null && S.selectedNode.manual_y != null) {
      S.isDragging = false;
      return;
    }

    // Touch-only jitter gate: while the node still carries a measurement,
    // ignore sub-threshold travel entirely (no move, no wipe, no save) so a
    // gloved finger-wobble cannot destroy survey data. Once travel becomes
    // deliberate the normal drag (incl. the one-time clear below) proceeds.
    if (
      lastPointerType === 'touch' &&
      dragStartNodeState && !dragStartNodeState.measurementCleared &&
      selectedNodeDownScreen &&
      nodeHasProtectedMeasurement(S.selectedNode) &&
      Math.hypot(x - selectedNodeDownScreen.x, y - selectedNodeDownScreen.y) < TOUCH_MEASURED_DRAG_THRESHOLD
    ) {
      return;
    }

    // Clear any stale schematic anchor / non-Fixed survey data exactly once
    // per drag, the first time we actually move the node. After this point
    // the node's x/y (and derived manual_x/y) are the sole source of truth.
    if (dragStartNodeState && !dragStartNodeState.measurementCleared) {
      const hadMeasurement = nodeHasProtectedMeasurement(S.selectedNode);
      if (hadMeasurement) {
        S.selectedNode.surveyX = null;
        S.selectedNode.surveyY = null;
        S.selectedNode.surveyZ = null;
        S.selectedNode.schematicX = null;
        S.selectedNode.schematicY = null;
        // Demote to Manual quality so downstream code (icons, completeness,
        // heatmap) treats this node as user-placed rather than surveyed.
        S.selectedNode.gnssFixQuality = 6;
        // hasCoordinates becomes true only if we can derive ITM from the
        // drag (reference point available) — otherwise the node is purely
        // schematic/canvas now.
        S.selectedNode.hasCoordinates = false;
      }
      dragStartNodeState.measurementCleared = true;
    }

    S.selectedNode.x = world.x - S.dragOffset.x;
    S.selectedNode.y = world.y - S.dragOffset.y;
    const refDrag = F.getMapReferencePoint();
    if (refDrag && refDrag.itm && refDrag.canvas && S.coordinateScale > 0) {
      S.selectedNode.manual_x = refDrag.itm.x + (S.selectedNode.x - refDrag.canvas.x) / S.coordinateScale;
      S.selectedNode.manual_y = refDrag.itm.y - (S.selectedNode.y - refDrag.canvas.y) / S.coordinateScale;
      // With a valid reference, the drag produces real ITM coordinates.
      S.selectedNode.hasCoordinates = true;
    }
    F.updateNodeTimestamp(S.selectedNode);
    F.saveToStorage();
    F.scheduleDraw();
    F.autoPanWhenDragging(x, y);
    return;
  }
  if (S.currentMode === 'edge' && (S.pendingEdgeTail || S.pendingEdgeStartPosition)) {
    S.pendingEdgePreview = { x: world.x, y: world.y };
    F.scheduleDraw();
  }
}

function pointerUp() {
  if (dragStartNodeState && S.selectedNode && String(S.selectedNode.id) === String(dragStartNodeState.id)) {
    const dx = S.selectedNode.x - dragStartNodeState.oldX;
    const dy = S.selectedNode.y - dragStartNodeState.oldY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      F.pushUndo({
        type: 'nodeMove',
        nodeId: dragStartNodeState.id,
        oldX: dragStartNodeState.oldX,
        oldY: dragStartNodeState.oldY,
        oldSurveyX: dragStartNodeState.oldSurveyX,
        oldSurveyY: dragStartNodeState.oldSurveyY,
        // Round-trip all fields we cleared during the drag so undo can
        // restore the pre-drag measurement state (schematic anchor, RTK-Float
        // survey, fix-quality flag, hasCoordinates). Without these the undo
        // was losing the measurement silently.
        oldSurveyZ: dragStartNodeState.oldSurveyZ,
        oldSchematicX: dragStartNodeState.oldSchematicX,
        oldSchematicY: dragStartNodeState.oldSchematicY,
        oldGnssFixQuality: dragStartNodeState.oldGnssFixQuality,
        oldHasCoordinates: dragStartNodeState.oldHasCoordinates,
      });
    }
  }
  dragStartNodeState = null;
  S.isDragging = false;
  if (pendingDetailsForSelectedNode && S.selectedNode) {
    if (pendingDeselect) {
      S.selectedNode = null;
      S.selectedEdge = null;
      F.renderDetails();
    } else {
      F.renderDetails();
      // Touch-select only: slide the node out from behind the sidebar once
      // the panel has opened (the unified-sidebar bridge flips the class
      // async). Mouse/desktop and programmatic selections are unaffected.
      if (lastPointerType === 'touch') {
        const selNode = S.selectedNode;
        setTimeout(() => {
          if (S.selectedNode === selNode) centerSelectedNodeInVisibleCanvas(selNode);
        }, 60);
      }
    }
    F.scheduleDraw();
  }
  pendingDetailsForSelectedNode = false;
  pendingDeselect = false;
  selectedNodeDownScreen = null;
}

// ── Init: wire up event listeners ───────────────────────────────────────────

export function initPointerHandlers() {
  const canvas = S.canvas;

  // Mouse events
  canvas.addEventListener('mousedown', (e) => {
    commitIdInputIfFocused();
    if (e.button === 1 || S.spacePanning) {
      S.isPanning = true;
      S.panStart = { x: e.clientX, y: e.clientY };
      S.translateStart = { ...S.viewTranslate };
      canvas.style.cursor = 'grabbing';
    } else {
      if (e.button === 0) {
        const world = F.screenToWorld(e.offsetX, e.offsetY);
        const node = findNodeAt(world.x, world.y);
        const edgeAt = (S.currentMode === 'edge') ? findEdgeAt(world.x, world.y) : null;
        if (node || edgeAt) {
          lastPointerType = 'mouse';
          pointerDown(e.offsetX, e.offsetY);
        } else {
          if (!window.__sketchReadOnly) {
            const danglingHit = F.findDanglingEndpointAt(world.x, world.y);
            if (danglingHit) {
              S.isDraggingDanglingEnd = true;
              S.draggingDanglingEdge = danglingHit.edge;
              S.draggingDanglingType = danglingHit.type;
              const pos = danglingHit.type === 'outbound'
                ? danglingHit.edge.danglingEndpoint : danglingHit.edge.tailPosition;
              F._setDraggingDanglingStart(pos ? { x: pos.x, y: pos.y } : null);
              canvas.style.cursor = 'grabbing';
              return;
            }
          }
          mousePanCandidate = true;
          mouseAddPending = (S.currentMode === 'node' || S.currentMode === 'home' || S.currentMode === 'drainage' || S.currentMode === 'edge');
          mouseAddPoint = { x: e.offsetX, y: e.offsetY };
          S.panStart = { x: e.clientX, y: e.clientY };
          S.translateStart = { ...S.viewTranslate };
          canvas.style.cursor = 'grab';
        }
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (S.isDraggingDanglingEnd && S.draggingDanglingEdge) {
      const world = F.screenToWorld(e.offsetX, e.offsetY);
      if (S.draggingDanglingType === 'outbound') {
        S.draggingDanglingEdge.danglingEndpoint = { x: world.x, y: world.y };
      } else {
        S.draggingDanglingEdge.tailPosition = { x: world.x, y: world.y };
      }
      S.danglingSnapTarget = F.findDanglingSnapTarget(world.x, world.y, S.draggingDanglingEdge);
      F.markEdgeLabelCacheDirty();
      F.scheduleDraw();
      return;
    }
    if (S.isPanning) {
      const dx = e.clientX - S.panStart.x;
      const dy = e.clientY - S.panStart.y;
      S.viewTranslate.x = S.translateStart.x + dx;
      S.viewTranslate.y = S.translateStart.y + dy;
      F.scheduleDraw();
    } else {
      if (mousePanCandidate) {
        const dx = e.clientX - S.panStart.x;
        const dy = e.clientY - S.panStart.y;
        if (Math.hypot(dx, dy) > MOUSE_TAP_MOVE_THRESHOLD) {
          S.isPanning = true;
          canvas.style.cursor = 'grabbing';
          S.viewTranslate.x = S.translateStart.x + dx;
          S.viewTranslate.y = S.translateStart.y + dy;
          mouseAddPending = false;
          F.scheduleDraw();
          return;
        }
      }
      pointerMove(e.offsetX, e.offsetY);
      if (!S.isDragging && !mousePanCandidate) {
        const world = F.screenToWorld(e.offsetX, e.offsetY);
        const danglingHit = F.findDanglingEndpointAt(world.x, world.y);
        const prevHovered = S.hoveredDanglingEndpoint;
        S.hoveredDanglingEndpoint = danglingHit;
        if (danglingHit) {
          canvas.style.cursor = 'grab';
        } else if (prevHovered) {
          canvas.style.cursor = '';
        }
        if (!!danglingHit !== !!prevHovered) F.scheduleDraw();

        // Reference layer hover tooltip
        _updateRefLayerTooltip(e.offsetX, e.offsetY, world);
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    commitIdInputIfFocused();
    if (S.isDraggingDanglingEnd && S.draggingDanglingEdge) {
      F.finalizeDanglingEndpointDrag();
      return;
    }
    if (S.isPanning) {
      S.isPanning = false;
      canvas.style.cursor = '';
    } else {
      if (mousePanCandidate && mouseAddPending && mouseAddPoint) {
        pointerDown(mouseAddPoint.x, mouseAddPoint.y);
      }
      pointerUp();
    }
    mousePanCandidate = false;
    mouseAddPending = false;
    mouseAddPoint = null;
  });

  canvas.addEventListener('mouseleave', () => {
    if (S.isDraggingDanglingEnd && S.draggingDanglingEdge) {
      F.finalizeDanglingEndpointDrag();
      return;
    }
    pointerUp();
  });

  // Touch events for mobile
  canvas.addEventListener('touchstart', (e) => {
    commitIdInputIfFocused();
    if (e.touches.length > 0) {
      e.preventDefault();
      F.invalidateCanvasRectCache();
      const rect = F.getCachedCanvasRect();
      if (e.touches.length >= 2) {
        S.isPinching = true;
        S.isDragging = false;
        clearLongPressTimer();
        touchAddPending = false;
        touchAddPoint = null;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
        const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
        pinchStartDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        pinchStartScale = S.viewScale;
        const centerScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        pinchCenterWorld = F.screenToWorld(centerScreen.x, centerScreen.y);
      } else {
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const world = F.screenToWorld(x, y);
        if (S.currentMode === 'edge') {
          let nodeAt = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION);
          const edgeAt = findEdgeAt(world.x, world.y, TOUCH_EDGE_HIT_THRESHOLD);
          if (!nodeAt && edgeAt) {
            nodeAt = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION * 1.6);
          }
          if (nodeAt || edgeAt) {
            if (!S.pendingEdgeTail && !S.pendingEdgeStartPosition) {
              if (nodeAt) {
                S.pendingEdgeTail = nodeAt;
                S.pendingEdgePreview = { x: world.x, y: world.y };
                _chainArmed = false;
                S.selectedNode = null;
                S.selectedEdge = null;
                touchAddPending = false;
                touchAddPoint = null;
                F.renderDetails();
                F.scheduleDraw();
                F.showToast(t('toasts.chooseTarget'));
              } else if (edgeAt) {
                S.selectedEdge = edgeAt;
                S.selectedNode = null;
                touchAddPending = false;
                touchAddPoint = null;
                F.renderDetails();
                F.scheduleDraw();
              }
            } else if (S.pendingEdgeTail) {
              if (nodeAt) {
                if (String(nodeAt.id) !== String(S.pendingEdgeTail.id)) {
                  const created = F.createEdge(S.pendingEdgeTail.id, nodeAt.id);
                  // Chain: the head becomes the next tail (mirrors the mouse
                  // branch) — one tap per manhole in a run.
                  S.pendingEdgeTail = nodeAt;
                  S.pendingEdgePreview = { x: world.x, y: world.y };
                  _chainArmed = true;
                  F.scheduleDraw();
                  if (created) {
                    F.showToast(t('toasts.edgeCreated'), 1200);
                  } else {
                    F.showToast(t('toasts.edgeExists'));
                  }
                } else {
                  // Same node: keep the chain armed; cancel via the chip,
                  // Escape, or a mode switch.
                  F.scheduleDraw();
                }
              } else if (edgeAt) {
                S.pendingEdgeTail = null;
                S.pendingEdgePreview = null;
                S.selectedEdge = edgeAt;
                S.selectedNode = null;
                F.renderDetails();
                F.scheduleDraw();
              }
            } else if (S.pendingEdgeStartPosition) {
              if (nodeAt) {
                const inboundEdge = F.createInboundDanglingEdge(
                  S.pendingEdgeStartPosition.x,
                  S.pendingEdgeStartPosition.y,
                  nodeAt.id
                );
                S.pendingEdgeStartPosition = null;
                S.pendingEdgePreview = null;
                if (inboundEdge) {
                  F.showToast(t('toasts.danglingEdgeCreated'));
                  F.updateIncompleteEdgeTracker();
                }
                F.scheduleDraw();
              } else if (edgeAt) {
                S.pendingEdgeStartPosition = null;
                S.pendingEdgePreview = null;
                S.selectedEdge = edgeAt;
                S.selectedNode = null;
                F.renderDetails();
                F.scheduleDraw();
              }
            }
          } else {
            touchPanCandidate = true;
            touchAddPending = true;
            touchAddPoint = { x, y };
          }
        } else {
          const nodeAt = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION);
          if (nodeAt) {
            if (S.selectedNode && String(S.selectedNode.id) === String(nodeAt.id)) {
              pendingDeselect = true;
            } else {
              S.selectedNode = nodeAt;
              S.selectedEdge = null;
              pendingDeselect = false;
              S.__wizardActiveTab = null;
            }
            S.dragOffset.x = world.x - nodeAt.x;
            S.dragOffset.y = world.y - nodeAt.y;
            S.isDragging = true;
            // Full measurement snapshot — must match the mouse-path literal
            // above so undo can restore surveyZ/schematic/fixQuality after a
            // touch drag wipes them (undo-redo restores per-field only when
            // the old value is !== undefined)
            dragStartNodeState = {
              id: nodeAt.id,
              oldX: nodeAt.x,
              oldY: nodeAt.y,
              oldSurveyX: nodeAt.surveyX,
              oldSurveyY: nodeAt.surveyY,
              oldSurveyZ: nodeAt.surveyZ,
              oldSchematicX: nodeAt.schematicX,
              oldSchematicY: nodeAt.schematicY,
              oldGnssFixQuality: nodeAt.gnssFixQuality,
              oldHasCoordinates: nodeAt.hasCoordinates,
              measurementCleared: false,
            };
            touchAddPending = false;
            touchAddPoint = null;
            // Double-tap detection for context menu
            const now = performance.now();
            if (!window.__sketchReadOnly && String(nodeAt.id) === _lastTapNodeId && (now - _lastTapTime) < DOUBLE_TAP_MS) {
              _lastTapNodeId = null;
              _lastTapTime = 0;
              showNodeContextMenu(nodeAt, x, y);
              touchAddPending = false;
              touchAddPoint = null;
              S.isDragging = false;
              return;
            }
            _lastTapNodeId = String(nodeAt.id);
            _lastTapTime = now;
            // Start long-press timer
            clearLongPressTimer();
            if (!window.__sketchReadOnly) {
              const lpNode = nodeAt;
              const lpX = x;
              const lpY = y;
              longPressTimer = setTimeout(() => {
                longPressTimer = null;
                S.isDragging = false;
                pendingDetailsForSelectedNode = false;
                _longPressEdgeTail = lpNode;
                S.pendingEdgeTail = lpNode;
                S.pendingEdgePreview = { x: lpX, y: lpY };
                navigator.vibrate?.(30);
                F.showToast(t('toasts.longPressEdge'));
                F.scheduleDraw();
              }, LONG_PRESS_MS);
            }
            lastPointerType = 'touch';
            pendingDetailsForSelectedNode = true;
            selectedNodeDownScreen = { x, y };
            selectedNodeMoveThreshold = TOUCH_TAP_MOVE_THRESHOLD;
            F.scheduleDraw();
          } else {
            if (!window.__sketchReadOnly) {
              const danglingHit = F.findDanglingEndpointAt(world.x, world.y);
              if (danglingHit) {
                S.isDraggingDanglingEnd = true;
                S.draggingDanglingEdge = danglingHit.edge;
                S.draggingDanglingType = danglingHit.type;
                const pos = danglingHit.type === 'outbound'
                  ? danglingHit.edge.danglingEndpoint : danglingHit.edge.tailPosition;
                F._setDraggingDanglingStart(pos ? { x: pos.x, y: pos.y } : null);
                touchAddPending = false;
                touchAddPoint = null;
                return;
              }
            }
            touchPanCandidate = true;
            touchAddPending = (S.currentMode === 'node' || S.currentMode === 'home' || S.currentMode === 'drainage' || S.currentMode === 'issue');
            touchAddPoint = { x, y };
          }
        }
      }
    }
  });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      e.preventDefault();
      const rect = F.getCachedCanvasRect();
      if (e.touches.length >= 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
        const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (pinchStartDistance && pinchStartScale) {
          const newScale = pinchStartScale * (dist / pinchStartDistance);
          const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
          S.viewScale = clamped;
          const centerScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          S.viewTranslate.x = centerScreen.x - S.viewScale * S.viewStretchX * pinchCenterWorld.x;
          S.viewTranslate.y = centerScreen.y - S.viewScale * S.viewStretchY * pinchCenterWorld.y;
          F.scheduleDraw();
        }
        touchAddPending = false;
        touchAddPoint = null;
      } else {
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        if (_longPressEdgeTail) {
          const world = F.screenToWorld(x, y);
          S.pendingEdgePreview = { x: world.x, y: world.y };
          F.scheduleDraw();
        } else if (S.currentMode === 'edge' && (S.pendingEdgeTail || S.pendingEdgeStartPosition)) {
          const world = F.screenToWorld(x, y);
          S.pendingEdgePreview = { x: world.x, y: world.y };
          F.scheduleDraw();
        } else {
          if (S.isDraggingDanglingEnd && S.draggingDanglingEdge) {
            const world = F.screenToWorld(x, y);
            if (S.draggingDanglingType === 'outbound') {
              S.draggingDanglingEdge.danglingEndpoint = { x: world.x, y: world.y };
            } else {
              S.draggingDanglingEdge.tailPosition = { x: world.x, y: world.y };
            }
            S.danglingSnapTarget = F.findDanglingSnapTarget(world.x, world.y, S.draggingDanglingEdge);
            F.markEdgeLabelCacheDirty();
            F.scheduleDraw();
            return;
          }
          if (touchPanCandidate && touchAddPoint) {
            const dx = (touch.clientX - (touchAddPoint.x + rect.left));
            const dy = (touch.clientY - (touchAddPoint.y + rect.top));
            if (Math.hypot(dx, dy) > TOUCH_TAP_MOVE_THRESHOLD) {
              S.viewTranslate.x += dx;
              S.viewTranslate.y += dy;
              touchAddPoint = { x, y };
              touchAddPending = false;
              F.scheduleDraw();
              return;
            }
          }
          pointerMove(x, y);
        }
        if (touchAddPending && touchAddPoint) {
          const dx = x - touchAddPoint.x;
          const dy = y - touchAddPoint.y;
          if (Math.hypot(dx, dy) > TOUCH_TAP_MOVE_THRESHOLD) {
            touchAddPending = false;
            touchAddPoint = null;
          }
        }
      }
    }
  });

  canvas.addEventListener('touchend', (e) => {
    commitIdInputIfFocused();
    clearLongPressTimer();
    e.preventDefault();
    if (e.touches.length < 2) {
      S.isPinching = false;
      pinchStartDistance = null;
      pinchStartScale = null;
    }
    // Handle one-handed edge mode
    if (_longPressEdgeTail && e.touches.length === 0 && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      const dropX = touch.clientX - rect.left;
      const dropY = touch.clientY - rect.top;
      const world = F.screenToWorld(dropX, dropY);
      const targetNode = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION);
      if (targetNode && String(targetNode.id) !== String(_longPressEdgeTail.id)) {
        const created = F.createEdge(_longPressEdgeTail.id, targetNode.id);
        if (created) {
          F.showToast(t('toasts.edgeCreated'), 1200);
        } else {
          F.showToast(t('toasts.edgeExists'));
        }
      }
      _longPressEdgeTail = null;
      S.pendingEdgeTail = null;
      S.pendingEdgePreview = null;
      touchAddPending = false;
      touchAddPoint = null;
      touchPanCandidate = false;
      S.isDragging = false;
      F.scheduleDraw();
      return;
    }
    // Finalize dangling endpoint drag on touch end
    if (S.isDraggingDanglingEnd && S.draggingDanglingEdge && e.touches.length === 0) {
      F.finalizeDanglingEndpointDrag();
      touchPanCandidate = false;
      touchAddPending = false;
      touchAddPoint = null;
      return;
    }
    if (e.touches.length === 0) {
      if (touchAddPending && touchAddPoint && (S.currentMode === 'node' || S.currentMode === 'home' || S.currentMode === 'drainage' || S.currentMode === 'issue' || S.currentMode === 'edge') && !S.isDragging) {
        if (S.currentMode === 'edge') {
          pointerDown(touchAddPoint.x, touchAddPoint.y);
        } else {
          const world = F.screenToWorld(touchAddPoint.x, touchAddPoint.y);
          let nearNode = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION);
          const nearEdge = findEdgeAt(world.x, world.y, TOUCH_EDGE_HIT_THRESHOLD);
          if (!nearNode && nearEdge) {
            nearNode = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION * 1.6);
          }
          if (nearNode) {
            S.selectedNode = nearNode;
            S.selectedEdge = null;
            S.__wizardActiveTab = null;
            F.renderDetails();
            F.scheduleDraw();
            // Touch-select only: slide the node out from behind the sidebar
            // once the panel has opened (bridge flips the class async)
            setTimeout(() => {
              if (S.selectedNode === nearNode) centerSelectedNodeInVisibleCanvas(nearNode);
            }, 60);
          } else if (!nearEdge) {
            const created = F.createNode(world.x, world.y);
            if (S.currentMode === 'home' && created) {
              created.nodeType = 'Home';
            } else if (S.currentMode === 'drainage' && created) {
              created.nodeType = 'Drainage';
            } else if (S.currentMode === 'issue' && created) {
              created.nodeType = 'Issue';
              created.issueStatus = 'open';
              created.issueComments = [];
              S.selectedNode = created;
              F.renderDetails();
              setTimeout(() => {
                const firstInput = S.detailsContainer.querySelector('textarea, input:not([type="checkbox"])');
                if (firstInput) firstInput.focus();
              }, 0);
            }
            F.scheduleDraw();
          }
        }
      }
      touchAddPending = false;
      touchAddPoint = null;
      touchPanCandidate = false;
      pointerUp();
    }
  });

  canvas.addEventListener('touchcancel', (e) => {
    commitIdInputIfFocused();
    clearLongPressTimer();
    e.preventDefault();
    S.isPinching = false;
    pinchStartDistance = null;
    pinchStartScale = null;
    pointerUp();
  });
}
