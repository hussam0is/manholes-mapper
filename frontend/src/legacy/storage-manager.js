/**
 * storage-manager.js
 *
 * Extracted storage/persistence and ID management from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 */

import { STORAGE_KEYS, idbSaveCurrentCompat } from '../state/persistence.js';
import { isNumericId } from '../graph/id-utils.js';
import { DEFAULT_INPUT_FLOW_CONFIG } from '../state/constants.js';
import {
  isProjectCanvasMode,
  refreshActiveSketchData,
} from '../project/project-canvas-state.js';
import { getLastEditPosition, setLastEditPosition } from '../project/last-edit-tracker.js';
import { getUsername as getAuthUsername } from '../auth/auth-guard.js';
import { S, F } from './shared-state.js';
import { getLibrary, saveToLibrary } from './library-manager.js';
import {
  NODE_MATERIAL_OPTIONS,
  NODE_COVER_DIAMETERS,
  NODE_TYPES,
  EDGE_MATERIAL_OPTIONS,
  EDGE_TYPES,
} from '../state/constants.js';

// ── Convenience wrappers for cross-module calls ─────────────────────────
const t = (...args) => F.t(...args);
const showToast = (...args) => F.showToast(...args);

// ── Derived constant arrays (match main.js) ─────────────────────────────
const NODE_MATERIALS = NODE_MATERIAL_OPTIONS.map(o => o.label);
const EDGE_MATERIALS = EDGE_MATERIAL_OPTIONS.map(o => o.label);

// ── Helper ──────────────────────────────────────────────────────────────
function getCurrentUsername() {
  try {
    const username = getAuthUsername();
    return username || 'anonymous';
  } catch (_) {
    return 'anonymous';
  }
}

// ── ID management ───────────────────────────────────────────────────────
export function collectUsedNumericIds() {
  const used = new Set();
  for (const n of S.nodes) {
    if (!n) continue;
    if (isNumericId(n.id)) {
      used.add(parseInt(String(n.id), 10));
    }
  }
  return used;
}

export function findSmallestAvailableNumericId() {
  const used = collectUsedNumericIds();
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return String(candidate);
}

export function renameNodeIdInternal(oldId, newId) {
  const node = S.nodes.find((n) => String(n.id) === String(oldId));
  if (!node) return;
  node.id = String(newId);
  S.edges.forEach((edge) => {
    if (String(edge.tail) === String(oldId)) edge.tail = String(newId);
    if (String(edge.head) === String(oldId)) edge.head = String(newId);
  });
}

// ── Normalize legacy sketch data ────────────────────────────────────────
/**
 * Normalize legacy sketch data in-place so that both localStorage and library
 * loaders produce identical, fully-populated node/edge objects.
 *
 * @param {Array} nodes - Node array (mutated in-place)
 * @param {Array} edges - Edge array (mutated in-place)
 */
