/**
 * Street View Module
 * Provides a draggable "pegman" widget that opens Google Street View
 * at the drop position on the canvas.
 */

import { itmToWgs84 } from './projections.js';
import { getMapReferencePoint } from './govmap-layer.js';

/** @type {HTMLElement|null} */
let pegmanEl = null;
/** @type {HTMLElement|null} */
let ghostEl = null;
/** @type {HTMLElement|null} */
let dropIndicator = null;
/** @type {boolean} */
let isDragging = false;

// Callbacks supplied by the host application
let _getViewState = null;
let _getCoordinateScale = null;
let _showToast = null;
let _t = null;

/**
 * Convert a screen-space (client-relative to canvas) position to ITM coordinates.
 * Mirrors the logic in main.js screenToWorld then world→ITM.
 * @param {number} screenX - X relative to canvas element
 * @param {number} screenY - Y relative to canvas element
 * @returns {{x: number, y: number}|null} ITM coordinates or null
 */
function screenToItm(screenX, screenY) {
  const ref = getMapReferencePoint();
  if (!ref) return null;

  const vs = _getViewState();
  const coordScale = _getCoordinateScale();

  // screen → world (pre-zoom, pre-stretch)
  const worldX = (screenX - vs.viewTranslate.x) / (vs.viewScale * vs.viewStretchX);
  const worldY = (screenY - vs.viewTranslate.y) / (vs.viewScale * vs.viewStretchY);

  // world → ITM using the reference point
  const itmX = ref.itm.x + (worldX - ref.canvas.x) / coordScale;
  const itmY = ref.itm.y - (worldY - ref.canvas.y) / coordScale; // Y is flipped

  return { x: itmX, y: itmY };
}

/**
 * Open Google Street View at the given WGS84 coordinates.
 * @param {number} lat
 * @param {number} lon
 */
function openStreetView(lat, lon) {
  const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
  window.open(url, '_blank', 'noopener');
}

/**
 * Create the pegman DOM elements and insert them into the canvas container.
 * @param {HTMLElement} canvasContainer
 */
function createPegmanElements(canvasContainer) {
  // Main pegman widget (always visible when active)
  pegmanEl = document.createElement('div');
  pegmanEl.id = 'streetViewPegman';
  pegmanEl.className = 'street-view-pegman';
  pegmanEl.setAttribute('role', 'button');
  pegmanEl.setAttribute('tabindex', '0');
  pegmanEl.setAttribute('draggable', 'false'); // We handle drag manually
  pegmanEl.innerHTML = `
    <span class="material-icons street-view-pegman__icon">person_pin</span>
    <span class="street-view-pegman__label" id="pegmanLabel"></span>
  `;
  canvasContainer.appendChild(pegmanEl);

  // Ghost element (follows cursor during drag)
  ghostEl = document.createElement('div');
  ghostEl.className = 'street-view-pegman-ghost';
  ghostEl.innerHTML = '<span class="material-icons">person_pin</span>';
  ghostEl.style.display = 'none';
  document.body.appendChild(ghostEl);

  // Drop indicator circle (shows on canvas during drag)
  dropIndicator = document.createElement('div');
  dropIndicator.className = 'street-view-drop-indicator';
  dropIndicator.style.display = 'none';
  canvasContainer.appendChild(dropIndicator);
}

/**
 * Update the pegman tooltip/label with the current translation.
 */
function updateLabels() {
  if (!pegmanEl || !_t) return;
  const label = _t('streetView.dragHint') || 'Drag to street';
  pegmanEl.title = label;
  pegmanEl.setAttribute('aria-label', label);
  const labelEl = pegmanEl.querySelector('.street-view-pegman__label');
  if (labelEl) labelEl.textContent = label;
}

/**
 * Show or hide the pegman based on whether coordinates / reference point are available.
 * @param {boolean} visible
 */
export function setStreetViewVisible(visible) {
  if (pegmanEl) {
    pegmanEl.style.display = visible ? '' : 'none';
  }
}

/**
 * Attach drag event listeners to the pegman element.
 * @param {HTMLCanvasElement} canvas
 */
