/**
 * toolbar-events.js
 *
 * Extracted toolbar button event listeners and UI helpers from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * Exported init function `initToolbarEvents()` wires up event listeners that
 * require DOM elements to already be available.
 */

import { S, F } from './shared-state.js';
import { STORAGE_KEYS } from '../state/persistence.js';
import { encodeUtf16LeWithBom } from '../utils/encoding.js';
import { menuEvents, bridgeAllToLegacy, legacyMappings } from '../menu/menu-events.js';
import { closeMobileMenu } from './mobile-menu.js';
import { syncFlyoutIcon } from './project-ui.js';
import { scheduleDraw } from './canvas-draw.js';
import { renderDetails } from './details-panel.js';
import { renderHome, hideHome } from './home-renderer.js';
import { hidePanelAnimated, mountAuthSignIn, mountAuthSignUp } from './auth-ui.js';
import { applyLangToStaticUI } from './i18n-ui.js';
import { commitIdInputIfFocused } from '../dom/dom-utils.js';
import { openAdminModal, openAdminScreen } from './admin-handlers.js';
import { saveToLibrary } from './library-manager.js';

// Convenience wrappers so calls inside this module look like plain calls
const t = (...args) => F.t(...args);
const showToast = (...args) => F.showToast(...args);

// ── Size scale constants ─────────────────────────────────────────────────
const MIN_SIZE_SCALE = 0.5;
const MAX_SIZE_SCALE = 10.0;
const SIZE_SCALE_STEP = 0.2; // 20% increments

// ── Size scale functions ─────────────────────────────────────────────────

/**
 * Increase the node/edge size scale by one step.
 */
export function increaseSizeScale() {
  const newScale = Math.min(S.sizeScale + SIZE_SCALE_STEP, MAX_SIZE_SCALE);
  if (newScale !== S.sizeScale) {
    S.sizeScale = newScale;
    localStorage.setItem(STORAGE_KEYS.sizeScale, String(S.sizeScale));
    scheduleDraw();
    const pct = Math.round(S.sizeScale * 100);
    showToast(t('toasts.sizeChanged', pct));
  }
}

/**
 * Decrease the node/edge size scale by one step.
 */
export function decreaseSizeScale() {
  const newScale = Math.max(S.sizeScale - SIZE_SCALE_STEP, MIN_SIZE_SCALE);
  if (newScale !== S.sizeScale) {
    S.sizeScale = newScale;
    localStorage.setItem(STORAGE_KEYS.sizeScale, String(S.sizeScale));
    scheduleDraw();
    const pct = Math.round(S.sizeScale * 100);
    showToast(t('toasts.sizeChanged', pct));
  }
}

/**
 * Update the visual style of auto-size toggle buttons.
 */
export function updateAutoSizeBtnStyle() {
  const autoSizeBtn = document.getElementById('autoSizeBtn');
  const mobileAutoSizeBtn = document.getElementById('mobileAutoSizeBtn');
  const activeClass = 'menu-btn--active';
  if (autoSizeBtn) {
    autoSizeBtn.classList.toggle(activeClass, S.autoSizeEnabled);
  }
  if (mobileAutoSizeBtn) {
    mobileAutoSizeBtn.classList.toggle('active', S.autoSizeEnabled);
  }
}

/**
 * Toggle auto-size mode on/off.
 */
export function toggleAutoSize() {
  S.autoSizeEnabled = !S.autoSizeEnabled;
  localStorage.setItem(STORAGE_KEYS.autoSize, String(S.autoSizeEnabled));
  updateAutoSizeBtnStyle();
  scheduleDraw();
  showToast(S.autoSizeEnabled ? t('toasts.autoSizeOn') : t('toasts.autoSizeOff'));
}

/**
 * Load persisted size scale and auto-size preferences from localStorage.
 */
export function loadSizePreferences() {
  // Load size scale preference
  try {
    const savedSizeScale = localStorage.getItem(STORAGE_KEYS.sizeScale);
    if (savedSizeScale !== null) {
      const parsed = parseFloat(savedSizeScale);
      if (!isNaN(parsed) && parsed >= MIN_SIZE_SCALE && parsed <= MAX_SIZE_SCALE) {
        S.sizeScale = parsed;
      }
    }
  } catch (e) {
    console.warn('[App] Failed to load size scale preference:', e.message);
  }

  // Load auto size preference
  try {
    const savedAutoSize = localStorage.getItem(STORAGE_KEYS.autoSize);
    if (savedAutoSize === 'false') {
      S.autoSizeEnabled = false;
    }
  } catch (e) {
    console.warn('[App] Failed to load auto size preference:', e.message);
  }
  updateAutoSizeBtnStyle();
}