export function normalizeLegacySketch(nodes, edges) {
  nodes.forEach((node) => {
    // --- Required scalar fields ---
    if (node.material === undefined) node.material = NODE_MATERIALS[0];
    if (node.type === undefined) node.type = NODE_TYPES[0];

    // --- nodeType canonicalization ---
    if (node.nodeType === undefined) node.nodeType = 'Manhole';
    const nt = node.nodeType;
    if (nt === 'בית' || nt === 'Home' || nt === 'B') {
      node.nodeType = 'Home';
    } else if (nt === 'שוחה מכוסה' || nt === 'Covered' || nt === 'C') {
      node.nodeType = 'Covered';
    } else if (nt === 'קולטן' || nt === 'Drainage' || nt === 'D') {
      node.nodeType = 'Drainage';
    } else if (nt === 'Issue' || nt === 'בעיה') {
      node.nodeType = 'Issue';
    } else if (nt === 'ForLater' || nt === 'למדידה מאוחרת') {
      node.nodeType = 'ForLater';
    } else {
      node.nodeType = 'Manhole';
    }

    // --- Fields that are N/A for Home and Drainage nodes ---
    if (node.nodeType === 'Home') {
      node.material = NODE_MATERIALS[0];
      node.coverDiameter = '';
      node.access = '';
      node.nodeEngineeringStatus = '';
      if (node.maintenanceStatus === undefined) node.maintenanceStatus = 0;
      if (node.directConnection === undefined) node.directConnection = false;
    }
    if (node.nodeType === 'Drainage') {
      node.material = NODE_MATERIALS[0];
      node.coverDiameter = '';
      node.access = '';
      node.nodeEngineeringStatus = '';
      if (node.maintenanceStatus === undefined) node.maintenanceStatus = 0;
    }

    // --- coverDiameter ---
    if (node.coverDiameter === undefined) {
      node.coverDiameter = NODE_COVER_DIAMETERS[0];
    } else if (node.coverDiameter !== '') {
      const cdNum = Number(node.coverDiameter);
      node.coverDiameter = Number.isFinite(cdNum) ? Math.round(cdNum) : '';
    }

    // --- Numeric coercions ---
    if (node.access === undefined) node.access = 0;
    if (typeof node.access !== 'number') {
      const acc = Number(node.access);
      node.access = Number.isFinite(acc) ? acc : 0;
    }

    if (node.accuracyLevel === undefined) node.accuracyLevel = 0;
    if (typeof node.accuracyLevel !== 'number') {
      const acl = Number(node.accuracyLevel);
      node.accuracyLevel = Number.isFinite(acl) ? acl : 0;
    }

    if (node.nodeEngineeringStatus === undefined) node.nodeEngineeringStatus = 0;
    if (typeof node.nodeEngineeringStatus !== 'number') {
      const esn = Number(node.nodeEngineeringStatus);
      node.nodeEngineeringStatus = Number.isFinite(esn) ? esn : 0;
    }

    if (node.maintenanceStatus === undefined) node.maintenanceStatus = 0;
    if (typeof node.maintenanceStatus !== 'number') {
      const ms = Number(node.maintenanceStatus);
      node.maintenanceStatus = Number.isFinite(ms) ? ms : 0;
    }

    // --- id coercion ---
    node.id = String(node.id);

    // --- gnssFixQuality migration ---
    if (node.gnssFixQuality === undefined && node.surveyX != null && node.surveyY != null) {
      node.gnssFixQuality = 4;
    }
    if (node.gnssFixQuality === 6 && node.surveyX != null && node.surveyY != null) {
      if (node.manual_x == null) node.manual_x = node.surveyX;
      if (node.manual_y == null) node.manual_y = node.surveyY;
      node.surveyX = null;
      node.surveyY = null;
      node.surveyZ = null;
      node.measure_precision = null;
    }
    if (
      node.gnssFixQuality != null &&
      node.gnssFixQuality !== 4 &&
      node.gnssFixQuality !== 5 &&
      node.gnssFixQuality !== 6 &&
      node.surveyX != null &&
      node.surveyY != null
    ) {
      if (node.manual_x == null) node.manual_x = node.surveyX;
      if (node.manual_y == null) node.manual_y = node.surveyY;
      node.surveyX = null;
      node.surveyY = null;
      node.surveyZ = null;
      node.measure_precision = null;
      node.gnssFixQuality = 6;
    }
  });

  edges.forEach((edge) => {
    // --- Default scalar fields ---
    if (edge.material === undefined) edge.material = EDGE_MATERIALS[0];
    if (edge.fall_depth === undefined) edge.fall_depth = '';
    if (edge.fall_position === undefined) edge.fall_position = '';
    if (edge.line_diameter === undefined) edge.line_diameter = '';
    if (edge.edge_type === undefined) edge.edge_type = EDGE_TYPES[0];

    // --- Numeric coercions ---
    if (edge.maintenanceStatus === undefined) edge.maintenanceStatus = 0;
    if (typeof edge.maintenanceStatus !== 'number') {
      const m = Number(edge.maintenanceStatus);
      edge.maintenanceStatus = Number.isFinite(m) ? m : 0;
    }

    if (edge.engineeringStatus === undefined) edge.engineeringStatus = 0;
    if (typeof edge.engineeringStatus !== 'number') {
      const es = Number(edge.engineeringStatus);
      edge.engineeringStatus = Number.isFinite(es) ? es : 0;
    }

    // --- id coercion (preserve null for dangling edges) ---
    edge.tail = edge.tail != null ? String(edge.tail) : null;
    edge.head = edge.head != null ? String(edge.head) : null;
  });
}

// ── Load from storage ───────────────────────────────────────────────────
/**
 * Load a previously saved sketch from localStorage if present.
 * @returns {boolean} true if a sketch was loaded; false otherwise
 */
