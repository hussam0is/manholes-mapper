/**
 * FC Gesture Support — Edge-swipe to open panels
 *
 * Swipe from right edge → open right panel (properties)
 * Swipe from left edge → open left panel (status)
 * Swipe up from bottom → open bottom sheet
 */

const EDGE_ZONE = 24;       // px from screen edge to trigger
const SWIPE_THRESHOLD = 60; // px minimum swipe distance

/**
 * Initialize panel gesture detection
 * @param {import('./fc-panels.js').FCPanelManager} panelManager
 */
export function initPanelGestures(panelManager) {
  if (!panelManager) return;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let edge = null;

  document.addEventListener('pointerdown', (e) => {
    // Don't intercept if a panel is already open (scrim will handle dismiss)
    if (document.querySelector('.fc-panel--open')) return;
    // Don't intercept if touching the action bar or status bar
    if (e.target.closest('.fc-action-bar, .fc-status-bar, .fc-panel')) return;

    const x = e.clientX;
    const y = e.clientY;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isRTL = document.dir === 'rtl' || document.documentElement.dir === 'rtl';

    if (x <= EDGE_ZONE) {
      edge = isRTL ? 'right' : 'left';
      tracking = true;
    } else if (x >= w - EDGE_ZONE) {
      edge = isRTL ? 'left' : 'right';
      tracking = true;
    } else if (y >= h - 80) { // Bottom zone (slightly larger for bottom sheet)
      edge = 'bottom';
      tracking = true;
    }

    if (tracking) {
      startX = x;
      startY = y;
    }
  }, { passive: true });

  document.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const isRTL = document.dir === 'rtl' || document.documentElement.dir === 'rtl';

    if (edge === 'left') {
      const swipeInward = isRTL ? dx < -SWIPE_THRESHOLD : dx > SWIPE_THRESHOLD;
      if (swipeInward) panelManager.open('left');
    } else if (edge === 'right') {
      const swipeInward = isRTL ? dx > SWIPE_THRESHOLD : dx < -SWIPE_THRESHOLD;
      if (swipeInward) panelManager.open('right');
    } else if (edge === 'bottom') {
      if (dy < -SWIPE_THRESHOLD) panelManager.open('bottom');
    }

    edge = null;
  }, { passive: true });

  // Cancel tracking if pointer leaves the window
  document.addEventListener('pointercancel', () => {
    tracking = false;
    edge = null;
  }, { passive: true });
}
