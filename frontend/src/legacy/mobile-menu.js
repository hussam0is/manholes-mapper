/**
 * mobile-menu.js
 *
 * Extracted mobile menu controls from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * Exported init function `initMobileMenu()` wires up event listeners that
 * require DOM elements to already be available.
 */

import { setZoom } from './view-utils.js';
import { S, F } from './shared-state.js';

// ── Constants (mirrored from main.js module scope) ──────────────────────
const SCALE_STEP = 1.1; // 10%

// ── DOM refs ────────────────────────────────────────────────────────────
const mobileMenu          = document.getElementById('mobileMenu');
const mobileMenuBackdrop  = document.getElementById('mobileMenuBackdrop');
const mobileHomeBtn       = document.getElementById('mobileHomeBtn');
const mobileNewSketchBtn  = document.getElementById('mobileNewSketchBtn');
const mobileZoomInBtn     = document.getElementById('mobileZoomInBtn');
const mobileZoomOutBtn    = document.getElementById('mobileZoomOutBtn');
const canvasZoomInBtn     = document.getElementById('canvasZoomInBtn');
const canvasZoomOutBtn    = document.getElementById('canvasZoomOutBtn');
const mobileExportSketchBtn = document.getElementById('mobileExportSketchBtn');
const mobileImportSketchBtn = document.getElementById('mobileImportSketchBtn');
const mobileExportNodesBtn  = document.getElementById('mobileExportNodesBtn');
const mobileExportEdgesBtn  = document.getElementById('mobileExportEdgesBtn');
const mobileSaveBtn         = document.getElementById('mobileSaveBtn');
const mobileAutosaveToggle  = document.getElementById('mobileAutosaveToggle');
const mobileHelpBtn         = document.getElementById('mobileHelpBtn');
const homeBtn             = document.getElementById('homeBtn');
const newSketchBtn        = document.getElementById('newSketchBtn');
const exportSketchBtn     = document.getElementById('exportSketchBtn');
const importSketchBtn     = document.getElementById('importSketchBtn');
const exportNodesBtn      = document.getElementById('exportNodesBtn');
const exportEdgesBtn      = document.getElementById('exportEdgesBtn');
const saveBtn             = document.getElementById('saveBtn');
const autosaveToggle      = document.getElementById('autosaveToggle');
const helpBtn             = document.getElementById('helpBtn');

// === Mobile menu controls ===
// Delegate to the main-entry.js closeMobileMenu (which properly manages
// the isMobileMenuOpen state and accessibility attributes).
// Falls back to direct DOM manipulation if the window version isn't available yet.
export function closeMobileMenu() {
  if (window.closeMobileMenu && window.closeMobileMenu !== closeMobileMenu) {
    window.closeMobileMenu();
    return;
  }
  // Fallback: direct DOM close (before main-entry.js has initialised)
  if (mobileMenu) mobileMenu.style.display = 'none';
  if (mobileMenuBackdrop) mobileMenuBackdrop.style.display = 'none';
  document.body.style.overflow = ''; // Restore scrolling
}

// NOTE: Toggle, close-button, and backdrop click handlers are managed by
// initMobileMenuBehavior() in main-entry.js. Do NOT duplicate them here
// — having two handlers causes a state-desync bug where the menu opens
// and immediately closes (see isMobileMenuOpen flag in main-entry.js).

/**
 * Wire up all mobile menu button event listeners.
 * Call once after DOM is ready and all desktop button references exist.
 */
export function initMobileMenu() {
  // Wire up mobile buttons to mimic their desktop counterparts
  if (mobileHomeBtn && homeBtn) {
    mobileHomeBtn.addEventListener('click', () => {
      closeMobileMenu();
      homeBtn.click();
    });
  }
  if (mobileNewSketchBtn && newSketchBtn) {
    mobileNewSketchBtn.addEventListener('click', () => {
      closeMobileMenu();
      newSketchBtn.click();
    });
  }
  if (mobileZoomInBtn) {
    mobileZoomInBtn.addEventListener('click', () => {
      closeMobileMenu();
      setZoom(S.viewScale * SCALE_STEP);
    });
  }
  if (mobileZoomOutBtn) {
    mobileZoomOutBtn.addEventListener('click', () => {
      closeMobileMenu();
      setZoom(S.viewScale / SCALE_STEP);
    });
  }
  // Canvas toolbar zoom buttons (always visible, no pinch-zoom needed)
  if (canvasZoomInBtn) {
    canvasZoomInBtn.addEventListener('click', () => {
      setZoom(S.viewScale * SCALE_STEP);
    });
  }
  if (canvasZoomOutBtn) {
    canvasZoomOutBtn.addEventListener('click', () => {
      setZoom(S.viewScale / SCALE_STEP);
    });
  }
  // FAB zoom buttons (mobile only — mirrors canvas toolbar zoom)
  const fabZoomInBtn = document.getElementById('fabZoomInBtn');
  const fabZoomOutBtn = document.getElementById('fabZoomOutBtn');
  if (fabZoomInBtn) {
    fabZoomInBtn.addEventListener('click', () => {
      setZoom(S.viewScale * SCALE_STEP);
    });
  }
  if (fabZoomOutBtn) {
    fabZoomOutBtn.addEventListener('click', () => {
      setZoom(S.viewScale / SCALE_STEP);
    });
  }
  if (mobileExportSketchBtn && exportSketchBtn) {
    mobileExportSketchBtn.addEventListener('click', () => {
      closeMobileMenu();
      exportSketchBtn.click();
    });
  }
  if (mobileImportSketchBtn && importSketchBtn) {
    mobileImportSketchBtn.addEventListener('click', () => {
      closeMobileMenu();
      importSketchBtn.click();
    });
  }
  if (mobileExportNodesBtn && exportNodesBtn) {
    mobileExportNodesBtn.addEventListener('click', () => {
      closeMobileMenu();
      exportNodesBtn.click();
    });
  }
  if (mobileExportEdgesBtn && exportEdgesBtn) {
    mobileExportEdgesBtn.addEventListener('click', () => {
      closeMobileMenu();
      exportEdgesBtn.click();
    });
  }
  if (mobileSaveBtn && saveBtn) {
    mobileSaveBtn.addEventListener('click', () => {
      closeMobileMenu();
      saveBtn.click();
    });
  }
  // Autosave toggle: keep both toggles in sync and dispatch change on original toggle
  if (mobileAutosaveToggle && autosaveToggle) {
    // Initialize mobile toggle to match saved preference
    mobileAutosaveToggle.checked = autosaveToggle.checked;
    // When mobile toggle changes, propagate to desktop toggle
    mobileAutosaveToggle.addEventListener('change', () => {
      autosaveToggle.checked = mobileAutosaveToggle.checked;
      // Trigger change event on desktop toggle
      autosaveToggle.dispatchEvent(new Event('change'));
      closeMobileMenu();
    });
    // When desktop toggle changes (e.g. via settings), update mobile toggle
    autosaveToggle.addEventListener('change', () => {
      mobileAutosaveToggle.checked = autosaveToggle.checked;
    });
  }
  // Help button
  if (mobileHelpBtn && helpBtn) {
    mobileHelpBtn.addEventListener('click', () => {
      closeMobileMenu();
      helpBtn.click();
    });
  }
}
