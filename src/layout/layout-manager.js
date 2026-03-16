/**
 * Layout Manager — orchestrates the unified layout system.
 *
 * Activates unified layout (body.unified-layout), initializes all three
 * new components (sidebar, toolbar, status bar), and hides old floating elements.
 *
 * The unified layout is always active (no feature flag needed after rollout).
 */

import { initUnifiedSidebar, destroyUnifiedSidebar } from './unified-sidebar.js';
import { initUnifiedToolbar, destroyUnifiedToolbar } from './unified-toolbar.js';
import { initMicroStatusBar, destroyMicroStatusBar } from './micro-status-bar.js';

let initialized = false;
let resizeHandler = null;

/**
 * Initialize the unified layout system.
 * Call this from main-entry.js at DOMContentLoaded.
 */
export function initUnifiedLayout() {
  if (initialized) return;
  initialized = true;

  // Activate unified layout mode
  document.body.classList.add('unified-layout');

  // Initialize components in order
  initMicroStatusBar();
  initUnifiedSidebar();
  initUnifiedToolbar();

  // Adjust canvas sizing for new toolbar height
  adjustCanvasForToolbar();

  console.debug('[Layout] Unified layout initialized');
}

/**
 * Tear down the entire unified layout and restore original UI
 */
export function destroyUnifiedLayout() {
  if (!initialized) return;

  destroyMicroStatusBar();
  destroyUnifiedSidebar();
  destroyUnifiedToolbar();

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }

  const container = document.getElementById('canvasContainer');
  if (container) container.style.paddingBottom = '';

  document.body.classList.remove('unified-layout');
  initialized = false;

  console.debug('[Layout] Unified layout destroyed');
}

/**
 * Adjust canvas container bottom padding so canvas doesn't render under the toolbar
 */
function adjustCanvasForToolbar() {
  const container = document.getElementById('canvasContainer');
  if (!container) return;

  const updatePadding = () => {
    const toolbar = document.getElementById('unifiedToolbar');
    if (toolbar) {
      const h = toolbar.offsetHeight || 56;
      container.style.paddingBottom = h + 'px';
    }
  };

  resizeHandler = updatePadding;

  // Update on resize
  window.addEventListener('resize', updatePadding);
  // Initial update after a frame for the toolbar to render
  requestAnimationFrame(updatePadding);
}