// ── Helper: wire mode button ─────────────────────────────────────────────
function setMode(mode) {
  try { commitIdInputIfFocused(); } catch (_) {}
  S.currentMode = mode;

  const nodeModeBtn = document.getElementById('nodeModeBtn');
  const homeNodeModeBtn = document.getElementById('homeNodeModeBtn');
  const drainageNodeModeBtn = document.getElementById('drainageNodeModeBtn');
  const issueNodeModeBtn = document.getElementById('issueNodeModeBtn');
  const edgeModeBtn = document.getElementById('edgeModeBtn');

  if (nodeModeBtn) nodeModeBtn.classList.toggle('active', mode === 'node');
  if (homeNodeModeBtn) homeNodeModeBtn.classList.toggle('active', mode === 'home');
  if (drainageNodeModeBtn) drainageNodeModeBtn.classList.toggle('active', mode === 'drainage');
  if (issueNodeModeBtn) issueNodeModeBtn.classList.toggle('active', mode === 'issue');
  if (edgeModeBtn) edgeModeBtn.classList.toggle('active', mode === 'edge');

  S.pendingEdgeTail = null;
  S.pendingEdgePreview = null;
  S.pendingEdgeStartPosition = null;
  S.selectedNode = null;
  S.selectedEdge = null;
  renderDetails();
}

// ── Init ─────────────────────────────────────────────────────────────────

/**
 * Wire up all toolbar button event listeners.
 * Call once after DOM is ready and all modules are initialized.
 */
