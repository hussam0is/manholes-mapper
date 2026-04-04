// Canvas FAB Speed Dial — collapses bottom-right action buttons into a single toggle
// Also manages the one-tap GPS capture FAB (draggable, shown when GPS is active)

import { gnssState } from './gnss/index.js';

/**
 * Initialize the Canvas FAB Speed Dial toolbar.
 */
export function initCanvasFabToolbar() {
  const toolbar = document.getElementById('canvasFabToolbar');
  const toggle = document.getElementById('canvasFabToggle');
  if (!toolbar || !toggle) return;

  function open() {
    toolbar.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function close() {
    toolbar.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (toolbar.classList.contains('open')) close();
    else open();
  });

  // Close when tapping outside
  document.addEventListener('click', (e) => {
    if (toolbar.classList.contains('open') && !toolbar.contains(e.target)) {
      close();
    }
  });

  // Close after clicking an action (recenter, density, etc.)
  const actions = toolbar.querySelector('.canvas-fab-toolbar__actions');
  if (actions) {
    actions.addEventListener('click', (e) => {
      if (e.target.closest('.canvas-fab-toolbar__item')) {
        close();
      }
    });
  }

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toolbar.classList.contains('open')) {
      close();
      toggle.focus();
    }
  });
}

// ═══════════════════════════════════════════════════════════
// One-tap GPS Capture FAB
// ═══════════════════════════════════════════════════════════

let _gpsFabEl = null;
let _gpsFabDragActive = false;
let _gpsFabPos = null; // { x, y } in viewport pixels (null = default bottom-right)

/**
 * Create and inject the GPS capture FAB into the DOM.
 * Must be called after DOMContentLoaded.
 */
export function initGpsCaptureFab() {
  if (_gpsFabEl) return; // already initialised

  const btn = document.createElement('button');
  btn.id = 'gpsCaptureFab';
  btn.className = 'gps-capture-fab';
  btn.setAttribute('aria-label', 'Add manhole at GPS location');
  btn.setAttribute('title', 'Add manhole at current GPS location');
  btn.setAttribute('draggable', 'false'); // we handle drag ourselves
  btn.innerHTML = `
    <span class="material-icons gps-capture-fab__icon" aria-hidden="true">add_location_alt</span>
    <span class="gps-capture-fab__label">Capture</span>
  `;

  // Hidden by default — only shown when GPS is active
  btn.style.display = 'none';

  document.body.appendChild(btn);
  _gpsFabEl = btn;

  // ── Tap action ──────────────────────────────────────────────
  btn.addEventListener('click', (e) => {
    if (_gpsFabDragActive) return; // don't fire after a drag
    e.stopPropagation();
    _captureNodeAtGps();
  });

  // ── Drag to reposition (left-hand support) ──────────────────
  _initGpsFabDrag(btn);

  // ── Show/hide based on GNSS state ───────────────────────────
  gnssState.on('position', _syncGpsFabVisibility);
  gnssState.on('connection', _syncGpsFabVisibility);
  _syncGpsFabVisibility();
}

/**
 * Show the FAB when GPS is active and has a valid position.
 * Hide it otherwise.
 */
function _syncGpsFabVisibility() {
  if (!_gpsFabEl) return;
  const pos = gnssState.getPosition ? gnssState.getPosition() : null;
  const liveMeasureActive = gnssState.isLiveMeasureEnabled
    ? gnssState.isLiveMeasureEnabled()
    : !!(gnssState.connectionType);
  const hasValidPos = pos && pos.isValid;

  if (liveMeasureActive && hasValidPos) {
    _showGpsFab();
  } else {
    _hideGpsFab();
  }
}

function _showGpsFab() {
  if (!_gpsFabEl) return;
  _gpsFabEl.style.display = 'flex';
  _applyFabPosition();
}

function _hideGpsFab() {
  if (!_gpsFabEl) return;
  _gpsFabEl.style.display = 'none';
}

/**
 * Apply stored drag position, or fall back to default (bottom-left, above canvas FAB).
 */
function _applyFabPosition() {
  if (!_gpsFabEl) return;
  if (_gpsFabPos) {
    _gpsFabEl.style.insetInlineStart = '';
    _gpsFabEl.style.insetInlineEnd = '';
    _gpsFabEl.style.bottom = '';
    _gpsFabEl.style.top = '';
    _gpsFabEl.style.left = `${_gpsFabPos.x}px`;
    _gpsFabEl.style.top = `${_gpsFabPos.y}px`;
  } else {
    // Default: bottom-left corner, clear of the canvas FAB speed dial (bottom-right)
    _gpsFabEl.style.left = '';
    _gpsFabEl.style.top = '';
    _gpsFabEl.style.insetInlineStart = '16px';
    _gpsFabEl.style.bottom = '72px';
  }
}

/**
 * Wire pointer-event drag handling on the FAB button.
 * Drag > 8px cancels the click action.
 */
function _initGpsFabDrag(btn) {
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;
  let pointerMoved = false;

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return; // left mouse only
    pointerMoved = false;
    _gpsFabDragActive = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = btn.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    btn.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  btn.addEventListener('pointermove', (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!_gpsFabDragActive && Math.hypot(dx, dy) > 8) {
      _gpsFabDragActive = true;
      btn.classList.add('gps-capture-fab--dragging');
    }
    if (_gpsFabDragActive) {
      const newLeft = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, startLeft + dx));
      const newTop  = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, startTop + dy));
      _gpsFabPos = { x: newLeft, y: newTop };
      btn.style.insetInlineStart = '';
      btn.style.insetInlineEnd = '';
      btn.style.bottom = '';
      btn.style.left = `${newLeft}px`;
      btn.style.top  = `${newTop}px`;
    }
  });

  btn.addEventListener('pointerup', () => {
    if (_gpsFabDragActive) {
      btn.classList.remove('gps-capture-fab--dragging');
      // keep _gpsFabDragActive = true briefly so click doesn't fire
      setTimeout(() => { _gpsFabDragActive = false; }, 50);
    }
  });

  btn.addEventListener('pointercancel', () => {
    btn.classList.remove('gps-capture-fab--dragging');
    _gpsFabDragActive = false;
  });
}

/**
 * Capture a node at the current GPS position.
 * Delegates to window.__createNodeFromMeasurement (wired in legacy/main.js).
 */
function _captureNodeAtGps() {
  const pos = gnssState.getPosition ? gnssState.getPosition() : null;
  if (!pos || !pos.isValid) {
    window.showToast?.('Waiting for GPS fix…');
    return;
  }

  if (typeof window.__createNodeFromMeasurement === 'function') {
    // Build a minimal result object matching the precision-measurement result shape
    window.__createNodeFromMeasurement({
      position: {
        lat:      pos.lat,
        lon:      pos.lon,
        alt:      pos.alt  ?? 0,
        accuracy: pos.accuracy ?? null,
      },
      source: 'gps-fab',
    });
    window.showToast?.('Manhole placed at GPS location');
  } else {
    window.showToast?.('GPS capture not ready — try again shortly');
  }
}

/**
 * Destroy the GPS capture FAB (cleanup for tests / hot-reload).
 */
export function destroyGpsCaptureFab() {
  if (!_gpsFabEl) return;
  gnssState.off?.('position', _syncGpsFabVisibility);
  gnssState.off?.('connection', _syncGpsFabVisibility);
  _gpsFabEl.remove();
  _gpsFabEl = null;
  _gpsFabPos = null;
  _gpsFabDragActive = false;
}