export function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.sketch);
    if (!data) return false;
    const parsed = JSON.parse(data);
    if (!parsed || !parsed.nodes || !parsed.edges) return false;
    S.nodes = parsed.nodes;
    S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
    S.edges = parsed.edges;
    F.clearUndoStack();
    F.markEdgeLabelCacheDirty();
    S.creationDate = parsed.creationDate || null;
    S.currentSketchId = parsed.sketchId || null;
    S.currentSketchName = parsed.sketchName || null;
    S.currentProjectId = parsed.projectId || null;
    S.currentInputFlowConfig = parsed.inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
    F.updateSketchNameDisplay();
    // Normalize nodes and edges to canonical shape
    normalizeLegacySketch(S.nodes, S.edges);
    // Recompute nextNodeId as (max numeric id among nodes) + 1
    let maxNumericId = 0;
    for (const n of S.nodes) {
      const parsedId = parseInt(String(n.id), 10);
      if (Number.isFinite(parsedId)) {
        if (parsedId > maxNumericId) maxNumericId = parsedId;
      }
    }
    S.nextNodeId = maxNumericId + 1;
    // Restore last edit position if available
    if (parsed.lastEditX != null && parsed.lastEditY != null) {
      setLastEditPosition(parsed.lastEditX, parsed.lastEditY);
    }
    // Recompute node types based on measurements
    F.computeNodeTypes();
    // Auto-reposition nodes from embedded geographic coordinates
    F.autoRepositionFromEmbeddedCoords();
    // Load reference layers for the project (if sketch belongs to one)
    F.loadProjectReferenceLayers(S.currentProjectId);
    F.updateCanvasEmptyState();
    return true;
  } catch (e) {
    console.error('[App] Error loading sketch from storage:', e.message);
    return false;
  }
}

// ── Save to storage ─────────────────────────────────────────────────────
/**
 * Persist the current sketch to localStorage.
 * Uses requestIdleCallback to defer heavy JSON serialization off the main thread.
 */
export function saveToStorage() {
  // Skip saving completely empty sketches
  if ((!S.nodes || S.nodes.length === 0) && (!S.edges || S.edges.length === 0)) {
    return;
  }

  const nowIso = new Date().toISOString();
  const username = getCurrentUsername();

  F.markEdgeLabelCacheDirty();
  S._issueSetsDirty = true;
  const currentNodes = S.nodes;
  const currentEdges = S.edges;
  const currentNextNodeId = S.nextNodeId;
  const currentCreationDate = S.creationDate;
  const savedSketchId = S.currentSketchId;
  let savedSketchName = S.currentSketchName;
  const savedProjectId = S.currentProjectId;
  const savedInputFlowConfig = S.currentInputFlowConfig;
  const savedAdminConfig = typeof S.adminConfig !== 'undefined' ? S.adminConfig : {};
  
  const doSave = () => {
    const lastEdit = getLastEditPosition();
    const payload = {
      nodes: currentNodes,
      edges: currentEdges,
      nextNodeId: currentNextNodeId,
      creationDate: currentCreationDate,
      sketchId: savedSketchId,
      sketchName: savedSketchName,
      projectId: savedProjectId,
      inputFlowConfig: savedInputFlowConfig,
      lastEditedBy: username,
      lastEditedAt: nowIso,
      lastEditX: lastEdit?.x ?? null,
      lastEditY: lastEdit?.y ?? null,
    };
    
    const payloadJson = JSON.stringify(payload);
    localStorage.setItem(STORAGE_KEYS.sketch, payloadJson);
    idbSaveCurrentCompat(payload);
    
    if (S.autosaveEnabled) {
      saveToLibrary();
    }
    
    // Trigger cloud sync if authenticated and online
    if (savedSketchId && window.syncService?.debouncedSyncToCloud) {
      let nameForSync = savedSketchName;
      if (!nameForSync && savedSketchId) {
        const lib = getLibrary();
        const rec = lib.find((r) => r.id === savedSketchId);
        if (rec && rec.name) {
          nameForSync = rec.name;
          S.currentSketchName = rec.name;
          F.updateSketchNameDisplay();
        }
      }
      const sketchForSync = {
        id: savedSketchId,
        name: nameForSync,
        creationDate: currentCreationDate,
        nodes: currentNodes,
        edges: currentEdges,
        adminConfig: savedAdminConfig,
        projectId: savedProjectId,
        snapshotInputFlowConfig: savedInputFlowConfig,
        lastEditedBy: username,
        lastEditedAt: nowIso,
      };
      window.syncService.debouncedSyncToCloud(sketchForSync);
    }

    // Update side panel stats in project-canvas mode
    if (isProjectCanvasMode()) {
      refreshActiveSketchData();
    }
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doSave, { timeout: 100 });
  } else {
    setTimeout(doSave, 0);
  }
}

// ── Debounced save ──────────────────────────────────────────────────────
export const debouncedSaveToStorage = (function () {
  /** @type {number|undefined} */
  let timeoutId;
  const delayMs = 150;
  return function () {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      try { saveToStorage(); showToast(t('toasts.saved') || 'Saved', 'success', 1000); } catch (_) { }
    }, delayMs);
  };
})();

// ── Clear storage ───────────────────────────────────────────────────────
/**
 * Remove the stored sketch from localStorage.
 */
export function clearStorage() {
  localStorage.removeItem(STORAGE_KEYS.sketch);
  idbSaveCurrentCompat(null);
}
