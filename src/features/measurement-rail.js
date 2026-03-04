/**
 * Measurement Rail — Floating inline depth inputs on selected edges.
 * Positions two number inputs at 25% (tail) and 75% (head) along the edge.
 * Updates in real-time as the user pans/zooms the canvas.
 */

let railEl = null;
let tailInput = null;
let headInput = null;
let currentEdge = null;
let updateRAF = null;

/**
 * Convert world coordinates to screen coordinates.
 * Uses the current view transform globals.
 */
function worldToScreen(wx, wy) {
  const vs = window.__getViewState?.();
  if (!vs) return { x: 0, y: 0 };
  const stretch = window.__getStretch?.() || { x: 1, y: 1 };
  return {
    x: wx * stretch.x * vs.scale + vs.tx,
    y: wy * stretch.y * vs.scale + vs.ty
  };
}

function createRailDOM() {
  railEl = document.createElement('div');
  railEl.className = 'measurement-rail';
  railEl.style.display = 'none';

  tailInput = document.createElement('input');
  tailInput.type = 'number';
  tailInput.className = 'measurement-rail__input measurement-rail__input--tail';
  tailInput.step = '0.01';
  tailInput.placeholder = window.t?.('labels.tailDepth') || 'Tail';
  tailInput.inputMode = 'decimal';

  headInput = document.createElement('input');
  headInput.type = 'number';
  headInput.className = 'measurement-rail__input measurement-rail__input--head';
  headInput.step = '0.01';
  headInput.placeholder = window.t?.('labels.headDepth') || 'Head';
  headInput.inputMode = 'decimal';

  // Save on input change
  tailInput.addEventListener('input', () => {
    if (!currentEdge) return;
    currentEdge.tail_measurement = tailInput.value;
    if (typeof window.__scheduleDraw === 'function') window.__scheduleDraw();
    saveEdgeQuietly();
  });

  headInput.addEventListener('input', () => {
    if (!currentEdge) return;
    currentEdge.head_measurement = headInput.value;
    if (typeof window.__scheduleDraw === 'function') window.__scheduleDraw();
    saveEdgeQuietly();
  });

  railEl.appendChild(tailInput);
  railEl.appendChild(headInput);

  const container = document.getElementById('canvasContainer');
  if (container) {
    container.appendChild(railEl);
  } else {
    document.body.appendChild(railEl);
  }
}

function saveEdgeQuietly() {
  // Trigger storage save via menu events if available
  if (window.menuEvents) {
    window.menuEvents.emit('sketch:changed');
  }
}

/**
 * Position inputs along the edge using world-to-screen transform.
 */
function positionInputs() {
  if (!currentEdge || !railEl) return;

  const nodeMap = window.__nodeMap;
  if (!nodeMap) { hide(); return; }

  const tailNode = currentEdge.tail != null ? nodeMap.get(String(currentEdge.tail)) : null;
  const headNode = currentEdge.head != null ? nodeMap.get(String(currentEdge.head)) : null;

  if (!tailNode || !headNode) { hide(); return; }

  // Compute 25% and 75% positions along the edge
  const wx25 = tailNode.x + (headNode.x - tailNode.x) * 0.25;
  const wy25 = tailNode.y + (headNode.y - tailNode.y) * 0.25;
  const wx75 = tailNode.x + (headNode.x - tailNode.x) * 0.75;
  const wy75 = tailNode.y + (headNode.y - tailNode.y) * 0.75;

  const s25 = worldToScreen(wx25, wy25);
  const s75 = worldToScreen(wx75, wy75);

  // Offset slightly perpendicular to the edge
  const dx = s75.x - s25.x;
  const dy = s75.y - s25.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = len > 0 ? -dy / len * 24 : 0;
  const perpY = len > 0 ? dx / len * 24 : 0;

  tailInput.style.left = `${s25.x + perpX - 35}px`;
  tailInput.style.top = `${s25.y + perpY - 14}px`;
  headInput.style.left = `${s75.x + perpX - 35}px`;
  headInput.style.top = `${s75.y + perpY - 14}px`;
}

/**
 * Show the measurement rail for the given edge.
 */
export function showMeasurementRail(edge) {
  if (!railEl) createRailDOM();
  currentEdge = edge;
  tailInput.value = edge.tail_measurement || '';
  headInput.value = edge.head_measurement || '';
  railEl.style.display = '';
  positionInputs();
  scheduleUpdate();
}

/**
 * Hide the measurement rail.
 */
export function hideMeasurementRail() {
  if (railEl) railEl.style.display = 'none';
  currentEdge = null;
  if (updateRAF) {
    cancelAnimationFrame(updateRAF);
    updateRAF = null;
  }
}

/**
 * Update positions (call from draw loop or pan/zoom handler).
 */
function scheduleUpdate() {
  if (updateRAF) return;
  updateRAF = requestAnimationFrame(() => {
    updateRAF = null;
    positionInputs();
    if (currentEdge && railEl && railEl.style.display !== 'none') {
      scheduleUpdate();
    }
  });
}

function hide() {
  if (railEl) railEl.style.display = 'none';
  currentEdge = null;
}