function attachDragHandlers(canvas) {
  if (!pegmanEl) return;

  // ---- Pointer events for drag ----
  function onPointerDown(e) {
    if (e.button !== 0) return; // Left click only

    const ref = getMapReferencePoint();
    if (!ref) {
      if (_showToast) _showToast(_t('streetView.noCoordinates') || 'Enable coordinates first to use Street View');
      return;
    }

    isDragging = true;
    pegmanEl.classList.add('street-view-pegman--dragging');
    ghostEl.style.display = '';
    dropIndicator.style.display = '';

    moveGhost(e.clientX, e.clientY);
    moveIndicator(e.clientX, e.clientY, canvas);

    // Capture pointer for smooth drag even outside the element
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);

    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    moveGhost(e.clientX, e.clientY);
    moveIndicator(e.clientX, e.clientY, canvas);
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;

    pegmanEl.classList.remove('street-view-pegman--dragging');
    ghostEl.style.display = 'none';
    dropIndicator.style.display = 'none';

    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);

    // Calculate drop position relative to canvas
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // Check if drop is within canvas bounds
    if (canvasX < 0 || canvasY < 0 || canvasX > rect.width || canvasY > rect.height) {
      // Dropped outside canvas – ignore
      return;
    }

    // Convert to ITM → WGS84
    const itm = screenToItm(canvasX, canvasY);
    if (!itm) {
      if (_showToast) _showToast(_t('streetView.noCoordinates') || 'Enable coordinates first');
      return;
    }

    const wgs = itmToWgs84(itm.x, itm.y);
    if (!wgs || isNaN(wgs.lat) || isNaN(wgs.lon)) {
      if (_showToast) _showToast(_t('streetView.conversionError') || 'Could not determine location');
      return;
    }

    // Open Street View
    openStreetView(wgs.lat, wgs.lon);
    if (_showToast) {
      _showToast(_t('streetView.opening') || `Opening Street View (${wgs.lat.toFixed(5)}, ${wgs.lon.toFixed(5)})`);
    }

    e.preventDefault();
    e.stopPropagation();
  }

  // Keyboard support – Enter to show info
  pegmanEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (_showToast) _showToast(_t('streetView.dragHint') || 'Drag to a position on the map to open Street View');
    }
  });

  pegmanEl.addEventListener('pointerdown', onPointerDown);
}

/**
 * Move the ghost element to follow the cursor.
 */
function moveGhost(clientX, clientY) {
  if (!ghostEl) return;
  ghostEl.style.left = `${clientX}px`;
  ghostEl.style.top = `${clientY}px`;
}

/**
 * Move the drop indicator on the canvas.
 */
function moveIndicator(clientX, clientY, canvas) {
  if (!dropIndicator) return;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  // Only show if within canvas
  const inBounds = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
  dropIndicator.style.display = inBounds ? '' : 'none';

  if (inBounds) {
    dropIndicator.style.left = `${x}px`;
    dropIndicator.style.top = `${y}px`;
  }
}

/**
 * Initialize the Street View pegman widget.
 * @param {object} config
 * @param {HTMLElement} config.canvasContainer - The canvas container element
 * @param {HTMLCanvasElement} config.canvas - The canvas element
 * @param {Function} config.getViewState - Returns { viewTranslate, viewScale, viewStretchX, viewStretchY }
 * @param {Function} config.getCoordinateScale - Returns the coordinate scale (pixels per meter)
 * @param {Function} config.showToast - Display a toast message
 * @param {Function} config.t - Translation function
 */
export function initStreetView(config) {
  const { canvasContainer, canvas, getViewState, getCoordinateScale, showToast, t } = config;

  _getViewState = getViewState;
  _getCoordinateScale = getCoordinateScale;
  _showToast = showToast;
  _t = t;

  // Create DOM elements
  createPegmanElements(canvasContainer);

  // Attach drag behaviour
  attachDragHandlers(canvas);

  // Set initial labels
  updateLabels();

  // Initially hidden – shown when map reference point is available
  setStreetViewVisible(!!getMapReferencePoint());
}

/**
 * Update translations when language changes.
 * @param {Function} t - New translation function
 */
export function updateStreetViewTranslations(t) {
  _t = t;
  updateLabels();
}