export function initToolbarEvents() {
  // ── Mode selection buttons ──────────────────────────────────────────
  const nodeModeBtn = document.getElementById('nodeModeBtn');
  const homeNodeModeBtn = document.getElementById('homeNodeModeBtn');
  const drainageNodeModeBtn = document.getElementById('drainageNodeModeBtn');
  const issueNodeModeBtn = document.getElementById('issueNodeModeBtn');
  const edgeModeBtn = document.getElementById('edgeModeBtn');

  if (nodeModeBtn) {
    nodeModeBtn.addEventListener('click', () => {
      setMode('node');
      syncFlyoutIcon();
      showToast(t('toasts.nodeMode'), 1200);
    });
  }
  if (homeNodeModeBtn) {
    homeNodeModeBtn.addEventListener('click', () => {
      setMode('home');
      showToast(t('home'), 1200);
    });
  }
  if (drainageNodeModeBtn) {
    drainageNodeModeBtn.addEventListener('click', () => {
      setMode('drainage');
      showToast(t('drainage'), 1200);
    });
  }
  if (issueNodeModeBtn) {
    issueNodeModeBtn.addEventListener('click', () => {
      setMode('issue');
      showToast(t('toasts.issueMode'), 1200);
    });
  }
  if (edgeModeBtn) {
    edgeModeBtn.addEventListener('click', () => {
      setMode('edge');
      syncFlyoutIcon();
      showToast(t('toasts.edgeMode'), 1200);
    });
  }

  // ── Export nodes CSV ────────────────────────────────────────────────
  const exportNodesBtn = document.getElementById('exportNodesBtn');
  if (exportNodesBtn) {
    exportNodesBtn.addEventListener('click', async () => {
      if (S.nodes.length === 0) {
        showToast(t('alerts.noNodesToExport'));
        return;
      }
      showToast(t('toasts.exporting'));
      const { exportNodesCsv } = await import('../utils/csv.js');
      const csvContent = 'sep=,\r\n' + exportNodesCsv(S.nodes, S.adminConfig, t).replace(/\n/g, '\r\n');
      const bytes = encodeUtf16LeWithBom(csvContent);
      const blob = new Blob([bytes], { type: 'text/csv;charset=utf-16le;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const datePart = S.creationDate || new Date().toISOString().substr(0, 10);
      a.download = `nodes_${datePart}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('toasts.nodesExported'));
    });
  }

  // ── Export edges CSV ────────────────────────────────────────────────
  const exportEdgesBtn = document.getElementById('exportEdgesBtn');
  if (exportEdgesBtn) {
    exportEdgesBtn.addEventListener('click', async () => {
      if (S.edges.length === 0) {
        showToast(t('alerts.noEdgesToExport'));
        return;
      }
      showToast(t('toasts.exporting'));
      const { exportEdgesCsv } = await import('../utils/csv.js');
      const csvContent = 'sep=,\r\n' + exportEdgesCsv(S.edges, S.adminConfig, t).replace(/\n/g, '\r\n');
      const bytes = encodeUtf16LeWithBom(csvContent);
      const blob = new Blob([bytes], { type: 'text/csv;charset=utf-16le;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const datePart = S.creationDate || new Date().toISOString().substr(0, 10);
      a.download = `edges_${datePart}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('toasts.edgesExported'));
    });
  }

  // ── Export sketch JSON ──────────────────────────────────────────────
  const exportSketchBtn = document.getElementById('exportSketchBtn');
  if (exportSketchBtn) {
    exportSketchBtn.addEventListener('click', async () => {
      if (S.nodes.length === 0 && S.edges.length === 0) {
        showToast(t('alerts.noSketchToExport'));
        return;
      }
      try {
        showToast(t('toasts.exporting'));
        const { exportSketchToJson } = await import('../utils/sketch-io.js');
        const sketchData = {
          nodes: S.nodes,
          edges: S.edges,
          nextNodeId: S.nextNodeId,
          creationDate: S.creationDate,
          sketchId: S.currentSketchId,
          sketchName: S.currentSketchName,
        };
        exportSketchToJson(sketchData);
        showToast(t('toasts.sketchExported'));
      } catch (error) {
        console.error('[App] Export error:', error.message);
        showToast(t('alerts.exportFailed'));
      }
    });
  }

  // ── Import sketch JSON ──────────────────────────────────────────────
  const importSketchBtn = document.getElementById('importSketchBtn');
  const importSketchFile = document.getElementById('importSketchFile');
  if (importSketchBtn && importSketchFile) {
    importSketchBtn.addEventListener('click', () => {
      importSketchFile.click();
    });

    importSketchFile.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const { importSketchFromJson } = await import('../utils/sketch-io.js');
        const importedSketch = await importSketchFromJson(file);

        const hasCurrentSketch = S.nodes.length > 0 || S.edges.length > 0;
        let shouldReplace = true;

        if (hasCurrentSketch) {
          shouldReplace = confirm(t('alerts.confirmImportReplace'));
          if (!shouldReplace) {
            importSketchFile.value = '';
            return;
          }
        }

        // Load the imported sketch
        S.nodes = importedSketch.nodes;
        S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
        S.edges = importedSketch.edges;
        S.nextNodeId = importedSketch.nextNodeId;
        S.creationDate = importedSketch.creationDate;
        S.currentSketchId = null;
        S.currentSketchName = importedSketch.sketchName;
        S.currentProjectId = importedSketch.projectId || null;

        // Rebuild coordinatesMap and originalNodePositions from imported nodes
        const newCoordsMap = new Map();
        const origPositions = new Map();
        for (const node of importedSketch.nodes) {
          if (node.hasCoordinates && node.surveyX != null && node.surveyY != null) {
            newCoordsMap.set(String(node.id), { x: node.surveyX, y: node.surveyY, z: node.surveyZ || 0 });
          }
          // Restore schematic positions if saved in the sketch
          if (node.schematicX != null && node.schematicY != null) {
            origPositions.set(node.id, { x: node.schematicX, y: node.schematicY });
          }
        }
        S.coordinatesMap = newCoordsMap;
        S.originalNodePositions = origPositions;
        const { DEFAULT_INPUT_FLOW_CONFIG } = await import('../state/constants.js');
        S.currentInputFlowConfig = importedSketch.inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
        F.updateSketchNameDisplay();

        // If the sketch has embedded coords, recreate reference layer and set map ref point
        if (newCoordsMap.size > 0) {
          try { F.addCoordinatesReferenceLayer?.(newCoordsMap); } catch (_) { }
          try { F.updateMapReferencePoint?.(); } catch (_) { }
        }

        F.computeNodeTypes();
        F.saveToStorage();
        F.updateCanvasEmptyState();
        F.draw();
        renderDetails();

        try { F.recenterView(); } catch (_) { }

        showToast(t('toasts.sketchImported'));
      } catch (error) {
        console.error('[App] Import error:', error.message);
        showToast(t('alerts.importFailed'));
      } finally {
        importSketchFile.value = '';
      }
    });
  }

  // ── Import Legacy Sketch (sketch + CSV coordinates) ─────────────────
  const importLegacySketchBtn = document.getElementById('importLegacySketchBtn');
  const mobileImportLegacySketchBtn = document.getElementById('mobileImportLegacySketchBtn');
  const importLegacySketchFile = document.getElementById('importLegacySketchFile');
  const importLegacyCoordsFile = document.getElementById('importLegacyCoordsFile');
  
  if (importLegacySketchFile && importLegacyCoordsFile) {
    let pendingSketchFile = null;
    let pendingCoordsFile = null;

    const triggerLegacyImport = () => {
      // Reset pending files
      pendingSketchFile = null;
      pendingCoordsFile = null;
      // First, prompt for the sketch file
      importLegacySketchFile.click();
    };

    if (importLegacySketchBtn) importLegacySketchBtn.addEventListener('click', triggerLegacyImport);
    if (mobileImportLegacySketchBtn) mobileImportLegacySketchBtn.addEventListener('click', () => {
      closeMobileMenu();
      triggerLegacyImport();
    });

    importLegacySketchFile.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      pendingSketchFile = file;
      // Now prompt for coordinates CSV
      importLegacyCoordsFile.click();
    });

    importLegacyCoordsFile.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        pendingSketchFile = null;
        importLegacySketchFile.value = '';
        return;
      }
      
      pendingCoordsFile = file;

      try {
        showToast(t('toasts.importingLegacy') || 'מייבא שרטוט ישן...');
        
        // Dynamic import to avoid loading legacy-import.js unless needed
        const { importLegacySketch, readFileAsJson, readFileAsText } = await import('../utils/legacy-import.js');
        
        // Read both files
        const [sketchData, csvContent] = await Promise.all([
          readFileAsJson(pendingSketchFile),
          readFileAsText(pendingCoordsFile)
        ]);

        // Check if current sketch has data
        const hasCurrentSketch = S.nodes.length > 0 || S.edges.length > 0;
        let shouldReplace = true;

        if (hasCurrentSketch) {
          shouldReplace = confirm(t('alerts.confirmImportReplace') || 'השרטוט הנוכחי יוחלף. להמשיך?');
          if (!shouldReplace) {
            importLegacySketchFile.value = '';
            importLegacyCoordsFile.value = '';
            pendingSketchFile = null;
            pendingCoordsFile = null;
            return;
          }
        }

        // Process the legacy import
        const importedData = importLegacySketch(sketchData, csvContent);
        const importedSketch = importedData.sketch;

        // Load the imported sketch
        S.nodes = importedSketch.nodes;
        S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
        S.edges = importedSketch.edges;
        S.nextNodeId = importedSketch.nextNodeId;
        S.creationDate = importedSketch.creationDate;
        S.currentSketchId = null;
        S.currentSketchName = importedSketch.name;
        S.currentProjectId = null;

        // Rebuild coordinatesMap from imported nodes
        const newCoordsMap = new Map();
        const origPositions = new Map();
        for (const node of importedSketch.nodes) {
          if (node.hasCoordinates && node.surveyX != null && node.surveyY != null) {
            newCoordsMap.set(String(node.id), { x: node.surveyX, y: node.surveyY, z: node.surveyZ || 0 });
          }
          if (node.schematicX != null && node.schematicY != null) {
            origPositions.set(node.id, { x: node.schematicX, y: node.schematicY });
          }
        }
        S.coordinatesMap = newCoordsMap;
        S.originalNodePositions = origPositions;
        
        const { DEFAULT_INPUT_FLOW_CONFIG } = await import('../state/constants.js');
        S.currentInputFlowConfig = DEFAULT_INPUT_FLOW_CONFIG;
        F.updateSketchNameDisplay();

        // If the sketch has embedded coords, recreate reference layer
        if (newCoordsMap.size > 0) {
          try { F.addCoordinatesReferenceLayer?.(newCoordsMap); } catch (_) { }
          try { F.updateMapReferencePoint?.(); } catch (_) { }
        }

        F.computeNodeTypes();
        F.saveToStorage();
        F.updateCanvasEmptyState();
        F.draw();
        renderDetails();

        try { F.recenterView(); } catch (_) { }

        showToast(t('toasts.legacySketchImported') || 'שרטוט ישן יובא בהצלחה');
      } catch (error) {
        console.error('[App] Legacy import error:', error.message);
        showToast(t('alerts.legacyImportFailed') || 'ייבוא שרטוט ישן נכשל');
      } finally {
        importLegacySketchFile.value = '';
        importLegacyCoordsFile.value = '';
        pendingSketchFile = null;
        pendingCoordsFile = null;
      }
    });
  }

  // ── Size control buttons ────────────────────────────────────────────
  const sizeIncreaseBtn = document.getElementById('sizeIncreaseBtn');
  const sizeDecreaseBtn = document.getElementById('sizeDecreaseBtn');
  const mobileSizeIncreaseBtn = document.getElementById('mobileSizeIncreaseBtn');
  const mobileSizeDecreaseBtn = document.getElementById('mobileSizeDecreaseBtn');
  const autoSizeBtn = document.getElementById('autoSizeBtn');
  const mobileAutoSizeBtn = document.getElementById('mobileAutoSizeBtn');

  if (sizeIncreaseBtn) sizeIncreaseBtn.addEventListener('click', increaseSizeScale);
  if (sizeDecreaseBtn) sizeDecreaseBtn.addEventListener('click', decreaseSizeScale);
  if (mobileSizeIncreaseBtn) mobileSizeIncreaseBtn.addEventListener('click', increaseSizeScale);
  if (mobileSizeDecreaseBtn) mobileSizeDecreaseBtn.addEventListener('click', decreaseSizeScale);
  if (autoSizeBtn) autoSizeBtn.addEventListener('click', toggleAutoSize);
  if (mobileAutoSizeBtn) mobileAutoSizeBtn.addEventListener('click', toggleAutoSize);

  // ── Help modal controls ─────────────────────────────────────────────
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const closeHelpBtn = document.getElementById('closeHelpBtn');

  if (helpBtn && helpModal) {
    helpBtn.addEventListener('click', () => {
      helpModal.classList.remove('panel-closing');
      helpModal.style.display = 'flex';
    });
  }
  if (closeHelpBtn && helpModal) {
    closeHelpBtn.addEventListener('click', () => {
      hidePanelAnimated(helpModal);
    });
  }
  if (helpModal) {
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) hidePanelAnimated(helpModal);
    });
  }

  // ── Language selector ───────────────────────────────────────────────
  menuEvents.on('languageChange', ({ value, element }) => {
    const newValue = value === 'en' ? 'en' : 'he';
    S.currentLang = newValue;
    try { window.currentLang = S.currentLang; } catch (_) { }
    localStorage.setItem(STORAGE_KEYS.lang, S.currentLang);

    // Sync all language selects
    document.querySelectorAll('[data-action="languageChange"]').forEach(select => {
      if (select.value !== newValue) {
        select.value = newValue;
      }
    });

    applyLangToStaticUI();
    document.title = t('appTitle') || 'Manhole Mapper';
    document.dispatchEvent(new Event('appLanguageChanged'));
    const homePanel = document.getElementById('homePanel');
    if (homePanel && homePanel.style.display === 'flex') {
      renderHome();
    }
    renderDetails();
    // Re-mount auth forms if login panel is visible
    const loginPanel = document.getElementById('loginPanel');
    if (loginPanel && loginPanel.style.display === 'flex') {
      const hash = location.hash;
      if (hash === '#/signup') {
        mountAuthSignUp();
      } else {
        mountAuthSignIn();
      }
      const loginTitle = document.getElementById('loginTitle');
      const loginSubtitle = document.getElementById('loginSubtitle');
      if (loginTitle) loginTitle.textContent = t('auth.loginTitle');
      if (loginSubtitle) loginSubtitle.textContent = t('auth.loginSubtitle');
    }
    // If admin modal is open, rebuild its UI
    const adminModal = document.getElementById('adminModal');
    if (adminModal && adminModal.style.display !== 'none') {
      openAdminModal();
    }
    try {
      if (location.hash === '#/admin') {
        openAdminScreen();
      }
    } catch (_) { }

    if (element && element.id === 'mobileLangSelect') {
      closeMobileMenu();
    }
  });

  // ── Autosave toggle ─────────────────────────────────────────────────
  const autosaveToggle = document.getElementById('autosaveToggle');
  if (autosaveToggle) {
    const savedPref = localStorage.getItem(STORAGE_KEYS.autosave);
    if (savedPref !== null) S.autosaveEnabled = savedPref === 'true';
    autosaveToggle.checked = S.autosaveEnabled;
    autosaveToggle.addEventListener('change', () => {
      S.autosaveEnabled = !!autosaveToggle.checked;
      localStorage.setItem(STORAGE_KEYS.autosave, String(S.autosaveEnabled));
      showToast(S.autosaveEnabled ? t('toasts.autosaveOn') : t('toasts.autosaveOff'));
      if (S.autosaveEnabled) saveToLibrary();
    });
  }

  // ── Home button ─────────────────────────────────────────────────────
  const homeBtn = document.getElementById('homeBtn');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      renderHome();
    });
  }

  // ── Bridge legacy menu events to DOM elements ───────────────────────
  // Wire up menuEvents actions that map to existing button IDs
  bridgeAllToLegacy(legacyMappings);
}
