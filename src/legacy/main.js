/*
 * Graph Sketcher PWA
 *
 * This script implements a simple canvas-based graph editor that allows users
 * to create directed graphs consisting of nodes and edges. Each node has a
 * sequential ID starting from 1 and can store an optional note. Each edge
 * stores references to the tail and head nodes as well as optional
 * measurements on either end. The state of the current sketch (including
 * creation date) is persisted in localStorage so that work is not lost
 * between sessions or when the application is offline. The sketch can be
 * exported to a CSV file with a specific schema.
 */

// Service worker and offline guards moved to src/serviceWorker/register-sw.js

// Offline guards moved to src/serviceWorker/register-sw.js

/*
 * IndexedDB bridging
 *
 * The application persists its state to localStorage for synchronous reads
 * throughout the code base.  To improve durability, every write to
 * localStorage is mirrored into IndexedDB using the functions below.
 * On startup we opportunistically restore any sketches from IndexedDB
 * into localStorage if localStorage is empty.  This hybrid approach
 * preserves the existing synchronous code while ensuring data is still
 * recoverable if localStorage is cleared or corrupt.
 */

// IndexedDB bridge moved to src/state/persistence.js and src/db.js
import { restoreFromIndexedDbIfNeeded, idbSaveCurrentCompat, idbSaveRecordCompat, idbDeleteRecordCompat, STORAGE_KEYS } from '../state/persistence.js';
import { mountSignIn as _mountSignIn, mountSignUp as _mountSignUp } from '../auth/auth-provider.jsx';
import { encodeUtf16LeWithBom } from '../utils/encoding.js';
import { distanceToSegment } from '../utils/geometry.js';
import { isNumericId, generateHomeInternalId } from '../graph/id-utils.js';
import { commitIdInputIfFocused } from '../dom/dom-utils.js';
import { AdminSettings, getNodeSpecs, getEdgeSpecs } from '../admin/admin-settings.js';
import { ProjectsSettings } from '../admin/projects-settings.js';
import { drawHouse as primitivesDrawHouse, drawDirectConnectionBadge as primitivesDrawDirectConnectionBadge } from '../features/drawing-primitives.js';
import { drawInfiniteGrid as drawInfiniteGridFeature, renderEdgeLegend as renderEdgeLegendFeature, drawEdge as drawEdgeFeature, drawNode as drawNodeFeature } from '../features/rendering.js';
import { drawNodeIcon } from '../features/node-icons.js';
import { processLabels } from '../utils/label-collision.js';
import { initBackupManager, clearHourlyBackups, saveDailyBackup, getAllBackups } from '../utils/backup-manager.js';
import { getUsername as getAuthUsername } from '../auth/auth-guard.js';
import { 
  evaluateRules, 
  applyActions, 
  isFieldVisible, 
  isFieldRequired,
  isFieldAutoFilled,
  getAutoFilledValue,
  getEffectiveInputFlowConfig,
  normalizeEntityForRules 
} from '../utils/input-flow-engine.js';
import { DEFAULT_INPUT_FLOW_CONFIG } from '../state/constants.js';
import { 
  importCoordinatesFromFile,
  applyCoordinatesToNodes,
  saveCoordinatesToStorage,
  loadCoordinatesFromStorage,
  saveCoordinatesEnabled,
  loadCoordinatesEnabled,
  calculateCoordinateBounds,
  surveyToCanvas,
  approximateUncoordinatedNodePositions,
  classifySketchCoordinates,
  repositionNodesFromEmbeddedCoordinates,
  extractNodeItmCoordinates
} from '../utils/coordinates.js';

// GNSS module imports
import {
  drawGnssMarker,
  gnssToCanvas,
  openPointCaptureDialog,
  gnssState,
  gnssConnection,
  startBrowserLocationAdapter,
  stopBrowserLocationAdapter,
  isBrowserLocationActive
} from '../gnss/index.js';
import { 
  getMapReferencePoint,
  setMapReferencePoint,
  setMapLayerEnabled,
  isMapLayerEnabled,
  setMapType,
  getMapType,
  drawMapTiles,
  drawMapAttribution,
  createReferenceFromNode,
  MAP_TYPES,
  saveMapSettings,
  loadMapSettings,
  wgs84ToItm,
  precacheTilesForMeasurementBounds
} from '../map/govmap-layer.js';
import {
  calculateCenterOnUser
} from '../map/user-location.js';
import {
  drawReferenceLayers,
  setReferenceLayers,
  getReferenceLayers,
  setLayerVisibility,
  setRefLayersEnabled,
  isRefLayersEnabled,
  saveRefLayerSettings,
  loadRefLayerSettings,
  clearReferenceLayers
} from '../map/reference-layers.js';
import {
  initStreetView,
  setStreetViewVisible,
  updateStreetViewTranslations
} from '../map/street-view.js';
import { drawIssueHighlight } from '../project/issue-highlight.js';
import { getLastEditPosition, setLastEditPosition } from '../project/last-edit-tracker.js';
import { menuEvents } from '../menu/menu-events.js';
import { tsc3Connection } from '../survey/tsc3-connection-manager.js';
import { initSurveyNodeTypeDialog, openSurveyNodeTypeDialog, getSurveyAutoConnect } from '../survey/survey-node-type-dialog.js';
import { openDevicePickerDialog } from '../survey/device-picker-dialog.js';
import {
  loadProjectSketches,
  getBackgroundSketches,
  getAllSketches,
  isProjectCanvasMode,
  clearProjectCanvas,
  findNodeInBackground,
  findEdgeInBackground,
  switchActiveSketch,
  onProjectCanvasChange,
  refreshActiveSketchData,
} from '../project/project-canvas-state.js';
import { drawBackgroundSketches } from '../project/project-canvas-renderer.js';
import { initSketchSidePanel, showSketchSidePanel, hideSketchSidePanel } from '../project/sketch-side-panel.js';

/**
 * Get the current username from authentication or return a default
 * @returns {string}
 */
function getCurrentUsername() {
  try {
    const username = getAuthUsername();
    return username || 'anonymous';
  } catch (_) {
    return 'anonymous';
  }
}

/**
 * Update timestamp fields on a node when it's modified
 * @param {object} node - The node to update
 */
function updateNodeTimestamp(node) {
  node.updatedAt = new Date().toISOString();
  node.modifiedBy = getCurrentUsername();
}

/**
 * Update timestamp fields on an edge when it's modified
 * @param {object} edge - The edge to update
 */
function updateEdgeTimestamp(edge) {
  edge.updatedAt = new Date().toISOString();
  edge.modifiedBy = getCurrentUsername();
}

// DOM references
const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');
const newSketchBtn = document.getElementById('newSketchBtn');
const homeBtn = document.getElementById('homeBtn');
const nodeModeBtn = document.getElementById('nodeModeBtn');
const homeNodeModeBtn = document.getElementById('homeNodeModeBtn');
const drainageNodeModeBtn = document.getElementById('drainageNodeModeBtn');
const edgeModeBtn = document.getElementById('edgeModeBtn');
// Separate export buttons for nodes and edges
const exportNodesBtn = document.getElementById('exportNodesBtn');
const exportEdgesBtn = document.getElementById('exportEdgesBtn');
// Sketch export/import buttons
const exportSketchBtn = document.getElementById('exportSketchBtn');
const importSketchBtn = document.getElementById('importSketchBtn');
const importSketchFile = document.getElementById('importSketchFile');
// Export dropdown menu toggle
const exportMenuBtn = document.getElementById('exportMenuBtn');
const exportDropdown = document.getElementById('exportDropdown');
const detailsContainer = document.getElementById('detailsContainer');
const startPanel = document.getElementById('startPanel');
const homePanel = document.getElementById('homePanel');
const sketchListEl = document.getElementById('sketchList');
const createFromHomeBtn = document.getElementById('createFromHomeBtn');
const dateInput = document.getElementById('dateInput');
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const helpBtn = document.getElementById('helpBtn');
const autosaveToggle = document.getElementById('autosaveToggle');
const saveBtn = document.getElementById('saveBtn');
const editModeBtn = null; // Removed edit button; edit functionality handled contextually
const helpModal = document.getElementById('helpModal');
const closeHelpBtn = document.getElementById('closeHelpBtn');
const toastEl = document.getElementById('toast');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const recenterBtn = document.getElementById('recenterBtn');
const recenterDensityBtn = document.getElementById('recenterDensityBtn');
const sizeIncreaseBtn = document.getElementById('sizeIncreaseBtn');
const sizeDecreaseBtn = document.getElementById('sizeDecreaseBtn');
const appTitleEl = document.getElementById('appTitle');
const sketchNameDisplayEl = document.getElementById('sketchNameDisplay');
const sketchNameDisplayMobileEl = document.getElementById('sketchNameDisplayMobile');
const sidebarTitleEl = document.getElementById('sidebarTitle');
const detailsDefaultEl = document.getElementById('detailsDefault');
const sidebarEl = document.getElementById('sidebar');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
const startTitleEl = document.getElementById('startTitle');
const creationDateLabelEl = document.getElementById('creationDateLabel');
const homeTitleEl = document.getElementById('homeTitle');
const helpTitleEl = document.getElementById('helpTitle');
const helpListEl = document.getElementById('helpList');
const helpNoteEl = document.getElementById('helpNote');
const langSelect = document.getElementById('langSelect');
// Admin UI elements
const adminBtn = document.getElementById('adminBtn');
const projectsBtn = document.getElementById('projectsBtn');
const mobileAdminBtn = document.getElementById('mobileAdminBtn');
const mobileProjectsBtn = document.getElementById('mobileProjectsBtn');
const adminModal = document.getElementById('adminModal');
const adminContent = document.getElementById('adminContent');
const adminSaveBtn = document.getElementById('adminSaveBtn');
const adminCancelBtn = document.getElementById('adminCancelBtn');
const adminImportBtn = document.getElementById('adminImportBtn');
const adminExportBtn = document.getElementById('adminExportBtn');
const adminImportFile = document.getElementById('adminImportFile');

// Admin Screen elements (separate screen)
const adminScreen = document.getElementById('adminScreen');
const adminScreenContent = document.getElementById('adminScreenContent');
const adminScreenTitleEl = document.getElementById('adminScreenTitle');
const adminScreenSaveBtn = document.getElementById('adminScreenSaveBtn');
const adminScreenCancelBtn = document.getElementById('adminScreenCancelBtn');
const adminScreenImportBtn = document.getElementById('adminScreenImportBtn');
const adminScreenExportBtn = document.getElementById('adminScreenExportBtn');
const adminScreenImportFile = document.getElementById('adminScreenImportFile');
const mainEl = document.getElementById('main');

// Projects Screen elements
const projectsScreen = document.getElementById('projectsScreen');
const projectsScreenContent = document.getElementById('projectsScreenContent');
const projectsScreenTitleEl = document.getElementById('projectsScreenTitle');
const projectsScreenCloseBtn = document.getElementById('projectsScreenCloseBtn');
const projectsList = document.getElementById('projectsList');
const addProjectBtn = document.getElementById('addProjectBtn');

// Mobile menu elements
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
const mobileMenuCloseBtn = document.getElementById('mobileMenuCloseBtn');
const mobileMenuBackdrop = document.getElementById('mobileMenuBackdrop');
const mobileMenuTitle = document.getElementById('mobileMenuTitle');
const menuGroupNav = document.getElementById('menuGroupNav');
const menuGroupSearch = document.getElementById('menuGroupSearch');
const menuGroupView = document.getElementById('menuGroupView');
const menuGroupSketch = document.getElementById('menuGroupSketch');
const menuGroupCsv = document.getElementById('menuGroupCsv');
const menuGroupLocation = document.getElementById('menuGroupLocation');
const menuGroupWorkday = document.getElementById('menuGroupWorkday');
const menuGroupSettings = document.getElementById('menuGroupSettings');
const mobileHomeBtn = document.getElementById('mobileHomeBtn');
const mobileNewSketchBtn = document.getElementById('mobileNewSketchBtn');
const mobileZoomInBtn = document.getElementById('mobileZoomInBtn');
const mobileZoomOutBtn = document.getElementById('mobileZoomOutBtn');
const mobileSizeIncreaseBtn = document.getElementById('mobileSizeIncreaseBtn');
const mobileSizeDecreaseBtn = document.getElementById('mobileSizeDecreaseBtn');
const mobileExportNodesBtn = document.getElementById('mobileExportNodesBtn');
const mobileExportEdgesBtn = document.getElementById('mobileExportEdgesBtn');
const mobileExportSketchBtn = document.getElementById('mobileExportSketchBtn');
const mobileImportSketchBtn = document.getElementById('mobileImportSketchBtn');
const mobileSaveBtn = document.getElementById('mobileSaveBtn');
const mobileAutosaveToggle = document.getElementById('mobileAutosaveToggle');
const mobileAutosaveLabel = document.getElementById('mobileAutosaveLabel');
const mobileLangSelect = document.getElementById('mobileLangSelect');
const mobileHelpBtn = document.getElementById('mobileHelpBtn');

// Finish Workday elements
const finishWorkdayBtn = document.getElementById('finishWorkdayBtn');
const mobileFinishWorkdayBtn = document.getElementById('mobileFinishWorkdayBtn');
const finishWorkdayModal = document.getElementById('finishWorkdayModal');
const finishWorkdayContent = document.getElementById('finishWorkdayContent');
const finishWorkdayCloseBtn = document.getElementById('finishWorkdayCloseBtn');
const finishWorkdayCancelBtn = document.getElementById('finishWorkdayCancelBtn');
const finishWorkdayConfirmBtn = document.getElementById('finishWorkdayConfirmBtn');
const danglingEdgesListEl = document.getElementById('danglingEdgesList');
const finishWorkdayDescEl = document.getElementById('finishWorkdayDesc');
const finishWorkdayTitleEl = document.getElementById('finishWorkdayTitle');

// Coordinate elements
const importCoordinatesBtn = document.getElementById('importCoordinatesBtn');
const coordinatesToggle = document.getElementById('coordinatesToggle');
const importCoordinatesFile = document.getElementById('importCoordinatesFile');
const mobileImportCoordinatesBtn = document.getElementById('mobileImportCoordinatesBtn');
const mobileCoordinatesToggle = document.getElementById('mobileCoordinatesToggle');
// Scale control elements
const scaleDecreaseBtn = document.getElementById('scaleDecreaseBtn');
const scaleIncreaseBtn = document.getElementById('scaleIncreaseBtn');
const scaleValueDisplay = document.getElementById('scaleValueDisplay');
const mobileScaleDecreaseBtn = document.getElementById('mobileScaleDecreaseBtn');
const mobileScaleIncreaseBtn = document.getElementById('mobileScaleIncreaseBtn');
const mobileScaleValueDisplay = document.getElementById('mobileScaleValueDisplay');
// Stretch control elements (horizontal)
const stretchXDecreaseBtn = document.getElementById('stretchXDecreaseBtn');
const stretchXIncreaseBtn = document.getElementById('stretchXIncreaseBtn');
const stretchXValueDisplay = document.getElementById('stretchXValueDisplay');
const mobileStretchXDecreaseBtn = document.getElementById('mobileStretchXDecreaseBtn');
const mobileStretchXIncreaseBtn = document.getElementById('mobileStretchXIncreaseBtn');
const mobileStretchXValueDisplay = document.getElementById('mobileStretchXValueDisplay');
// Stretch control elements (vertical)
const stretchYDecreaseBtn = document.getElementById('stretchYDecreaseBtn');
const stretchYIncreaseBtn = document.getElementById('stretchYIncreaseBtn');
const stretchYValueDisplay = document.getElementById('stretchYValueDisplay');
const mobileStretchYDecreaseBtn = document.getElementById('mobileStretchYDecreaseBtn');
const mobileStretchYIncreaseBtn = document.getElementById('mobileStretchYIncreaseBtn');
const mobileStretchYValueDisplay = document.getElementById('mobileStretchYValueDisplay');
// Stretch reset buttons
const resetStretchBtn = document.getElementById('resetStretchBtn');
const mobileResetStretchBtn = document.getElementById('mobileResetStretchBtn');
// Live Measure toggle elements
const liveMeasureToggle = document.getElementById('liveMeasureToggle');
const mobileLiveMeasureToggle = document.getElementById('mobileLiveMeasureToggle');
// Map layer toggle elements
const mapLayerToggle = document.getElementById('mapLayerToggle');
const mobileMapLayerToggle = document.getElementById('mobileMapLayerToggle');
const mapTypeSelect = document.getElementById('mapTypeSelect');
const mobileMapTypeSelect = document.getElementById('mobileMapTypeSelect');

// iPad/iOS: ensure taps trigger clicks on header buttons (Safari sometimes suppresses click)
function synthesizeClickOnTap(element) {
  if (!element) return;
  let touchMoved = false;
  const onTouchStart = () => { touchMoved = false; };
  const onTouchMove = () => { touchMoved = true; };
  const onTouchEnd = (e) => {
    try {
      // If it was a simple tap and default hasn't been prevented, fire a click
      if (!touchMoved) {
        e.preventDefault();
        e.stopPropagation();
        element.click();
      }
    } catch (_) { }
  };
  try { element.addEventListener('touchstart', onTouchStart, { passive: true }); } catch (_) { element.addEventListener('touchstart', onTouchStart); }
  try { element.addEventListener('touchmove', onTouchMove, { passive: true }); } catch (_) { element.addEventListener('touchmove', onTouchMove); }
  try { element.addEventListener('touchend', onTouchEnd, { passive: false }); } catch (_) { element.addEventListener('touchend', onTouchEnd); }
}

// Apply iOS tap-to-click fix to top bar buttons and key controls
[
  newSketchBtn,
  saveBtn,
  exportNodesBtn,
  exportEdgesBtn,
  exportSketchBtn,
  importSketchBtn,
  sizeIncreaseBtn,
  sizeDecreaseBtn,
  helpBtn,
  adminBtn,
  homeBtn,
  langSelect,
  autosaveToggle,
  mobileMenuBtn
].forEach(synthesizeClickOnTap);

// Application state
let nodes = [];
let edges = [];
let nextNodeId = 1;
let selectedNode = null;
let selectedEdge = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
// Current interaction mode: 'node' to create nodes, 'edge' to create edges
let currentMode = 'node';
let pendingEdgeTail = null;
// For inbound dangling edges: when user clicks empty space first, store the position
let pendingEdgeStartPosition = null; // { x, y } or null - for creating inbound dangling edges
let creationDate = null;
let currentSketchId = null; // id in library; null means unsaved new sketch
let currentSketchName = null; // human-friendly name for the sketch
let currentProjectId = null; // id of the project this sketch belongs to
let currentInputFlowConfig = DEFAULT_INPUT_FLOW_CONFIG; // input flow configuration for the current sketch
let availableProjects = []; // list of projects available to the user (fetched from API)
let autosaveEnabled = true;
// TSC3 survey auto-connect state
let lastSurveyNodeId = null;
let surveyAutoConnect = true;

// Update the sketch name display in the header (desktop and mobile)
function updateSketchNameDisplay() {
  const name = currentSketchName || '';
  if (sketchNameDisplayEl) {
    sketchNameDisplayEl.textContent = name;
  }
  if (sketchNameDisplayMobileEl) {
    sketchNameDisplayMobileEl.textContent = name;
  }
}
let currentLang = 'he';
// Pointer position used for edge preview in edge mode
let pendingEdgePreview = null; // { x, y } or null
// Expose language to window for modules that need it during migration
try { window.currentLang = currentLang; } catch (_) { }
// Zoom state
let viewScale = 1;
let drawScheduled = false;
let viewTranslate = { x: 0, y: 0 }; // screen-space translation (for pan/anchored zoom)
const MIN_SCALE = 0.001;
const MAX_SCALE = 5.0;
const SCALE_STEP = 1.1; // 10%
// Canvas stretch state (separate X and Y scaling factors)
let viewStretchX = 0.6;
let viewStretchY = 1.0;
const MIN_STRETCH = 0.2;
const MAX_STRETCH = 3.0;
const STRETCH_STEP = 0.1;
const VIEW_STRETCH_KEY = STORAGE_KEYS.viewStretch;
// Size scale state for nodes and fonts
let sizeScale = 0.9;
const MIN_SIZE_SCALE = 0.5;
const MAX_SIZE_SCALE = 10.0;
const SIZE_SCALE_STEP = 0.2; // 20% increments
// Pinch zoom state
let isPinching = false;
let pinchStartDistance = null;
let pinchStartScale = null;
let pinchCenterWorld = null;
// Mouse/keyboard panning state
let isPanning = false;
let spacePanning = false;
let panStart = { x: 0, y: 0 };
let translateStart = { x: 0, y: 0 };
// Touch tap-to-add deferral to avoid accidental node creation during pinch or slight taps
let touchAddPending = false;
let touchAddPoint = null; // screen-space point
const TOUCH_TAP_MOVE_THRESHOLD = 5; // px, slightly larger on touch to filter small jitters
const TOUCH_SELECT_EXPANSION = 14; // px extra radius for selecting nodes on touch
const TOUCH_EDGE_HIT_THRESHOLD = 14; // px threshold for selecting edges on touch
// Mouse click-to-add deferral and grab-pan support
const MOUSE_TAP_MOVE_THRESHOLD = 6; // px threshold to distinguish click from drag
let mouseAddPending = false;
let mouseAddPoint = null; // screen-space point
let mousePanCandidate = false; // becomes true when clicking empty space until movement threshold exceeded
let touchPanCandidate = false; // similar concept for touch single-finger background drags

// Defer opening details panel when starting a drag on a node; only open on release if no movement
let pendingDetailsForSelectedNode = false;
let selectedNodeDownScreen = null; // screen-space coordinates at press time
let selectedNodeMoveThreshold = MOUSE_TAP_MOVE_THRESHOLD; // threshold depends on pointer type
let lastPointerType = 'mouse';
let pendingDeselect = false; // Defer deselection until release if grabbing a selected node

// Highlight state for half-edge when editing via node details panel
let highlightedHalfEdge = null; // { edgeId, half: 'tail' | 'head' } or null

// Visual configuration moved to src/state/constants.js
import {
  NODE_RADIUS,
  COLORS,
  NODE_TYPES,
  NODE_MATERIAL_OPTIONS,
  NODE_COVER_DIAMETERS,
  NODE_ACCESS_OPTIONS,
  NODE_ENGINEERING_STATUS,
  NODE_MAINTENANCE_OPTIONS,
  EDGE_MATERIAL_OPTIONS,
  EDGE_LINE_DIAMETERS,
  EDGE_TYPES,
  EDGE_TYPE_OPTIONS,
  EDGE_TYPE_COLORS,
  EDGE_TYPE_SELECTED_COLORS,
  EDGE_ENGINEERING_STATUS,
  NODE_ACCURACY_OPTIONS,
} from '../state/constants.js';
const NODE_MATERIALS = NODE_MATERIAL_OPTIONS.map(o => o.label);
const EDGE_MATERIALS = EDGE_MATERIAL_OPTIONS.map(o => o.label);

// Fall icon image (used to mark edges with a fall depth)
let fallIconImage = null;
let fallIconReady = false;

// Fast node lookup map – rebuilt at the start of each draw() frame
let nodeMap = new Map(); // Map<String(id), node>

// --- Draw-loop performance caches ---

// Issue 2: canvas bounding rect cache — avoids forced layout flush during drag frames.
// Invalidated by resizeCanvas() and the window resize listener.
let _cachedCanvasRect = null;
function getCachedCanvasRect() {
  if (!_cachedCanvasRect) {
    _cachedCanvasRect = canvas.getBoundingClientRect();
  }
  return _cachedCanvasRect;
}
function invalidateCanvasRectCache() {
  _cachedCanvasRect = null;
}

// Issue 3: edge label data cache — rebuilt only when edges change.
// Avoids iterating all edges twice per frame for label-collision input data.
// Invalidated via markEdgeLabelCacheDirty() whenever edges are mutated.
let _edgeLabelDataCache = null; // null means dirty / needs rebuild
let _edgeLabelCacheStretchX = NaN;
let _edgeLabelCacheStretchY = NaN;
let _edgeLabelCacheSizeScale = NaN;
function markEdgeLabelCacheDirty() {
  _edgeLabelDataCache = null;
}
// Coordinate system state
let coordinatesMap = new Map(); // Map<nodeId, {x, y, z}>
let coordinatesEnabled = true; // Whether to show coordinate indicators and use coordinate positions
let originalNodePositions = new Map(); // Store original positions before applying coordinates
let geoNodePositions = new Map(); // Store geographic positions after coordinate repositioning
let coordinateScale = 50; // Pixels per meter (50 = 1:50 default)
const SCALE_PRESETS = [5, 10, 25, 50, 75, 100, 150, 200, 300]; // Available scale options

// Live Measure / GNSS mode state
let liveMeasureEnabled = false;
const COORDINATE_SCALE_KEY = STORAGE_KEYS.coordinateScale;

// Map layer state - initialized from localStorage via loadMapSettings() in govmap-layer.js
let mapLayerEnabled = isMapLayerEnabled();

try {
  fallIconImage = new Image();
  fallIconImage.src = './fall_icon.png';
  fallIconImage.onload = () => { fallIconReady = true; try { scheduleDraw(); } catch (_) { } };
  fallIconImage.onerror = () => { fallIconReady = false; };
} catch (_) { /* no-op */ }

// Type and option catalogs are imported above

// ---- Admin configuration (persisted) ----
/**
 * adminConfig allows administrators to control:
 * - Which fields are included in CSV export for nodes (manholes/homes) and edges (lines)
 * - Default values for newly created entities
 * - Option lists for selectable fields, with mapping between labels (UI) and numeric codes (CSV)
 */
const ADMIN_STORAGE_KEY = STORAGE_KEYS.adminConfig;
const defaultAdminConfig = {
  nodes: {
    include: {
      id: true,
      type: true,
      note: true,
      material: true,
      cover_diameter: true,
      access: true,
      accuracy_level: true,
      engineering_status: false,
      maintenance_status: true,
      survey_x: true,
      survey_y: true,
      terrain_level: true,
      measure_precision: true,
      fix_type: true,
    },
    defaults: {
      material: NODE_MATERIALS[0],
      cover_diameter: '',
      access: 0,
      accuracy_level: 0,
      engineering_status: 0,
      maintenance_status: 0,
    },
    options: {
      material: NODE_MATERIAL_OPTIONS.map(o => ({ code: o.code, label: o.label, enabled: true })),
      access: NODE_ACCESS_OPTIONS.map(o => ({ code: o.code, label: o.label, enabled: true })),
      accuracy_level: NODE_ACCURACY_OPTIONS.map(o => ({ code: o.code, label: o.label, enabled: true })),
      engineering_status: NODE_ENGINEERING_STATUS.map(o => ({ code: o.code, label: o.label, enabled: true })),
      maintenance_status: NODE_MAINTENANCE_OPTIONS.map(o => ({ code: o.code, label: o.label, enabled: true })),
    },
    // customFields removed
  },
  edges: {
    include: {
      from_node: true,
      to_node: true,
      tail_measurement: true,
      head_measurement: true,
      fall_depth: true,
      fall_position: true,
      line_diameter: true,
      note: true,
      edge_material: true,
      edge_type: true,
      engineering_status: true,
    },
    defaults: {
      material: EDGE_MATERIALS[0],
      edge_type: EDGE_TYPES[0],
      tail_measurement: '',
      head_measurement: '',
      fall_depth: '',
      fall_position: 0,
      line_diameter: '',
      engineering_status: 0,
    },
    options: {
      material: EDGE_MATERIAL_OPTIONS.map(o => ({ code: o.code, label: o.label, enabled: true })),
      edge_type: EDGE_TYPE_OPTIONS.map(o => ({ code: o.code, label: o.label, enabled: true })),
      engineering_status: EDGE_ENGINEERING_STATUS.map(o => ({ code: o.code, label: o.label, enabled: true })),
      line_diameter: EDGE_LINE_DIAMETERS.map(v => ({ code: v, label: v, enabled: true })),
      fall_position: [
        { code: 0, label: 'פנימי', enabled: true },
        { code: 1, label: 'חיצוני', enabled: true },
      ],
    },
    // customFields removed
  }
};

let adminConfig = (() => {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(defaultAdminConfig));
    const parsed = JSON.parse(raw);
    const merged = { ...JSON.parse(JSON.stringify(defaultAdminConfig)), ...parsed };
    // Normalize nested shapes for backward compatibility
    merged.nodes = merged.nodes || {};
    merged.edges = merged.edges || {};
    // customFields removed
    merged.nodes.options = merged.nodes.options || {};
    merged.edges.options = merged.edges.options || {};
    merged.nodes.include = merged.nodes.include || {};
    merged.edges.include = merged.edges.include || {};
    merged.nodes.defaults = merged.nodes.defaults || {};
    merged.edges.defaults = merged.edges.defaults || {};
    return merged;
  } catch (e) {
    console.warn('[App] Failed to load admin config; using defaults', e.message);
    return JSON.parse(JSON.stringify(defaultAdminConfig));
  }
})();

function saveAdminConfig() {
  localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(adminConfig));
}

// === Field History Tracking System ===
// Tracks user field value selections to provide smart sorting in dropdowns
const FIELD_HISTORY_KEY = STORAGE_KEYS.fieldHistory;

// Load field history from localStorage
function loadFieldHistory() {
  try {
    const raw = localStorage.getItem(FIELD_HISTORY_KEY);
    if (!raw) return { nodes: {}, edges: {} };
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[App] Failed to load field history', e.message);
    return { nodes: {}, edges: {} };
  }
}

// Save field history to localStorage
function saveFieldHistory(history) {
  try {
    localStorage.setItem(FIELD_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn('[App] Failed to save field history', e.message);
  }
}

// Track a field value selection - increment usage count
function trackFieldUsage(scope, fieldName, value) {
  if (value === null || value === undefined || value === '') return;
  const history = loadFieldHistory();
  if (!history[scope]) history[scope] = {};
  if (!history[scope][fieldName]) history[scope][fieldName] = {};
  const key = String(value);
  history[scope][fieldName][key] = (history[scope][fieldName][key] || 0) + 1;
  saveFieldHistory(history);
}

// Get sorted options based on usage history
// Returns options sorted by: most used first, then original order for unused
function getSortedOptions(scope, fieldName, originalOptions) {
  const history = loadFieldHistory();
  const fieldHistory = history[scope]?.[fieldName] || {};

  // Create a map of value -> usage count
  const usageMap = new Map();
  for (const [key, count] of Object.entries(fieldHistory)) {
    usageMap.set(key, count);
  }

  // Sort options: first by usage count (descending), then by original order
  const sorted = [...originalOptions].sort((a, b) => {
    const aKey = a.code !== undefined ? String(a.code) : (a.label !== undefined ? a.label : String(a));
    const bKey = b.code !== undefined ? String(b.code) : (b.label !== undefined ? b.label : String(b));
    const aCount = usageMap.get(aKey) || 0;
    const bCount = usageMap.get(bKey) || 0;
    if (aCount !== bCount) return bCount - aCount; // Higher count first
    return 0; // Keep original order for equal counts
  });

  return sorted;
}

// Import field history from a specific sketch
function importFieldHistoryFromSketch(sketchRec) {
  if (!sketchRec || !sketchRec.nodes) return 0;
  const history = loadFieldHistory();
  let imported = 0;

  // Process nodes from the sketch
  (sketchRec.nodes || []).forEach(node => {
    if (node.material && node.material !== 'לא ידוע') {
      if (!history.nodes) history.nodes = {};
      if (!history.nodes.material) history.nodes.material = {};
      history.nodes.material[node.material] = (history.nodes.material[node.material] || 0) + 1;
      imported++;
    }
    if (node.access !== undefined && node.access !== 0) {
      if (!history.nodes.access) history.nodes.access = {};
      history.nodes.access[String(node.access)] = (history.nodes.access[String(node.access)] || 0) + 1;
      imported++;
    }
    if (node.maintenanceStatus !== undefined && node.maintenanceStatus !== 0) {
      if (!history.nodes.maintenance_status) history.nodes.maintenance_status = {};
      history.nodes.maintenance_status[String(node.maintenanceStatus)] = (history.nodes.maintenance_status[String(node.maintenanceStatus)] || 0) + 1;
      imported++;
    }
    if (node.coverDiameter !== undefined && node.coverDiameter !== '') {
      if (!history.nodes.cover_diameter) history.nodes.cover_diameter = {};
      history.nodes.cover_diameter[String(node.coverDiameter)] = (history.nodes.cover_diameter[String(node.coverDiameter)] || 0) + 1;
      imported++;
    }
  });

  // Process edges from the sketch
  (sketchRec.edges || []).forEach(edge => {
    if (!history.edges) history.edges = {};
    if (edge.material && edge.material !== 'לא ידוע') {
      if (!history.edges.material) history.edges.material = {};
      history.edges.material[edge.material] = (history.edges.material[edge.material] || 0) + 1;
      imported++;
    }
    if (edge.line_diameter !== undefined && edge.line_diameter !== '') {
      if (!history.edges.line_diameter) history.edges.line_diameter = {};
      history.edges.line_diameter[String(edge.line_diameter)] = (history.edges.line_diameter[String(edge.line_diameter)] || 0) + 1;
      imported++;
    }
    if (edge.edge_type) {
      if (!history.edges.edge_type) history.edges.edge_type = {};
      history.edges.edge_type[edge.edge_type] = (history.edges.edge_type[edge.edge_type] || 0) + 1;
      imported++;
    }
    if (edge.engineeringStatus !== undefined && edge.engineeringStatus !== 0) {
      if (!history.edges.engineering_status) history.edges.engineering_status = {};
      history.edges.engineering_status[String(edge.engineeringStatus)] = (history.edges.engineering_status[String(edge.engineeringStatus)] || 0) + 1;
      imported++;
    }
    if (edge.fall_position !== undefined && edge.fall_position !== '') {
      if (!history.edges.fall_position) history.edges.fall_position = {};
      history.edges.fall_position[String(edge.fall_position)] = (history.edges.fall_position[String(edge.fall_position)] || 0) + 1;
      imported++;
    }
  });

  saveFieldHistory(history);
  return imported;
}

// Get library sketches for history import
function getSketchesForHistoryImport() {
  return getLibrary();
}

// Format sketch display name - use name if available, otherwise format creation date
function formatSketchDisplayName(rec) {
  if (rec.name && rec.name.trim()) {
    return rec.name;
  }
  // Format creation date as display name
  try {
    const date = new Date(rec.createdAt || rec.creationDate);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString(currentLang === 'he' ? 'he-IL' : 'en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  } catch (e) {}
  // Fallback to shortened ID
  return rec.id ? rec.id.replace('sk_', '#') : 'Sketch';
}

// Shared AdminSettings instance for both modal and screen
let adminSettingsModal = null;
let adminSettingsScreen = null;

function openAdminModal() {
  if (!adminModal || !adminContent) return;

  // Create or reuse AdminSettings instance
  adminSettingsModal = new AdminSettings({
    container: adminContent,
    config: adminConfig,
    t,
    showHeader: true,
  });
  adminSettingsModal.render();

  adminModal.style.display = 'flex';

  // Apply localized title
  const adminTitleEl = document.getElementById('adminTitle');
  if (adminTitleEl) {
    const titleText = adminTitleEl.querySelector('.admin-title-text');
    if (titleText) titleText.textContent = t('admin.title');
  }

  applyLangToStaticUI();
}

function closeAdminModal() {
  if (adminModal) adminModal.style.display = 'none';
}

// Admin screen (separate view) open/close
function openAdminScreen() {
  if (!adminScreen || !adminScreenContent) return;

  // Create or reuse AdminSettings instance for screen
  adminSettingsScreen = new AdminSettings({
    container: adminScreenContent,
    config: adminConfig,
    t,
    showHeader: false, // Screen uses simpler headers
  });
  adminSettingsScreen.render();

  if (adminScreenTitleEl) {
    const titleText = adminScreenTitleEl.querySelector('.admin-title-text');
    if (titleText) titleText.textContent = t('admin.title');
  }
  if (mainEl) mainEl.style.display = 'none';
  adminScreen.style.display = 'block';
  applyLangToStaticUI();
}

function closeAdminScreen() {
  if (adminScreen) adminScreen.style.display = 'none';
  if (mainEl) mainEl.style.display = '';
}

// Projects screen instance
let projectsSettingsScreen = null;

// Projects screen (separate view) open/close
async function openProjectsScreen() {
  if (!projectsScreen || !projectsScreenContent) return;

  // Show screen immediately so user sees loading spinner
  if (projectsScreenTitleEl) {
    const titleText = projectsScreenTitleEl.querySelector('.admin-title-text');
    if (titleText) titleText.textContent = t('projects.title');
  }
  if (mainEl) mainEl.style.display = 'none';
  projectsScreen.style.display = 'block';
  applyLangToStaticUI();

  // Create or reuse ProjectsSettings instance for screen
  projectsSettingsScreen = new ProjectsSettings({
    container: projectsScreenContent,
    t,
    showToast,
  });
  await projectsSettingsScreen.render();
}

function closeProjectsScreen() {
  if (projectsScreen) projectsScreen.style.display = 'none';
  if (mainEl) mainEl.style.display = '';
}

function navigateToProjects() {
  try { closeMobileMenu(); } catch (_) { }
  try { location.hash = '#/projects'; } catch (_) { }
  try { handleRoute(); } catch (_) { }
}

function navigateToAdmin() {
  try { closeMobileMenu(); } catch (_) { }
  try { location.hash = '#/admin'; } catch (_) { }
  try { handleRoute(); } catch (_) { }
}
if (adminBtn) adminBtn.addEventListener('click', (e) => {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  navigateToAdmin();
});
if (mobileAdminBtn) {
  const openAdminFromMobile = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    navigateToAdmin();
  };
  // Use both click and touchend for broad Android compatibility
  mobileAdminBtn.addEventListener('click', openAdminFromMobile);
  try { mobileAdminBtn.addEventListener('touchend', openAdminFromMobile, { passive: false }); } catch (_) { mobileAdminBtn.addEventListener('touchend', openAdminFromMobile); }
}

// Projects button click handlers
if (projectsBtn) projectsBtn.addEventListener('click', (e) => {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  navigateToProjects();
});
if (mobileProjectsBtn) {
  const openProjectsFromMobile = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    navigateToProjects();
  };
  // Use both click and touchend for broad Android compatibility
  mobileProjectsBtn.addEventListener('click', openProjectsFromMobile);
  try { mobileProjectsBtn.addEventListener('touchend', openProjectsFromMobile, { passive: false }); } catch (_) { mobileProjectsBtn.addEventListener('touchend', openProjectsFromMobile); }
}

// DOM references for login
const loginPanel = document.getElementById('loginPanel');
const authLoadingOverlay = document.getElementById('authLoadingOverlay');
const authContainer = document.getElementById('authContainer');
const loginTitle = document.getElementById('loginTitle');
const loginSubtitle = document.getElementById('loginSubtitle');
const loginLoadingText = document.getElementById('loginLoadingText');
const authLoadingText = document.getElementById('authLoadingText');
const userButtonContainer = document.getElementById('userButtonContainer');
const mobileUserButtonContainer = document.getElementById('mobileUserButtonContainer');

// Animated panel close helper — plays modalSlideOut then hides
function hidePanelAnimated(el, callback) {
  if (!el || el.style.display === 'none') { if (callback) callback(); return; }
  // If reduced motion or animation not supported, skip animation
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    el.classList.remove('panel-closing');
    el.style.display = 'none';
    if (callback) callback();
    return;
  }
  el.classList.add('panel-closing');
  const onEnd = () => {
    el.removeEventListener('animationend', onEnd);
    el.classList.remove('panel-closing');
    el.style.display = 'none';
    if (callback) callback();
  };
  el.addEventListener('animationend', onEnd, { once: true });
  // Safety timeout in case animationend never fires
  setTimeout(() => {
    if (el.classList.contains('panel-closing')) {
      el.classList.remove('panel-closing');
      el.style.display = 'none';
      if (callback) callback();
    }
  }, 200);
}

// Show/hide login panel
function showLoginPanel() {
  if (loginPanel) {
    loginPanel.classList.remove('panel-closing');
    loginPanel.style.display = 'flex';
    document.body.classList.add('show-login');
  }
  // Update login panel text based on language
  if (loginTitle) loginTitle.textContent = t('auth.loginTitle');
  if (loginSubtitle) loginSubtitle.textContent = t('auth.loginSubtitle');
  if (loginLoadingText) loginLoadingText.textContent = t('auth.loading');
  
  // Mount SignIn when ready
  mountAuthSignIn();
}

function hideLoginPanel() {
  if (loginPanel) {
    hidePanelAnimated(loginPanel, () => {
      document.body.classList.remove('show-login');
    });
  }
}

function showAuthLoading() {
  if (authLoadingOverlay) {
    authLoadingOverlay.style.display = 'flex';
    if (authLoadingText) authLoadingText.textContent = t('auth.checkingAuth');
  }
}

function hideAuthLoading() {
  if (authLoadingOverlay) {
    authLoadingOverlay.style.display = 'none';
  }
}

// Mount SignIn component (Better Auth)
function mountAuthSignIn() {
  if (!authContainer) return;
  authContainer.innerHTML = '';
  _mountSignIn(authContainer, { signUpUrl: '#/signup' });
}

// Mount SignUp component (Better Auth)
function mountAuthSignUp() {
  if (!authContainer) return;
  authContainer.innerHTML = '';
  _mountSignUp(authContainer, { signInUrl: '#/login' });
}

// Update user button visibility (desktop and mobile)
function updateUserButtonVisibility(isSignedIn) {
  if (userButtonContainer) {
    userButtonContainer.style.display = isSignedIn ? 'flex' : 'none';
  }
  if (mobileUserButtonContainer) {
    mobileUserButtonContainer.style.display = isSignedIn ? 'flex' : 'none';
  }
}

// Simple hash routing for admin screen and login
function handleRoute() {
  const hash = location.hash || '#/';
  const isAdmin = (hash === '#/admin');
  const isProjects = (hash === '#/projects');
  const isLogin = (hash === '#/login');
  const isSignup = (hash === '#/signup');
  const projectMatch = hash.match(/^#\/project\/(.+)$/);

  // Get auth state if available
  const authState = window.authGuard?.getAuthState?.() || { isLoaded: false, isSignedIn: false };

  console.debug('[App] handleRoute:', { hash, isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn });

  // If auth is not yet loaded, show loading
  if (!authState.isLoaded) {
    showAuthLoading();
    return;
  }

  hideAuthLoading();

  // Handle login/signup routes
  if (isLogin || isSignup) {
    // If already signed in, redirect to home
    if (authState.isSignedIn) {
      location.hash = '#/';
      return;
    }
    showLoginPanel();
    if (isSignup) {
      mountAuthSignUp();
      if (loginTitle) loginTitle.textContent = t('auth.signupTitle');
      if (loginSubtitle) loginSubtitle.textContent = t('auth.signupSubtitle');
    } else {
      mountAuthSignIn();
    }
    return;
  }

  // For protected routes, check authentication
  if (!authState.isSignedIn) {
    location.hash = '#/login';
    return;
  }

  // Hide login panel for authenticated routes
  hideLoginPanel();
  updateUserButtonVisibility(authState.isSignedIn);

  // Leave project-canvas mode when navigating away from #/project/:id
  if (!projectMatch && isProjectCanvasMode()) {
    // Sync project sketches back to localStorage so the home view is up to date
    syncProjectSketchesToLibrary();
    clearProjectCanvas();
    hideSketchSidePanel();
  }

  // Handle admin route
  if (isAdmin) {
    try { document.body.classList.add('admin-screen'); } catch (_) { }
    try { closeAdminModal(); } catch (_) { }
    try { openAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
  } else if (isProjects) {
    // Handle projects route
    try { document.body.classList.add('admin-screen'); } catch (_) { }
    try { closeAdminModal(); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { openProjectsScreen(); } catch (_) { }
  } else if (projectMatch) {
    // Handle #/project/:id route — load project canvas
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true); // Immediate hide to prevent race with sync-service
    loadProjectCanvas(projectMatch[1]);
  } else {
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    // Default route: show projects homepage if user has an org, else show sketch list
    renderProjectsHome();
  }
}

// Listen for auth state changes to re-route
if (window.authGuard?.onAuthStateChange) {
  window.authGuard.onAuthStateChange((state) => {
    handleRoute();
    updateUserButtonVisibility(state.isSignedIn);
  });
}

window.addEventListener('hashchange', handleRoute);
// Expose handleRoute globally so main-entry.js can call it
window.handleRoute = handleRoute;

// Prevent scroll and zoom propagation from modals to the canvas
function preventModalScrollPropagation() {
  const modals = ['startPanel', 'homePanel', 'helpModal', 'adminModal', 'adminScreen', 'projectsScreen'];
  modals.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Stop mouse wheel and touch events from reaching the canvas
    const stopProp = (e) => e.stopPropagation();
    el.addEventListener('wheel', stopProp, { passive: false });
    el.addEventListener('touchmove', stopProp, { passive: false });
    el.addEventListener('mousedown', stopProp);
    el.addEventListener('touchstart', stopProp, { passive: false });
  });
}

// Initialize route on load (with slight delay to allow auth to initialize)
setTimeout(() => {
  try { handleRoute(); } catch (_) { }
  preventModalScrollPropagation();
}, 100);
if (adminCancelBtn) adminCancelBtn.addEventListener('click', () => {
  closeAdminModal();
  closeAdminScreen();
  try { if (document.body.classList.contains('admin-screen')) location.hash = '#/'; } catch (_) { }
});
if (adminSaveBtn) adminSaveBtn.addEventListener('click', () => {
  if (!adminSettingsModal) return;

  // Validate before saving
  const validation = adminSettingsModal.validate();
  if (!validation.valid) {
    // Scroll to first error
    if (validation.errors[0]?.field) {
      validation.errors[0].field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      validation.errors[0].field.focus();
    }
    return;
  }

  // Collect and save configuration
  const newConfig = adminSettingsModal.collectConfig();
  Object.assign(adminConfig, newConfig);
  saveAdminConfig();
  closeAdminModal();
  renderDetails();
  showToast(t('admin.saved'));
});
// Admin import/export handlers
if (adminExportBtn) {
  adminExportBtn.addEventListener('click', () => {
    try {
      const payload = {
        kind: 'graphSketchAdminConfig',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: adminConfig,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const datePart = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = URL.createObjectURL(blob);
      a.download = `admin-config_${datePart}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(t('admin.exportSuccess'));
    } catch (_) {
      // no-op
    }
  });
}

if (adminImportBtn && adminImportFile) {
  adminImportBtn.addEventListener('click', () => {
    adminImportFile.value = '';
    adminImportFile.click();
  });
  adminImportFile.addEventListener('change', async () => {
    const file = adminImportFile.files && adminImportFile.files[0];
    if (!file) return;
    try {
      let text = await file.text();
      // Strip BOM and trim to be tolerant of editors that add BOM/newlines
      if (text && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      text = text.trim();
      const parsed = JSON.parse(text);
      // Accept both wrapped and raw formats
      const incoming = (parsed && parsed.kind === 'graphSketchAdminConfig' && parsed.data)
        ? parsed.data
        : (parsed && parsed.nodes && parsed.edges)
          ? parsed
          : null;
      if (!incoming) {
        showToast(t('admin.importInvalid'));
        return;
      }
      // Basic shape validation and normalization
      function normalize(config) {
        const merged = { ...JSON.parse(JSON.stringify(defaultAdminConfig)), ...config };
        merged.nodes = merged.nodes || {};
        merged.edges = merged.edges || {};
        const incNodes = { ...defaultAdminConfig.nodes.include, ...(merged.nodes.include || {}) };
        const incEdges = { ...defaultAdminConfig.edges.include, ...(merged.edges.include || {}) };
        // Coerce include flags to booleans
        Object.keys(incNodes).forEach(k => { incNodes[k] = !!incNodes[k]; });
        Object.keys(incEdges).forEach(k => { incEdges[k] = !!incEdges[k]; });
        merged.nodes.include = incNodes;
        merged.edges.include = incEdges;
        merged.nodes.defaults = { ...defaultAdminConfig.nodes.defaults, ...(merged.nodes.defaults || {}) };
        merged.edges.defaults = { ...defaultAdminConfig.edges.defaults, ...(merged.edges.defaults || {}) };
        merged.nodes.options = { ...defaultAdminConfig.nodes.options, ...(merged.nodes.options || {}) };
        merged.edges.options = { ...defaultAdminConfig.edges.options, ...(merged.edges.options || {}) };
        // customFields removed
        // Ensure options rows have enabled defaulting to true
        ['nodes', 'edges'].forEach(scope => {
          const opt = merged[scope].options || {};
          Object.keys(opt).forEach(key => {
            const arr = Array.isArray(opt[key]) ? opt[key] : [];
            opt[key] = arr.map(o => ({ ...o, enabled: o && o.enabled === false ? false : true }));
          });
        });
        return merged;
      }
      adminConfig = normalize(incoming);
      saveAdminConfig();
      // Re-render admin UI to reflect imported settings if modal is open
      if (adminModal) openAdminModal();
      // If user is on the dedicated admin screen, refresh it as well
      try {
        if (document.body && document.body.classList && document.body.classList.contains('admin-screen')) {
          openAdminScreen();
        }
      } catch (_) { }
      // Also refresh details panel options
      renderDetails();
      showToast(t('admin.importSuccess'));
    } catch (_) {
      console.warn('[Admin] Import failed', _);
      showToast(t('admin.importInvalid'));
    }
  });
}

// Admin screen import/export handlers mirror modal handlers
if (adminScreenExportBtn) {
  adminScreenExportBtn.addEventListener('click', () => {
    try {
      const payload = { kind: 'graphSketchAdminConfig', version: 1, exportedAt: new Date().toISOString(), data: adminConfig };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const datePart = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = URL.createObjectURL(blob);
      a.download = `admin-config_${datePart}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(t('admin.exportSuccess'));
    } catch (_) { }
  });
}
if (adminScreenImportBtn && adminScreenImportFile) {
  adminScreenImportBtn.addEventListener('click', () => {
    adminScreenImportFile.value = '';
    adminScreenImportFile.click();
  });
  adminScreenImportFile.addEventListener('change', async () => {
    const file = adminScreenImportFile.files && adminScreenImportFile.files[0];
    if (!file) return;
    try {
      // Preserve currently active tab before rebuild
      const prevTab = adminSettingsScreen ? adminSettingsScreen.getActiveTab() : 'nodes';
      let text = await file.text();
      if (text && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      text = text.trim();
      const parsed = JSON.parse(text);
      const incoming = (parsed && parsed.kind === 'graphSketchAdminConfig' && parsed.data)
        ? parsed.data
        : (parsed && parsed.nodes && parsed.edges)
          ? parsed
          : null;
      if (!incoming) { showToast(t('admin.importInvalid')); return; }
      function normalize(config) {
        const merged = { ...JSON.parse(JSON.stringify(defaultAdminConfig)), ...config };
        merged.nodes = merged.nodes || {};
        merged.edges = merged.edges || {};
        const incNodes = { ...defaultAdminConfig.nodes.include, ...(merged.nodes.include || {}) };
        const incEdges = { ...defaultAdminConfig.edges.include, ...(merged.edges.include || {}) };
        Object.keys(incNodes).forEach(k => { incNodes[k] = !!incNodes[k]; });
        Object.keys(incEdges).forEach(k => { incEdges[k] = !!incEdges[k]; });
        merged.nodes.include = incNodes;
        merged.edges.include = incEdges;
        // customFields removed
        merged.nodes.options = merged.nodes.options || {};
        merged.edges.options = merged.edges.options || {};
        merged.nodes.defaults = merged.nodes.defaults || {};
        merged.edges.defaults = merged.edges.defaults || {};
        return merged;
      }
      adminConfig = normalize(incoming);
      saveAdminConfig();
      try { openAdminScreen(); } catch (_) { }
      // Restore previously selected tab if applicable
      try {
        if (prevTab && prevTab !== 'nodes' && adminSettingsScreen) {
          adminSettingsScreen.setActiveTab(prevTab);
        }
      } catch (_) { }
      // Refresh details panel to reflect updated dropdown options
      try { renderDetails(); } catch (_) { }
      showToast(t('admin.importSuccess'));
    } catch (_) {
      showToast(t('admin.importInvalid'));
    }
  });
}

// Admin screen save/cancel
if (adminScreenSaveBtn) adminScreenSaveBtn.addEventListener('click', () => {
  if (!adminSettingsScreen) return;

  // Validate before saving
  const validation = adminSettingsScreen.validate();
  if (!validation.valid) {
    // Scroll to first error
    if (validation.errors[0]?.field) {
      validation.errors[0].field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      validation.errors[0].field.focus();
    }
    return;
  }

  // Collect and save configuration
  const newConfig = adminSettingsScreen.collectConfig();
  Object.assign(adminConfig, newConfig);
  saveAdminConfig();
  closeAdminScreen();
  try { location.hash = '#/'; } catch (_) { }
  renderDetails();
  showToast(t('admin.saved'));
});
if (adminScreenCancelBtn) adminScreenCancelBtn.addEventListener('click', () => {
  closeAdminScreen();
  try { location.hash = '#/'; } catch (_) { }
});

// Projects screen close button handler
if (projectsScreenCloseBtn) projectsScreenCloseBtn.addEventListener('click', () => {
  closeProjectsScreen();
  try { location.hash = '#/'; } catch (_) { }
});

// Close admin modal when clicking the dim backdrop
if (adminModal) {
  adminModal.addEventListener('click', (e) => {
    if (e.target === adminModal) closeAdminModal();
  });
}

/**
 * Resize the canvas to match its container and device pixel ratio,
 * then trigger a redraw.
 */
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.round(rect.width * dpr);
  const targetHeight = Math.round(rect.height * dpr);
  // Only update backing store if dimensions actually changed to avoid extra layout
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  invalidateCanvasRectCache(); // bounding rect changes on resize
  draw();
}

// Coalesce resize-triggered work to the next animation frame
let resizeRafId = 0;
function scheduleResizeCanvas() {
  if (resizeRafId) return;
  if (typeof requestAnimationFrame === 'function') {
    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = 0;
      resizeCanvas();
    });
  } else {
    resizeRafId = setTimeout(() => {
      resizeRafId = 0;
      resizeCanvas();
    }, 0);
  }
}

window.addEventListener('resize', scheduleResizeCanvas);
window.addEventListener('scroll', invalidateCanvasRectCache, { passive: true }); // keep canvas rect cache fresh on page scroll

// Also resize the canvas whenever its container changes size (e.g.,
// details panel expands/collapses on mobile and alters flex heights)
if (window.ResizeObserver) {
  const canvasContainerObserver = new ResizeObserver(() => {
    scheduleResizeCanvas();
  });
  try {
    canvasContainerObserver.observe(canvas.parentElement);
  } catch (_) { }
}

// showToast is now provided by src/utils/toast.js via window.showToast
// Keeping calls intact; this comment remains for migration traceability.

// === i18n ===
// i18n strings and translator are now provided by src/i18n.js via window.t and window.isRTL

// use global t/isRTL injected from module entry

function applyLangToStaticUI() {
  // Sweep all elements with translation data-attributes
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  // appTitle uses child spans for styled brand text — set textContent directly
  if (appTitleEl) appTitleEl.textContent = t('appTitle');

  // Canvas toolbar mode buttons: innerHTML must be reset each call to restore
  // the Material Icon markup that applyLangToStaticUI itself previously wiped.
  if (nodeModeBtn) {
    nodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">radio_button_unchecked</span>';
  }
  if (homeNodeModeBtn) {
    homeNodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">home</span>';
  }
  if (drainageNodeModeBtn) {
    drainageNodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">water_drop</span>';
  }
  if (edgeModeBtn) {
    edgeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">timeline</span>';
  }

  // Dynamic inputs not present in index.html (created at runtime by other modules)
  if (typeof searchAddressInput !== 'undefined' && searchAddressInput) {
    searchAddressInput.placeholder = t('searchAddress');
    searchAddressInput.title = t('searchAddressTitle');
  }
  if (typeof mobileSearchAddressInput !== 'undefined' && mobileSearchAddressInput) {
    mobileSearchAddressInput.placeholder = t('searchAddress');
    mobileSearchAddressInput.title = t('searchAddressTitle');
  }

  // Rebuild the help list — it is an array of translated strings, not a single key
  if (helpListEl) {
    helpListEl.innerHTML = '';
    t('helpLines').forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      helpListEl.appendChild(li);
    });
  }

  // Apply document-level RTL/LTR direction and language tag
  document.documentElement.dir = isRTL(currentLang) ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLang;
  document.body.classList.toggle('rtl', isRTL(currentLang));

  // Re-render edge legend (alignment depends on current language direction)
  renderEdgeLegend();

  // Update street view pegman labels (managed by an external module)
  updateStreetViewTranslations(t);
}

// CSV helpers moved to src/utils/csv.js
import { csvQuote, exportNodesCsv, exportEdgesCsv } from '../utils/csv.js';
import { exportSketchToJson, importSketchFromJson } from '../utils/sketch-io.js';

/**
 * Utility: determine if an id is a strictly numeric positive integer string.
 */


function collectUsedNumericIds() {
  const used = new Set();
  for (const n of nodes) {
    if (!n) continue;
    // Include all nodes with numeric IDs (manholes, drainage, and homes)
    if (isNumericId(n.id)) {
      used.add(parseInt(String(n.id), 10));
    }
  }
  return used;
}

function findSmallestAvailableNumericId() {
  const used = collectUsedNumericIds();
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return String(candidate);
}

function renameNodeIdInternal(oldId, newId) {
  const node = nodes.find((n) => String(n.id) === String(oldId));
  if (!node) return;
  node.id = String(newId);
  edges.forEach((edge) => {
    if (String(edge.tail) === String(oldId)) edge.tail = String(newId);
    if (String(edge.head) === String(oldId)) edge.head = String(newId);
  });
}



/**
 * Encode a JS string as UTF-16LE with BOM so that Excel on Windows opens it with correct encoding.
 * @param {string} text
 * @returns {Uint8Array}
 */


/**
 * Compute the shortest distance from a point to a line segment.
 * @param {number} x0 - X of point
 * @param {number} y0 - Y of point
 * @param {number} x1 - X of first segment endpoint
 * @param {number} y1 - Y of first segment endpoint
 * @param {number} x2 - X of second segment endpoint
 * @param {number} y2 - Y of second segment endpoint
 * @returns {number} Euclidean distance in pixels
 */


/**
 * Normalize legacy sketch data in-place so that both localStorage and library
 * loaders produce identical, fully-populated node/edge objects.
 *
 * Node normalization:
 *  - nodeType: case-insensitive aliases → canonical 'Manhole'|'Home'|'Covered'|'Drainage'
 *  - Home/Drainage nodes: clear inapplicable fields, ensure directConnection default
 *  - coverDiameter: undefined → NODE_COVER_DIAMETERS[0]; present → round(Number) or ''
 *  - access, accuracyLevel, nodeEngineeringStatus, maintenanceStatus: coerce to Number
 *  - id: coerce to String
 *
 * Edge normalization:
 *  - material, fall_depth, fall_position, line_diameter, edge_type: set defaults
 *  - maintenanceStatus, engineeringStatus: coerce to Number
 *  - tail/head: String (preserving null for dangling edges)
 *
 * @param {Array} nodes - Node array (mutated in-place)
 * @param {Array} edges - Edge array (mutated in-place)
 */
function normalizeLegacySketch(nodes, edges) {
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
    } else {
      node.nodeType = 'Manhole';
    }

    // --- Fields that are N/A for Home and Drainage nodes ---
    if (node.nodeType === 'Home') {
      node.material = NODE_MATERIALS[0];
      node.coverDiameter = '';
      node.access = '';
      node.nodeEngineeringStatus = '';
      node.maintenanceStatus = '';
      if (node.directConnection === undefined) node.directConnection = false;
    }
    if (node.nodeType === 'Drainage') {
      node.material = NODE_MATERIALS[0];
      node.coverDiameter = '';
      node.access = '';
      node.nodeEngineeringStatus = '';
      node.maintenanceStatus = '';
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

/**
 * Load a previously saved sketch from localStorage if present.
 * Ensures required properties exist and normalizes id types, then
 * recomputes node types based on edge measurements.
 * @returns {boolean} true if a sketch was loaded; false otherwise
 */
function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.sketch);
    if (!data) return false;
    const parsed = JSON.parse(data);
    if (!parsed || !parsed.nodes || !parsed.edges) return false;
    nodes = parsed.nodes;
    edges = parsed.edges;
    markEdgeLabelCacheDirty(); // new sketch data loaded
    creationDate = parsed.creationDate || null;
    currentSketchId = parsed.sketchId || null;
    currentSketchName = parsed.sketchName || null;
    currentProjectId = parsed.projectId || null;
    currentInputFlowConfig = parsed.inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
    updateSketchNameDisplay();
    // Normalize nodes and edges to canonical shape (single source of truth)
    normalizeLegacySketch(nodes, edges);
    // Recompute nextNodeId as (max numeric id among nodes) + 1
    let maxNumericId = 0;
    for (const n of nodes) {
      const parsedId = parseInt(String(n.id), 10);
      if (Number.isFinite(parsedId)) {
        if (parsedId > maxNumericId) maxNumericId = parsedId;
      }
    }
    nextNodeId = maxNumericId + 1;
    // Restore last edit position if available
    if (parsed.lastEditX != null && parsed.lastEditY != null) {
      setLastEditPosition(parsed.lastEditX, parsed.lastEditY);
    }
    // Recompute node types based on measurements
    computeNodeTypes();
    // Auto-reposition nodes from embedded geographic coordinates
    autoRepositionFromEmbeddedCoords();
    // Load reference layers for the project (if sketch belongs to one)
    loadProjectReferenceLayers(currentProjectId);
    return true;
  } catch (e) {
    console.error('[App] Error loading sketch from storage:', e.message);
    return false;
  }
}

/**
 * Persist the current sketch to localStorage.
 * Uses requestIdleCallback to defer heavy JSON serialization off the main thread.
 */
function saveToStorage() {
  // Skip saving completely empty sketches (no nodes, no edges)
  if ((!nodes || nodes.length === 0) && (!edges || edges.length === 0)) {
    return;
  }

  const nowIso = new Date().toISOString();
  const username = getCurrentUsername();

  // Capture current state references (these are lightweight)
  markEdgeLabelCacheDirty(); // edge/node data changed — invalidate label layout cache
  const currentNodes = nodes;
  const currentEdges = edges;
  const currentNextNodeId = nextNodeId;
  const currentCreationDate = creationDate;
  const savedSketchId = currentSketchId;
  const savedSketchName = currentSketchName;
  const savedProjectId = currentProjectId;
  const savedInputFlowConfig = currentInputFlowConfig;
  const savedAdminConfig = typeof adminConfig !== 'undefined' ? adminConfig : {};
  
  // Schedule the heavy work to run when browser is idle
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
    
    // Single JSON.stringify call, reuse the string
    const payloadJson = JSON.stringify(payload);
    localStorage.setItem(STORAGE_KEYS.sketch, payloadJson);

    // Persist to IndexedDB for durability (fire-and-forget)
    idbSaveCurrentCompat(payload);
    
    if (autosaveEnabled) {
      saveToLibrary();
    }
    
    // Trigger cloud sync if authenticated and online
    if (savedSketchId && window.syncService?.debouncedSyncToCloud) {
      // Get the name from the library record if currentSketchName is null
      let nameForSync = savedSketchName;
      if (!nameForSync && savedSketchId) {
        const lib = getLibrary();
        const rec = lib.find((r) => r.id === savedSketchId);
        if (rec && rec.name) {
          nameForSync = rec.name;
          // Also update currentSketchName so it stays in sync
          currentSketchName = rec.name;
          updateSketchNameDisplay();
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

  // Use requestIdleCallback if available, otherwise setTimeout(0)
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doSave, { timeout: 100 });
  } else {
    setTimeout(doSave, 0);
  }
}

// Debounced saver to reduce jank on mobile while typing
const debouncedSaveToStorage = (function () {
  /** @type {number|undefined} */
  let timeoutId;
  const delayMs = 150;
  return function () {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      try { saveToStorage(); } catch (_) { }
    }, delayMs);
  };
})();

/**
 * Remove the stored sketch from localStorage.
 */
function clearStorage() {
  localStorage.removeItem(STORAGE_KEYS.sketch);
  // Remove from IndexedDB as well
  idbSaveCurrentCompat(null);
}

// === Library management (multiple sketches) ===
// Cache for library to avoid repeated JSON.parse() on large datasets
let _libraryCache = null;
let _libraryCacheValid = false;

function getLibrary() {
  if (_libraryCacheValid && _libraryCache !== null) {
    return _libraryCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.library);
    if (!raw) {
      _libraryCache = [];
      _libraryCacheValid = true;
      return [];
    }
    const lib = JSON.parse(raw);
    if (Array.isArray(lib)) {
      _libraryCache = lib;
      _libraryCacheValid = true;
      return lib;
    }
    _libraryCache = [];
    _libraryCacheValid = true;
    return [];
  } catch (e) {
    console.error('[App] Failed to parse library', e.message);
    _libraryCache = [];
    _libraryCacheValid = true;
    return [];
  }
}

// Pending localStorage write for library (to batch writes)
let _libraryWritePending = false;

function setLibrary(list) {
  // Update cache immediately for responsive reads
  _libraryCache = list;
  _libraryCacheValid = true;
  
  // Defer the heavy localStorage write to avoid blocking UI
  if (!_libraryWritePending) {
    _libraryWritePending = true;
    const doWrite = () => {
      _libraryWritePending = false;
      // Use the cached version to ensure we write the latest state
      if (_libraryCache !== null) {
        localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(_libraryCache));
      }
    };
    
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(doWrite, { timeout: 100 });
    } else {
      setTimeout(doWrite, 0);
    }
  }
}

function invalidateLibraryCache() {
  _libraryCacheValid = false;
  _libraryCache = null;
}

/**
 * Sync project canvas sketches back to the localStorage library.
 * Called when leaving project-canvas mode so the home view shows
 * up-to-date node/edge counts and metadata for all project sketches.
 */
function syncProjectSketchesToLibrary() {
  try {
    const projectSketchList = getAllSketches(); // from project-canvas-state
    if (!projectSketchList || projectSketchList.length === 0) return;

    const lib = getLibrary();
    let changed = false;

    for (const ps of projectSketchList) {
      // The active sketch's live data is in the globals, not the Map
      const sketchNodes = ps.isActive ? nodes : (ps.nodes || []);
      const sketchEdges = ps.isActive ? edges : (ps.edges || []);

      const idx = lib.findIndex(s => s.id === ps.id);
      if (idx >= 0) {
        // Update existing entry with fresh data from the project canvas
        lib[idx] = {
          ...lib[idx],
          nodes: sketchNodes,
          edges: sketchEdges,
          nodeCount: sketchNodes.length,
          edgeCount: sketchEdges.length,
          name: ps.name || lib[idx].name,
          adminConfig: ps.adminConfig || lib[idx].adminConfig || {},
          updatedAt: ps.updatedAt || lib[idx].updatedAt,
          metadataOnly: false,
        };
        changed = true;
      } else {
        // Sketch exists in project but not in library — add it
        lib.unshift({
          id: ps.id,
          name: ps.name || null,
          creationDate: ps.creationDate || ps.createdAt,
          createdAt: ps.createdAt,
          updatedAt: ps.updatedAt,
          projectId: ps.projectId,
          nodes: sketchNodes,
          edges: sketchEdges,
          nodeCount: sketchNodes.length,
          edgeCount: sketchEdges.length,
          adminConfig: ps.adminConfig || {},
          cloudSynced: true,
          metadataOnly: false,
          ownerId: ps.ownerId,
          ownerUsername: ps.ownerUsername,
          ownerEmail: ps.ownerEmail,
          isOwner: ps.isOwner,
          createdBy: ps.createdBy,
          lastEditedBy: ps.lastEditedBy,
        });
        changed = true;
      }
    }

    if (changed) {
      setLibrary(lib);
    }
  } catch (err) {
    console.warn('[App] Failed to sync project sketches to library:', err);
  }
}

function generateSketchId() {
  return 'sk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function saveToLibrary() {
  const lib = getLibrary();
  const nowIso = new Date().toISOString();
  const sketchId = currentSketchId || generateSketchId();

  // Silently skip saving empty sketches (no nodes and no edges)
  if ((!nodes || nodes.length === 0) && (!edges || edges.length === 0)) {
    console.debug('[App] Skipping save of empty sketch:', sketchId);
    return;
  }

  const lastEdit = getLastEditPosition();
  const record = {
    id: sketchId,
    createdAt: creationDate || nowIso,
    updatedAt: nowIso,
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nextNodeId,
    creationDate: creationDate || nowIso,
    name: currentSketchName || null,
    projectId: currentProjectId || null,
    inputFlowConfig: currentInputFlowConfig || null,
    lastEditedBy: getCurrentUsername(),
    metadataOnly: false,
    lastEditX: lastEdit?.x ?? null,
    lastEditY: lastEdit?.y ?? null,
  };
  const idx = lib.findIndex((s) => s.id === record.id);
  let finalRecord = record;
  if (idx >= 0) {
    // Preserve existing name if current is null, so we don't accidentally clear it
    const existing = lib[idx];
    const merged = { ...record };
    if ((record.name == null || record.name === '') && (existing.name != null && existing.name !== '')) {
      merged.name = existing.name;
      // Also update currentSketchName so subsequent syncs use the preserved name
      currentSketchName = existing.name;
      updateSketchNameDisplay();
    }
    lib[idx] = merged;
    finalRecord = merged;
  } else {
    lib.unshift(record);
  }
  setLibrary(lib);
  currentSketchId = finalRecord.id;
  // Mirror into IndexedDB (use finalRecord which has the merged/preserved name)
  idbSaveRecordCompat(finalRecord);
}

async function loadFromLibrary(sketchId) {
  const lib = getLibrary();
  const rec = lib.find((r) => r.id === sketchId);
  if (!rec) return false;
  
  // Release lock on previous sketch if we held one
  if (currentSketchId && window.syncService?.releaseSketchLock) {
    await window.syncService.releaseSketchLock(currentSketchId).catch(() => {});
  }
  
  // Try to acquire lock on the new sketch
  if (window.syncService?.acquireSketchLock) {
    const lockResult = await window.syncService.acquireSketchLock(sketchId);
    if (!lockResult.success && !lockResult.offline) {
      // Show warning that sketch is locked
      if (showToast) {
        const lockedBy = lockResult.lock?.lockedBy || 'another user';
        showToast(t('sketches.lockedByOther') || `Sketch is being edited by ${lockedBy}. Opening in view-only mode.`, 'warning');
      }
      // Still allow opening in read-only mode
      window.__sketchReadOnly = true;
    } else {
      window.__sketchReadOnly = false;
    }
  }
  // Lazy-fetch full data from cloud if we only have metadata
  let sketchData = rec;
  if (rec.metadataOnly || (!rec.nodes?.length && !rec.edges?.length && rec.cloudSynced)) {
    try {
      if (showToast) showToast(t('sketches.loading') || 'Loading sketch data...', 'info');
      const fullSketch = await window.syncService?.fetchSketchFromCloud(sketchId);
      if (fullSketch && (fullSketch.nodes?.length || fullSketch.edges?.length)) {
        sketchData = { ...rec, ...fullSketch, metadataOnly: false };
        // Update localStorage cache with full data
        const lib = getLibrary();
        const idx = lib.findIndex(r => r.id === sketchId);
        if (idx >= 0) { lib[idx] = sketchData; setLibrary(lib); }
      }
    } catch (e) {
      console.warn('[loadFromLibrary] Failed to fetch full sketch from cloud:', e.message);
    }
  }
  nodes = sketchData.nodes || [];
  edges = sketchData.edges || [];
  markEdgeLabelCacheDirty(); // sketch record loaded
  // Normalize nodes and edges to canonical shape (single source of truth)
  normalizeLegacySketch(nodes, edges);
  nextNodeId = sketchData.nextNodeId || 1;
  creationDate = sketchData.creationDate || sketchData.createdAt || null;
  currentSketchId = sketchData.id;
  currentSketchName = sketchData.name || null;
  currentProjectId = sketchData.projectId || null;
  currentInputFlowConfig = sketchData.inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
  updateSketchNameDisplay();
  // Reset edge creation state
  pendingEdgeTail = null;
  pendingEdgePreview = null;
  pendingEdgeStartPosition = null;
  selectedNode = null;
  selectedEdge = null;
  computeNodeTypes();
  // Auto-reposition nodes from embedded geographic coordinates
  autoRepositionFromEmbeddedCoords();
  // Restore last edit position from library record
  if (sketchData.lastEditX != null && sketchData.lastEditY != null) {
    setLastEditPosition(sketchData.lastEditX, sketchData.lastEditY);
  }
  saveToStorage();
  draw();
  renderDetails();

  // If a last edit position exists, center on it at 20% zoom; otherwise recenter on sketch center
  const lastEdit = getLastEditPosition();
  if (lastEdit) {
    const targetScale = 0.2;
    const rect = canvas.getBoundingClientRect();
    const tx = rect.width / 2 - targetScale * viewStretchX * lastEdit.x;
    const ty = rect.height / 2 - targetScale * viewStretchY * lastEdit.y;
    window.__setViewState(targetScale, tx, ty);
  } else {
    try { recenterView(); } catch (_) { }
  }

  // Load reference layers for the project (if sketch belongs to one)
  loadProjectReferenceLayers(currentProjectId);

  return true;
}

/**
 * Fetch and load reference layers for a given project.
 * Layers are cached in IndexedDB keyed by projectId.
 * @param {string|null} projectId
 */
async function loadProjectReferenceLayers(projectId) {
  if (!projectId) {
    clearReferenceLayers();
    scheduleDraw();
    return;
  }
  
  try {
    // Check IndexedDB cache first
    const cacheKey = `refLayers_${projectId}`;
    let cached = null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const data = JSON.parse(raw);
        // Use cache if less than 1 hour old
        if (data.timestamp && Date.now() - data.timestamp < 3600000) {
          cached = data.layers;
        }
      }
    } catch (_) { /* ignore cache errors */ }
    
    if (cached) {
      setReferenceLayers(cached);
      loadRefLayerSettings();
      renderRefLayerToggles();
      scheduleDraw();
      console.debug(`[RefLayers] Loaded ${cached.length} layers from cache for project ${projectId}`);
      return; // Skip server fetch when cache is fresh (< 1 hour)
    }

    // Cache miss or stale — fetch from server
    const response = await fetch(`/api/layers?projectId=${projectId}&full=true`);
    if (!response.ok) {
      console.warn('[RefLayers] Failed to fetch layers:', response.status);
      return;
    }
    
    const data = await response.json();
    const layers = data.layers || [];
    
    setReferenceLayers(layers);
    loadRefLayerSettings();
    renderRefLayerToggles();
    scheduleDraw();
    
    // Cache in localStorage
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        layers
      }));
    } catch (_) { /* localStorage may be full */ }
    
    console.debug(`[RefLayers] Loaded ${layers.length} layers from server for project ${projectId}`);
  } catch (err) {
    console.warn('[RefLayers] Error loading reference layers:', err.message);
  }
}

// Expose for external use (menu, admin)
window.loadProjectReferenceLayers = loadProjectReferenceLayers;
window.getReferenceLayers = getReferenceLayers;
window.setLayerVisibility = setLayerVisibility;
window.setRefLayersEnabled = setRefLayersEnabled;
window.isRefLayersEnabled = isRefLayersEnabled;
window.saveRefLayerSettings = saveRefLayerSettings;

function deleteFromLibrary(sketchId) {
  const lib = getLibrary();
  const filtered = lib.filter((r) => r.id !== sketchId);
  setLibrary(filtered);
  if (currentSketchId === sketchId) {
    currentSketchId = null;
  }
  // Remove from IndexedDB
  idbDeleteRecordCompat(sketchId);
  // Remove from cloud if sync service is available
  if (window.syncService?.deleteSketchEverywhere) {
    window.syncService.deleteSketchEverywhere(sketchId).catch(err => console.error('[Sync] Failed to delete sketch everywhere:', err.message));
  }
}

function migrateSingleSketchToLibraryIfNeeded() {
  const lib = getLibrary();
  if (lib.length > 0) return; // already migrated or has sketches
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sketch);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.nodes || !parsed.edges) return;
    const id = parsed.sketchId || generateSketchId();
    const nowIso = new Date().toISOString();
    const record = {
      id,
      createdAt: parsed.creationDate || nowIso,
      updatedAt: nowIso,
      nodes: parsed.nodes,
      edges: parsed.edges,
      nextNodeId: parsed.nextNodeId || 1,
      creationDate: parsed.creationDate || nowIso,
      name: parsed.sketchName || null,
    };
    setLibrary([record]);
    currentSketchId = id;
    saveToStorage();
    // Also populate IndexedDB with the migrated record
    idbSaveRecordCompat(record);
  } catch (e) {
    console.warn('[App] Migration skipped', e.message);
  }
}

// Sync status UI elements
const syncStatusBar = document.getElementById('syncStatusBar');
const syncStatusText = document.getElementById('syncStatusText');
const syncStatusIcon = syncStatusBar?.querySelector('.sync-icon');

// Update sync status UI
function updateSyncStatusUI(state) {
  if (!syncStatusBar) return;
  
  const authState = window.authGuard?.getAuthState?.() || {};
  if (!authState.isSignedIn) {
    syncStatusBar.style.display = 'none';
    return;
  }
  
  syncStatusBar.style.display = 'flex';
  
  // Remove all state classes
  syncStatusBar.classList.remove('syncing', 'offline', 'error');
  if (syncStatusIcon) syncStatusIcon.classList.remove('spin');
  
  if (!state.isOnline) {
    syncStatusBar.classList.add('offline');
    if (syncStatusIcon) syncStatusIcon.textContent = 'cloud_off';
    if (syncStatusText) syncStatusText.textContent = t('auth.offline');
  } else if (state.isSyncing) {
    syncStatusBar.classList.add('syncing');
    if (syncStatusIcon) {
      syncStatusIcon.textContent = 'sync';
      syncStatusIcon.classList.add('spin');
    }
    if (syncStatusText) syncStatusText.textContent = t('auth.syncing');
  } else if (state.error) {
    syncStatusBar.classList.add('error');
    if (syncStatusIcon) syncStatusIcon.textContent = 'cloud_off';
    if (syncStatusText) syncStatusText.textContent = t('auth.syncError');
  } else {
    if (syncStatusIcon) syncStatusIcon.textContent = 'cloud_done';
    if (state.lastSyncTime) {
      const timeAgo = formatTimeAgo(state.lastSyncTime);
      if (syncStatusText) syncStatusText.textContent = t('auth.lastSynced', timeAgo);
    } else {
      if (syncStatusText) syncStatusText.textContent = t('auth.synced');
    }
  }
}

// Format time ago string
function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return currentLang === 'he' ? 'עכשיו' : 'just now';
  if (mins < 60) return currentLang === 'he' ? `לפני ${mins} דקות` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return currentLang === 'he' ? `לפני ${hours} שעות` : `${hours} hr ago`;
  return new Date(date).toLocaleDateString(currentLang === 'he' ? 'he-IL' : 'en-GB');
}

// Subscribe to sync state changes
if (window.syncService?.onSyncStateChange) {
  window.syncService.onSyncStateChange((state) => {
    updateSyncStatusUI(state);
    // Re-render home panel when sync completes while it is visible (but not in project canvas mode)
    if (homePanel && homePanel.style.display === 'flex' && !isProjectCanvasMode()) {
      if (homeMode === 'projects') {
        renderProjectsHome();
      } else {
        renderHome();
      }
    }
  });
}

// Track the current sketch tab (personal or organization)
let currentSketchTab = 'personal';
// Track which home mode is active: 'projects' or 'sketches'
let homeMode = 'projects';

function renderHome() {
  if (!homePanel || !sketchListEl) return;
  homeMode = 'sketches';

  // Undo projects-mode overrides
  homePanel.classList.remove('home-panel--projects');
  // Reset title and icon
  if (homeTitleEl) homeTitleEl.textContent = t('homeTitle');
  const headerIcon = homePanel.querySelector('.home-panel-header-title .material-icons');
  if (headerIcon) headerIcon.textContent = 'folder_open';
  // Hide subtitle
  const subtitleEl = homePanel.querySelector('.home-panel-header-subtitle');
  if (subtitleEl) subtitleEl.style.display = 'none';
  // Restore close button
  const closeBtn = document.getElementById('homePanelCloseBtn');
  if (closeBtn) closeBtn.style.display = '';
  // Restore footer
  const footer = homePanel.querySelector('.home-panel-footer');
  if (footer) footer.style.display = '';

  startPanel.style.display = 'none';
  homePanel.classList.remove('panel-closing');
  homePanel.style.display = 'flex';

  // Update sync status
  if (window.syncService?.getSyncState) {
    updateSyncStatusUI(window.syncService.getSyncState());
  }
  
  // Check if user is admin to show organization tab
  const userRole = window.permissionsService?.getUserRole?.();
  const isAdminUser = userRole?.isAdmin === true;
  
  // Setup tabs
  const sketchTabs = document.getElementById('sketchTabs');
  const personalTab = document.getElementById('personalTab');
  const organizationTab = document.getElementById('organizationTab');
  
  if (sketchTabs) {
    // Show organization tab only for admin users
    if (isAdminUser) {
      sketchTabs.classList.add('show-org');
    } else {
      sketchTabs.classList.remove('show-org');
      currentSketchTab = 'personal'; // Reset to personal if not admin
    }
    
    // Update active tab state
    if (personalTab) {
      personalTab.classList.toggle('active', currentSketchTab === 'personal');
    }
    if (organizationTab) {
      organizationTab.classList.toggle('active', currentSketchTab === 'organization');
    }
    
    // Add tab click handlers (remove old ones first to avoid duplicates)
    if (personalTab && !personalTab._hasTabHandler) {
      personalTab.addEventListener('click', () => {
        currentSketchTab = 'personal';
        renderHome();
      });
      personalTab._hasTabHandler = true;
    }
    if (organizationTab && !organizationTab._hasTabHandler) {
      organizationTab.addEventListener('click', () => {
        currentSketchTab = 'organization';
        renderHome();
      });
      organizationTab._hasTabHandler = true;
    }
  }
  
  const lib = getLibrary();
  
  // Filter sketches based on selected tab
  const filteredLib = lib.filter(rec => {
    if (currentSketchTab === 'personal') {
      return rec.isOwner === true || rec.isOwner === undefined; // Include undefined for backwards compatibility
    } else {
      return rec.isOwner === false; // Organization sketches (not owned by current user)
    }
  });

  // Stable sort: newest updated first, then by ID as tiebreaker
  filteredLib.sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    if (bTime !== aTime) return bTime - aTime;
    return (a.id || '').localeCompare(b.id || '');
  });

  sketchListEl.innerHTML = '';

  // Show loading spinner while syncing and list is empty
  const syncState = window.syncService?.getSyncState?.();
  if (syncState?.isSyncing && filteredLib.length === 0) {
    const loading = document.createElement('div');
    loading.className = 'sketch-list-loading';
    loading.innerHTML = `
      <span class="material-icons spin">sync</span>
      <span>${t('auth.syncing')}</span>
    `;
    sketchListEl.appendChild(loading);
    return;
  }

  if (filteredLib.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sketch-list-empty';
    empty.innerHTML = `
      <span class="material-icons">inbox</span>
      <span>${currentSketchTab === 'organization' ? t('noOrganizationSketches') || 'No organization sketches' : t('noSketches')}</span>
    `;
    sketchListEl.appendChild(empty);
  } else {
    filteredLib.forEach((rec) => {
      const item = document.createElement('div');
      const isCurrentSketch = rec.id === currentSketchId;
      item.className = `sketch-card${isCurrentSketch ? ' sketch-card-active' : ''}`;
      const displayName = rec.name && String(rec.name).trim().length > 0 ? rec.name : null;
      const dateStr = rec.creationDate || rec.createdAt;
      let formattedDate = '';
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString(currentLang === 'he' ? 'he-IL' : 'en-GB');
        } else {
          formattedDate = dateStr;
        }
      }
      const title = displayName || t('listTitle', rec.id.slice(-6), formattedDate);
      const nodeCount = rec.nodeCount ?? (rec.nodes || []).length;
      const edgeCount = rec.edgeCount ?? (rec.edges || []).length;
      
      // Show owner info for admin users viewing other users' sketches
      const ownerDisplay = rec.ownerUsername || rec.createdBy || rec.ownerEmail || '';
      const showOwnerInfo = isAdminUser && !rec.isOwner && ownerDisplay;
      
      // Get created by and modified by labels
      const createdByUser = rec.createdBy || '';
      const modifiedByUser = rec.lastEditedBy || '';
      const showCreatedBy = createdByUser && createdByUser.length > 0;
      const showModifiedBy = modifiedByUser && modifiedByUser.length > 0;
      
      const safeRecId = escapeHtml(rec.id);
      const safeTitle = escapeHtml(title);
      const safeCreatedByUser = escapeHtml(createdByUser);
      const safeModifiedByUser = escapeHtml(modifiedByUser);
      const safeOwnerDisplay = escapeHtml(ownerDisplay);
      item.innerHTML = `
        ${isCurrentSketch ? `<div class="sketch-card-active-badge">
          <span class="material-icons">check_circle</span>
          <span>${t('listCurrentSketch')}</span>
        </div>` : ''}
        <div class="sketch-card-header">
          <div class="sketch-card-icon${isCurrentSketch ? ' active' : ''}">
            <span class="material-icons">description</span>
          </div>
          <div class="sketch-card-info">
            <div class="sketch-card-title sketch-title" data-id="${safeRecId}">${safeTitle}</div>
            <div class="sketch-card-meta">
              <span class="material-icons">schedule</span>
              ${t('listUpdated', new Date(rec.updatedAt || rec.createdAt).toLocaleString(currentLang === 'he' ? 'he-IL' : 'en-GB'))}
            </div>
            <div class="sketch-card-user-info">
              ${showCreatedBy ? `<div class="sketch-card-meta sketch-card-creator">
                <span class="material-icons" aria-hidden="true">person_add</span>
                <span>${t('createdBy') || 'Created by'}: ${safeCreatedByUser}</span>
              </div>` : ''}
              ${showModifiedBy ? `<div class="sketch-card-meta sketch-card-modifier">
                <span class="material-icons" aria-hidden="true">edit</span>
                <span>${t('modifiedBy') || 'Modified by'}: ${safeModifiedByUser}</span>
              </div>` : ''}
            </div>
            ${showOwnerInfo ? `<div class="sketch-card-meta sketch-card-owner">
              <span class="material-icons">person</span>
              <span>${safeOwnerDisplay}</span>
            </div>` : ''}
          </div>
        </div>
        <div class="sketch-card-stats">
          <div class="sketch-stat">
            <span class="material-icons">account_tree</span>
            <span>${nodeCount}</span>
          </div>
          <div class="sketch-stat">
            <span class="material-icons">timeline</span>
            <span>${edgeCount}</span>
          </div>
        </div>
        <div class="sketch-card-actions">
          ${isCurrentSketch ? '' : `<button class="sketch-action-btn sketch-action-primary" data-action="open" data-id="${safeRecId}">
            <span class="material-icons">open_in_new</span>
            <span>${t('listOpen')}</span>
          </button>`}
          <button class="sketch-action-btn" data-action="changeProject" data-id="${safeRecId}">
            <span class="material-icons">folder</span>
            <span>${t('listChangeProject')}</span>
          </button>
          <button class="sketch-action-btn" data-action="duplicate" data-id="${safeRecId}">
            <span class="material-icons">content_copy</span>
            <span>${t('listDuplicate')}</span>
          </button>
          ${!isCurrentSketch ? `
          <button class="sketch-action-btn" data-action="importHistory" data-id="${safeRecId}">
            <span class="material-icons">history</span>
            <span>${t('listImportHistory')}</span>
          </button>` : ''}
          <button class="sketch-action-btn sketch-action-danger" data-action="delete" data-id="${safeRecId}" aria-label="${t('listDelete')}" title="${t('listDelete')}">
            <span class="material-icons" aria-hidden="true">delete_outline</span>
          </button>
        </div>`;
      sketchListEl.appendChild(item);
    });
  }
}

// Expose renderHome to window so sync-service can trigger a re-render after fetching sketches.
// refreshHomePanel respects the current home mode (projects vs sketches).
window.invalidateLibraryCache = invalidateLibraryCache;

window.renderHome = function () {
  // Don't re-render home when in project canvas mode (e.g. sync-service triggers after cloud fetch)
  if (isProjectCanvasMode()) return;
  if (homeMode === 'projects') {
    renderProjectsHome();
  } else {
    renderHome();
  }
};

// ── Project Canvas Mode: active sketch getter/setter ──────────────────────

/**
 * Snapshot the current active sketch state for project-canvas switching.
 */
window.__getActiveSketchData = function () {
  return {
    nodes: nodes.slice(),
    edges: edges.slice(),
    nextNodeId,
    sketchId: currentSketchId,
    sketchName: currentSketchName,
    projectId: currentProjectId,
    inputFlowConfig: currentInputFlowConfig,
    creationDate,
  };
};

/**
 * Load a sketch into the main globals (used by project-canvas-state).
 */
window.__setActiveSketchData = function (data) {
  nodes = data.nodes || [];
  edges = data.edges || [];
  nextNodeId = data.nextNodeId || 1;
  currentSketchId = data.sketchId || null;
  currentSketchName = data.sketchName || null;
  currentProjectId = data.projectId || null;
  if (data.inputFlowConfig) currentInputFlowConfig = data.inputFlowConfig;
  if (data.creationDate) creationDate = data.creationDate;
  // Reset selection
  selectedNode = null;
  selectedEdge = null;
  pendingEdgeTail = null;
  pendingEdgePreview = null;
  pendingEdgeStartPosition = null;
  updateSketchNameDisplay();
  computeNodeTypes();
  autoRepositionFromEmbeddedCoords();
  renderDetails();
  scheduleDraw();
};

window.__scheduleDraw = function () { scheduleDraw(); };

window.__setViewState = function (scale, tx, ty) {
  viewScale = scale;
  viewTranslate.x = tx;
  viewTranslate.y = ty;
  scheduleDraw();
};

window.__getStretch = function () {
  return { x: viewStretchX, y: viewStretchY };
};

// Expose project canvas module on window for draw()/pointerDown() integration
window.__projectCanvas = {
  isProjectCanvasMode,
  getBackgroundSketches,
  findNodeInBackground,
  findEdgeInBackground,
  switchActiveSketch,
};

function hideHome(immediate) {
  if (!homePanel) return;
  if (immediate) {
    homePanel.classList.remove('panel-closing');
    homePanel.style.display = 'none';
  } else {
    hidePanelAnimated(homePanel);
  }
}

// ── Projects Homepage & Project Canvas ────────────────────────────────────

/**
 * Render the projects homepage in the homePanel container.
 * Shows organization projects as cards. Falls back to old sketch list
 * if user has no org or fetch fails.
 */
async function renderProjectsHome() {
  if (!homePanel || !sketchListEl) {
    // Fallback: show old sketch list
    renderHome();
    return;
  }

  homeMode = 'projects';

  // Show the home panel with loading state
  startPanel.style.display = 'none';
  homePanel.classList.remove('panel-closing');
  homePanel.classList.add('home-panel--projects');
  homePanel.style.display = 'flex';

  // Update title and icon for projects landing page
  if (homeTitleEl) homeTitleEl.textContent = t('projectsTitle');
  const headerIcon = homePanel.querySelector('.home-panel-header-title .material-icons');
  if (headerIcon) headerIcon.textContent = 'dashboard';

  // Add subtitle below title
  let subtitleEl = homePanel.querySelector('.home-panel-header-subtitle');
  if (!subtitleEl) {
    subtitleEl = document.createElement('div');
    subtitleEl.className = 'home-panel-header-subtitle';
    const headerTitle = homePanel.querySelector('.home-panel-header-title');
    if (headerTitle) headerTitle.after(subtitleEl);
  }
  subtitleEl.textContent = t('projects.homepage.subtitle');
  subtitleEl.style.display = '';

  // Hide close button (projects page is the landing page)
  const closeBtn = document.getElementById('homePanelCloseBtn');
  if (closeBtn) closeBtn.style.display = 'none';

  // Hide footer (New Sketch button is irrelevant on projects page)
  const footer = homePanel.querySelector('.home-panel-footer');
  if (footer) footer.style.display = 'none';

  // Hide sketch tabs
  const sketchTabs = document.getElementById('sketchTabs');
  if (sketchTabs) sketchTabs.style.display = 'none';

  sketchListEl.innerHTML = `
    <div class="sketch-list-loading">
      <span class="material-icons spin">sync</span>
      <span>${t('projectsLoading')}</span>
    </div>`;

  try {
    const res = await fetch('/api/projects');
    if (!res.ok) throw new Error('Failed to fetch projects');
    const data = await res.json();
    const projects = data.projects || [];

    if (projects.length === 0) {
      // No projects: fall back to old sketch list
      renderHome();
      return;
    }

    sketchListEl.innerHTML = '';

    for (const project of projects) {
      const card = document.createElement('div');
      card.className = 'sketch-card project-card';
      const safeProjectId = escapeHtml(project.id);
      const safeProjectName = escapeHtml(project.name || project.id);
      const safeProjectDescription = project.description ? escapeHtml(project.description) : '';
      card.innerHTML = `
        <div class="sketch-card-header">
          <div class="sketch-card-icon">
            <span class="material-icons">folder</span>
          </div>
          <div class="sketch-card-info">
            <div class="sketch-card-title">${safeProjectName}</div>
            ${safeProjectDescription ? `<div class="sketch-card-meta">${safeProjectDescription}</div>` : ''}
          </div>
        </div>
        <div class="sketch-card-actions">
          <button class="sketch-action-btn sketch-action-primary" data-action="openProject" data-id="${safeProjectId}">
            <span class="material-icons">open_in_new</span>
            <span>${t('projects.homepage.openProject') || 'Open Project'}</span>
          </button>
        </div>`;
      card.addEventListener('click', () => {
        location.hash = '#/project/' + project.id;
      });
      sketchListEl.appendChild(card);
    }
  } catch (err) {
    console.warn('[App] Failed to load projects, falling back to sketch list:', err.message);
    renderHome();
  }
}

/**
 * Reposition nodes in ALL project sketches using shared global ITM bounds.
 * This ensures every sketch's nodes are placed at their correct geographic
 * positions relative to each other on the canvas.
 */
function repositionAllProjectSketchNodes(sketches) {
  // 1. First pass: extract ITM coords from all nodes across all sketches
  const allCoordinated = []; // [{node, surveyX, surveyY}]
  for (const sketch of sketches) {
    for (const node of (sketch.nodes || [])) {
      const itm = extractNodeItmCoordinates(node, wgs84ToItm);
      if (itm) {
        allCoordinated.push({ node, ...itm });
      }
    }
  }

  if (allCoordinated.length === 0) return;

  // 2. Compute global ITM bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { surveyX, surveyY } of allCoordinated) {
    if (surveyX < minX) minX = surveyX;
    if (surveyX > maxX) maxX = surveyX;
    if (surveyY < minY) minY = surveyY;
    if (surveyY > maxY) maxY = surveyY;
  }
  const globalBounds = { minX, maxX, minY, maxY };

  // Canvas dimensions
  const dpr = window.devicePixelRatio || 1;
  const logicalW = (canvas.width / dpr) || 800;
  const logicalH = (canvas.height / dpr) || 600;

  console.debug(`[ProjectCanvas] Global ITM bounds: X[${minX.toFixed(1)}, ${maxX.toFixed(1)}] Y[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`);
  console.debug(`[ProjectCanvas] Repositioning ${sketches.length} sketches, ${allCoordinated.length} coordinated nodes`);

  // 3. Reposition each sketch's nodes
  let firstReferencePoint = null;
  for (const sketch of sketches) {
    const sketchNodes = sketch.nodes || [];
    const sketchEdges = sketch.edges || [];

    // Save original positions for uncoordinated node placement
    const origPositions = new Map();
    for (const node of sketchNodes) {
      origPositions.set(String(node.id), { x: node.x, y: node.y });
    }

    // Reposition coordinated nodes
    for (const node of sketchNodes) {
      const itm = extractNodeItmCoordinates(node, wgs84ToItm);
      if (itm) {
        const pos = surveyToCanvas(itm.surveyX, itm.surveyY, globalBounds, logicalW, logicalH, { pixelsPerMeter: coordinateScale });
        node.x = pos.x;
        node.y = pos.y;
        node.surveyX = itm.surveyX;
        node.surveyY = itm.surveyY;
        node.hasCoordinates = true;
        node._hidden = false;

        if (!firstReferencePoint) {
          firstReferencePoint = {
            itm: { x: itm.surveyX, y: itm.surveyY },
            canvas: { x: pos.x, y: pos.y }
          };
        }
      } else {
        node._hidden = true;
      }
    }

    // Handle uncoordinated nodes — place relative to coordinated neighbors
    const hiddenNodes = sketchNodes.filter(n => n._hidden);
    if (hiddenNodes.length > 0) {
      const nodeMap = new Map();
      for (const n of sketchNodes) nodeMap.set(String(n.id), n);

      for (const node of hiddenNodes) {
        let placed = false;
        for (const edge of sketchEdges) {
          const tailId = String(edge.tail);
          const headId = String(edge.head);
          const nodeId = String(node.id);
          let neighborId = null;
          if (tailId === nodeId) neighborId = headId;
          else if (headId === nodeId) neighborId = tailId;
          if (!neighborId) continue;

          const neighbor = nodeMap.get(neighborId);
          if (!neighbor || neighbor._hidden) continue;

          const origNode = origPositions.get(String(node.id));
          const origNeighbor = origPositions.get(String(neighbor.id));
          if (origNode && origNeighbor) {
            const dx = origNode.x - origNeighbor.x;
            const dy = origNode.y - origNeighbor.y;
            node.x = neighbor.x + dx;
            node.y = neighbor.y + dy;
          } else {
            node.x = neighbor.x + 20;
            node.y = neighbor.y + 20;
          }
          node._hidden = false;
          placed = true;
          break;
        }
        if (!placed) {
          const coordNodes = sketchNodes.filter(n => !n._hidden && n !== node);
          if (coordNodes.length > 0) {
            const cx = coordNodes.reduce((s, n) => s + n.x, 0) / coordNodes.length;
            const cy = coordNodes.reduce((s, n) => s + n.y, 0) / coordNodes.length;
            node.x = cx + (Math.random() - 0.5) * 40;
            node.y = cy + (Math.random() - 0.5) * 40;
          }
          node._hidden = false;
        }
      }
    }
  }

  // 4. Update active sketch state (geoNodePositions, coordinatesMap, etc.)
  for (const node of nodes) {
    geoNodePositions.set(String(node.id), { x: node.x, y: node.y });
    if (node.hasCoordinates && node.surveyX != null && node.surveyY != null) {
      coordinatesMap.set(String(node.id), { x: node.surveyX, y: node.surveyY, z: node.surveyZ || 0 });
    }
  }
  saveCoordinatesToStorage(coordinatesMap);

  // Enable coordinates mode
  if (!coordinatesEnabled) {
    coordinatesEnabled = true;
    saveCoordinatesEnabled(true);
    syncCoordinatesToggleUI();
  }

  // Set the map reference point from the first coordinated node
  if (firstReferencePoint) {
    setMapReferencePoint(firstReferencePoint);
    setStreetViewVisible(true);
  }

  // Zoom to fit ALL project nodes (not just active sketch)
  requestAnimationFrame(() => {
    const allNodes = [];
    for (const sketch of sketches) {
      for (const n of (sketch.nodes || [])) {
        if (n && !n._hidden && typeof n.x === 'number' && typeof n.y === 'number') {
          allNodes.push(n);
        }
      }
    }
    if (allNodes.length < 2) { zoomToFit(); return; }

    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    for (const n of allNodes) {
      if (n.x < mnX) mnX = n.x;
      if (n.y < mnY) mnY = n.y;
      if (n.x > mxX) mxX = n.x;
      if (n.y > mxY) mxY = n.y;
    }
    const rangeX = (mxX - mnX) || 1;
    const rangeY = (mxY - mnY) || 1;
    const rect = canvas.getBoundingClientRect();
    const padding = 0.85;
    const scaleX = (rect.width * padding) / (rangeX * viewStretchX);
    const scaleY = (rect.height * padding) / (rangeY * viewStretchY);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)));
    const cx = (mnX + mxX) / 2;
    const cy = (mnY + mxY) / 2;
    viewScale = newScale;
    viewTranslate.x = rect.width / 2 - viewScale * viewStretchX * cx;
    viewTranslate.y = rect.height / 2 - viewScale * viewStretchY * cy;
    scheduleDraw();
  });
}

/**
 * Enter project-canvas mode: load all sketches for a project onto the canvas.
 */
async function loadProjectCanvas(projectId) {
  try {
    hideHome(true); // Immediate hide to prevent sync-service race condition
    showToast(t('projects.canvas.loading') || 'Loading project sketches...');

    const sketches = await loadProjectSketches(projectId);

    if (sketches.length === 0) {
      showToast(t('projects.homepage.empty') || 'No sketches in this project', 'warning');
      location.hash = '#/';
      return;
    }

    // Sync the freshly fetched project sketches into the localStorage library
    // so the home view stays in sync with the project data
    syncProjectSketchesToLibrary();

    // Reposition ALL sketch nodes using global ITM bounds so all sketches
    // align correctly on the canvas relative to each other
    repositionAllProjectSketchNodes(sketches);

    showSketchSidePanel();
    scheduleDraw();

    showToast(`${sketches.length} ${t('projects.canvas.sketches') || 'sketches loaded'}`);
  } catch (err) {
    console.error('[App] Failed to load project canvas:', err);
    showToast(err.message || 'Failed to load project', 'error');
  }
}

async function handleChangeProject(sketchId) {
  try {
    const authState = window.authGuard?.getAuthState?.() || {};
    if (!authState.isSignedIn) {
      showToast(t('auth.loginSubtitle'), 'error');
      return;
    }

    // Fetch available projects
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Failed to fetch projects');
    const data = await response.json();
    const projects = data.projects || [];

    if (projects.length === 0) {
      showToast(t('projects.noProjects'), 'warning');
      return;
    }

    // Get current sketch to find current project
    const lib = getLibrary();
    const sketch = lib.find(s => s.id === sketchId);
    const sketchProjectId = sketch?.projectId;

    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'projects-modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'projects-modal';
    
    modal.innerHTML = `
      <div class="projects-modal-header">
        <h3>${t('listChangeProject')}</h3>
        <button class="btn-icon projects-modal-close">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="projects-modal-body">
        <div class="form-group">
          <label for="projectSelect">${t('labels.selectProject')}</label>
          <select id="projectSelect" class="form-input">
            <option value="">-- ${t('labels.selectProject')} --</option>
            ${projects.map(p => `
              <option value="${escapeHtml(p.id)}" ${p.id === sketchProjectId ? 'selected' : ''}>
                ${escapeHtml(p.name)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group checkbox-group" style="margin-top: 15px; display: flex; align-items: center;">
          <input type="checkbox" id="updateConfigCheck" checked>
          <label for="updateConfigCheck" style="margin-left: 8px; margin-right: 8px;">
            ${t('projects.updateInputFlow')}
          </label>
        </div>
      </div>
      <div class="projects-modal-footer">
        <button class="btn btn-secondary projects-modal-cancel">${t('buttons.cancel')}</button>
        <button class="btn btn-primary projects-modal-save">${t('buttons.save')}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    modal.querySelector('.projects-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.projects-modal-cancel').addEventListener('click', closeModal);

    modal.querySelector('.projects-modal-save').addEventListener('click', async () => {
      const select = modal.querySelector('#projectSelect');
      const projectId = select.value;
      const updateConfig = modal.querySelector('#updateConfigCheck').checked;

      // Allow selecting empty value to unassign project
      // if (!projectId) ... (Optional: decide if project is required. Current logic suggests we can assign to a project or not, but usually we want to assign)
      // If user selects "Select Project" (empty), maybe we should warn or allow unassigning?
      // The option value is "" for default.
      // Let's assume user wants to assign a project.

      if (!projectId) {
         // If they want to unassign, they can pick empty? Or maybe we enforce selection.
         // Let's enforce selection for now based on "Change Project".
         showToast(t('alerts.selectProject'), 'error');
         return;
      }

      try {
        const res = await fetch(`/api/sketches/${sketchId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            projectId,
            updateInputFlowSnapshot: updateConfig
          })
        });

        if (!res.ok) throw new Error('Failed to update sketch project');

        const updatedData = await res.json();
        const updatedSketch = updatedData.sketch;

        // Update local library
        const lib = getLibrary();
        const idx = lib.findIndex(s => s.id === sketchId);
        if (idx !== -1) {
          lib[idx] = { ...lib[idx], ...updatedSketch };
          setLibrary(lib);
          // Persist and Sync
          idbSaveRecordCompat(lib[idx]);
          
          // If this is the active sketch, update the runtime state immediately
          if (currentSketchId === sketchId) {
            currentProjectId = updatedSketch.projectId || null;
            currentInputFlowConfig = updatedSketch.inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
            loadProjectReferenceLayers(currentProjectId);
            saveToStorage();
          }
        }

        renderHome();
        showToast(t('toasts.saved'));
        closeModal();
      } catch (err) {
        console.error('[Projects] Failed to save project assignment:', err.message);
        showToast(err.message, 'error');
      }
    });

  } catch (err) {
    console.error('[Projects] Error loading projects:', err.message);
    showToast('Error loading projects', 'error');
  }
}

/**
 * Initialize a brand new sketch and reset all transient state.
 * @param {string} date - ISO date string used for exported filenames
 * @param {string} projectId - Optional project ID to associate with this sketch
 * @param {Object} inputFlowConfig - Optional input flow configuration (copied from project)
 */
function newSketch(date, projectId = null, inputFlowConfig = null) {
  nodes = [];
  edges = [];
  markEdgeLabelCacheDirty(); // sketch cleared
  nextNodeId = 1;
  selectedNode = null;
  selectedEdge = null;
  isDragging = false;
  pendingEdgeTail = null;
  pendingEdgeStartPosition = null;
  creationDate = date;
  currentSketchId = null; // new unsaved sketch
  currentSketchName = null;
  currentProjectId = projectId;
  currentInputFlowConfig = inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
  updateSketchNameDisplay();
  saveToStorage();
  draw();
  renderDetails();
}

/**
 * Create a node at the provided canvas coordinates.
 * Chooses the next available numeric id and stores it as a string.
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {{id:string,x:number,y:number,note:string,material:string,type:string}} The created node
 */
function createNode(x, y) {
  // Determine ID for a new Manhole by finding the smallest available numeric id
  const candidateStr = findSmallestAvailableNumericId();
  // Prepare nextNodeId to the next available after this
  const used = collectUsedNumericIds();
  used.add(parseInt(candidateStr, 10));
  let nextCandidate = 1;
  while (used.has(nextCandidate)) nextCandidate += 1;
  nextNodeId = nextCandidate;
  const node = {
    id: candidateStr,
    x: x,
    y: y,
    note: '',
    material: (adminConfig.nodes?.defaults?.material ?? NODE_MATERIALS[0]),
    coverDiameter: (adminConfig.nodes?.defaults?.cover_diameter ?? ''),
    type: 'type1',
    nodeType: 'Manhole',
    access: (adminConfig.nodes?.defaults?.access ?? 0),
    accuracyLevel: (adminConfig.nodes?.defaults?.accuracy_level ?? 0),
    nodeEngineeringStatus: (adminConfig.nodes?.defaults?.engineering_status ?? 0),
    maintenanceStatus: (adminConfig.nodes?.defaults?.maintenance_status ?? 0),
    createdAt: new Date().toISOString(),
    createdBy: getCurrentUsername(),
    gnssFixQuality: 6, // Manual Float — user placed on canvas
  };
  // Compute ITM coordinates from canvas position if reference point exists
  const ref = getMapReferencePoint();
  if (ref && ref.itm && ref.canvas && coordinateScale > 0) {
    node.surveyX = ref.itm.x + (x - ref.canvas.x) / coordinateScale;
    node.surveyY = ref.itm.y - (y - ref.canvas.y) / coordinateScale;
    node.surveyZ = 0;
    node.measure_precision = null;
    node.hasCoordinates = true;
  }
  // Apply custom default fields
  if (Array.isArray(adminConfig.nodes?.customFields)) {
    adminConfig.nodes.customFields.forEach((f) => {
      if (!f || !f.key) return;
      node[f.key] = f.default ?? '';
    });
  }
  nodes.push(node);
  
  // Check for nearby dangling edges and auto-connect
  const nearbyDangling = findDanglingEdgeNear(x, y);
  if (nearbyDangling) {
    connectDanglingEdge(nearbyDangling.edge, node.id, nearbyDangling.type);
    showToast(t('toasts.danglingEdgeConnected'));
  }
  
  computeNodeTypes();
  saveToStorage();
  return node;
}

/**
 * Create a directed edge between two nodes.
 * Prevents duplicates regardless of direction (A→B or B→A).
 * Supports dangling edges where either tailId or headId is null.
 * @param {string|number|null} tailId - Source node id (null for inbound dangling edge)
 * @param {string|number|null} headId - Target node id (null for outbound dangling edge)
 * @param {object} options - Optional: { danglingEndpoint: {x, y}, tailPosition: {x, y} }
 * @returns {object|null} The created edge, or null if duplicate exists
 */
function createEdge(tailId, headId, options = {}) {
  const tailStr = tailId != null ? String(tailId) : null;
  const headStr = headId != null ? String(headId) : null;
  const isDanglingHead = headStr === null; // outbound: missing head
  const isDanglingTail = tailStr === null; // inbound: missing tail
  const isDangling = isDanglingHead || isDanglingTail;
  
  // Block duplicate edges in either direction (only for non-dangling edges)
  if (!isDangling) {
    const exists = edges.some((e) =>
      (String(e.tail) === tailStr && String(e.head) === headStr) ||
      (String(e.tail) === headStr && String(e.head) === tailStr)
    );
    if (exists) {
      return null;
    }
  }
  
  const edge = {
    id: Date.now() + Math.random(), // unique id for internal use
    tail: tailStr,
    head: headStr,
    isDangling: isDangling,
    danglingEndpoint: isDanglingHead ? (options.danglingEndpoint || null) : null, // for outbound
    tailPosition: isDanglingTail ? (options.tailPosition || null) : null, // for inbound
    tail_measurement: (adminConfig.edges?.defaults?.tail_measurement ?? ''),
    head_measurement: (adminConfig.edges?.defaults?.head_measurement ?? ''),
    fall_depth: (adminConfig.edges?.defaults?.fall_depth ?? ''),
    fall_position: (adminConfig.edges?.defaults?.fall_position ?? ''),
    line_diameter: (adminConfig.edges?.defaults?.line_diameter ?? ''),
    edge_type: (adminConfig.edges?.defaults?.edge_type ?? EDGE_TYPES[0]),
    material: (adminConfig.edges?.defaults?.material ?? EDGE_MATERIALS[0]),
    maintenanceStatus: 0,
    engineeringStatus: (adminConfig.edges?.defaults?.engineering_status ?? 0),
    createdAt: new Date().toISOString(),
    createdBy: getCurrentUsername(),
  };
  if (Array.isArray(adminConfig.edges?.customFields)) {
    adminConfig.edges.customFields.forEach((f) => {
      if (!f || !f.key) return;
      edge[f.key] = f.default ?? '';
    });
  }
  edges.push(edge);
  computeNodeTypes();
  saveToStorage();
  return edge;
}

/**
 * Create a dangling edge from a node with the open end at the specified position.
 * @param {string|number} tailId - Source node id
 * @param {number} endX - X coordinate for the dangling endpoint
 * @param {number} endY - Y coordinate for the dangling endpoint
 * @returns {object} The created dangling edge
 */
/**
 * Create an outbound dangling edge (from node to open end).
 */
function createDanglingEdge(tailId, endX, endY) {
  return createEdge(tailId, null, { danglingEndpoint: { x: endX, y: endY } });
}

/**
 * Create an inbound dangling edge (from open end to node).
 */
function createInboundDanglingEdge(startX, startY, headId) {
  return createEdge(null, headId, { tailPosition: { x: startX, y: startY } });
}

/**
 * Find all incomplete/dangling edges (edges with only one connected node).
 * Includes both outbound (head === null) and inbound (tail === null) dangling edges.
 * @returns {Array<object>} Array of dangling edges
 */
function findIncompleteEdges() {
  return edges.filter(edge => edge.isDangling || edge.head === null || edge.tail === null);
}

/**
 * Update the incomplete edge tracker UI with the current count.
 */
function updateIncompleteEdgeTracker() {
  const tracker = document.getElementById('incompleteEdgeTracker');
  const countEl = document.getElementById('incompleteEdgeCount');
  if (!tracker || !countEl) return;
  
  const incompleteCount = findIncompleteEdges().length;
  countEl.textContent = String(incompleteCount);
  
  // Show/hide tracker based on count
  if (incompleteCount > 0) {
    tracker.style.display = 'inline-flex';
  } else {
    tracker.style.display = 'none';
  }
}

/**
 * Find a dangling edge whose open endpoint is within snap distance of the given position.
 * Checks both outbound (danglingEndpoint) and inbound (tailPosition) dangling edges.
 * @param {number} x - X coordinate to check
 * @param {number} y - Y coordinate to check
 * @param {number} snapDistance - Maximum distance to consider for snapping (default 30)
 * @returns {{edge: object, distance: number, type: 'outbound'|'inbound'}|null} The closest dangling edge within range, or null
 */
function findDanglingEdgeNear(x, y, snapDistance = 30) {
  const incompleteEdges = findIncompleteEdges();
  let closest = null;
  let minDist = snapDistance;
  
  for (const edge of incompleteEdges) {
    // Check outbound dangling edges (head is null, danglingEndpoint has position)
    if (edge.danglingEndpoint) {
      const dx = edge.danglingEndpoint.x - x;
      const dy = edge.danglingEndpoint.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = { edge, distance: dist, type: 'outbound' };
      }
    }
    // Check inbound dangling edges (tail is null, tailPosition has position)
    if (edge.tailPosition) {
      const dx = edge.tailPosition.x - x;
      const dy = edge.tailPosition.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = { edge, distance: dist, type: 'inbound' };
      }
    }
  }
  
  return closest;
}

/**
 * Connect a dangling edge to a newly created node.
 * @param {object} edge - The dangling edge to connect
 * @param {string} nodeId - The node ID to connect to
 * @param {'outbound'|'inbound'} type - Type of dangling edge
 */
function connectDanglingEdge(edge, nodeId, type = 'outbound') {
  if (type === 'outbound') {
    // Outbound: connect the open head end to the new node
    edge.head = String(nodeId);
    edge.danglingEndpoint = null;
  } else {
    // Inbound: connect the open tail end to the new node
    edge.tail = String(nodeId);
    edge.tailPosition = null;
  }
  edge.isDangling = false;
  saveToStorage();
}

// Drawing functions
/**
 * Redraw the entire scene (edges first, then nodes).
 */
function draw() {
  // Rebuild fast node lookup map once per frame
  nodeMap.clear();
  for (let i = 0; i < nodes.length; i++) {
    nodeMap.set(String(nodes[i].id), nodes[i]);
  }

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // Read devicePixelRatio once per frame (avoids 3 separate property reads per frame)
  const dpr = window.devicePixelRatio || 1;
  
  // Draw map tiles as background layer (before grid and other elements)
  // Map layer stretches with coordinates (like the grid) to align with positions
  if (mapLayerEnabled && getMapReferencePoint()) {
    ctx.save();
    ctx.translate(viewTranslate.x, viewTranslate.y);
    // Apply stretch to map layer so it aligns with stretched coordinates
    ctx.scale(viewScale * viewStretchX, viewScale * viewStretchY);
    // Use logical (CSS) dimensions for tile calculations since viewTranslate is in CSS pixels
    // canvas.width/height are in device pixels (CSS * devicePixelRatio)
    // dpr already read at draw() top
    drawMapTiles(
      ctx, 
      canvas.width / dpr,  // Logical width
      canvas.height / dpr, // Logical height
      viewTranslate, 
      viewScale, 
      coordinateScale, 
      () => scheduleDraw(), // Callback to redraw when tiles load
      viewStretchX,
      viewStretchY
    );
    ctx.restore();
  }
  
  // Since we scaled for device pixel ratio, treat coordinates unscaled.
  // Apply view transform for zooming and translation
  // Draw infinite grid first in screen space but offset by transform
  drawInfiniteGrid();
  ctx.translate(viewTranslate.x, viewTranslate.y);
  ctx.scale(viewScale, viewScale);
  
  // Draw GIS reference layers (sections, survey data, streets, addresses)
  // Drawn after grid but before edges/nodes so user data appears on top
  {
    // dpr already read at draw() top
    drawReferenceLayers(
      ctx,
      coordinateScale,
      viewScale,
      viewStretchX,
      viewStretchY,
      viewTranslate,
      canvas.width / dpr,
      canvas.height / dpr
    );
  }
  
  // Compute visible world-coordinate bounds for culling (with generous margin)
  // dpr already read at draw() top; reused for logical canvas dimensions
  const canvasLogicalW = canvas.width / dpr;
  const canvasLogicalH = canvas.height / dpr;
  const cullMargin = 100 / viewScale; // extra margin in world coords
  const visMinX = -viewTranslate.x / viewScale - cullMargin;
  const visMinY = -viewTranslate.y / viewScale - cullMargin;
  const visMaxX = (canvasLogicalW - viewTranslate.x) / viewScale + cullMargin;
  const visMaxY = (canvasLogicalH - viewTranslate.y) / viewScale + cullMargin;

  // Draw background sketches in project-canvas mode (before active sketch)
  if (window.__projectCanvas?.isProjectCanvasMode()) {
    drawBackgroundSketches(ctx, window.__projectCanvas.getBackgroundSketches(), {
      sizeScale,
      viewStretchX,
      viewStretchY,
      visMinX, visMinY, visMaxX, visMaxY,
    });
  }

  // Draw edges first (positions will be stretched, shapes won't)
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    // Quick cull for normal (non-dangling) edges
    const tn = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const hn = edge.head != null ? nodeMap.get(String(edge.head)) : null;
    // Skip edges where either endpoint is hidden
    if ((tn && tn._hidden) || (hn && hn._hidden)) continue;
    if (tn && hn) {
      const sx1 = tn.x * viewStretchX, sy1 = tn.y * viewStretchY;
      const sx2 = hn.x * viewStretchX, sy2 = hn.y * viewStretchY;
      const eMinX = Math.min(sx1, sx2), eMaxX = Math.max(sx1, sx2);
      const eMinY = Math.min(sy1, sy2), eMaxY = Math.max(sy1, sy2);
      if (eMaxX < visMinX || eMinX > visMaxX || eMaxY < visMinY || eMinY > visMaxY) continue;
    }
    drawEdge(edge);
  }
  // Draw a rubber-band preview when creating an edge
  if (currentMode === 'edge' && pendingEdgePreview) {
    let x1, y1, x2, y2;
    
    if (pendingEdgeTail) {
      // Normal preview: from node to cursor (apply stretch to positions)
      x1 = pendingEdgeTail.x * viewStretchX;
      y1 = pendingEdgeTail.y * viewStretchY;
      x2 = pendingEdgePreview.x * viewStretchX;
      y2 = pendingEdgePreview.y * viewStretchY;
    } else if (pendingEdgeStartPosition) {
      // Inbound preview: from start position to cursor (apply stretch to positions)
      x1 = pendingEdgeStartPosition.x * viewStretchX;
      y1 = pendingEdgeStartPosition.y * viewStretchY;
      x2 = pendingEdgePreview.x * viewStretchX;
      y2 = pendingEdgePreview.y * viewStretchY;
    } else {
      x1 = x2 = y1 = y2 = 0; // Should not happen
    }
    
    ctx.save();
    ctx.strokeStyle = COLORS.edge.preview;
    ctx.fillStyle = COLORS.edge.preview;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // Arrow head
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLength = 10;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - arrowLength * Math.cos(angle - Math.PI / 6),
      y2 - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - arrowLength * Math.cos(angle + Math.PI / 6),
      y2 - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    
    // Draw a small circle at the start position when creating inbound edge
    if (pendingEdgeStartPosition) {
      const circleRadius = 5 * sizeScale;
      ctx.beginPath();
      ctx.arc(x1, y1, circleRadius, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.edge.preview;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
  // Draw nodes on top and collect label data
  const labelData = [];
  const nodeData = [];
  const nodeRadius = NODE_RADIUS * sizeScale;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    // Skip hidden nodes (no coordinates — not yet measured)
    if (node._hidden) continue;
    // Viewport cull: skip nodes entirely outside the visible area
    const sx = node.x * viewStretchX;
    const sy = node.y * viewStretchY;
    if (sx + nodeRadius < visMinX || sx - nodeRadius > visMaxX ||
        sy + nodeRadius < visMinY || sy - nodeRadius > visMaxY) {
      continue;
    }
    const label = drawNode(node);
    if (label) {
      labelData.push(label);
    }
    // Collect node data for collision detection (use stretched positions)
    nodeData.push({ x: sx, y: sy, radius: nodeRadius });
  }

  // Collect edge label data for collision detection — cached, rebuilt only when edges change.
  // The cache (_edgeLabelDataCache) is invalidated by markEdgeLabelCacheDirty(), which is
  // called from saveToStorage() and whenever the edges array is replaced (load/new sketch).
  // Also rebuilt when viewStretchX/Y or sizeScale change since positions depend on them.
  if (
    _edgeLabelDataCache === null ||
    _edgeLabelCacheStretchX !== viewStretchX ||
    _edgeLabelCacheStretchY !== viewStretchY ||
    _edgeLabelCacheSizeScale !== sizeScale
  ) {
    _edgeLabelDataCache = [];
    _edgeLabelCacheStretchX = viewStretchX;
    _edgeLabelCacheStretchY = viewStretchY;
    _edgeLabelCacheSizeScale = sizeScale;
    edges.forEach((edge) => {
      const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : undefined;
      const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : undefined;
      if (!tailNode || !headNode) return;

      // Apply stretch to positions for label placement
      const x1 = tailNode.x * viewStretchX, y1 = tailNode.y * viewStretchY;
      const x2 = headNode.x * viewStretchX, y2 = headNode.y * viewStretchY;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length <= 0) return;

      const normX = dx / length;
      const normY = dy / length;
      const offset = 6 * sizeScale;
      const fontSize = Math.round(14 * sizeScale);

      if (edge.tail_measurement) {
        const ratio = 0.25;
        const px = x1 + dx * ratio;
        const py = y1 + dy * ratio;
        const perpX = -normY * offset;
        const perpY = normX * offset;
        _edgeLabelDataCache.push({
          text: String(edge.tail_measurement),
          x: px + perpX,
          y: py + perpY,
          fontSize: fontSize
        });
      }

      if (edge.head_measurement) {
        const ratio = 0.75;
        const px = x1 + dx * ratio;
        const py = y1 + dy * ratio;
        const perpX = -normY * offset;
        const perpY = normX * offset;
        _edgeLabelDataCache.push({
          text: String(edge.head_measurement),
          x: px + perpX,
          y: py + perpY,
          fontSize: fontSize
        });
      }
    });
  }
  const edgeLabelData = _edgeLabelDataCache;

  // Process labels – use smart collision avoidance for small-to-medium graphs,
  // but fall back to simple positioning when there are many visible labels to
  // keep frame times low.
  const LABEL_COLLISION_THRESHOLD = 120;
  let positionedLabels;
  if (labelData.length <= LABEL_COLLISION_THRESHOLD) {
    positionedLabels = processLabels(ctx, labelData, nodeData, edgeLabelData);
  } else {
    // Fast path: place labels above center without collision detection
    positionedLabels = labelData.map(l => ({
      text: l.text,
      x: l.nodeX,
      y: l.nodeY - l.nodeRadius * 1.1,
      align: 'center',
      baseline: 'bottom',
      fontSize: l.fontSize
    }));
  }

  // Draw the optimally positioned labels
  ctx.fillStyle = COLORS.node.label;
  for (let i = 0; i < positionedLabels.length; i++) {
    const label = positionedLabels[i];
    ctx.save();
    ctx.font = `${label.fontSize}px Arial`;
    ctx.textAlign = label.align;
    ctx.textBaseline = label.baseline;
    ctx.fillText(label.text, label.x, label.y);
    ctx.restore();
  }

  // Draw edge measurement labels after node labels to ensure they're on top
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    // Quick viewport cull for edge labels (same as edge drawing)
    const tn = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const hn = edge.head != null ? nodeMap.get(String(edge.head)) : null;
    if (tn && hn) {
      const sx1 = tn.x * viewStretchX, sy1 = tn.y * viewStretchY;
      const sx2 = hn.x * viewStretchX, sy2 = hn.y * viewStretchY;
      if (Math.max(sx1, sx2) < visMinX || Math.min(sx1, sx2) > visMaxX ||
          Math.max(sy1, sy2) < visMinY || Math.min(sy1, sy2) > visMaxY) continue;
    }
    drawEdgeLabels(edge);
  }
  
  // Draw unified location marker if Live Measure is enabled
  if (liveMeasureEnabled && gnssState) {
    const position = gnssState.getPosition();
    const referencePoint = getMapReferencePoint();

    if (position && position.isValid && referencePoint) {
      drawGnssMarker(
        ctx,
        position,
        referencePoint,
        coordinateScale,
        viewTranslate,
        viewScale,
        { isStale: position.isStale, stretchX: viewStretchX, stretchY: viewStretchY }
      );
    }
  }

  // Draw issue highlight animation (pulsing ring at issue location)
  drawIssueHighlight(ctx, viewScale, viewStretchX, viewStretchY, viewTranslate);

  ctx.restore();
  
  // Draw map attribution in screen space (after restore)
  if (mapLayerEnabled && getMapReferencePoint()) {
    drawMapAttribution(ctx, canvas.width, canvas.height);
  }
  
  // Ensure edge legend is rendered/positioned (throttled to avoid layout thrash)
  scheduleEdgeLegendUpdate();
  // Update incomplete edge tracker (throttled)
  scheduleIncompleteEdgeUpdate();
}

// Throttled DOM updates – avoid running inside every draw frame
let _edgeLegendDirty = false;
function scheduleEdgeLegendUpdate() {
  if (_edgeLegendDirty) return;
  _edgeLegendDirty = true;
  queueMicrotask(() => {
    _edgeLegendDirty = false;
    renderEdgeLegend();
  });
}

let _incompleteEdgeDirty = false;
function scheduleIncompleteEdgeUpdate() {
  if (_incompleteEdgeDirty) return;
  _incompleteEdgeDirty = true;
  queueMicrotask(() => {
    _incompleteEdgeDirty = false;
    updateIncompleteEdgeTracker();
  });
}

function renderEdgeLegend() {
  const legend = document.getElementById('edgeLegend');
  renderEdgeLegendFeature(legend, EDGE_TYPE_COLORS);
}

/**
 * Draw a grid that appears infinite by offsetting with viewTranslate/viewScale.
 * The grid is rendered in screen space but aligned to world units so it scrolls with pan and zoom.
 */
function drawInfiniteGrid() {
  drawInfiniteGridFeature(ctx, viewTranslate, viewScale, canvas, viewStretchX, viewStretchY);
}

/**
 * If any node is near the current visible edges, expand the virtual space by translating.
 * This creates the effect of an infinite canvas with extra space similar to draw.io.
 */
function ensureVirtualPadding() {
  if (nodes.length === 0) return;
  // Hysteresis thresholds: OUTER triggers the nudge; INNER is the target margin
  const OUTER = 80;
  const INNER = 140;
  // Compute screen-space bounding box of nodes
  let minScreenX = Infinity;
  let minScreenY = Infinity;
  let maxScreenX = -Infinity;
  let maxScreenY = -Infinity;
  for (const n of nodes) {
    // Apply stretch to positions for screen coordinate calculation
    const stretchedX = n.x * viewStretchX;
    const stretchedY = n.y * viewStretchY;
    const sx = stretchedX * viewScale + viewTranslate.x;
    const sy = stretchedY * viewScale + viewTranslate.y;
    if (sx < minScreenX) minScreenX = sx;
    if (sy < minScreenY) minScreenY = sy;
    if (sx > maxScreenX) maxScreenX = sx;
    if (sy > maxScreenY) maxScreenY = sy;
  }
  const rect = getCachedCanvasRect(); // cached — avoids layout flush
  let dx = 0;
  let dy = 0;
  // If content is too close to the left/top, push it to INNER margin
  if (minScreenX < OUTER) dx += INNER - minScreenX;
  if (minScreenY < OUTER) dy += INNER - minScreenY;
  // If content is too close to the right/bottom, push it to INNER margin
  if (maxScreenX > rect.width - OUTER) dx -= maxScreenX - (rect.width - INNER);
  if (maxScreenY > rect.height - OUTER) dy -= maxScreenY - (rect.height - INNER);
  if (dx !== 0 || dy !== 0) {
    viewTranslate.x += dx;
    viewTranslate.y += dy;
  }
}

/**
 * When dragging near the viewport edges, pan the view slightly to reveal more space,
 * creating an infinite-canvas feel during drag operations.
 */
function autoPanWhenDragging(screenX, screenY) {
  const rect = getCachedCanvasRect(); // cached — avoids layout flush during drag frames
  const EDGE = 80; // pixels from edge to start auto-pan
  const SPEED = 6; // slower speed to reduce oscillation
  let dx = 0;
  let dy = 0;
  if (screenX < EDGE) dx += SPEED;
  if (screenX > rect.width - EDGE) dx -= SPEED;
  if (screenY < EDGE) dy += SPEED;
  if (screenY > rect.height - EDGE) dy -= SPEED;
  if (dx !== 0 || dy !== 0) {
    // Apply easing to reduce flicker
    viewTranslate.x += dx * 0.7;
    viewTranslate.y += dy * 0.7;
    scheduleDraw();
  }
}

/**
 * Compute node types based on whether their connected edges lack measurements.
 * Nodes connected to an edge with a missing/empty measurement become type2; otherwise type1.
 */
function computeNodeTypes() {
  // Build a Map for O(1) node lookups instead of O(n) find() calls
  const nodeMap = new Map();
  for (const node of nodes) {
    node.type = 'type1'; // default all nodes to type1
    nodeMap.set(String(node.id), node);
  }
  
  for (const edge of edges) {
    // Ignore self-loops when computing node types to avoid false orange coloring
    if (String(edge.tail) === String(edge.head)) continue;
    
    const tailNode = nodeMap.get(String(edge.tail));
    const headNode = nodeMap.get(String(edge.head));
    
    // If tail measurement missing or empty, mark tail node as type2
    if (tailNode && (!edge.tail_measurement || edge.tail_measurement.trim() === '')) {
      tailNode.type = 'type2';
    }
    // If head measurement missing or empty, mark head node as type2
    if (headNode && (!edge.head_measurement || edge.head_measurement.trim() === '')) {
      headNode.type = 'type2';
    }
  }
}

function drawEdge(edge) {
  const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) || null : null;
  const headNode = edge.head != null ? nodeMap.get(String(edge.head)) || null : null;
  
  // Apply stretch to node positions for drawing
  const stretchedTail = stretchedNode(tailNode);
  const stretchedHead = stretchedNode(headNode);
  
  // Handle inbound dangling edges (tail is null, head is a node)
  if (edge.tail === null && headNode && edge.tailPosition) {
    drawDanglingEdgeLocal(edge, headNode, 'inbound');
    return;
  }
  
  // Handle outbound dangling edges (head is null, tail is a node)
  if (edge.head === null && tailNode && (edge.isDangling || edge.danglingEndpoint)) {
    drawDanglingEdgeLocal(edge, tailNode, 'outbound');
    return;
  }
  
  const angle = stretchedTail && stretchedHead ? Math.atan2(stretchedHead.y - stretchedTail.y, stretchedHead.x - stretchedTail.x) : 0;
  drawEdgeFeature(ctx, edge, stretchedTail, stretchedHead, {
    selectedEdge,
    edgeTypeColors: EDGE_TYPE_COLORS,
    highlightedHalfEdge,
    colors: COLORS,
  });
  if (!stretchedTail || !stretchedHead) return;
  if (edge.fall_depth !== '' && edge.fall_depth !== null && edge.fall_depth !== undefined) {
    const iconDistanceFromHead = ((typeof NODE_RADIUS === 'number' ? NODE_RADIUS : 20) * sizeScale) + (7 * sizeScale);
    const iconX = stretchedHead.x - Math.cos(angle) * iconDistanceFromHead;
    const iconY = stretchedHead.y - Math.sin(angle) * iconDistanceFromHead;
    const size = 16 * sizeScale;
    if (fallIconImage && fallIconReady) {
      ctx.save();
      const bgRadius = size * 0.45;
      ctx.beginPath();
      ctx.arc(iconX, iconY, bgRadius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.edge.fallIconBg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.edge.fallIconStroke;
      ctx.stroke();
      const innerSize = size - (6 * sizeScale);
      ctx.drawImage(fallIconImage, iconX - innerSize / 2, iconY - innerSize / 2, innerSize, innerSize);
      ctx.restore();
    } else {
      const iconRadius = 6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.edge.fallIconFallback;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.edge.fallIconStroke;
      ctx.stroke();
      ctx.fillStyle = COLORS.edge.fallIconText;
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F', iconX, iconY);
      ctx.restore();
    }
  }
  // mid-arrow remains inline; labels are drawn in a later pass above nodes
  const x1 = stretchedTail.x, y1 = stretchedTail.y, x2 = stretchedHead.x, y2 = stretchedHead.y;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const midArrowLen = 8;
  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.lineTo(
    midX - midArrowLen * Math.cos(angle - Math.PI / 6),
    midY - midArrowLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    midX - midArrowLen * Math.cos(angle + Math.PI / 6),
    midY - midArrowLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = (COLORS.edge.label || '#000');
  ctx.fill();
}

/**
 * Draw a dangling edge with dashed/fading end.
 * @param {object} edge - The dangling edge object
 * @param {object} connectedNode - The connected node (tailNode for outbound, headNode for inbound)
 * @param {'outbound'|'inbound'} type - Type of dangling edge
 */
function drawDanglingEdgeLocal(edge, connectedNode, type = 'outbound') {
  if (!connectedNode) return;
  
  const isSelected = edge === selectedEdge;
  const defaultOffset = 80 * sizeScale;
  
  // Apply stretch to positions
  const stretchedConnected = stretchedNode(connectedNode);
  
  let startX, startY, endX, endY, openEndX, openEndY;
  
  if (type === 'outbound') {
    // Outbound: draw from node to dangling endpoint
    startX = stretchedConnected.x;
    startY = stretchedConnected.y;
    // Apply stretch to dangling endpoint
    const rawEndX = edge.danglingEndpoint?.x ?? (connectedNode.x + defaultOffset);
    const rawEndY = edge.danglingEndpoint?.y ?? (connectedNode.y - defaultOffset * 0.5);
    endX = rawEndX * viewStretchX;
    endY = rawEndY * viewStretchY;
    openEndX = endX;
    openEndY = endY;
  } else {
    // Inbound: draw from tailPosition to node
    const rawStartX = edge.tailPosition?.x ?? (connectedNode.x - defaultOffset);
    const rawStartY = edge.tailPosition?.y ?? (connectedNode.y - defaultOffset * 0.5);
    startX = rawStartX * viewStretchX;
    startY = rawStartY * viewStretchY;
    endX = stretchedConnected.x;
    endY = stretchedConnected.y;
    openEndX = startX;
    openEndY = startY;
  }
  
  ctx.save();
  
  // Use grey color for dangling edges
  const solidColor = isSelected ? '#6b7280' : '#9ca3af'; // grey-500 / grey-400
  
  // Calculate the total length and determine where to start/end dashing
  const dx = endX - startX;
  const dy = endY - startY;
  const totalLength = Math.sqrt(dx * dx + dy * dy);
  const dashLength = 30 * sizeScale; // 30px of dashed line at the open end
  
  if (type === 'outbound') {
    // Outbound: solid from node, dashed at the end
    const dashStartLength = Math.max(0, totalLength - dashLength);
    const ratio = totalLength > 0 ? dashStartLength / totalLength : 0;
    const dashStartX = startX + dx * ratio;
    const dashStartY = startY + dy * ratio;
    
    // Draw solid portion
    ctx.strokeStyle = solidColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(dashStartX, dashStartY);
    ctx.stroke();
    
    // Draw dashed portion
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isSelected ? '#9ca3af' : '#d1d5db';
    ctx.beginPath();
    ctx.moveTo(dashStartX, dashStartY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  } else {
    // Inbound: dashed at the start, solid to node
    const dashEndLength = Math.min(dashLength, totalLength);
    const ratio = totalLength > 0 ? dashEndLength / totalLength : 0;
    const dashEndX = startX + dx * ratio;
    const dashEndY = startY + dy * ratio;
    
    // Draw dashed portion (at start)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isSelected ? '#9ca3af' : '#d1d5db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(dashEndX, dashEndY);
    ctx.stroke();
    
    // Draw solid portion (to node)
    ctx.setLineDash([]);
    ctx.strokeStyle = solidColor;
    ctx.beginPath();
    ctx.moveTo(dashEndX, dashEndY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  
  ctx.setLineDash([]);
  
  // Draw the mid-arrow (black triangle at the middle) like regular edges
  const angle = Math.atan2(dy, dx);
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const midArrowLen = 8;
  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.lineTo(
    midX - midArrowLen * Math.cos(angle - Math.PI / 6),
    midY - midArrowLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    midX - midArrowLen * Math.cos(angle + Math.PI / 6),
    midY - midArrowLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = (COLORS.edge.label || '#000');
  ctx.fill();
  
  // Draw a small open circle at the dangling end (unfilled, subtle indicator)
  const circleRadius = 5 * sizeScale;
  ctx.beginPath();
  ctx.arc(openEndX, openEndY, circleRadius, 0, Math.PI * 2);
  ctx.strokeStyle = solidColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  
  ctx.restore();
}

function drawEdgeLabels(edge) {
  const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : undefined;
  const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : undefined;
  if (!tailNode || !headNode) return;
  if (tailNode._hidden || headNode._hidden) return;
  // Apply stretch to positions for label placement
  const x1 = tailNode.x * viewStretchX, y1 = tailNode.y * viewStretchY;
  const x2 = headNode.x * viewStretchX, y2 = headNode.y * viewStretchY;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthPx = Math.sqrt(dx * dx + dy * dy);
  if (lengthPx <= 0) return;
  const normX = dx / lengthPx;
  const normY = dy / lengthPx;
  const offset = 6 * sizeScale;
  ctx.save();
  const fontSize = Math.round(14 * sizeScale);
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.edge.labelStroke;
  ctx.fillStyle = COLORS.edge.label;
  
  // Draw length in meters if coordinates are enabled
  if (coordinatesEnabled && coordinatesMap.size > 0) {
    // Calculate actual length in meters from survey coordinates or pixel distance
    let lengthMeters = null;
    
    if (tailNode.surveyX !== undefined && headNode.surveyX !== undefined) {
      // Both nodes have survey coordinates - calculate real distance
      const surveyDx = headNode.surveyX - tailNode.surveyX;
      const surveyDy = headNode.surveyY - tailNode.surveyY;
      lengthMeters = Math.sqrt(surveyDx * surveyDx + surveyDy * surveyDy);
    } else if (coordinateScale > 0) {
      // Convert pixel distance to meters using current scale
      lengthMeters = lengthPx / coordinateScale;
    }
    
    if (lengthMeters !== null && lengthMeters > 0.01) {
      // Format length: show 2 decimal places for small values, 1 for larger
      const lengthText = lengthMeters < 10 
        ? `${lengthMeters.toFixed(2)}m` 
        : `${lengthMeters.toFixed(1)}m`;
      
      // Position at 0.5 (middle) but offset perpendicular to avoid the arrow
      // The arrow is at the head end, so we offset in the perpendicular direction
      const ratio = 0.5;
      const px = x1 + dx * ratio;
      const py = y1 + dy * ratio;
      
      // Offset perpendicular to the edge (opposite side from measurements)
      // Use negative perpendicular to go to the other side
      const lengthOffset = 16 * sizeScale;
      const perpX = normY * lengthOffset;  // Note: positive normY for opposite side
      const perpY = -normX * lengthOffset;
      
      // Draw with slightly smaller font and different style for length
      const lengthFontSize = Math.round(12 * sizeScale);
      ctx.font = `${lengthFontSize}px Arial`;
      ctx.textBaseline = 'middle';
      
      // Use a distinct color for length labels
      ctx.strokeStyle = COLORS.edge.labelStroke;
      ctx.fillStyle = '#0369a1'; // sky-700 for length labels
      ctx.lineWidth = 3;
      
      ctx.strokeText(lengthText, px + perpX, py + perpY);
      ctx.fillText(lengthText, px + perpX, py + perpY);
      
      // Reset font for other labels
      ctx.font = `${fontSize}px Arial`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = COLORS.edge.label;
      ctx.lineWidth = 4;
    }
  }
  
  if (edge.tail_measurement) {
    const ratio = 0.25;
    const px = x1 + dx * ratio;
    const py = y1 + dy * ratio;
    const perpX = -normY * offset;
    const perpY = normX * offset;
    const text = String(edge.tail_measurement);
    ctx.strokeText(text, px + perpX, py + perpY);
    ctx.fillText(text, px + perpX, py + perpY);
  }
  if (edge.head_measurement) {
    const ratio = 0.75;
    const px = x1 + dx * ratio;
    const py = y1 + dy * ratio;
    const perpX = -normY * offset;
    const perpY = normX * offset;
    const text = String(edge.head_measurement);
    ctx.strokeText(text, px + perpX, py + perpY);
    ctx.fillText(text, px + perpX, py + perpY);
  }
  ctx.restore();
}

function drawNode(node) {
  const radius = NODE_RADIUS * sizeScale;

  // Apply stretch to position for drawing (shapes stay the same, only position stretches)
  const stretchedN = stretchedNode(node);
  
  // Check if this node is selected (compare by ID since we're using stretched copies)
  const isSelected = selectedNode && String(selectedNode.id) === String(node.id);

  // Draw the node icon using the new icon system with coordinate options
  const coordinateOptions = {
    showCoordinateStatus: coordinatesEnabled,
    coordinatesMap: coordinatesMap,
    isSelected: isSelected  // Pass selection state explicitly
  };
  // Pass the same node for both if selected, so identity comparison works
  drawNodeIcon(ctx, stretchedN, radius, COLORS, isSelected ? stretchedN : null, coordinateOptions);

  // For Home nodes with directConnection badge, draw it on top
  if (node.nodeType === 'Home' && node.directConnection) {
    drawDirectConnectionBadge(stretchedN.x, stretchedN.y, radius);
  }

  // Return label data for deferred rendering (smart positioning)
  const fontSize = Math.round(16 * sizeScale);
  let labelText = String(node.id);

  // For Home nodes, only show numeric IDs as labels
  if (node.nodeType === 'Home') {
    const idStr = String(node.id);
    if (!/^\d+$/.test(idStr)) {
      return null; // No label for non-numeric Home IDs
    }
    labelText = idStr;
  }

  return {
    text: labelText,
    nodeX: stretchedN.x,
    nodeY: stretchedN.y,
    nodeRadius: radius,
    fontSize: fontSize
  };
}

/**
 * Draw a simple house icon centered at (cx, cy) fitting inside the node radius.
 */
function drawHouse(cx, cy, radius) {
  primitivesDrawHouse(ctx, cx, cy, radius);
}

/**
 * Draw a small badge indicating a direct connection on top-right of the node.
 */
function drawDirectConnectionBadge(cx, cy, radius) {
  primitivesDrawDirectConnectionBadge(ctx, cx, cy, radius);
}

/**
 * Schedule a redraw on the next animation frame.
 */
function scheduleDraw() {
  if (drawScheduled) return;
  drawScheduled = true;
  window.requestAnimationFrame(() => {
    drawScheduled = false;
    draw();
  });
}

/**
 * Render the right-hand details panel based on the current selection.
 * Supports editing node id, note, material and edge type/material/measurements.
 */
function renderDetails() {
  detailsContainer.innerHTML = '';
  // Track last edited position for "center between" navigation
  if (selectedNode) {
    window.__setLastEditPosition?.(selectedNode.x, selectedNode.y);
  } else if (selectedEdge) {
    const tailN = nodeMap.get(String(selectedEdge.tail));
    const headN = nodeMap.get(String(selectedEdge.head));
    if (tailN && headN) {
      window.__setLastEditPosition?.((tailN.x + headN.x) / 2, (tailN.y + headN.y) / 2);
    }
  }
  if (selectedNode) {
    const node = selectedNode;
    const container = document.createElement('div');
    
    // Evaluate input flow rules for this node
    const normalizedNode = normalizeEntityForRules(node);
    const ruleResults = evaluateRules(currentInputFlowConfig, 'nodes', normalizedNode);
    
    // Store rule results for use in event handlers
    // Convert fillValues Map to object for JSON serialization
    const fillValuesObj = {};
    if (ruleResults.fillValues) {
      for (const [key, val] of ruleResults.fillValues) {
        fillValuesObj[key] = val;
      }
    }
    container.dataset.ruleResults = JSON.stringify({
      disabled: Array.from(ruleResults.disabled),
      required: Array.from(ruleResults.required),
      nullified: Array.from(ruleResults.nullified),
      fillValues: fillValuesObj
    });
    
    // Helper to check if a field is auto-filled
    const isAutoFilled = (fieldKey) => ruleResults.fillValues && ruleResults.fillValues.has(fieldKey);
    const getFilledValue = (fieldKey) => ruleResults.fillValues ? ruleResults.fillValues.get(fieldKey) : undefined;
    
    // Apply fill values to the node and get effective values for rendering
    // This ensures the correct option is selected in dropdowns
    if (ruleResults.fillValues && ruleResults.fillValues.size > 0) {
      let hasChanges = false;
      for (const [field, value] of ruleResults.fillValues) {
        // Map snake_case field keys to camelCase for comparison
        const propMap = {
          'accuracy_level': 'accuracyLevel',
          'maintenance_status': 'maintenanceStatus', 
          'cover_diameter': 'coverDiameter',
          'material': 'material',
          'access': 'access',
          'engineering_status': 'nodeEngineeringStatus'
        };
        const propName = propMap[field] || field;
        if (node[propName] !== value) {
          hasChanges = true;
          break;
        }
      }
      if (hasChanges) {
        const modifiedNode = applyActions(node, ruleResults, adminConfig.nodes?.defaults || {});
        // Update node with fill values (persist the change)
        Object.assign(node, modifiedNode);
        saveToStorage();
      }
    }
    
    // Build node details form with smart sorting based on usage history
    let materialOptions = '';
    const rawMaterialOptions = (adminConfig.nodes?.options?.material ?? NODE_MATERIAL_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedMaterialOptions = getSortedOptions('nodes', 'material', rawMaterialOptions);
    sortedMaterialOptions.forEach((opt) => {
      const mat = opt.label || opt;
      materialOptions += `<option value="${mat}" ${node.material === mat ? 'selected' : ''}>${mat}</option>`;
    });
    // Cover diameter as free integer input
    // Access options with smart sorting
    const rawAccessOptions = (adminConfig.nodes?.options?.access ?? NODE_ACCESS_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedAccessOptions = getSortedOptions('nodes', 'access', rawAccessOptions);
    const accessOptions = sortedAccessOptions
      .map(({ code, label }) => `<option value="${code}" ${Number(node.access)===Number(code)?'selected':''}>${label}</option>`)
      .join('');
    
    // Accuracy level options with smart sorting
    const rawAccuracyOptions = (adminConfig.nodes?.options?.accuracy_level ?? NODE_ACCURACY_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedAccuracyOptions = getSortedOptions('nodes', 'accuracy_level', rawAccuracyOptions);
    const accuracyLevelOptions = sortedAccuracyOptions
      .map(({ code, label }) => `<option value="${code}" ${Number(node.accuracyLevel)===Number(code)?'selected':''}>${label}</option>`)
      .join('');

    // Maintenance status options with smart sorting
    const rawMaintenanceOptions = (adminConfig.nodes?.options?.maintenance_status ?? NODE_MAINTENANCE_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedMaintenanceOptions = getSortedOptions('nodes', 'maintenance_status', rawMaintenanceOptions);
    const maintenanceStatusOptions = sortedMaintenanceOptions
      .map(({ code, label }) => `<option value="${code}" ${Number(node.maintenanceStatus)===Number(code)?'selected':''}>${label}</option>`)
      .join('');

    // Node type options: A (default), B (house), C (grey)
    if (node.nodeType === 'Home') {
      const dcLblRaw = (typeof t === 'function') ? t('labels.directConnection') : '';
      const dcText = (dcLblRaw && dcLblRaw !== 'labels.directConnection')
        ? dcLblRaw
        : (typeof isRTL === 'function' && isRTL(currentLang) ? 'חיבור ישיר' : 'Direct connection');
      container.innerHTML = `
        <div class="field">
          <label for="idInput">${t('labels.nodeId')}</label>
          <input id="idInput" type="text" value="${escapeHtml(node.id)}" dir="auto" />
        </div>
        <div class="field">
          <label for="noteInput">${t('labels.note')}</label>
          <textarea id="noteInput" rows="3" placeholder="${t('labels.notePlaceholder')}" dir="auto">${escapeHtml(node.note || '')}</textarea>
        </div>
        <div class="field">
          <label><input id="directConnectionToggle" type="checkbox" ${node.directConnection ? 'checked' : ''}/> ${dcText}</label>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="details-section">
          <div class="field">
            <label for="idInput">${t('labels.nodeId')}</label>
            <input id="idInput" type="text" value="${escapeHtml(node.id)}" dir="auto" />
          </div>
        </div>
        <div class="details-section">
          <div class="details-section-title">${t('labels.indicator')}</div>
          <div class="details-grid two-col">
            <div class="field">
              <div class="chip ${node.type === 'type2' ? 'chip-warn' : 'chip-ok'}">${node.type === 'type2' ? t('labels.indicatorMissing') : t('labels.indicatorOk')}</div>
            </div>
            <div class="field"></div>
            ${adminConfig.nodes.include.accuracy_level ? `
            <div class="field${isAutoFilled('accuracy_level') ? ' field-auto-filled' : ''}" data-flow-field="accuracy_level">
              <label for="accuracyLevelSelect">${t('labels.accuracyLevel')}${ruleResults.required.has('accuracy_level') ? ' *' : ''}</label>
              <select id="accuracyLevelSelect" ${isAutoFilled('accuracy_level') ? 'disabled' : ''}>${accuracyLevelOptions}</select>
            </div>` : ''}
            ${adminConfig.nodes.include.maintenance_status && !ruleResults.disabled.has('maintenance_status') ? `
            <div class="field${isAutoFilled('maintenance_status') ? ' field-auto-filled' : ''}" data-flow-field="maintenance_status">
              <label for="nodeMaintenanceStatusSelect">${t('labels.maintenanceStatus')}${ruleResults.required.has('maintenance_status') ? ' *' : ''}</label>
              <select id="nodeMaintenanceStatusSelect" ${isAutoFilled('maintenance_status') ? 'disabled' : ''}>${maintenanceStatusOptions}</select>
            </div>` : ''}
            ${adminConfig.nodes.include.cover_diameter && !ruleResults.disabled.has('cover_diameter') ? `
            <div class="field${isAutoFilled('cover_diameter') ? ' field-auto-filled' : ''}" data-flow-field="cover_diameter">
              <label for="coverDiameterInput">${t('labels.coverDiameter')}${ruleResults.required.has('cover_diameter') ? ' *' : ''}</label>
              <input id="coverDiameterInput" type="number" step="1" min="0" value="${node.coverDiameter !== '' ? node.coverDiameter : ''}" placeholder="${t('labels.optional')}" ${isAutoFilled('cover_diameter') ? 'disabled' : ''} />
            </div>` : ''}
            ${!ruleResults.disabled.has('material') ? `
            <div class="field${isAutoFilled('material') ? ' field-auto-filled' : ''}" data-flow-field="material">
              <label for="materialSelect">${t('labels.coverMaterial')}${ruleResults.required.has('material') ? ' *' : ''}</label>
              <select id="materialSelect" ${isAutoFilled('material') ? 'disabled' : ''}>${materialOptions}</select>
            </div>` : ''}
            ${adminConfig.nodes.include.access && !ruleResults.disabled.has('access') ? `
            <div class="field${isAutoFilled('access') ? ' field-auto-filled' : ''}" data-flow-field="access">
              <label for="accessSelect">${t('labels.access')}${ruleResults.required.has('access') ? ' *' : ''}</label>
              <select id="accessSelect" ${isAutoFilled('access') ? 'disabled' : ''}>${accessOptions}</select>
            </div>` : ''}
          </div>
        </div>
        <div class="details-section">
          <div class="details-section-title">${t('labels.surveyData')}</div>
          <div class="details-grid two-col">
            <div class="field">
              <label>${t('labels.surveyX')}</label>
              <div class="field-value-readonly">${node.surveyX != null ? node.surveyX.toFixed(3) : '—'}</div>
            </div>
            <div class="field">
              <label>${t('labels.surveyY')}</label>
              <div class="field-value-readonly">${node.surveyY != null ? node.surveyY.toFixed(3) : '—'}</div>
            </div>
            <div class="field">
              <label>${t('labels.terrainLevel')}</label>
              <div class="field-value-readonly">${node.surveyZ != null ? node.surveyZ.toFixed(3) : '—'}</div>
            </div>
            <div class="field">
              <label>${t('labels.measurePrecision')}</label>
              <div class="field-value-readonly">${node.measure_precision != null ? node.measure_precision.toFixed(3) + ' m' : '—'}</div>
            </div>
            <div class="field col-span-2">
              <label>${t('labels.fixType')}</label>
              <div class="field-value-readonly survey-fix-badge fix-${node.gnssFixQuality === 4 ? '4' : node.gnssFixQuality === 5 ? '5' : '6'}">${
                node.gnssFixQuality === 4 ? t('labels.fixFixed') :
                node.gnssFixQuality === 5 ? t('labels.fixDeviceFloat') :
                t('labels.fixManualFloat')
              }</div>
            </div>
          </div>
        </div>
        <div class="details-section">
          <div class="field">
            <label for="noteInput">${t('labels.note')}</label>
            <textarea id="noteInput" rows="3" placeholder="${t('labels.notePlaceholder')}" dir="auto">${node.note || ''}</textarea>
          </div>
        </div>
      `;
    }

    // Build per-connected-edge inputs: measurement (incoming/outgoing) | material, then diameter
    try {
      const connectedEdges = edges.filter((e) => String(e.tail) === String(node.id) || String(e.head) === String(node.id));
      if (connectedEdges.length > 0) {
        const edgeMaterialOptionLabels = (adminConfig.edges?.options?.material ?? EDGE_MATERIAL_OPTIONS)
          .filter(o => (o.enabled !== false))
          .map(o => o.label || o);
        const diameterOptions = (adminConfig.edges?.options?.line_diameter ?? EDGE_LINE_DIAMETERS)
          .filter(o => (o.enabled !== false))
          .map(d => ({ code: d.code ?? d, label: d.label ?? d }));
        const diameterIndexFromCode = (code) => {
          if (code === '' || code == null) return 0;
          const idx = diameterOptions.findIndex((d) => String(d.code) === String(code));
          return idx >= 0 ? (idx + 1) : 0;
        };
        const connectedLinesText = (typeof isRTL === 'function' && isRTL(currentLang)) ? 'קווים מחוברים' : 'Connected lines';
        let html = `<div class=\"details-section\"><div class=\"details-section-title\">${connectedLinesText}</div><div class=\"details-grid two-col connected-lines-grid\">`;
        connectedEdges.forEach((e) => {
          const isTail = String(e.tail) === String(node.id);
          const measureLabel = isTail ? t('labels.tailMeasure') : t('labels.headMeasure');
          const inputId = `edgeMeasure_${e.id}_${isTail ? 'tail' : 'head'}`;
          const matId = `edgeMaterial_${e.id}`;
          const diamSelectId = `edgeDiameterSelect_${e.id}`;
          const materialOptions = edgeMaterialOptionLabels.map((m) => `<option value="${m}" ${e.material === m ? 'selected' : ''}>${m}</option>`).join('');
          const currentDiameterIndex = diameterIndexFromCode(e.line_diameter);
          html += `
            <div class="field">
              <label for="${inputId}">${measureLabel}</label>
              <input id="${inputId}" type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" value="${isTail ? (e.tail_measurement || '') : (e.head_measurement || '')}" placeholder="${t('labels.optional')}" dir="auto" />
            </div>
            <div class="field">
              <label for="${matId}">${t('labels.edgeMaterial')}</label>
              <select id="${matId}">${materialOptions}</select>
            </div>
            <div class="field col-span-2">
              <label for="${diamSelectId}">${t('labels.lineDiameter')}</label>
              <select id="${diamSelectId}">
                <option value="" ${e.line_diameter === '' ? 'selected' : ''}>${t('labels.optional')}</option>
                ${diameterOptions.map((d) => `<option value="${String(d.code)}" ${String(e.line_diameter) === String(d.code) ? 'selected' : ''}>${String(d.label)}</option>`).join('')}
              </select>
            </div>
          `;
        });
        html += '</div></div>';
        const nodeEdgesWrapper = document.createElement('div');
        nodeEdgesWrapper.innerHTML = html;
        container.appendChild(nodeEdgesWrapper);

        // Listeners
        connectedEdges.forEach((e) => {
          const isTail = String(e.tail) === String(node.id);
          const inputId = `edgeMeasure_${e.id}_${isTail ? 'tail' : 'head'}`;
          const matId = `edgeMaterial_${e.id}`;
          const diamSelectId = `edgeDiameterSelect_${e.id}`;
          const measureInput = container.querySelector(`#${CSS.escape(inputId)}`);
          const materialSelect = container.querySelector(`#${CSS.escape(matId)}`);
          const diameterSelect = container.querySelector(`#${CSS.escape(diamSelectId)}`);

          if (measureInput) {
            const setHighlight = () => { highlightedHalfEdge = { edgeId: e.id, half: isTail ? 'tail' : 'head' }; scheduleDraw(); };
            const clearHighlight = () => { highlightedHalfEdge = null; scheduleDraw(); };
            measureInput.addEventListener('focus', setHighlight);
            measureInput.addEventListener('input', setHighlight);
            measureInput.addEventListener('blur', clearHighlight);
            measureInput.addEventListener('input', (ev) => {
              const raw = String(ev.target.value || '');
              const sanitized = raw.replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, '');
              if (sanitized !== raw) ev.target.value = sanitized;
              if (isTail) e.tail_measurement = sanitized; else e.head_measurement = sanitized;
              computeNodeTypes();
              debouncedSaveToStorage();
              scheduleDraw();
            });
          }
          if (materialSelect) {
            const setHighlight = () => { highlightedHalfEdge = { edgeId: e.id, half: isTail ? 'tail' : 'head' }; scheduleDraw(); };
            const clearHighlight = () => { highlightedHalfEdge = null; scheduleDraw(); };
            materialSelect.addEventListener('focus', setHighlight);
            materialSelect.addEventListener('change', (ev) => {
              setHighlight();
              e.material = ev.target.value;
              saveToStorage();
              scheduleDraw();
            });
            materialSelect.addEventListener('blur', clearHighlight);
          }
          if (diameterSelect) {
            const setHighlight = () => { highlightedHalfEdge = { edgeId: e.id, half: isTail ? 'tail' : 'head' }; scheduleDraw(); };
            const clearHighlight = () => { highlightedHalfEdge = null; scheduleDraw(); };
            diameterSelect.addEventListener('focus', setHighlight);
            diameterSelect.addEventListener('change', (ev) => {
              setHighlight();
              e.line_diameter = String(ev.target.value || '');
              saveToStorage();
              scheduleDraw();
            });
            diameterSelect.addEventListener('blur', clearHighlight);
          }
        });
      }
    } catch (_) { }
    // Add delete button at the bottom (after connected lines if present)
    const deleteButtonWrapper = document.createElement('div');
    deleteButtonWrapper.className = 'details-actions';
    deleteButtonWrapper.innerHTML = `<button id="deleteNodeBtn" class="btn btn-danger btn-full">${t('labels.deleteNode')}</button>`;
    container.appendChild(deleteButtonWrapper);
    detailsContainer.appendChild(container);
    // ID rename listener
    const idInput = container.querySelector('#idInput');
    idInput.addEventListener('change', (e) => {
      const raw = e.target.value.trim();
      const oldId = String(node.id);
      if (!raw || raw === oldId) return;
      if (node.nodeType !== 'Home' && !/^\d+$/.test(raw)) {
        alert(t('alerts.nodeIdUnique'));
        idInput.value = oldId;
        return;
      }
      if (nodes.some((n) => n !== node && String(n.id) === raw)) {
        alert(t('alerts.nodeIdUnique'));
        idInput.value = oldId;
        return;
      }
      renameNodeIdInternal(oldId, raw);
      if (node.nodeType !== 'Home') {
        const used = collectUsedNumericIds();
        let nextCandidate = 1;
        while (used.has(nextCandidate)) nextCandidate += 1;
        nextNodeId = nextCandidate;
        computeNodeTypes();
      }
      saveToStorage();
      scheduleDraw();
      renderDetails();
    });
    idInput.addEventListener('blur', () => {
      // Commit pending changes on blur
      idInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    idInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        idInput.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof idInput.blur === 'function') idInput.blur();
      }
    });
    // Note input listener
    const noteInput = container.querySelector('#noteInput');
    noteInput.addEventListener('input', (e) => {
      node.note = e.target.value;
      updateNodeTimestamp(node);
      debouncedSaveToStorage();
    });
    // Direct connection toggle (Home only)
    const directToggle = container.querySelector('#directConnectionToggle');
    if (directToggle) {
      directToggle.addEventListener('change', (e) => {
        node.directConnection = !!e.target.checked;
        updateNodeTimestamp(node);
        // Keep the same ID regardless of direct connection status
        saveToStorage();
        scheduleDraw();
        renderDetails();
      });
    }
    // Material selection listener (manhole only)
    const materialSelect = container.querySelector('#materialSelect');
    if (materialSelect) {
      materialSelect.addEventListener('change', (e) => {
        node.material = e.target.value;
        updateNodeTimestamp(node);
        trackFieldUsage('nodes', 'material', e.target.value);
        saveToStorage();
        scheduleDraw();
      });
    }
    // Cover diameter selection listener
    const coverDiameterInput = container.querySelector('#coverDiameterInput');
    if (coverDiameterInput) {
      coverDiameterInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const n = Number(val);
        node.coverDiameter = val === '' || !Number.isFinite(n) ? '' : Math.round(n);
        updateNodeTimestamp(node);
        if (node.coverDiameter !== '') {
          trackFieldUsage('nodes', 'cover_diameter', node.coverDiameter);
        }
        debouncedSaveToStorage();
        scheduleDraw();
      });
    }
    // Access selection listener
    const accessSelect = container.querySelector('#accessSelect');
    if (accessSelect) {
      accessSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        node.access = Number.isFinite(num) ? num : 0;
        updateNodeTimestamp(node);
        trackFieldUsage('nodes', 'access', node.access);
        saveToStorage();
        scheduleDraw();
      });
    }
    // Accuracy level selection listener
    const accuracyLevelSelect = container.querySelector('#accuracyLevelSelect');
    if (accuracyLevelSelect) {
      accuracyLevelSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        node.accuracyLevel = Number.isFinite(num) ? num : 0;
        updateNodeTimestamp(node);
        trackFieldUsage('nodes', 'accuracy_level', node.accuracyLevel);
        
        // Apply input flow rules based on the new accuracy level
        const normalizedNode = normalizeEntityForRules(node);
        const newRuleResults = evaluateRules(currentInputFlowConfig, 'nodes', normalizedNode);
        const defaults = {
          material: adminConfig.nodes?.defaults?.material || 'לא ידוע'
        };
        const updatedNode = applyActions(node, newRuleResults, defaults);
        
        // Apply the changes to the node
        Object.assign(node, updatedNode);
        
        saveToStorage();
        scheduleDraw();
        // Re-render to show updated values and field visibility
        renderDetails();
      });
    }

    // Node maintenance status selection listener
    const nodeMaintenanceStatusSelect = container.querySelector('#nodeMaintenanceStatusSelect');
    if (nodeMaintenanceStatusSelect) {
      nodeMaintenanceStatusSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        node.maintenanceStatus = Number.isFinite(num) ? num : 0;
        updateNodeTimestamp(node);
        trackFieldUsage('nodes', 'maintenance_status', node.maintenanceStatus);
        
        // Apply input flow rules based on the new maintenance status
        const normalizedNode = normalizeEntityForRules(node);
        const newRuleResults = evaluateRules(currentInputFlowConfig, 'nodes', normalizedNode);
        const defaults = {
          material: adminConfig.nodes?.defaults?.material || 'לא ידוע'
        };
        const updatedNode = applyActions(node, newRuleResults, defaults);
        
        // Apply the changes to the node
        Object.assign(node, updatedNode);
        
        saveToStorage();
        scheduleDraw();
        // Re-render to show updated values and field visibility
        renderDetails();
      });
    }

    // Node type selection removed from UI per requirements
    // Delete node button listener
    const deleteNodeBtn = container.querySelector('#deleteNodeBtn');
    deleteNodeBtn.addEventListener('click', () => {
      const hasConnections = edges.some((edge) => String(edge.tail) === String(node.id) || String(edge.head) === String(node.id));
      if (hasConnections) {
        const ok = confirm(t('confirms.deleteNodeWithEdges'));
        if (!ok) return;
      }
      // Remove node and associated edges
      nodes = nodes.filter((n) => n !== node);
      edges = edges.filter((edge) => String(edge.tail) !== String(node.id) && String(edge.head) !== String(node.id));
      selectedNode = null;
      // Recompute types after deletion
      computeNodeTypes();
      saveToStorage();
      scheduleDraw();
      renderDetails();
      showToast(t('toasts.nodeDeleted'));
    });
  } else if (selectedEdge) {
    const edge = selectedEdge;
    const tailNode = nodes.find((n) => String(n.id) === String(edge.tail));
    const headNode = nodes.find((n) => String(n.id) === String(edge.head));
    const container = document.createElement('div');

    // Build dropdown options for material with smart sorting
    let materialOptions = '';
    const rawEdgeMaterialOptions = (adminConfig.edges?.options?.material ?? EDGE_MATERIAL_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedEdgeMaterialOptions = getSortedOptions('edges', 'material', rawEdgeMaterialOptions);
    sortedEdgeMaterialOptions.forEach((opt) => {
      const m = opt.label || opt;
      materialOptions += `<option value="${m}" ${edge.material === m ? 'selected' : ''}>${m}</option>`;
    });

    // Compute current material code based on label
    const materialCodeFor = (label) => {
      const list = adminConfig.edges?.options?.material ?? EDGE_MATERIAL_OPTIONS;
      const found = list.find(o => o.label === label);
      if (found) return found.code;
      const idx = (adminConfig.edges?.options?.material ? list.map(o => o.label) : EDGE_MATERIALS).indexOf(label);
      return idx >= 0 ? idx : 0;
    };

    // Build dropdown options for edge type with smart sorting
    let edgeTypeOptions = '';
    const rawEdgeTypeOptions = (adminConfig.edges?.options?.edge_type ?? EDGE_TYPE_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedEdgeTypeOptions = getSortedOptions('edges', 'edge_type', rawEdgeTypeOptions);
    sortedEdgeTypeOptions.forEach((opt) => {
      const et = opt.label || opt;
      edgeTypeOptions += `<option value="${et}" ${edge.edge_type === et ? 'selected' : ''}>${et}</option>`;
    });

    // Engineering status options for edge with smart sorting
    const rawEngineeringOptions = (adminConfig.edges?.options?.engineering_status ?? EDGE_ENGINEERING_STATUS);
    const sortedEngineeringOptions = getSortedOptions('edges', 'engineering_status', rawEngineeringOptions);
    const edgeEngineeringOptions = sortedEngineeringOptions
      .map(({ code, label }) => `<option value="${code}" ${Number(edge.engineeringStatus)===Number(code)?'selected':''}>${label}</option>`)
      .join('');

    // Normalize line diameter options with smart sorting
    const rawDiameterOptions = (adminConfig.edges?.options?.line_diameter ?? EDGE_LINE_DIAMETERS)
      .filter(o => (o.enabled !== false))
      .map(d => ({ code: d.code ?? d, label: d.label ?? d }));
    const sortedDiameterOptions = getSortedOptions('edges', 'line_diameter', rawDiameterOptions);
    const diameterOptions = sortedDiameterOptions;
    const diameterIndexFromCode = (code) => {
      if (code === '' || code == null) return 0; // 0 represents Optional/empty
      const idx = diameterOptions.findIndex((d) => String(d.code) === String(code));
      return idx >= 0 ? (idx + 1) : 0;
    };
    const currentDiameterIndex = diameterIndexFromCode(edge.line_diameter);

    // Fall position options with smart sorting
    const rawFallPositionOptions = (adminConfig.edges?.options?.fall_position || [{code:0,label:'פנימי'},{code:1,label:'חיצוני'}])
      .filter(o => (o.enabled !== false));
    const sortedFallPositionOptions = getSortedOptions('edges', 'fall_position', rawFallPositionOptions);
    const fallPositionOptionsHtml = sortedFallPositionOptions
      .map(({code,label}) => `<option value="${String(code)}" ${Number(edge.fall_position)===Number(code)?'selected':''}>${label}</option>`)
      .join('');

    container.innerHTML = `
      <div class="details-section">
        <div class="details-grid two-col">
          <div class="field col-span-2">
            <div>${escapeHtml(edge.tail)} ${isRTL(currentLang) ? '←' : '→'} ${escapeHtml(edge.head)}</div>
          </div>
        </div>
      </div>

      <div class="details-section">
        <div class="details-grid two-col">
          <div class="field">
            <label for="edgeTypeSelect">${t('labels.edgeType')}</label>
            <select id="edgeTypeSelect">${edgeTypeOptions}</select>
          </div>
          ${adminConfig.edges.include.engineering_status ? `
          <div class="field">
            <label for="edgeEngineeringStatusSelect">${t('labels.engineeringStatus')}</label>
            <select id="edgeEngineeringStatusSelect">${edgeEngineeringOptions}</select>
          </div>` : '<div class="field"></div>'}
          <div class="field">
            <label for="edgeMaterialSelect">${t('labels.edgeMaterial')}</label>
            <select id="edgeMaterialSelect">${materialOptions}</select>
          </div>
          ${adminConfig.edges.include.line_diameter ? `
          <div class="field">
            <label for="edgeDiameterSelect">${t('labels.lineDiameter')}</label>
            <select id="edgeDiameterSelect">
              <option value="" ${edge.line_diameter === '' ? 'selected' : ''}>${t('labels.optional')}</option>
              ${diameterOptions.map((d) => `<option value="${String(d.code)}" ${String(edge.line_diameter) === String(d.code) ? 'selected' : ''}>${String(d.label)}</option>`).join('')}
            </select>
          </div>` : ''}
        </div>
      </div>

      ${(adminConfig.edges.include.fall_depth || adminConfig.edges.include.fall_position) ? `
      <div class="details-section">
        <div class="details-grid two-col">
          ${adminConfig.edges.include.fall_depth ? `
          <div class="field">
            <label for="fallDepthInput">${t('labels.fallDepth')}</label>
            <input id="fallDepthInput" type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" value="${edge.fall_depth || ''}" placeholder="${t('labels.optional')}" dir="auto" />
          </div>` : ''}
          ${adminConfig.edges.include.fall_position ? `
          <div class="field">
            <label for="fallPositionSelect">${t('labels.fallPosition')}</label>
            <select id="fallPositionSelect">
              <option value="" ${edge.fall_position===''?'selected':''}>${t('labels.optional')}</option>
              ${fallPositionOptionsHtml}
            </select>
          </div>` : ''}
        </div>
      </div>` : ''}

      ${(adminConfig.edges.include.tail_measurement || adminConfig.edges.include.head_measurement) ? `
      <div class="details-section">
        <div class="details-grid two-col">
          ${adminConfig.edges.include.tail_measurement ? `
          <div class="field">
            <label for="tailInput">${t('labels.tailMeasure')}</label>
            <input id="tailInput" type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" value="${edge.tail_measurement || ''}" placeholder="${t('labels.optional')}" dir="auto" />
          </div>` : ''}
          ${adminConfig.edges.include.head_measurement ? `
          <div class="field">
            <label for="headInput">${t('labels.headMeasure')}</label>
            <input id="headInput" type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" value="${edge.head_measurement || ''}" placeholder="${t('labels.optional')}" dir="auto" />
          </div>` : ''}
        </div>
      </div>` : ''}

      ${(headNode && headNode.note) ? `
      <div class="details-section">
        <div class="field">
          <div class="field-label">${t('labels.targetNote')}</div>
          <div class="muted">${headNode.note}</div>
        </div>
      </div>` : ''}

      <div class="details-actions">
        <button id="deleteEdgeBtn" class="btn btn-danger btn-full">${t('labels.deleteEdge')}</button>
      </div>
    `;
    detailsContainer.appendChild(container);

    // Attach listeners with field usage tracking
    const edgeTypeSelect = container.querySelector('#edgeTypeSelect');
    const edgeMaterialSelect = container.querySelector('#edgeMaterialSelect');
    const edgeDiameterSelect = container.querySelector('#edgeDiameterSelect');
    const edgeEngineeringStatusSelect = container.querySelector('#edgeEngineeringStatusSelect');
    const fallPositionSelect = container.querySelector('#fallPositionSelect');
    edgeTypeSelect.addEventListener('change', (e) => {
      edge.edge_type = e.target.value;
      updateEdgeTimestamp(edge);
      trackFieldUsage('edges', 'edge_type', e.target.value);
      saveToStorage();
      scheduleDraw();
    });
    edgeMaterialSelect.addEventListener('change', (e) => {
      edge.material = e.target.value;
      updateEdgeTimestamp(edge);
      trackFieldUsage('edges', 'material', e.target.value);
      saveToStorage();
      scheduleDraw();
    });
    if (edgeDiameterSelect) {
      edgeDiameterSelect.addEventListener('change', (e) => {
        edge.line_diameter = String(e.target.value || '');
        updateEdgeTimestamp(edge);
        if (edge.line_diameter !== '') {
          trackFieldUsage('edges', 'line_diameter', edge.line_diameter);
        }
        saveToStorage();
        scheduleDraw();
      });
    }
    if (edgeEngineeringStatusSelect) {
      edgeEngineeringStatusSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        edge.engineeringStatus = Number.isFinite(num) ? num : 0;
        updateEdgeTimestamp(edge);
        trackFieldUsage('edges', 'engineering_status', edge.engineeringStatus);
        saveToStorage();
        scheduleDraw();
      });
    }
    if (fallPositionSelect) {
      fallPositionSelect.addEventListener('change', (e) => {
        const raw = e.target.value;
        const num = Number(raw);
        edge.fall_position = raw === '' || !Number.isFinite(num) ? '' : num;
        updateEdgeTimestamp(edge);
        if (edge.fall_position !== '') {
          trackFieldUsage('edges', 'fall_position', edge.fall_position);
        }
        saveToStorage();
      });
    }
    const tailInput = container.querySelector('#tailInput');
    const headInput = container.querySelector('#headInput');
    const fallDepthInput = container.querySelector('#fallDepthInput');
    if (tailInput) {
      tailInput.addEventListener('input', (e) => {
        const raw = String(e.target.value || '');
        // Keep digits and a single dot for decimals
        const sanitized = raw
          .replace(/[^0-9.]/g, '')
          .replace(/\.(?=.*\.)/g, '');
        if (sanitized !== raw) {
          e.target.value = sanitized;
        }
        edge.tail_measurement = sanitized;
        updateEdgeTimestamp(edge);
        // Recompute node types because missing measurement may affect connected node type
        computeNodeTypes();
        debouncedSaveToStorage();
        scheduleDraw();
      });
    }
    if (headInput) {
      headInput.addEventListener('input', (e) => {
        const raw = String(e.target.value || '');
        const sanitized = raw
          .replace(/[^0-9.]/g, '')
          .replace(/\.(?=.*\.)/g, '');
        if (sanitized !== raw) {
          e.target.value = sanitized;
        }
        edge.head_measurement = sanitized;
        updateEdgeTimestamp(edge);
        computeNodeTypes();
        debouncedSaveToStorage();
        scheduleDraw();
      });
    }
    if (fallDepthInput) {
      fallDepthInput.addEventListener('input', (e) => {
        // Store the value, allowing partial decimals like "3." while typing
        const val = e.target.value;

        // Allow empty string
        if (val === '') {
          edge.fall_depth = '';
        }
        // Allow partial decimal numbers (e.g., "3." or "0.")
        else if (val.endsWith('.') && !isNaN(parseFloat(val))) {
          edge.fall_depth = val;
        }
        // Convert complete numbers to number type
        else {
          const num = Number(val);
          edge.fall_depth = Number.isFinite(num) ? num : val;
        }

        updateEdgeTimestamp(edge);
        debouncedSaveToStorage();
        scheduleDraw();
      });
    }
    const deleteEdgeBtn = container.querySelector('#deleteEdgeBtn');
    deleteEdgeBtn.addEventListener('click', () => {
      const ok = confirm(t('confirms.deleteEdge'));
      if (!ok) return;
      edges = edges.filter((ed) => ed !== edge);
      selectedEdge = null;
      // Recompute node types after deletion
      computeNodeTypes();
      saveToStorage();
      scheduleDraw();
      renderDetails();
      showToast(t('toasts.edgeDeleted'));
    });

  } else {
    detailsContainer.textContent = t('detailsDefault');
  }
  // Toggle drawer visibility on tablet/mobile
  try {
    const shouldOpen = !!(selectedNode || selectedEdge);
    if (sidebarEl && sidebarEl.classList) {
      if (shouldOpen) sidebarEl.classList.add('open');
      else sidebarEl.classList.remove('open');
    }
    // Mark body for CSS offset of canvas toolbar
    if (document && document.body && document.body.classList) {
      if (shouldOpen) document.body.classList.add('drawer-open');
      else document.body.classList.remove('drawer-open');
    }
  } catch (_) { }
  // In mobile layout, the sidebar height affects the canvasContainer height.
  // Ensure the canvas backing store matches the new display size.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(resizeCanvas);
  } else {
    setTimeout(resizeCanvas, 0);
  }
}

// Close button for drawer
if (sidebarCloseBtn) {
  sidebarCloseBtn.addEventListener('click', () => {
    if (sidebarEl && sidebarEl.classList) sidebarEl.classList.remove('open');
    if (document && document.body && document.body.classList) document.body.classList.remove('drawer-open');
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    scheduleDraw();
  });
}

/**
 * If the provided Home node is connected to a Manhole, assign an id derived from the manhole id.
 * Format: `${manholeId}-${k}` where k is the next available positive integer suffix.
 */
function assignHomeIdFromConnectedManhole(homeNode) {
  if (!homeNode || homeNode.nodeType !== 'Home') return;
  // For direct connection, use the normal numeric id assignment
  const newId = findSmallestAvailableNumericId();
  if (String(homeNode.id) !== String(newId)) {
    renameNodeIdInternal(String(homeNode.id), String(newId));
  }
}

/**
 * Find the topmost node under a given point, if any.
 * @param {number} x
 * @param {number} y
 * @returns {object|null} The node if found; otherwise null
 */
function findNodeAt(x, y) {
  // Look through nodes in reverse order (topmost first)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node._hidden) continue;

    // Check for drainage nodes (rectangular hit detection)
    if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
      const rectWidth = NODE_RADIUS * sizeScale * 1.8;
      const rectHeight = NODE_RADIUS * sizeScale * 1.3;
      const halfWidth = rectWidth / 2 + 2;
      const halfHeight = rectHeight / 2 + 2;

      if (Math.abs(x - node.x) <= halfWidth && Math.abs(y - node.y) <= halfHeight) {
        return node;
      }
    } else {
      // Circular hit detection for other nodes
      const dx = x - node.x;
      const dy = y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= (NODE_RADIUS * sizeScale) + 2) {
        return node;
      }
    }
  }
  return null;
}

/**
 * Touch-friendly node hit test that expands the selection radius.
 * Falls back to normal hit if extraRadius is falsy.
 */
function findNodeAtWithExpansion(x, y, extraRadius) {
  const extra = typeof extraRadius === 'number' ? extraRadius : 0;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node._hidden) continue;

    // Check for drainage nodes (rectangular hit detection)
    if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
      const rectWidth = NODE_RADIUS * sizeScale * 1.8;
      const rectHeight = NODE_RADIUS * sizeScale * 1.3;
      const halfWidth = rectWidth / 2 + 2 + extra;
      const halfHeight = rectHeight / 2 + 2 + extra;

      if (Math.abs(x - node.x) <= halfWidth && Math.abs(y - node.y) <= halfHeight) {
        return node;
      }
    } else {
      // Circular hit detection for other nodes
      const dx = x - node.x;
      const dy = y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= (NODE_RADIUS * sizeScale) + 2 + extra) {
        return node;
      }
    }
  }
  return null;
}

/**
 * Find an edge near a given point by measuring perpendicular distance to segments.
 * @param {number} x
 * @param {number} y
 * @returns {object|null} The closest edge within a threshold; otherwise null
 */
function findEdgeAt(x, y, threshold) {
  let closest = null;
  let minDist = (typeof threshold === 'number') ? threshold : 8; // threshold in pixels
  edges.forEach((edge) => {
    let tailX, tailY, headX, headY;
    
    // Handle outbound dangling edges (tail is node, head is null)
    if (edge.head === null && edge.tail != null) {
      const tailNode = nodes.find((n) => n.id === edge.tail);
      if (!tailNode || !edge.danglingEndpoint) return;
      tailX = tailNode.x;
      tailY = tailNode.y;
      headX = edge.danglingEndpoint.x;
      headY = edge.danglingEndpoint.y;
    }
    // Handle inbound dangling edges (tail is null, head is node)
    else if (edge.tail === null && edge.head != null) {
      const headNode = nodes.find((n) => n.id === edge.head);
      if (!headNode || !edge.tailPosition) return;
      tailX = edge.tailPosition.x;
      tailY = edge.tailPosition.y;
      headX = headNode.x;
      headY = headNode.y;
    }
    // Normal edges
    else {
      const tailNode = nodes.find((n) => n.id === edge.tail);
      const headNode = nodes.find((n) => n.id === edge.head);
      if (!tailNode || !headNode) return;
      tailX = tailNode.x;
      tailY = tailNode.y;
      headX = headNode.x;
      headY = headNode.y;
    }
    
    const dist = distanceToSegment(x, y, tailX, tailY, headX, headY);
    if (dist < minDist) {
      minDist = dist;
      closest = edge;
    }
  });
  return closest;
}

/**
 * Handle pointer down events for both mouse and touch.
 * Creates nodes in node mode, or starts/finishes edges in edge mode,
 * or selects existing nodes/edges for editing.
 * @param {number} x
 * @param {number} y
 */
function pointerDown(x, y) {
  const world = screenToWorld(x, y);
  const node = findNodeAt(world.x, world.y);
  // Edge creation and selection mode
  if (currentMode === 'edge') {
    const edgeAt = findEdgeAt(world.x, world.y);
    
    // Case 1: No pending edge yet
    if (!pendingEdgeTail && !pendingEdgeStartPosition) {
      if (node) {
        // Start from a node (for normal or outbound dangling edge)
        pendingEdgeTail = node;
        pendingEdgePreview = { x: world.x, y: world.y };
        showToast(t('toasts.chooseTarget'));
        scheduleDraw();
        return;
      }
      if (edgeAt) {
        selectedEdge = edgeAt;
        selectedNode = null;
        renderDetails();
        scheduleDraw();
        return;
      }
      // Project-canvas: check background sketches for nodes/edges before treating as empty space
      if (window.__projectCanvas?.isProjectCanvasMode()) {
        const bgNode = window.__projectCanvas.findNodeInBackground(world.x, world.y, sizeScale);
        if (bgNode) {
          window.__projectCanvas.switchActiveSketch(bgNode.sketchId);
          const switched = findNodeAt(world.x, world.y);
          if (switched) {
            pendingEdgeTail = switched;
            pendingEdgePreview = { x: world.x, y: world.y };
            showToast(t('toasts.chooseTarget'));
            scheduleDraw();
            return;
          }
        }
        const bgEdge = window.__projectCanvas.findEdgeInBackground(world.x, world.y);
        if (bgEdge) {
          window.__projectCanvas.switchActiveSketch(bgEdge.sketchId);
          const switchedEdge = findEdgeAt(world.x, world.y);
          if (switchedEdge) {
            selectedEdge = switchedEdge;
            selectedNode = null;
            renderDetails();
            scheduleDraw();
            return;
          }
        }
      }
      // Clicked empty space first - start inbound dangling edge
      pendingEdgeStartPosition = { x: world.x, y: world.y };
      pendingEdgePreview = { x: world.x, y: world.y };
      showToast(t('toasts.chooseTargetInbound'));
      scheduleDraw();
      return;
    }
    
    // Case 2: We started from a node (pendingEdgeTail is set)
    if (pendingEdgeTail) {
      if (node) {
        // If user clicked the same node again, cancel pending edge creation
        if (String(node.id) === String(pendingEdgeTail.id)) {
          pendingEdgeTail = null;
          pendingEdgePreview = null;
          showToast(t('toasts.edgeCancelled'));
          scheduleDraw();
          return;
        }
        const created = createEdge(pendingEdgeTail.id, node.id);
        pendingEdgeTail = null;
        pendingEdgePreview = null;
        if (created) {
          showToast(t('toasts.edgeCreated'));
        } else {
          showToast(t('toasts.edgeExists'));
        }
        scheduleDraw();
        return;
      }
      if (edgeAt) {
        // Switch to selecting the edge and cancel pending edge creation
        pendingEdgeTail = null;
        pendingEdgePreview = null;
        selectedEdge = edgeAt;
        selectedNode = null;
        renderDetails();
        scheduleDraw();
        return;
      }
      // Clicked empty space; create an outbound dangling edge
      const danglingEdge = createDanglingEdge(pendingEdgeTail.id, world.x, world.y);
      pendingEdgeTail = null;
      pendingEdgePreview = null;
      if (danglingEdge) {
        showToast(t('toasts.danglingEdgeCreated'));
        updateIncompleteEdgeTracker();
      }
      scheduleDraw();
      return;
    }
    
    // Case 3: We started from empty space (pendingEdgeStartPosition is set)
    if (pendingEdgeStartPosition) {
      if (node) {
        // Create an inbound dangling edge (from position to node)
        const inboundEdge = createInboundDanglingEdge(
          pendingEdgeStartPosition.x, 
          pendingEdgeStartPosition.y, 
          node.id
        );
        pendingEdgeStartPosition = null;
        pendingEdgePreview = null;
        if (inboundEdge) {
          showToast(t('toasts.danglingEdgeCreated'));
          updateIncompleteEdgeTracker();
        }
        scheduleDraw();
        return;
      }
      if (edgeAt) {
        // Cancel and select the edge
        pendingEdgeStartPosition = null;
        pendingEdgePreview = null;
        selectedEdge = edgeAt;
        selectedNode = null;
        renderDetails();
        scheduleDraw();
        return;
      }
      // Clicked empty space again - cancel
      pendingEdgeStartPosition = null;
      pendingEdgePreview = null;
      showToast(t('toasts.edgeCancelled'));
      scheduleDraw();
      return;
    }
  }
  // Project-canvas auto-switch: if clicking empty space in active sketch, check background sketches
  if (!node && window.__projectCanvas?.isProjectCanvasMode() &&
      (currentMode === 'node' || currentMode === 'home' || currentMode === 'drainage')) {
    const bgHit = window.__projectCanvas.findNodeInBackground(world.x, world.y, sizeScale);
    if (bgHit) {
      window.__projectCanvas.switchActiveSketch(bgHit.sketchId);
      // Re-find in the now-active sketch
      const switched = findNodeAt(world.x, world.y);
      if (switched) {
        selectedNode = switched;
        selectedEdge = null;
        renderDetails();
        scheduleDraw();
        return;
      }
    }
  }

  // Contextual edit: in Node/Home/Drainage mode, allow selecting and dragging existing nodes when clicking on them
  if ((currentMode === 'node' || currentMode === 'home' || currentMode === 'drainage') && node) {
    // If clicking an already selected node, defer potential deselection until release
    // so that dragging is still possible.
    if (selectedNode && String(selectedNode.id) === String(node.id)) {
      pendingDeselect = true;
    } else {
      selectedNode = node;
      selectedEdge = null;
      pendingDeselect = false;
    }
    
    dragOffset.x = world.x - node.x;
    dragOffset.y = world.y - node.y;
    isDragging = true;
    // Defer opening details until release if no drag movement occurred
    pendingDetailsForSelectedNode = true;
    selectedNodeDownScreen = { x, y };
    selectedNodeMoveThreshold = (lastPointerType === 'touch') ? TOUCH_TAP_MOVE_THRESHOLD : MOUSE_TAP_MOVE_THRESHOLD;
    scheduleDraw(); // show selection highlight without opening panel yet
    return;
  }
  // In node/home modes, do not allow selecting edges
  // Create new node when clicking empty space
  if (currentMode === 'node') {
    const created = createNode(world.x, world.y);
    // Do not enter edit mode or open details; Node mode is for placement only
    scheduleDraw();
  } else if (currentMode === 'home') {
    const created = createNode(world.x, world.y);
    // Switch the created node to Home type but keep numeric ID (like manholes/drainage)
    created.nodeType = 'Home';
    selectedNode = created;
    draw();
    renderDetails();
    setTimeout(() => {
      const firstInput = detailsContainer.querySelector('input:not([type="checkbox"]), select, textarea');
      if (firstInput) firstInput.focus();
    }, 0);
  } else if (currentMode === 'drainage') {
    const created = createNode(world.x, world.y);
    // Switch the created node to Drainage type but keep numeric ID (like manholes)
    created.nodeType = 'Drainage';
    // Do not enter edit mode or open details; Node mode is for placement only
    scheduleDraw();
  }
}

/**
 * Handle pointer move events to reposition a dragged node.
 * @param {number} x
 * @param {number} y
 */
function pointerMove(x, y) {
  const world = screenToWorld(x, y);
  // Cancel pending details open if user moves beyond threshold while dragging
  if (pendingDetailsForSelectedNode && selectedNodeDownScreen) {
    const dxScreen = x - selectedNodeDownScreen.x;
    const dyScreen = y - selectedNodeDownScreen.y;
    if (Math.hypot(dxScreen, dyScreen) > selectedNodeMoveThreshold) {
      pendingDetailsForSelectedNode = false;
      pendingDeselect = false;
    }
  }
  if (isDragging && selectedNode) {
    // Don't allow dragging if node has survey coordinates (position is locked)
    if (selectedNode.surveyX != null && selectedNode.surveyY != null) {
      isDragging = false;
      return;
    }
    selectedNode.x = world.x - dragOffset.x;
    selectedNode.y = world.y - dragOffset.y;
    // Recompute ITM coordinates for manually positioned nodes
    const refDrag = getMapReferencePoint();
    if (refDrag && refDrag.itm && refDrag.canvas && coordinateScale > 0) {
      selectedNode.surveyX = refDrag.itm.x + (selectedNode.x - refDrag.canvas.x) / coordinateScale;
      selectedNode.surveyY = refDrag.itm.y - (selectedNode.y - refDrag.canvas.y) / coordinateScale;
      selectedNode.gnssFixQuality = selectedNode.gnssFixQuality || 6; // Manual Float
      selectedNode.hasCoordinates = true;
    }
    updateNodeTimestamp(selectedNode);
    saveToStorage();
    scheduleDraw();
    // Auto-pan only while dragging to create infinite feel, not every frame in draw
    autoPanWhenDragging(x, y);
    return;
  }
  // Update edge preview while selecting target in edge mode
  if (currentMode === 'edge' && (pendingEdgeTail || pendingEdgeStartPosition)) {
    pendingEdgePreview = { x: world.x, y: world.y };
    scheduleDraw();
  }
}

/**
 * Handle pointer up/cancel to end dragging.
 */
function pointerUp() {
  isDragging = false;
  // If a node was grabbed but not moved significantly, perform toggle/details logic
  if (pendingDetailsForSelectedNode && selectedNode) {
    if (pendingDeselect) {
      selectedNode = null;
      selectedEdge = null;
      renderDetails();
    } else {
      renderDetails();
    }
    scheduleDraw();
  }
  // Reset pending click/drag states
  pendingDetailsForSelectedNode = false;
  pendingDeselect = false;
  selectedNodeDownScreen = null;
}

// Mouse events
canvas.addEventListener('mousedown', (e) => {
  commitIdInputIfFocused();
  // Middle mouse or space+drag pans the view
  if (e.button === 1 || spacePanning) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    translateStart = { ...viewTranslate };
    canvas.style.cursor = 'grabbing';
  } else {
    // Left button: start background grab-to-pan if clicking empty space; otherwise delegate
    if (e.button === 0) {
      const world = screenToWorld(e.offsetX, e.offsetY);
      const node = findNodeAt(world.x, world.y);
      const edgeAt = (currentMode === 'edge') ? findEdgeAt(world.x, world.y) : null;
      if (node || edgeAt) {
        lastPointerType = 'mouse';
        pointerDown(e.offsetX, e.offsetY);
      } else {
        // Empty background: prepare to either pan (if moved) or create node on release (node/home/drainage modes)
        mousePanCandidate = true;
        mouseAddPending = (currentMode === 'node' || currentMode === 'home' || currentMode === 'drainage' || currentMode === 'edge');
        mouseAddPoint = { x: e.offsetX, y: e.offsetY };
        panStart = { x: e.clientX, y: e.clientY };
        translateStart = { ...viewTranslate };
        canvas.style.cursor = 'grab';
      }
    }
  }
});
canvas.addEventListener('mousemove', (e) => {
  if (isPanning) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    viewTranslate.x = translateStart.x + dx;
    viewTranslate.y = translateStart.y + dy;
    scheduleDraw();
  } else {
    // If user started on empty background and moved beyond threshold, begin panning
    if (mousePanCandidate) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      if (Math.hypot(dx, dy) > MOUSE_TAP_MOVE_THRESHOLD) {
        isPanning = true;
        canvas.style.cursor = 'grabbing';
        viewTranslate.x = translateStart.x + dx;
        viewTranslate.y = translateStart.y + dy;
        // Once panning starts, do not create on release
        mouseAddPending = false;
        scheduleDraw();
        return;
      }
    }
    pointerMove(e.offsetX, e.offsetY);
  }
});
canvas.addEventListener('mouseup', (e) => {
  commitIdInputIfFocused();
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = '';
  } else {
    // If click ended without starting pan and we intended to add, create now
    if (mousePanCandidate && mouseAddPending && mouseAddPoint) {
      pointerDown(mouseAddPoint.x, mouseAddPoint.y);
    }
    pointerUp();
  }
  // Reset background-pan click state
  mousePanCandidate = false;
  mouseAddPending = false;
  mouseAddPoint = null;
});
canvas.addEventListener('mouseleave', pointerUp);

// Touch events for mobile
canvas.addEventListener('touchstart', (e) => {
  commitIdInputIfFocused();
  if (e.touches.length > 0) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (e.touches.length >= 2) {
      // Initialize pinch zoom
      isPinching = true;
      isDragging = false;
      // Cancel any pending tap-to-add when multi-touch begins
      touchAddPending = false;
      touchAddPoint = null;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
      const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
      pinchStartDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchStartScale = viewScale;
      const centerScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      pinchCenterWorld = screenToWorld(centerScreen.x, centerScreen.y);
    } else {
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      // Defer node creation until touchend to distinguish tap from pinch/drag
      const world = screenToWorld(x, y);
      if (currentMode === 'edge') {
        const nodeAt = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION);
        const edgeAt = findEdgeAt(world.x, world.y, TOUCH_EDGE_HIT_THRESHOLD);
        
        if (nodeAt || edgeAt) {
          // Case 1: No pending edge yet
          if (!pendingEdgeTail && !pendingEdgeStartPosition) {
            if (nodeAt) {
              // Start from a node (for normal or outbound dangling edge)
              pendingEdgeTail = nodeAt;
              pendingEdgePreview = { x: world.x, y: world.y };
              selectedNode = null;
              selectedEdge = null;
              touchAddPending = false;
              touchAddPoint = null;
              renderDetails();
              scheduleDraw();
              showToast(t('toasts.chooseTarget'));
            } else if (edgeAt) {
              // Select edge for editing
              selectedEdge = edgeAt;
              selectedNode = null;
              touchAddPending = false;
              touchAddPoint = null;
              renderDetails();
              scheduleDraw();
            }
          }
          // Case 2: We started from a node (pendingEdgeTail is set)
          else if (pendingEdgeTail) {
            if (nodeAt) {
              if (String(nodeAt.id) !== String(pendingEdgeTail.id)) {
                const created = createEdge(pendingEdgeTail.id, nodeAt.id);
                pendingEdgeTail = null;
                pendingEdgePreview = null;
                scheduleDraw();
                if (created) {
                  showToast(t('toasts.edgeCreated'));
                } else {
                  showToast(t('toasts.edgeExists'));
                }
              } else {
                // Tapped same node again: cancel
                pendingEdgeTail = null;
                pendingEdgePreview = null;
                scheduleDraw();
                showToast(t('toasts.edgeCancelled'));
              }
            } else if (edgeAt) {
              // Cancel and select edge
              pendingEdgeTail = null;
              pendingEdgePreview = null;
              selectedEdge = edgeAt;
              selectedNode = null;
              renderDetails();
              scheduleDraw();
            }
          }
          // Case 3: We started from empty space (pendingEdgeStartPosition is set)
          else if (pendingEdgeStartPosition) {
            if (nodeAt) {
              // Create inbound dangling edge
              const inboundEdge = createInboundDanglingEdge(
                pendingEdgeStartPosition.x,
                pendingEdgeStartPosition.y,
                nodeAt.id
              );
              pendingEdgeStartPosition = null;
              pendingEdgePreview = null;
              if (inboundEdge) {
                showToast(t('toasts.danglingEdgeCreated'));
                updateIncompleteEdgeTracker();
              }
              scheduleDraw();
            } else if (edgeAt) {
              // Cancel and select edge
              pendingEdgeStartPosition = null;
              pendingEdgePreview = null;
              selectedEdge = edgeAt;
              selectedNode = null;
              renderDetails();
              scheduleDraw();
            }
          }
        } else {
          // Empty background in edge mode: defer to allow panning
          touchPanCandidate = true;
          touchAddPending = true;
          touchAddPoint = { x, y };
        }
      } else {
        const nodeAt = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION);
        if (nodeAt) {
          // If tapping an already selected node, defer potential deselection until release
          if (selectedNode && String(selectedNode.id) === String(nodeAt.id)) {
            pendingDeselect = true;
          } else {
            selectedNode = nodeAt;
            selectedEdge = null;
            pendingDeselect = false;
          }
          // Begin drag/select without risking accidental creation via pointerDown
          dragOffset.x = world.x - nodeAt.x;
          dragOffset.y = world.y - nodeAt.y;
          isDragging = true;
          touchAddPending = false;
          touchAddPoint = null;
          // Defer opening details until release if no drag movement occurred
          lastPointerType = 'touch';
          pendingDetailsForSelectedNode = true;
          selectedNodeDownScreen = { x, y };
          selectedNodeMoveThreshold = TOUCH_TAP_MOVE_THRESHOLD;
          scheduleDraw(); // show selection highlight without opening panel yet
        } else {
          // Background: candidate for panning or tap-to-add on release
          touchPanCandidate = true;
          touchAddPending = (currentMode === 'node' || currentMode === 'home' || currentMode === 'drainage');
          touchAddPoint = { x, y };
        }
      }
    }
  }
});
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (e.touches.length >= 2) {
      // Update pinch zoom
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
      const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (pinchStartDistance && pinchStartScale) {
        const newScale = pinchStartScale * (dist / pinchStartDistance);
        const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
        viewScale = clamped;
        const centerScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        // Keep the original world center under the same screen point
        viewTranslate.x = centerScreen.x - viewScale * viewStretchX * pinchCenterWorld.x;
        viewTranslate.y = centerScreen.y - viewScale * viewStretchY * pinchCenterWorld.y;
        scheduleDraw();
      }
      // Any multi-touch cancels pending tap-to-add
      touchAddPending = false;
      touchAddPoint = null;
    } else {
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      // Update edge preview while selecting target in edge mode (touch)
      if (currentMode === 'edge' && (pendingEdgeTail || pendingEdgeStartPosition)) {
        const world = screenToWorld(x, y);
        pendingEdgePreview = { x: world.x, y: world.y };
        scheduleDraw();
      } else {
        // If background touch and movement exceeds threshold, treat as panning
        if (touchPanCandidate && touchAddPoint) {
          const dx = (touch.clientX - (touchAddPoint.x + rect.left));
          const dy = (touch.clientY - (touchAddPoint.y + rect.top));
          if (Math.hypot(dx, dy) > TOUCH_TAP_MOVE_THRESHOLD) {
            // Start panning: update translate by movement delta in screen space
            viewTranslate.x += dx;
            viewTranslate.y += dy;
            // Update anchor point so further deltas are incremental
            touchAddPoint = { x, y };
            // While panning, do not create a node on release
            touchAddPending = false;
            scheduleDraw();
            return;
          }
        }
        pointerMove(x, y);
      }
      // If finger moved too much, cancel tap-to-add
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
  e.preventDefault();
  if (e.touches.length < 2) {
    isPinching = false;
    pinchStartDistance = null;
    pinchStartScale = null;
  }
  if (e.touches.length === 0) {
    // If a tap-to-add is pending and didn't move much, create node/edge now
    if (touchAddPending && touchAddPoint && (currentMode === 'node' || currentMode === 'home' || currentMode === 'drainage' || currentMode === 'edge') && !isDragging) {
      if (currentMode === 'edge') {
        pointerDown(touchAddPoint.x, touchAddPoint.y);
      } else {
        const world = screenToWorld(touchAddPoint.x, touchAddPoint.y);
        // Re-check proximity with touch-friendly thresholds to avoid creating next to an existing node/edge
        const nearNode = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION);
        const nearEdge = findEdgeAt(world.x, world.y, TOUCH_EDGE_HIT_THRESHOLD);
        if (!nearNode && !nearEdge) {
          const created = createNode(world.x, world.y);
          if (currentMode === 'home' && created) {
            // Keep numeric ID for home (like manholes/drainage)
            created.nodeType = 'Home';
          } else if (currentMode === 'drainage' && created) {
            // Keep numeric ID for drainage (like manholes)
            created.nodeType = 'Drainage';
          }
          scheduleDraw();
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
  e.preventDefault();
  isPinching = false;
  pinchStartDistance = null;
  pinchStartScale = null;
  pointerUp();
});

// ============================================
// Project Management Functions
// ============================================

/**
 * Fetch available projects from the API
 * @returns {Promise<Array>} List of projects
 */
async function fetchProjects() {
  try {
    // Better Auth uses cookie-based sessions, no token needed
    // The session cookie is automatically sent with fetch requests
    const authState = window.authGuard?.getAuthState?.() || {};
    if (!authState.isSignedIn) {
      console.warn('[Projects] Not authenticated');
      return [];
    }
    
    const response = await fetch('/api/projects', {
      credentials: 'include', // Include cookies for session auth
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('[Projects] Failed to fetch projects:', response.status);
      return [];
    }
    
    const data = await response.json();
    availableProjects = data.projects || [];
    return availableProjects;
  } catch (error) {
    console.error('[Projects] Error fetching projects:', error);
    return [];
  }
}

/**
 * Render the project dropdown in the start panel
 */
function renderProjectDropdown() {
  const projectSelect = document.getElementById('projectSelect');
  if (!projectSelect) return;

  // Hide the entire project field when no projects exist
  const fieldContainer = projectSelect.closest('.field');
  if (availableProjects.length === 0) {
    if (fieldContainer) fieldContainer.style.display = 'none';
    return;
  }

  if (fieldContainer) fieldContainer.style.display = '';
  projectSelect.innerHTML = `
    <option value="">${t('labels.selectProject')}</option>
    ${availableProjects.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
  `;
}

/**
 * Get the selected project's input flow config
 * @param {string} projectId - Project ID
 * @returns {Object} Input flow configuration
 */
function getProjectInputFlowConfig(projectId) {
  if (!projectId) return DEFAULT_INPUT_FLOW_CONFIG;
  
  const project = availableProjects.find(p => p.id === projectId);
  if (!project || !project.inputFlowConfig || Object.keys(project.inputFlowConfig).length === 0) {
    return DEFAULT_INPUT_FLOW_CONFIG;
  }
  
  return project.inputFlowConfig;
}

// Control buttons handlers
newSketchBtn.addEventListener('click', async () => {
  commitIdInputIfFocused();
  // Show start panel to choose date
  hideHome();
  selectedNode = null;
  selectedEdge = null;
  isDragging = false;
  pendingEdgeTail = null;
  pendingEdgePreview = null;
  // Reset modes to node creation by default
  currentMode = 'node';
  if (nodeModeBtn) nodeModeBtn.classList.add('active');
  if (homeNodeModeBtn) homeNodeModeBtn.classList.remove('active');
  if (drainageNodeModeBtn) drainageNodeModeBtn.classList.remove('active');
  if (edgeModeBtn) edgeModeBtn.classList.remove('active');
  selectedNode = null;
  selectedEdge = null;
  renderDetails();
  // Reset date input to today by default
  dateInput.value = new Date().toISOString().substr(0, 10);
  
  // Fetch and render projects
  await fetchProjects();
  renderProjectDropdown();
  
  startPanel.style.display = 'flex';
  showToast(t('toasts.startNew'));
  // If current sketch is not empty, reveal Cancel button
  if (cancelBtn) cancelBtn.style.display = (nodes.length || edges.length) ? 'inline-block' : 'none';
});

startBtn.addEventListener('click', () => {
  commitIdInputIfFocused();
  const dateVal = dateInput.value;
  if (!dateVal) {
    alert(t('alerts.pickDate'));
    return;
  }
  
  // Get selected project
  const projectSelect = document.getElementById('projectSelect');
  const selectedProjectId = projectSelect?.value || null;
  
  // If projects are available, require selection
  if (availableProjects.length > 0 && !selectedProjectId) {
    alert(t('alerts.selectProject') || 'Please select a project');
    return;
  }
  
  // Get the project's input flow config
  const inputFlowConfig = getProjectInputFlowConfig(selectedProjectId);
  
  // Confirm if existing sketch has content
  if ((nodes.length > 0 || edges.length > 0)) {
    const ok = confirm(t('confirms.newClears'));
    if (!ok) return;
  }
  
  // Create new sketch with project info
  newSketch(dateVal, selectedProjectId, inputFlowConfig);

  // Reset mode and button states on new sketch
  currentMode = 'node';
  if (nodeModeBtn) nodeModeBtn.classList.add('active');
  if (homeNodeModeBtn) homeNodeModeBtn.classList.remove('active');
  if (drainageNodeModeBtn) drainageNodeModeBtn.classList.remove('active');
  if (edgeModeBtn) edgeModeBtn.classList.remove('active');
  selectedNode = null;
  selectedEdge = null;
  startPanel.style.display = 'none';
  showToast(t('toasts.createdNew'));
  // Center on user's GPS location after a short delay so the creation toast shows first
  setTimeout(() => centerNewSketchOnUserLocation(), 2000);
});

// Cancel new sketch panel (only shown when sketch not empty)
if (cancelBtn) {
  cancelBtn.addEventListener('click', () => {
    commitIdInputIfFocused();
    startPanel.style.display = 'none';
    showToast('בוטל');
  });
}

// Mode selection buttons
if (nodeModeBtn) {
  nodeModeBtn.addEventListener('click', () => {
    commitIdInputIfFocused();
    currentMode = 'node';
    nodeModeBtn.classList.add('active');
    if (homeNodeModeBtn) homeNodeModeBtn.classList.remove('active');
    if (drainageNodeModeBtn) drainageNodeModeBtn.classList.remove('active');
    if (edgeModeBtn) edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
    pendingEdgeStartPosition = null;
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    showToast(t('toasts.nodeMode'));
  });
}
if (homeNodeModeBtn) {
  homeNodeModeBtn.addEventListener('click', () => {
    commitIdInputIfFocused();
    currentMode = 'home';
    homeNodeModeBtn.classList.add('active');
    if (nodeModeBtn) nodeModeBtn.classList.remove('active');
    if (drainageNodeModeBtn) drainageNodeModeBtn.classList.remove('active');
    if (edgeModeBtn) edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
    pendingEdgeStartPosition = null;
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    showToast(t('home'));
  });
}
if (drainageNodeModeBtn) {
  drainageNodeModeBtn.addEventListener('click', () => {
    commitIdInputIfFocused();
    currentMode = 'drainage';
    drainageNodeModeBtn.classList.add('active');
    if (nodeModeBtn) nodeModeBtn.classList.remove('active');
    if (homeNodeModeBtn) homeNodeModeBtn.classList.remove('active');
    if (edgeModeBtn) edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
    pendingEdgeStartPosition = null;
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    showToast(t('drainage'));
  });
}
if (edgeModeBtn) {
  edgeModeBtn.addEventListener('click', () => {
    commitIdInputIfFocused();
    currentMode = 'edge';
    edgeModeBtn.classList.add('active');
    if (nodeModeBtn) nodeModeBtn.classList.remove('active');
    if (homeNodeModeBtn) homeNodeModeBtn.classList.remove('active');
    if (drainageNodeModeBtn) drainageNodeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
    pendingEdgeStartPosition = null;
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    showToast(t('toasts.edgeMode'));
  });
}
// Zoom buttons
if (zoomInBtn) {
  zoomInBtn.addEventListener('click', () => {
    setZoom(viewScale * SCALE_STEP);
  });
}
if (zoomOutBtn) {
  zoomOutBtn.addEventListener('click', () => {
    setZoom(viewScale / SCALE_STEP);
  });
}
// No explicit edit button; edit works contextually in Node mode via right-click or double-click.

// Export nodes CSV
if (exportNodesBtn) {
  exportNodesBtn.addEventListener('click', () => {
    if (nodes.length === 0) {
      alert(t('alerts.noNodesToExport'));
      return;
    }
    const csvContent = 'sep=,\r\n' + exportNodesCsv(nodes, adminConfig, t).replace(/\n/g, '\r\n');
    // Encode as UTF-16LE with BOM for best compatibility with Excel on Windows
    const bytes = encodeUtf16LeWithBom(csvContent);
    const blob = new Blob([bytes], { type: 'text/csv;charset=utf-16le;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const datePart = creationDate || new Date().toISOString().substr(0, 10);
    a.download = `nodes_${datePart}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // Do not clear storage so user can export edges separately
    showToast(t('toasts.nodesExported'));
  });
}

// Export edges CSV
if (exportEdgesBtn) {
  exportEdgesBtn.addEventListener('click', () => {
    if (edges.length === 0) {
      alert(t('alerts.noEdgesToExport'));
      return;
    }
    const csvContent = 'sep=,\r\n' + exportEdgesCsv(edges, adminConfig, t).replace(/\n/g, '\r\n');
    // Encode as UTF-16LE with BOM for best compatibility with Excel on Windows
    const bytes = encodeUtf16LeWithBom(csvContent);
    const blob = new Blob([bytes], { type: 'text/csv;charset=utf-16le;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const datePart = creationDate || new Date().toISOString().substr(0, 10);
    a.download = `edges_${datePart}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // Do not clear storage here
    showToast(t('toasts.edgesExported'));
  });
}

// Export dropdown toggle - Now handled by main-entry.js initCommandDropdown()
// The new implementation uses fixed positioning to avoid overflow clipping issues

// Export complete sketch as JSON
if (exportSketchBtn) {
  exportSketchBtn.addEventListener('click', () => {
    if (nodes.length === 0 && edges.length === 0) {
      alert(t('alerts.noSketchToExport'));
      return;
    }
    try {
      const sketchData = {
        nodes: nodes,
        edges: edges,
        nextNodeId: nextNodeId,
        creationDate: creationDate,
        sketchId: currentSketchId,
        sketchName: currentSketchName,
      };
      exportSketchToJson(sketchData);
      showToast(t('toasts.sketchExported'));
    } catch (error) {
      console.error('[App] Export error:', error.message);
      alert(t('alerts.exportFailed'));
    }
  });
}

// Import sketch from JSON
if (importSketchBtn && importSketchFile) {
  importSketchBtn.addEventListener('click', () => {
    // Trigger file picker
    importSketchFile.click();
  });

  importSketchFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const importedSketch = await importSketchFromJson(file);

      // Ask user if they want to replace current sketch or create new
      const hasCurrentSketch = nodes.length > 0 || edges.length > 0;
      let shouldReplace = true;

      if (hasCurrentSketch) {
        shouldReplace = confirm(t('alerts.confirmImportReplace'));
        if (!shouldReplace) {
          // Reset file input
          importSketchFile.value = '';
          return;
        }
      }

      // Load the imported sketch
      nodes = importedSketch.nodes;
      edges = importedSketch.edges;
      nextNodeId = importedSketch.nextNodeId;
      creationDate = importedSketch.creationDate;
      currentSketchId = null; // Will get new ID when saved
      currentSketchName = importedSketch.sketchName;
      currentProjectId = importedSketch.projectId || null;
      currentInputFlowConfig = importedSketch.inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
      updateSketchNameDisplay();

      // Recompute node types and save
      computeNodeTypes();
      saveToStorage();
      draw();
      renderDetails();

      // Recenter view
      try { recenterView(); } catch (_) { }

      showToast(t('toasts.sketchImported'));

    } catch (error) {
      console.error('[App] Import error:', error.message);
      alert(t('alerts.importFailed') + '\n' + error.message);
    } finally {
      // Reset file input so same file can be imported again
      importSketchFile.value = '';
    }
  });
}

// Home/Library controls
if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    renderHome();
  });
}
if (createFromHomeBtn) {
  createFromHomeBtn.addEventListener('click', () => {
    hideHome();
    startPanel.style.display = 'flex';
  });
}
// Close button for home panel
const homePanelCloseBtn = document.getElementById('homePanelCloseBtn');
if (homePanelCloseBtn) {
  homePanelCloseBtn.addEventListener('click', () => {
    if (homeMode === 'projects') return; // Projects page is the landing page
    hideHome();
  });
}
if (sketchListEl) {
  sketchListEl.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    // Inline title editing: clicking on title turns it into an input
    if (target.classList.contains('sketch-title')) {
      const id = target.getAttribute('data-id');
      if (!id) return;
      const lib = getLibrary();
      const rec = lib.find((r) => r.id === id);
      if (!rec) return;
      const originalTitle = (target.textContent || '').trim();
      const hadExplicitName = !!(rec.name && rec.name.trim().length > 0);
      const currentValue = hadExplicitName ? rec.name : originalTitle;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentValue;
      input.style.fontWeight = 'bold';
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';
      input.setAttribute('data-id', id);
      // Replace the title div with the input
      target.replaceWith(input);
      input.focus();
      // Select all text for quick overwrite
      input.select();
      const commit = () => {
        const newVal = input.value.trim();
        if (newVal.length === 0) {
          rec.name = null;
        } else if (!hadExplicitName && newVal === originalTitle) {
          // User didn't change the fallback title; keep name as null
          rec.name = null;
        } else {
          rec.name = newVal;
        }
        rec.updatedAt = new Date().toISOString();
        rec.lastEditedBy = getCurrentUsername();
        
        setLibrary(lib);

        if (currentSketchId === rec.id) {
          currentSketchName = rec.name || null;
          updateSketchNameDisplay();
          saveToStorage();
        } else {
          // If not the current sketch, we still need to persist to IndexedDB and Sync to Cloud
          idbSaveRecordCompat(rec);
          if (window.syncService?.debouncedSyncToCloud) {
            window.syncService.debouncedSyncToCloud(rec);
          }
        }
        
        renderHome();
        showToast(t('toasts.renamed'));
      };
      const cancel = () => {
        renderHome();
      };
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') commit();
        else if (ke.key === 'Escape') cancel();
      });
      input.addEventListener('blur', commit);
      return;
    }
    // Find the closest button with data-action (handles clicks on child spans)
    const actionBtn = target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.getAttribute('data-action');
    const id = actionBtn.getAttribute('data-id');
    if (!action || !id) return;
    if (action === 'open') {
      hideHome();
      await loadFromLibrary(id);
      showToast(t('toasts.opened'));
    } else if (action === 'duplicate') {
      const lib = getLibrary();
      const rec = lib.find((r) => r.id === id);
      if (rec) {
        const now = new Date().toISOString();
        const copy = { 
          ...rec, 
          id: generateSketchId(), 
          createdAt: now, 
          updatedAt: now,
          lastEditedBy: getCurrentUsername()
        };
        lib.unshift(copy);
        setLibrary(lib);
        
        // Persist duplicate to IndexedDB and Sync to Cloud
        idbSaveRecordCompat(copy);
        if (window.syncService?.debouncedSyncToCloud) {
          window.syncService.debouncedSyncToCloud(copy);
        }
        
        renderHome();
        showToast(t('toasts.duplicated'));
      }
    } else if (action === 'changeProject') {
      handleChangeProject(id);
    } else if (action === 'delete') {
      const ok = confirm(t('confirms.deleteSketch'));
      if (!ok) return;
      deleteFromLibrary(id);
      renderHome();
      showToast(t('toasts.deleted'));
    } else if (action === 'openProject') {
      location.hash = '#/project/' + id;
    } else if (action === 'importHistory') {
      const lib = getLibrary();
      const rec = lib.find((r) => r.id === id);
      if (rec) {
        const imported = importFieldHistoryFromSketch(rec);
        if (imported > 0) {
          showToast(`${t('labels.importHistorySuccess')} (${imported})`);
        }
      }
    }
  });
}

// Save button and autosave toggle
if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    // Show feedback immediately for responsive UI
    showToast(t('toasts.saved'));
    
    // Defer heavy save work to avoid blocking UI
    const doSave = () => {
      const before = autosaveEnabled;
      autosaveEnabled = false; // avoid double-save side effects
      saveToLibrary();
      autosaveEnabled = before;
      saveToStorage();
    };
    
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(doSave, { timeout: 50 });
    } else {
      setTimeout(doSave, 0);
    }
  });
}
if (autosaveToggle) {
  const savedPref = localStorage.getItem(STORAGE_KEYS.autosave);
  if (savedPref !== null) autosaveEnabled = savedPref === 'true';
  autosaveToggle.checked = autosaveEnabled;
  autosaveToggle.addEventListener('change', () => {
    autosaveEnabled = !!autosaveToggle.checked;
    localStorage.setItem(STORAGE_KEYS.autosave, String(autosaveEnabled));
    showToast(autosaveEnabled ? t('toasts.autosaveOn') : t('toasts.autosaveOff'));
    if (autosaveEnabled) saveToLibrary();
  });
}

// Load size scale preference
try {
  const savedSizeScale = localStorage.getItem(STORAGE_KEYS.sizeScale);
  if (savedSizeScale !== null) {
    const parsed = parseFloat(savedSizeScale);
    if (!isNaN(parsed) && parsed >= MIN_SIZE_SCALE && parsed <= MAX_SIZE_SCALE) {
      sizeScale = parsed;
    }
  }
} catch (e) {
  console.warn('[App] Failed to load size scale preference:', e.message);
}

// Size control buttons
function increaseSizeScale() {
  const newScale = Math.min(sizeScale + SIZE_SCALE_STEP, MAX_SIZE_SCALE);
  if (newScale !== sizeScale) {
    sizeScale = newScale;
    localStorage.setItem(STORAGE_KEYS.sizeScale, String(sizeScale));
    scheduleDraw();
    const pct = Math.round(sizeScale * 100);
    showToast(t('toasts.sizeChanged', pct));
  }
}

function decreaseSizeScale() {
  const newScale = Math.max(sizeScale - SIZE_SCALE_STEP, MIN_SIZE_SCALE);
  if (newScale !== sizeScale) {
    sizeScale = newScale;
    localStorage.setItem(STORAGE_KEYS.sizeScale, String(sizeScale));
    scheduleDraw();
    const pct = Math.round(sizeScale * 100);
    showToast(t('toasts.sizeChanged', pct));
  }
}

if (sizeIncreaseBtn) {
  sizeIncreaseBtn.addEventListener('click', increaseSizeScale);
}
if (sizeDecreaseBtn) {
  sizeDecreaseBtn.addEventListener('click', decreaseSizeScale);
}
if (mobileSizeIncreaseBtn) {
  mobileSizeIncreaseBtn.addEventListener('click', increaseSizeScale);
}
if (mobileSizeDecreaseBtn) {
  mobileSizeDecreaseBtn.addEventListener('click', decreaseSizeScale);
}

// Help modal controls
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

// Language selector
menuEvents.on('languageChange', ({ value, element }) => {
  const newValue = value === 'en' ? 'en' : 'he';
  currentLang = newValue;
  try { window.currentLang = currentLang; } catch (_) { }
  localStorage.setItem(STORAGE_KEYS.lang, currentLang);
  
  // Sync all language selects
  document.querySelectorAll('[data-action="languageChange"]').forEach(select => {
    if (select.value !== newValue) {
      select.value = newValue;
    }
  });

  applyLangToStaticUI();
  // Dispatch custom event for language change (for floating keyboard and other modules)
  document.dispatchEvent(new Event('appLanguageChanged'));
  // Re-render dynamic lists and details with translated labels
  if (homePanel && homePanel.style.display === 'flex') {
    renderHome();
  }
  renderDetails();
  // If admin modal is open, rebuild its UI to apply new translations
  if (adminModal && adminModal.style.display !== 'none') {
    openAdminModal();
  }
  // If admin screen is active (#/admin), rebuild it as well
  try {
    if (location.hash === '#/admin') {
      openAdminScreen();
    }
  } catch (_) { }

  // Close mobile menu if change came from mobile
  if (element && element.id === 'mobileLangSelect') {
    closeMobileMenu();
  }
});

// === Mobile menu controls ===
// Delegate to the main-entry.js closeMobileMenu (which properly manages
// the isMobileMenuOpen state and accessibility attributes).
// Falls back to direct DOM manipulation if the window version isn't available yet.
function closeMobileMenu() {
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
    setZoom(viewScale * SCALE_STEP);
  });
}
if (mobileZoomOutBtn) {
  mobileZoomOutBtn.addEventListener('click', () => {
    closeMobileMenu();
    setZoom(viewScale / SCALE_STEP);
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

// === Finish Workday Functionality ===

/**
 * Get all dangling edges (edges with head === null)
 * @returns {Array} Array of dangling edge objects
 */
function getDanglingEdges() {
  return edges.filter(e => e.head === null || e.isDangling === true);
}

/**
 * Show the finish workday modal
 */
function showFinishWorkdayModal() {
  const danglingEdgesList = getDanglingEdges();
  
  if (danglingEdgesList.length === 0) {
    // No dangling edges - proceed directly
    completeFinishWorkday();
    return;
  }
  
  // Show modal with dangling edges
  if (finishWorkdayModal) {
    finishWorkdayModal.classList.remove('panel-closing');
    finishWorkdayModal.style.display = 'flex';
    renderDanglingEdgesForm(danglingEdgesList);
  }
}

/**
 * Render the form for resolving dangling edges
 * @param {Array} danglingEdgesList - Array of dangling edges
 */
function renderDanglingEdgesForm(danglingEdgesList) {
  if (!danglingEdgesListEl) return;
  
  // Update description text
  if (finishWorkdayDescEl) {
    finishWorkdayDescEl.textContent = t('labels.resolveDanglingDesc');
  }
  if (finishWorkdayTitleEl) {
    const titleText = finishWorkdayTitleEl.querySelector('.finish-workday-title-text');
    if (titleText) titleText.textContent = t('finishWorkday.title');
  }
  
  danglingEdgesListEl.innerHTML = danglingEdgesList.map((edge, index) => {
    const tailNode = nodes.find(n => n.id === edge.tail);
    const tailLabel = tailNode ? `${edge.tail}` : edge.tail;
    
    return `
      <div class="dangling-edge-item" data-edge-id="${edge.id}">
        <div class="dangling-edge-item-header">
          <span class="material-icons">call_missed_outgoing</span>
          <span>${t('labels.danglingEdge')}: ${tailLabel} → ?</span>
        </div>
        <select class="dangling-edge-select" data-edge-index="${index}">
          <option value="">${t('labels.selectNodeType')}</option>
          <option value="Manhole">${t('modeNode')}</option>
          <option value="Home">${t('modeHome')}</option>
          <option value="ForLater">${t('modeForLater')}</option>
        </select>
      </div>
    `;
  }).join('');
  
  // Update button texts
  if (finishWorkdayCancelBtn) {
    finishWorkdayCancelBtn.textContent = t('cancel');
  }
  if (finishWorkdayConfirmBtn) {
    const confirmText = finishWorkdayConfirmBtn.querySelector('span:last-child');
    if (confirmText) confirmText.textContent = t('finishWorkday.confirm');
  }
}

/**
 * Close the finish workday modal
 */
function closeFinishWorkdayModal() {
  if (finishWorkdayModal) {
    hidePanelAnimated(finishWorkdayModal);
  }
}

/**
 * Resolve dangling edges by creating nodes at their endpoints
 * @returns {boolean} True if all dangling edges were resolved
 */
function resolveDanglingEdges() {
  const danglingEdgesList = getDanglingEdges();
  const selects = danglingEdgesListEl?.querySelectorAll('.dangling-edge-select') || [];
  
  // Check all selections are made
  for (const select of selects) {
    if (!select.value) {
      showToast(t('finishWorkday.resolveFirst'));
      return false;
    }
  }
  
  // Create nodes for each dangling edge
  danglingEdgesList.forEach((edge, index) => {
    const select = selects[index];
    if (!select || !select.value) return;
    
    const nodeType = select.value;
    const tailNode = nodes.find(n => n.id === edge.tail);
    
    // Calculate position for new node
    let newX, newY;
    if (edge.danglingEndpoint) {
      newX = edge.danglingEndpoint.x;
      newY = edge.danglingEndpoint.y;
    } else if (tailNode) {
      // Default offset from tail node
      newX = tailNode.x + 80;
      newY = tailNode.y - 40;
    } else {
      newX = 100;
      newY = 100;
    }
    
    // Create the new node
    const newNode = createNode(newX, newY);
    newNode.nodeType = nodeType;
    
    // Update the edge to connect to the new node
    edge.head = newNode.id;
    edge.isDangling = false;
    edge.danglingEndpoint = null;
  });
  
  computeNodeTypes();
  saveToStorage();
  scheduleDraw();
  
  return true;
}

/**
 * Complete the finish workday process
 */
async function completeFinishWorkday() {
  try {
    // Clear hourly backups
    await clearHourlyBackups();
    
    // Save daily backup
    await saveDailyBackup();
    
    // Export nodes and edges CSV (optional - could prompt user)
    // For now, just save the sketch and sync
    saveToStorage();
    
    // Force immediate sync if online
    if (currentSketchId && window.syncService?.syncSketchToCloud) {
      const sketchForSync = {
        id: currentSketchId,
        name: currentSketchName,
        creationDate: creationDate,
        nodes: nodes,
        edges: edges,
        adminConfig: typeof adminConfig !== 'undefined' ? adminConfig : {},
        lastEditedBy: getCurrentUsername(),
        lastEditedAt: new Date().toISOString(),
      };
      await window.syncService.syncSketchToCloud(sketchForSync);
    }
    
    showToast(t('toasts.finishWorkdaySuccess'));
    closeFinishWorkdayModal();
    scheduleDraw();
    
  } catch (error) {
    console.error('[App] Error completing finish workday:', error.message);
    showToast(t('finishWorkday.error') || 'Error completing workday');
  }
}

// Finish Workday button handlers
if (finishWorkdayBtn) {
  finishWorkdayBtn.addEventListener('click', () => {
    // Close dropdown menu first
    if (exportDropdown) exportDropdown.classList.remove('menu-dropdown--open');
    showFinishWorkdayModal();
  });
}

if (mobileFinishWorkdayBtn) {
  mobileFinishWorkdayBtn.addEventListener('click', () => {
    closeMobileMenu();
    showFinishWorkdayModal();
  });
}

// Modal close handlers
if (finishWorkdayCloseBtn) {
  finishWorkdayCloseBtn.addEventListener('click', closeFinishWorkdayModal);
}

if (finishWorkdayCancelBtn) {
  finishWorkdayCancelBtn.addEventListener('click', closeFinishWorkdayModal);
}

// Confirm button handler
if (finishWorkdayConfirmBtn) {
  finishWorkdayConfirmBtn.addEventListener('click', async () => {
    const danglingEdgesList = getDanglingEdges();
    
    if (danglingEdgesList.length > 0) {
      // Need to resolve dangling edges first
      if (!resolveDanglingEdges()) {
        return; // Resolution failed or incomplete
      }
    }
    
    // Proceed with finish workday
    await completeFinishWorkday();
  });
}

// Close modal when clicking backdrop
if (finishWorkdayModal) {
  finishWorkdayModal.addEventListener('click', (e) => {
    if (e.target === finishWorkdayModal) {
      closeFinishWorkdayModal();
    }
  });
}

// ============================================
// Coordinate System Handlers
// ============================================

/**
 * Handle importing coordinates from CSV file
 * @param {File} file - The CSV file to import
 */
async function handleCoordinatesImport(file) {
  try {
    const newCoordinates = await importCoordinatesFromFile(file);
    
    if (newCoordinates.size === 0) {
      showToast(t('coordinates.noCoordinatesFound') || 'לא נמצאו קואורדינטות בקובץ');
      return;
    }
    
    // Debug: Log imported coordinates
    console.debug('[Coordinates] === IMPORT DEBUG ===');
    console.debug('[Coordinates] Imported coordinates count:', newCoordinates.size);
    console.debug('[Coordinates] Sample coordinates (first 5):');
    let count = 0;
    for (const [pointId, coords] of newCoordinates.entries()) {
      if (count++ < 5) {
        console.debug(`[Coordinates]   Point ID "${pointId}":`, coords);
      }
    }
    
    // Debug: Log current node IDs
    console.debug('[Coordinates] Current node IDs in sketch:', nodes.map(n => `"${n.id}" (type: ${typeof n.id})`).slice(0, 10));
    
    // Check for matches
    const matchingIds = [];
    const nonMatchingNodeIds = [];
    nodes.forEach(node => {
      const nodeIdStr = String(node.id);
      if (newCoordinates.has(nodeIdStr)) {
        matchingIds.push(nodeIdStr);
      } else {
        nonMatchingNodeIds.push(nodeIdStr);
      }
    });
    console.debug('[Coordinates] Matching node IDs:', matchingIds.length, matchingIds.slice(0, 10));
    console.debug('[Coordinates] Non-matching node IDs:', nonMatchingNodeIds.length, nonMatchingNodeIds.slice(0, 10));
    
    // Check if any coordinate point_ids match node IDs
    const coordPointIds = Array.from(newCoordinates.keys());
    console.debug('[Coordinates] Coordinate point_ids (first 10):', coordPointIds.slice(0, 10));
    
    // Store coordinates
    coordinatesMap = newCoordinates;
    saveCoordinatesToStorage(coordinatesMap);
    
    // Show success message with match info
    const matchCount = matchingIds.length;
    const totalNodes = nodes.length;
    showToast(`נטענו ${newCoordinates.size} קואורדינטות, ${matchCount}/${totalNodes} שוחות תואמות`);
    
    // Automatically enable coordinates if not already enabled
    if (!coordinatesEnabled) {
      coordinatesEnabled = true;
      saveCoordinatesEnabled(true);
      syncCoordinatesToggleUI();
      applyCoordinatesIfEnabled();
    } else {
      // Re-apply if already enabled
      applyCoordinatesIfEnabled();
    }
    
    scheduleDraw();
    
  } catch (error) {
    console.error('[Coordinates] Failed to import coordinates:', error.message);
    showToast(t('coordinates.importError') || 'שגיאה בטעינת קואורדינטות');
  }
}

/**
 * Apply coordinates to nodes if enabled
 * Stores original positions and updates node positions based on survey coordinates
 * @param {Object} options - Options for applying coordinates
 * @param {boolean} options.recenter - Whether to recenter the view (default: true)
 * @param {number} options.oldScale - Previous scale value (for maintaining focus during scale change)
 */
function applyCoordinatesIfEnabled(options = {}) {
  const { recenter = true, oldScale = null } = options;
  
  if (!coordinatesEnabled || coordinatesMap.size === 0) {
    return;
  }
  
  // Store original positions before applying coordinates (if not already stored)
  nodes.forEach(node => {
    if (!originalNodePositions.has(node.id)) {
      originalNodePositions.set(node.id, { x: node.x, y: node.y });
    }
  });
  
  // Get canvas dimensions - use actual canvas size, not bounding rect
  // canvas.width and canvas.height are the actual pixel dimensions
  let canvasWidth = canvas.width;
  let canvasHeight = canvas.height;
  
  // If canvas dimensions are not yet set, use sensible defaults
  if (!canvasWidth || canvasWidth <= 0) {
    const rect = canvas.getBoundingClientRect();
    canvasWidth = rect.width || 800;
  }
  if (!canvasHeight || canvasHeight <= 0) {
    const rect = canvas.getBoundingClientRect();
    canvasHeight = rect.height || 600;
  }
  
  // Account for device pixel ratio if set
  const dpr = window.devicePixelRatio || 1;
  const logicalWidth = canvasWidth / dpr;
  const logicalHeight = canvasHeight / dpr;
  
  // Canvas center in world/logical coordinates (where survey center maps to)
  const canvasCenterX = logicalWidth / 2;
  const canvasCenterY = logicalHeight / 2;
  
  // If we're changing scale (not recentering), capture current view center for focus preservation
  let worldCenterBeforeChange = null;
  if (!recenter && oldScale !== null && oldScale !== coordinateScale) {
    // Get the current screen center in world coordinates
    const rect = canvas.getBoundingClientRect();
    const screenCenterX = rect.width / 2;
    const screenCenterY = rect.height / 2;
    worldCenterBeforeChange = screenToWorld(screenCenterX, screenCenterY);
  }
  
  console.debug('[Coordinates] Canvas dimensions for coordinate transform:', {
    canvasWidth,
    canvasHeight,
    logicalWidth,
    logicalHeight,
    dpr
  });
  
  // Apply coordinates to matching nodes using logical (CSS) dimensions and current scale
  const result = applyCoordinatesToNodes(nodes, coordinatesMap, logicalWidth, logicalHeight, coordinateScale);
  nodes = result.updatedNodes;
  
  // Log results for debugging
  console.debug(`[Coordinates] Applied: ${result.matchedCount} matched, ${result.unmatchedCount} unmatched`);
  
  // Approximate positions for nodes without coordinates based on their neighbors
  // Pass original positions to calculate distance ratios
  if (result.unmatchedCount > 0 && result.matchedCount > 0) {
    nodes = approximateUncoordinatedNodePositions(nodes, edges, originalNodePositions);
  }
  
  // Handle view adjustment based on options
  if (recenter) {
    // Auto-recenter view after applying coordinates (first time or explicit recenter)
    recenterView();
  } else if (worldCenterBeforeChange !== null && oldScale !== null) {
    // Maintain focus on the same part of the sketch during scale change
    // When scale changes, node positions move relative to canvas center
    // Calculate where the old world center point now is after the scale change
    const scaleRatio = coordinateScale / oldScale;
    
    // The world center point moves: new position = canvasCenter + (oldPos - canvasCenter) * scaleRatio
    const newWorldCenterX = canvasCenterX + (worldCenterBeforeChange.x - canvasCenterX) * scaleRatio;
    const newWorldCenterY = canvasCenterY + (worldCenterBeforeChange.y - canvasCenterY) * scaleRatio;
    
    // Adjust viewTranslate so the new world position appears at screen center
    const rect = canvas.getBoundingClientRect();
    const screenCenterX = rect.width / 2;
    const screenCenterY = rect.height / 2;
    
    viewTranslate.x = screenCenterX - viewScale * viewStretchX * newWorldCenterX;
    viewTranslate.y = screenCenterY - viewScale * viewStretchY * newWorldCenterY;
  }
  
  // Update map reference point and precache tiles for measurement area when map is on
  if (mapLayerEnabled) {
    updateMapReferencePoint();
    startMeasurementTilesPrecache();
  } else {
    // Even without map layer, update reference point for Street View pegman
    updateMapReferencePoint();
  }
  
  saveToStorage();
  scheduleDraw();
}

/**
 * Restore original node positions (when coordinates are disabled)
 */
function restoreOriginalPositions() {
  nodes.forEach(node => {
    const original = originalNodePositions.get(node.id);
    if (original) {
      node.x = original.x;
      node.y = original.y;
    }
  });

  zoomToFit();
  saveToStorage();
}

/**
 * Toggle coordinates enabled/disabled
 */
function toggleCoordinates(enabled) {
  coordinatesEnabled = enabled;
  saveCoordinatesEnabled(enabled);
  syncCoordinatesToggleUI();

  if (enabled) {
    // If we have saved geographic positions from a previous reposition, use those
    // to avoid canvas-dimension-dependent recalculation
    if (geoNodePositions.size > 0) {
      nodes.forEach(node => {
        const geo = geoNodePositions.get(String(node.id));
        if (geo) {
          node.x = geo.x;
          node.y = geo.y;
        }
      });
      zoomToFit();
      saveToStorage();
    } else {
      // First time: run full repositioning pipeline
      const hasEmbeddedCoords = nodes && nodes.some(n => n.surveyX != null && n.surveyY != null);
      if (hasEmbeddedCoords) {
        autoRepositionFromEmbeddedCoords();
      } else {
        applyCoordinatesIfEnabled();
      }
    }
  } else {
    restoreOriginalPositions();
  }
  
  const msg = enabled 
    ? (t('coordinates.enabled') || 'קואורדינטות הופעלו')
    : (t('coordinates.disabled') || 'קואורדינטות כובו');
  showToast(msg);
}

/**
 * Sync the coordinates toggle UI elements
 */
function syncCoordinatesToggleUI() {
  if (coordinatesToggle) {
    coordinatesToggle.checked = coordinatesEnabled;
  }
  if (mobileCoordinatesToggle) {
    mobileCoordinatesToggle.checked = coordinatesEnabled;
  }
}

/**
 * Toggle map layer enabled/disabled
 */
function toggleMapLayer(enabled) {
  mapLayerEnabled = enabled;
  setMapLayerEnabled(enabled);
  saveMapSettings();
  syncMapLayerToggleUI();
  
  // Set up reference point (and precache tiles for measurement area) when enabling map
  if (enabled) {
    updateMapReferencePoint();
  }
  
  const msg = enabled 
    ? (t('mapLayer.enabled') || 'Map layer enabled')
    : (t('mapLayer.disabled') || 'Map layer disabled');
  showToast(msg);
  scheduleDraw();
}

/**
 * Sync the map layer toggle UI elements
 */
function syncMapLayerToggleUI() {
  if (mapLayerToggle) {
    mapLayerToggle.checked = mapLayerEnabled;
  }
  if (mobileMapLayerToggle) {
    mobileMapLayerToggle.checked = mapLayerEnabled;
  }
  
  const currentType = getMapType();
  if (mapTypeSelect) {
    mapTypeSelect.value = currentType;
  }
  if (mobileMapTypeSelect) {
    mobileMapTypeSelect.value = currentType;
  }
}

/**
 * Get ITM bounds of all nodes that have survey coordinates (measurement polygon extent).
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number } | null}
 */
function getMeasurementBoundsItm() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasAny = false;
  for (const node of nodes) {
    if (node.surveyX != null && node.surveyY != null) {
      if (node.surveyX < minX) minX = node.surveyX;
      if (node.surveyY < minY) minY = node.surveyY;
      if (node.surveyX > maxX) maxX = node.surveyX;
      if (node.surveyY > maxY) maxY = node.surveyY;
      hasAny = true;
    }
  }
  if (!hasAny && coordinatesMap.size > 0) {
    for (const node of nodes) {
      const coords = coordinatesMap.get(String(node.id));
      if (coords) {
        if (coords.x < minX) minX = coords.x;
        if (coords.y < minY) minY = coords.y;
        if (coords.x > maxX) maxX = coords.x;
        if (coords.y > maxY) maxY = coords.y;
        hasAny = true;
      }
    }
  }
  if (!hasAny || !Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

/**
 * Start precaching map tiles for the measurement extent so tiles are ready when viewing.
 */
function startMeasurementTilesPrecache() {
  const bounds = getMeasurementBoundsItm();
  if (bounds) precacheTilesForMeasurementBounds(bounds);
}

/**
 * Update the map reference point from available survey coordinates
 */
function updateMapReferencePoint() {
  // Find a node with survey coordinates to use as reference
  for (const node of nodes) {
    if (node.surveyX != null && node.surveyY != null) {
      const refPoint = createReferenceFromNode(node);
      if (refPoint) {
        console.debug('[Map] Reference point set from node surveyX/surveyY:', refPoint);
        setMapReferencePoint(refPoint);
        startMeasurementTilesPrecache();
        setStreetViewVisible(true);
        return true;
      }
    }
  }
  
  // No reference point available - check if coordinates are loaded
  if (coordinatesMap.size > 0) {
    // Find a node that has coordinates in the map
    for (const node of nodes) {
      const coords = coordinatesMap.get(String(node.id));
      if (coords) {
        const refPoint = {
          itm: { x: coords.x, y: coords.y },
          canvas: { x: node.x, y: node.y }
        };
        console.debug('[Map] Reference point set from coordinatesMap:', refPoint);
        setMapReferencePoint(refPoint);
        startMeasurementTilesPrecache();
        setStreetViewVisible(true);
        return true;
      }
    }
  }
  
  // Fallback: use a default location in central Israel (Tel Aviv area)
  // This allows testing the map layer without loading coordinates
  const rect = canvas.getBoundingClientRect();
  const canvasCenterX = rect.width / 2;
  const canvasCenterY = rect.height / 2;
  
  // Default ITM coordinates for Tel Aviv area (approximately)
  const defaultItm = {
    x: 180000,  // ITM Easting
    y: 665000   // ITM Northing
  };
  
  const refPoint = {
    itm: defaultItm,
    canvas: { x: canvasCenterX, y: canvasCenterY }
  };
  
  console.debug('[Map] Reference point set to default (Tel Aviv area):', refPoint);
  setMapReferencePoint(refPoint);
  // Show street-view pegman whenever a reference point becomes available
  setStreetViewVisible(true);
  return true;
}

/**
 * Auto-reposition nodes from embedded geographic coordinates on sketch load.
 * Called from loadFromStorage() and loadFromLibrary() after normalization.
 * - Nodes with coords: repositioned to correct canvas positions
 * - Nodes without coords: marked _hidden = true (not drawn)
 * - If zero nodes have coords but sketch is non-empty: prompt dialog
 */
function autoRepositionFromEmbeddedCoords() {
  if (!nodes || nodes.length === 0) return;
  // In project-canvas mode, global repositioning handles all sketches
  if (isProjectCanvasMode()) return;

  const classification = classifySketchCoordinates(nodes, wgs84ToItm);
  console.debug('[Coordinates] Sketch classification:', classification);

  if (classification.withCoords > 0) {
    // Save original node positions before repositioning
    for (const node of nodes) {
      if (!originalNodePositions.has(node.id)) {
        originalNodePositions.set(node.id, { x: node.x, y: node.y });
      }
    }

    // Get logical canvas dimensions
    const dpr = window.devicePixelRatio || 1;
    const logicalW = (canvas.width / dpr) || 800;
    const logicalH = (canvas.height / dpr) || 600;

    const { referencePoint } = repositionNodesFromEmbeddedCoordinates(
      nodes, coordinateScale, logicalW, logicalH, wgs84ToItm
    );

    // Reposition uncoordinated nodes relative to coordinated neighbors
    const hiddenNodes = nodes.filter(n => n._hidden);
    if (hiddenNodes.length > 0) {
      const nodeMap = new Map();
      for (const n of nodes) nodeMap.set(String(n.id), n);

      for (const node of hiddenNodes) {
        // Find a connected coordinated neighbor via edges
        let placed = false;
        for (const edge of edges) {
          const tailId = String(edge.tail);
          const headId = String(edge.head);
          const nodeId = String(node.id);
          let neighborId = null;
          if (tailId === nodeId) neighborId = headId;
          else if (headId === nodeId) neighborId = tailId;
          if (!neighborId) continue;

          const neighbor = nodeMap.get(neighborId);
          if (!neighbor || neighbor._hidden) continue;

          // Apply the same offset as in original positions
          const origNode = originalNodePositions.get(node.id) || originalNodePositions.get(String(node.id));
          const origNeighbor = originalNodePositions.get(neighbor.id) || originalNodePositions.get(String(neighbor.id));
          if (origNode && origNeighbor) {
            const dx = origNode.x - origNeighbor.x;
            const dy = origNode.y - origNeighbor.y;
            node.x = neighbor.x + dx;
            node.y = neighbor.y + dy;
          } else {
            node.x = neighbor.x + 20;
            node.y = neighbor.y + 20;
          }
          node._hidden = false;
          placed = true;
          break;
        }
        // Fallback: place near centroid of coordinated nodes
        if (!placed) {
          const coordNodes = nodes.filter(n => !n._hidden && n !== node);
          if (coordNodes.length > 0) {
            const cx = coordNodes.reduce((s, n) => s + n.x, 0) / coordNodes.length;
            const cy = coordNodes.reduce((s, n) => s + n.y, 0) / coordNodes.length;
            node.x = cx + (Math.random() - 0.5) * 40;
            node.y = cy + (Math.random() - 0.5) * 40;
          }
          node._hidden = false;
        }
      }
    }

    // Save geographic positions after repositioning and sync coordinatesMap
    for (const node of nodes) {
      geoNodePositions.set(String(node.id), { x: node.x, y: node.y });
      if (node.hasCoordinates && node.surveyX != null && node.surveyY != null) {
        coordinatesMap.set(String(node.id), {
          x: node.surveyX,
          y: node.surveyY,
          z: node.surveyZ || 0
        });
      }
    }
    saveCoordinatesToStorage(coordinatesMap);

    // Enable coordinates mode
    if (!coordinatesEnabled) {
      coordinatesEnabled = true;
      saveCoordinatesEnabled(true);
      syncCoordinatesToggleUI();
    }

    // Set the map reference point
    if (referencePoint) {
      setMapReferencePoint(referencePoint);
      setStreetViewVisible(true);
    }

    // Zoom to fit all repositioned nodes in view (deferred to allow canvas to render)
    requestAnimationFrame(() => zoomToFit());
  } else if (classification.total > 0) {
    // Non-empty sketch with zero coordinates → show prompt
    showCoordinatesRequiredPrompt();
  }
  // Empty sketch → do nothing
}

/**
 * Show a prompt dialog when a sketch has no geographic coordinates.
 * Options: Import CSV, Open without coordinates, Cancel (return to library).
 */
function showCoordinatesRequiredPrompt() {
  const overlay = document.createElement('div');
  overlay.className = 'projects-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'projects-modal';

  modal.innerHTML = `
    <div class="projects-modal-header">
      <h3>${t('coordinates.noCoordinatesTitle')}</h3>
      <button class="btn-icon projects-modal-close">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="projects-modal-body">
      <p>${t('coordinates.noCoordinatesBody')}</p>
    </div>
    <div class="projects-modal-footer" style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-primary" data-action="import">
        <span class="material-icons" style="font-size:18px;vertical-align:middle;margin-inline-end:4px;">upload_file</span>
        ${t('coordinates.import')}
      </button>
      <button class="btn btn-secondary" data-action="open">
        ${t('coordinates.openWithoutCoords')}
      </button>
      <button class="btn btn-secondary" data-action="cancel">
        ${t('cancel')}
      </button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  modal.querySelector('.projects-modal-close').addEventListener('click', closeModal);

  modal.querySelector('[data-action="import"]').addEventListener('click', () => {
    closeModal();
    // Trigger the existing coordinate file picker
    if (importCoordinatesFile) importCoordinatesFile.click();
  });

  modal.querySelector('[data-action="open"]').addEventListener('click', () => {
    closeModal();
    // Clear _hidden flags so all nodes become visible in freehand mode
    for (const node of nodes) {
      delete node._hidden;
    }
    scheduleDraw();
  });

  modal.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    closeModal();
    // Return to the library / home panel
    renderHome();
  });
}

/**
 * Update scale display in UI
 */
function updateScaleDisplay() {
  const displayText = `1:${coordinateScale}`;
  if (scaleValueDisplay) {
    scaleValueDisplay.textContent = displayText;
  }
  if (mobileScaleValueDisplay) {
    mobileScaleValueDisplay.textContent = displayText;
  }
}

/**
 * Save coordinate scale to storage
 */
function saveCoordinateScale() {
  try {
    localStorage.setItem(COORDINATE_SCALE_KEY, JSON.stringify(coordinateScale));
  } catch (e) {
    console.warn('[Coordinates] Failed to save coordinate scale', e.message);
  }
}

/**
 * Load coordinate scale from storage
 */
function loadCoordinateScale() {
  try {
    const raw = localStorage.getItem(COORDINATE_SCALE_KEY);
    if (raw) {
      const scale = JSON.parse(raw);
      if (typeof scale === 'number' && scale > 0) {
        coordinateScale = scale;
      }
    }
  } catch (e) {
    console.warn('[Coordinates] Failed to load coordinate scale', e.message);
  }
}

/**
 * Update stretch display in UI
 */
function updateStretchDisplay() {
  const displayX = viewStretchX.toFixed(1);
  const displayY = viewStretchY.toFixed(1);
  if (stretchXValueDisplay) {
    stretchXValueDisplay.textContent = displayX;
  }
  if (mobileStretchXValueDisplay) {
    mobileStretchXValueDisplay.textContent = displayX;
  }
  if (stretchYValueDisplay) {
    stretchYValueDisplay.textContent = displayY;
  }
  if (mobileStretchYValueDisplay) {
    mobileStretchYValueDisplay.textContent = displayY;
  }
}

/**
 * Save view stretch to storage
 */
function saveViewStretch() {
  try {
    localStorage.setItem(VIEW_STRETCH_KEY, JSON.stringify({ x: viewStretchX, y: viewStretchY }));
  } catch (e) {
    console.warn('[App] Failed to save view stretch', e.message);
  }
}

/**
 * Load view stretch from storage
 */
function loadViewStretch() {
  try {
    const raw = localStorage.getItem(VIEW_STRETCH_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data.x === 'number' && typeof data.y === 'number') {
        viewStretchX = Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, data.x));
        viewStretchY = Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, data.y));
      }
    }
  } catch (e) {
    console.warn('[App] Failed to load view stretch', e.message);
  }
}

/**
 * Change view stretch (horizontal or vertical)
 * Maintains focus on the screen center when stretch changes
 * @param {'x' | 'y'} axis - Which axis to change
 * @param {number} delta - Change direction: 1 for increase, -1 for decrease
 */
function changeViewStretch(axis, delta) {
  const currentValue = axis === 'x' ? viewStretchX : viewStretchY;
  const newValue = currentValue + (delta * STRETCH_STEP);
  const clamped = Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, newValue));
  
  // Round to 1 decimal place to avoid floating point issues
  const rounded = Math.round(clamped * 10) / 10;
  
  // If no change, skip
  if (rounded === currentValue) return;
  
  // Get the screen center point
  const rect = canvas.getBoundingClientRect();
  const screenCenterX = rect.width / 2;
  const screenCenterY = rect.height / 2;
  
  // Get the world point currently at screen center (using current stretch)
  const worldCenter = screenToWorld(screenCenterX, screenCenterY);
  
  // Update the stretch value
  if (axis === 'x') {
    viewStretchX = rounded;
  } else {
    viewStretchY = rounded;
  }
  
  // Adjust viewTranslate to keep the same world point at screen center
  // screenX = worldX * stretchX * viewScale + viewTranslate.x
  // viewTranslate.x = screenX - worldX * stretchX * viewScale
  viewTranslate.x = screenCenterX - worldCenter.x * viewStretchX * viewScale;
  viewTranslate.y = screenCenterY - worldCenter.y * viewStretchY * viewScale;
  
  saveViewStretch();
  updateStretchDisplay();
  scheduleDraw();
  showToast(t('stretch.changed', axis, rounded));
}

/**
 * Reset view stretch to default (1.0, 1.0)
 * Maintains focus on the screen center when resetting
 */
function resetViewStretch() {
  // If already at default, skip
  if (viewStretchX === 1.0 && viewStretchY === 1.0) return;
  
  // Get the screen center point
  const rect = canvas.getBoundingClientRect();
  const screenCenterX = rect.width / 2;
  const screenCenterY = rect.height / 2;
  
  // Get the world point currently at screen center (using current stretch)
  const worldCenter = screenToWorld(screenCenterX, screenCenterY);
  
  // Reset stretch values
  viewStretchX = 1.0;
  viewStretchY = 1.0;
  
  // Adjust viewTranslate to keep the same world point at screen center
  viewTranslate.x = screenCenterX - worldCenter.x * viewStretchX * viewScale;
  viewTranslate.y = screenCenterY - worldCenter.y * viewStretchY * viewScale;
  
  saveViewStretch();
  updateStretchDisplay();
  scheduleDraw();
  showToast(t('stretch.resetDone'));
}

/**
 * Change coordinate scale and re-apply coordinates
 * Maintains focus on the same part of the sketch when scale changes
 * @param {number} delta - Change direction: 1 for increase, -1 for decrease
 */
function changeCoordinateScale(delta) {
  const currentIndex = SCALE_PRESETS.indexOf(coordinateScale);
  let newIndex;
  
  if (currentIndex === -1) {
    // Current scale is not in presets, find closest
    newIndex = delta > 0 
      ? SCALE_PRESETS.findIndex(s => s > coordinateScale)
      : SCALE_PRESETS.findIndex(s => s >= coordinateScale) - 1;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= SCALE_PRESETS.length) newIndex = SCALE_PRESETS.length - 1;
  } else {
    newIndex = currentIndex + delta;
  }
  
  // Clamp to valid range
  newIndex = Math.max(0, Math.min(SCALE_PRESETS.length - 1, newIndex));
  
  const newScale = SCALE_PRESETS[newIndex];
  if (newScale !== coordinateScale) {
    // Save old scale before updating for focus preservation
    const oldScale = coordinateScale;
    
    coordinateScale = newScale;
    saveCoordinateScale();
    updateScaleDisplay();
    
    // Re-apply coordinates with new scale, maintaining focus (don't recenter)
    if (coordinatesEnabled && coordinatesMap.size > 0) {
      applyCoordinatesIfEnabled({ recenter: false, oldScale: oldScale });
    }
    
    showToast(`קנה מידה: 1:${coordinateScale}`);
  }
}

/**
 * Initialize coordinates from storage
 */
function initCoordinates() {
  coordinatesMap = loadCoordinatesFromStorage();
  coordinatesEnabled = loadCoordinatesEnabled();
  loadCoordinateScale();
  loadViewStretch();
  syncCoordinatesToggleUI();
  updateScaleDisplay();
  updateStretchDisplay();
  
  // Mark nodes with coordinate status
  if (coordinatesMap.size > 0) {
    nodes.forEach(node => {
      node.hasCoordinates = coordinatesMap.has(String(node.id));
    });
  }
  
  // Initialize map layer state from saved settings
  mapLayerEnabled = isMapLayerEnabled();
  syncMapLayerToggleUI();
  
  // Set up map reference point if we have coordinates
  if (mapLayerEnabled) {
    updateMapReferencePoint();
  }

  // Initialize Street View pegman widget
  initStreetView({
    canvasContainer: canvas.parentElement,
    canvas,
    getViewState: () => ({
      viewTranslate: { x: viewTranslate.x, y: viewTranslate.y },
      viewScale,
      viewStretchX,
      viewStretchY,
    }),
    getCoordinateScale: () => coordinateScale,
    showToast,
    t,
  });
  // Show pegman only when a reference point is available
  setStreetViewVisible(!!getMapReferencePoint());
}

// Import coordinates button handler (desktop)
if (importCoordinatesBtn) {
  importCoordinatesBtn.addEventListener('click', () => {
    // Close dropdown menu first
    if (exportDropdown) exportDropdown.classList.remove('menu-dropdown--open');
    if (importCoordinatesFile) importCoordinatesFile.click();
  });
}

// Import coordinates button handler (mobile)
if (mobileImportCoordinatesBtn) {
  mobileImportCoordinatesBtn.addEventListener('click', () => {
    closeMobileMenu();
    if (importCoordinatesFile) importCoordinatesFile.click();
  });
}

// Coordinates file input handler
if (importCoordinatesFile) {
  importCoordinatesFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleCoordinatesImport(file);
      e.target.value = ''; // Reset to allow re-importing same file
    }
  });
}

// Coordinates toggle handler (desktop)
if (coordinatesToggle) {
  coordinatesToggle.addEventListener('change', (e) => {
    toggleCoordinates(e.target.checked);
  });
}

// Coordinates toggle handler (mobile)
if (mobileCoordinatesToggle) {
  mobileCoordinatesToggle.addEventListener('change', (e) => {
    toggleCoordinates(e.target.checked);
    closeMobileMenu();
  });
}

// Map layer toggle handler (desktop)
if (mapLayerToggle) {
  mapLayerToggle.addEventListener('change', (e) => {
    toggleMapLayer(e.target.checked);
  });
}

// Map layer toggle handler (mobile)
if (mobileMapLayerToggle) {
  mobileMapLayerToggle.addEventListener('change', (e) => {
    toggleMapLayer(e.target.checked);
    closeMobileMenu();
  });
}

// Map type selector handler (desktop)
if (mapTypeSelect) {
  mapTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    setMapType(type);
    saveMapSettings();
    if (mobileMapTypeSelect) mobileMapTypeSelect.value = type;
    scheduleDraw();
  });
}

// Map type selector handler (mobile)
if (mobileMapTypeSelect) {
  mobileMapTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    setMapType(type);
    saveMapSettings();
    if (mapTypeSelect) mapTypeSelect.value = type;
    scheduleDraw();
    closeMobileMenu();
  });
}

// Live Measure toggle handler (desktop)
if (liveMeasureToggle) {
  liveMeasureToggle.addEventListener('change', (e) => {
    setLiveMeasureMode(e.target.checked);
  });
}

// Live Measure toggle handler (mobile)
if (mobileLiveMeasureToggle) {
  mobileLiveMeasureToggle.addEventListener('change', (e) => {
    setLiveMeasureMode(e.target.checked);
    closeMobileMenu();
  });
}

// Subscribe to gnssState position updates for status and redraw.
// Also auto-center on first GPS fix when Live Measure is enabled and the sketch has
// no ITM-anchored coordinates yet (e.g. empty sketch or default Tel Aviv reference
// point). Without this the marker renders off-screen because the default reference
// point may be far from the user's actual location.
let _liveMeasureFirstFixDone = false;
gnssState.on('position', (pos) => {
  updateLocationStatus();
  updateGpsQuickCaptureBtn();
  scheduleDraw();

  if (liveMeasureEnabled && !_liveMeasureFirstFixDone && pos && pos.isValid && coordinatesMap.size === 0) {
    _liveMeasureFirstFixDone = true;
    const itm = wgs84ToItm(pos.lat, pos.lon);
    const rect = canvas.getBoundingClientRect();
    setMapReferencePoint({
      itm: { x: itm.x, y: itm.y },
      canvas: { x: rect.width / 2, y: rect.height / 2 }
    });
    centerOnGpsLocation(pos.lat, pos.lon);
  }
});

// GPS Quick Capture FAB wiring
const gpsQuickCaptureBtn = document.getElementById('gpsQuickCaptureBtn');
if (gpsQuickCaptureBtn) {
  gpsQuickCaptureBtn.addEventListener('click', () => {
    gpsQuickCapture();
  });
}

/**
 * Update GPS Quick Capture button enabled/disabled state and RTK pulse
 */
function updateGpsQuickCaptureBtn() {
  if (!gpsQuickCaptureBtn) return;
  const pos = gnssState.getPosition();
  const hasValidFix = pos && pos.isValid;
  gpsQuickCaptureBtn.disabled = !hasValidFix;
  const isRtkFixed = hasValidFix && pos.fixQuality === 4;
  gpsQuickCaptureBtn.classList.toggle('rtk-ready', isRtkFixed);
}

// ============================================
// Reference Layers UI Controls
// ============================================

/**
 * Render the per-layer toggles in both desktop and mobile menus
 */
function renderRefLayerToggles() {
  const layers = getReferenceLayers();
  const desktopSection = document.getElementById('refLayersSection');
  const mobileSection = document.getElementById('mobileRefLayersSection');
  const desktopList = document.getElementById('refLayersList');
  const mobileList = document.getElementById('mobileRefLayersList');
  
  if (!layers || layers.length === 0) {
    if (desktopSection) desktopSection.style.display = 'none';
    if (mobileSection) mobileSection.style.display = 'none';
    return;
  }
  
  if (desktopSection) desktopSection.style.display = '';
  if (mobileSection) mobileSection.style.display = '';
  
  // Build layer toggle HTML
  const buildToggleHtml = (prefix) => layers.map(l => `
    <label class="ref-layer-toggle" title="${l.name} (${l.featureCount} features)">
      <input type="checkbox" data-layer-id="${l.id}" ${l.visible ? 'checked' : ''} class="${prefix}-ref-layer-cb" />
      <span class="ref-layer-name">${l.name}</span>
      <span class="ref-layer-count">(${l.featureCount})</span>
    </label>
  `).join('');
  
  if (desktopList) desktopList.innerHTML = buildToggleHtml('desktop');
  if (mobileList) mobileList.innerHTML = buildToggleHtml('mobile');
  
  // Attach event listeners
  const attachListeners = (container, closeFn) => {
    if (!container) return;
    container.querySelectorAll('input[data-layer-id]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        setLayerVisibility(e.target.dataset.layerId, e.target.checked);
        saveRefLayerSettings();
        scheduleDraw();
        // Sync the other menu
        syncRefLayerCheckboxes();
      });
    });
  };
  
  attachListeners(desktopList);
  attachListeners(mobileList);
}

/**
 * Sync checkbox states between desktop and mobile menus
 */
function syncRefLayerCheckboxes() {
  const layers = getReferenceLayers();
  for (const l of layers) {
    document.querySelectorAll(`input[data-layer-id="${l.id}"]`).forEach(cb => {
      cb.checked = l.visible;
    });
  }
}

// Reference layers global toggle (desktop)
const refLayersToggle = document.getElementById('refLayersToggle');
if (refLayersToggle) {
  refLayersToggle.checked = isRefLayersEnabled();
  refLayersToggle.addEventListener('change', (e) => {
    e.stopPropagation();
    setRefLayersEnabled(e.target.checked);
    saveRefLayerSettings();
    scheduleDraw();
    // Sync mobile
    const mobileToggle = document.getElementById('mobileRefLayersToggle');
    if (mobileToggle) mobileToggle.checked = e.target.checked;
  });
}

// Reference layers global toggle (mobile)
const mobileRefLayersToggle = document.getElementById('mobileRefLayersToggle');
if (mobileRefLayersToggle) {
  mobileRefLayersToggle.checked = isRefLayersEnabled();
  mobileRefLayersToggle.addEventListener('change', (e) => {
    e.stopPropagation();
    setRefLayersEnabled(e.target.checked);
    saveRefLayerSettings();
    scheduleDraw();
    // Sync desktop
    const desktopToggle = document.getElementById('refLayersToggle');
    if (desktopToggle) desktopToggle.checked = e.target.checked;
  });
}

// Expose render function for use after layers are loaded
window.renderRefLayerToggles = renderRefLayerToggles;

// Scale control handlers (desktop)
if (scaleDecreaseBtn) {
  scaleDecreaseBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dropdown from closing
    changeCoordinateScale(-1);
  });
}

if (scaleIncreaseBtn) {
  scaleIncreaseBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dropdown from closing
    changeCoordinateScale(1);
  });
}

// Scale control handlers (mobile)
if (mobileScaleDecreaseBtn) {
  mobileScaleDecreaseBtn.addEventListener('click', () => {
    changeCoordinateScale(-1);
  });
}

if (mobileScaleIncreaseBtn) {
  mobileScaleIncreaseBtn.addEventListener('click', () => {
    changeCoordinateScale(1);
  });
}

// Stretch control handlers (desktop - horizontal)
if (stretchXDecreaseBtn) {
  stretchXDecreaseBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dropdown from closing
    changeViewStretch('x', -1);
  });
}

if (stretchXIncreaseBtn) {
  stretchXIncreaseBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dropdown from closing
    changeViewStretch('x', 1);
  });
}

// Stretch control handlers (desktop - vertical)
if (stretchYDecreaseBtn) {
  stretchYDecreaseBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dropdown from closing
    changeViewStretch('y', -1);
  });
}

if (stretchYIncreaseBtn) {
  stretchYIncreaseBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dropdown from closing
    changeViewStretch('y', 1);
  });
}

// Stretch reset handler (desktop)
if (resetStretchBtn) {
  resetStretchBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent dropdown from closing
    resetViewStretch();
  });
}

// Stretch control handlers (mobile - horizontal)
if (mobileStretchXDecreaseBtn) {
  mobileStretchXDecreaseBtn.addEventListener('click', () => {
    changeViewStretch('x', -1);
  });
}

if (mobileStretchXIncreaseBtn) {
  mobileStretchXIncreaseBtn.addEventListener('click', () => {
    changeViewStretch('x', 1);
  });
}

// Stretch control handlers (mobile - vertical)
if (mobileStretchYDecreaseBtn) {
  mobileStretchYDecreaseBtn.addEventListener('click', () => {
    changeViewStretch('y', -1);
  });
}

if (mobileStretchYIncreaseBtn) {
  mobileStretchYIncreaseBtn.addEventListener('click', () => {
    changeViewStretch('y', 1);
  });
}

// Stretch reset handler (mobile)
if (mobileResetStretchBtn) {
  mobileResetStretchBtn.addEventListener('click', () => {
    closeMobileMenu();
    resetViewStretch();
  });
}

// ============================================
// End Coordinate System Handlers
// ============================================

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  const target = e.target;
  const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
  const isTyping = tag === 'input' || tag === 'textarea';

  // Mode toggles
  if (!isTyping && (e.key === 'n' || e.key === 'N')) {
    if (nodeModeBtn && edgeModeBtn) {
      nodeModeBtn.click();
      e.preventDefault();
    } else {
      currentMode = 'node';
      pendingEdgeTail = null;
      pendingEdgePreview = null;
      showToast(t('toasts.nodeMode'));
    }
  }
  if (!isTyping && (e.key === 'e' || e.key === 'E')) {
    if (edgeModeBtn && nodeModeBtn) {
      edgeModeBtn.click();
      e.preventDefault();
    } else {
      currentMode = 'edge';
      pendingEdgeTail = null;
      pendingEdgePreview = null;
      showToast(t('toasts.edgeMode'));
    }
  }
  if (!isTyping && (e.key === 's' || e.key === 'S')) {
    // Manual save
    if (saveBtn) saveBtn.click();
  }
  // 'D' no longer toggles edit mode since Edit button was removed
  // Hold Space to pan the canvas
  if (!isTyping && e.code === 'Space' && !spacePanning) {
    spacePanning = true;
    canvas.style.cursor = 'grab';
    e.preventDefault();
  }

  // Escape: cancel pending edge or clear selection, or close help
  if (e.key === 'Escape') {
    if (helpModal && helpModal.style.display === 'flex') {
      hidePanelAnimated(helpModal);
      e.preventDefault();
      return;
    }
    if (pendingEdgeTail || pendingEdgeStartPosition) {
      pendingEdgeTail = null;
      pendingEdgePreview = null;
      pendingEdgeStartPosition = null;
      scheduleDraw();
      showToast(t('toasts.cancelled'));
      e.preventDefault();
      return;
    }
    if (selectedNode || selectedEdge) {
      selectedNode = null;
      selectedEdge = null;
      renderDetails();
      scheduleDraw();
      e.preventDefault();
    }
  }

  // Delete selection (Delete/Backspace) if not typing in a field
  if (!isTyping && (e.key === 'Delete' || e.key === 'Backspace')) {
    if (selectedNode) {
      const node = selectedNode;
      const hasConnections = edges.some((edge) => String(edge.tail) === String(node.id) || String(edge.head) === String(node.id));
      let proceed = true;
      if (hasConnections) {
        proceed = confirm('Delete selected node and its connected edges?');
      }
      if (proceed) {
        nodes = nodes.filter((n) => n !== node);
        edges = edges.filter((edge) => String(edge.tail) !== String(node.id) && String(edge.head) !== String(node.id));
        selectedNode = null;
        computeNodeTypes();
        saveToStorage();
        scheduleDraw();
        renderDetails();
        showToast(t('toasts.nodeDeleted'));
      }
      e.preventDefault();
    } else if (selectedEdge) {
      const ok = confirm(t('confirms.deleteSelectedEdge'));
      if (ok) {
        edges = edges.filter((ed) => ed !== selectedEdge);
        selectedEdge = null;
        computeNodeTypes();
        saveToStorage();
        scheduleDraw();
        renderDetails();
        showToast(t('toasts.edgeDeleted'));
      }
      e.preventDefault();
    }
  }
  // Zoom shortcuts
  if (!isTyping && (e.key === '=' || e.key === '+')) {
    setZoom(viewScale * SCALE_STEP);
    e.preventDefault();
  }
  if (!isTyping && (e.key === '-' || e.key === '_')) {
    setZoom(viewScale / SCALE_STEP);
    e.preventDefault();
  }
  if (!isTyping && e.key === '0') {
    setZoom(1);
    e.preventDefault();
  }
});
// Commit node id edit when clicking/tapping anywhere outside the input
document.addEventListener('mousedown', () => { try { commitIdInputIfFocused(); } catch (_) { } }, true);
document.addEventListener('touchstart', () => { try { commitIdInputIfFocused(); } catch (_) { } }, true);
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spacePanning = false;
    if (!isPanning) canvas.style.cursor = '';
  }
});

// Ctrl/Cmd + wheel zoom on canvas
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const focusWorld = screenToWorld(mouseX, mouseY);
  const delta = e.deltaY;
  const newScale = delta > 0 ? (viewScale / SCALE_STEP) : (viewScale * SCALE_STEP);
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  if (Math.abs(clamped - viewScale) < 0.0001) return;
  viewScale = clamped;
  // Anchor zoom at mouse position
  viewTranslate.x = mouseX - viewScale * viewStretchX * focusWorld.x;
  viewTranslate.y = mouseY - viewScale * viewStretchY * focusWorld.y;
  scheduleDraw();
  showToast(t('toasts.zoom', (viewScale * 100).toFixed(0)));
}, { passive: false });

/**
 * Convert screen space (canvas client) coords to world coords (pre-zoom space).
 * Accounts for both view scale and stretch factors.
 */
function screenToWorld(x, y) {
  return {
    x: (x - viewTranslate.x) / (viewScale * viewStretchX),
    y: (y - viewTranslate.y) / (viewScale * viewStretchY),
  };
}

/**
 * Apply stretch factors to world coordinates for drawing.
 * This stretches positions without affecting shapes.
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {{x: number, y: number}} Stretched coordinates
 */
function applyStretch(x, y) {
  return {
    x: x * viewStretchX,
    y: y * viewStretchY,
  };
}

/**
 * Create a stretched version of a node for drawing (position only, not the actual node).
 * @param {object} node - The node object
 * @returns {object} A copy with stretched x and y coordinates
 */
function stretchedNode(node) {
  if (!node) return null;
  return {
    ...node,
    x: node.x * viewStretchX,
    y: node.y * viewStretchY,
  };
}

/**
 * Set zoom, clamped to min/max, and redraw.
 */
function setZoom(newScale) {
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  if (Math.abs(clamped - viewScale) < 0.0001) return;
  // Zoom centered on canvas center
  const rect = canvas.getBoundingClientRect();
  const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
  const centerWorld = screenToWorld(centerScreen.x, centerScreen.y);
  viewScale = clamped;
  viewTranslate.x = centerScreen.x - viewScale * viewStretchX * centerWorld.x;
  viewTranslate.y = centerScreen.y - viewScale * viewStretchY * centerWorld.y;
  scheduleDraw();
  showToast(t('toasts.zoom', (viewScale * 100).toFixed(0)));
}

/**
 * Compute the current sketch center in world coordinates.
 * Uses the bounding box of all nodes; falls back to origin if empty.
 */
function getSketchCenter() {
  if (!Array.isArray(nodes) || nodes.length === 0) return { x: 0, y: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    if (!node || node._hidden) continue;
    if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0 };
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Recenters the view so the sketch center maps to the canvas center.
 * Keeps the current zoom level.
 */
function recenterView() {
  const rect = canvas.getBoundingClientRect();
  const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
  const centerWorld = getSketchCenter();
  viewTranslate.x = centerScreen.x - viewScale * viewStretchX * centerWorld.x;
  viewTranslate.y = centerScreen.y - viewScale * viewStretchY * centerWorld.y;
  scheduleDraw();
}

/**
 * Zoom and pan so all visible nodes fit inside the canvas with padding.
 * Falls back to recenterView() when there are fewer than 2 visible nodes.
 */
function zoomToFit() {
  const visible = (nodes || []).filter(n => n && !n._hidden && typeof n.x === 'number' && typeof n.y === 'number');
  if (visible.length < 2) { recenterView(); return; }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of visible) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  const rangeX = (maxX - minX) || 1;
  const rangeY = (maxY - minY) || 1;
  const rect = canvas.getBoundingClientRect();
  const padding = 0.85; // 15% margin
  const scaleX = (rect.width * padding) / (rangeX * viewStretchX);
  const scaleY = (rect.height * padding) / (rangeY * viewStretchY);
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)));

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  viewScale = newScale;
  viewTranslate.x = rect.width / 2 - viewScale * viewStretchX * cx;
  viewTranslate.y = rect.height / 2 - viewScale * viewStretchY * cy;
  scheduleDraw();
}

/**
 * Compute the sketch density center in world coordinates.
 * Finds the area with the highest concentration of nodes.
 */
function getSketchDensityCenter() {
  if (!Array.isArray(nodes) || nodes.length === 0) return { x: 0, y: 0 };
  if (nodes.length === 1) return { x: nodes[0].x, y: nodes[0].y };

  // Calculate a reasonable search radius based on the bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    if (!node || typeof node.x !== 'number' || typeof node.y !== 'number') continue;
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const radius = Math.min(width, height) / 5 || 50; // Use 1/5th of the smaller dimension or 50 units

  let maxNeighbors = -1;
  let bestPoint = { x: 0, y: 0 };

  // For each node, count neighbors within radius
  for (let i = 0; i < nodes.length; i++) {
    const n1 = nodes[i];
    if (!n1 || typeof n1.x !== 'number' || typeof n1.y !== 'number') continue;
    
    let neighbors = 0;
    let sumX = 0;
    let sumY = 0;
    
    for (let j = 0; j < nodes.length; j++) {
      const n2 = nodes[j];
      if (!n2 || typeof n2.x !== 'number' || typeof n2.y !== 'number') continue;
      
      const dx = n1.x - n2.x;
      const dy = n1.y - n2.y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < radius * radius) {
        neighbors++;
        sumX += n2.x;
        sumY += n2.y;
      }
    }
    
    if (neighbors > maxNeighbors) {
      maxNeighbors = neighbors;
      bestPoint = { x: sumX / neighbors, y: sumY / neighbors };
    }
  }
  
  return bestPoint;
}

/**
 * Recenters the view so the sketch density center maps to the canvas center.
 */
function recenterDensityView() {
  const rect = canvas.getBoundingClientRect();
  const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
  const centerWorld = getSketchDensityCenter();
  viewTranslate.x = centerScreen.x - viewScale * viewStretchX * centerWorld.x;
  viewTranslate.y = centerScreen.y - viewScale * viewStretchY * centerWorld.y;
  scheduleDraw();
}

// Recenter button handler
if (recenterBtn) {
  recenterBtn.addEventListener('click', () => {
    try { recenterView(); } catch (_) { }
  });
}

// Recenter by density button handler
if (recenterDensityBtn) {
  recenterDensityBtn.addEventListener('click', () => {
    try { recenterDensityView(); } catch (_) { }
  });
}

// Zoom-to-fit button handler
const zoomToFitBtn = document.getElementById('zoomToFitBtn');
if (zoomToFitBtn) {
  zoomToFitBtn.addEventListener('click', () => {
    try { zoomToFit(); } catch (_) { }
  });
}

/**
 * Search for a node by ID and center the view on it.
 * @param {string|number} searchId - The ID to search for
 */
function searchAndCenterNode(searchId) {
  if (!searchId || searchId.toString().trim() === '') return;

  const searchIdStr = String(searchId).trim();

  // Find the node by ID (case-insensitive partial match)
  const foundNode = nodes.find((n) => String(n.id).toLowerCase().includes(searchIdStr.toLowerCase()));

  if (foundNode) {
    // Center the view on the found node
    const rect = canvas.getBoundingClientRect();
    const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
    viewTranslate.x = centerScreen.x - viewScale * viewStretchX * foundNode.x;
    viewTranslate.y = centerScreen.y - viewScale * viewStretchY * foundNode.y;

    // Select the node to highlight it
    selectedNode = foundNode;
    selectedEdge = null;

    // Render the details and redraw
    renderDetails();
    scheduleDraw();

    // Show success toast
    showToast(t('toasts.nodeFound', String(foundNode.id)) || `שוחה ${foundNode.id} נמצאה`);
  } else {
    // Show error toast
    showToast(t('toasts.nodeNotFound', searchIdStr) || `שוחה ${searchIdStr} לא נמצאה`, 'error');
  }
}

/**
 * Geocode an address/city/street query via Nominatim (OpenStreetMap).
 * @param {string} query - Address, city or street search text
 * @returns {Promise<{lat: number, lon: number, display_name: string}|null>}
 */
async function geocodeAddress(query) {
  const q = encodeURIComponent(query.trim());
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Accept-Language': 'en,he', 'User-Agent': 'ManholesMapper/1.0' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  const lat = parseFloat(first.lat);
  const lon = parseFloat(first.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon, display_name: first.display_name || '' };
}

/**
 * Search by address/city/street, geocode and center the map on the result.
 * @param {string} query - Address, city or street search text
 */
async function searchAddressAndCenter(query) {
  if (!query || query.toString().trim() === '') return;
  const q = String(query).trim();
  try {
    const result = await geocodeAddress(q);
    if (!result) {
      showToast(t('toasts.addressNotFound') || 'כתובת לא נמצאה', 'error');
      return;
    }
    const { x, y } = wgs84ToItm(result.lat, result.lon);
    const rect = canvas.getBoundingClientRect();
    const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
    viewTranslate.x = centerScreen.x - viewScale * viewStretchX * x;
    viewTranslate.y = centerScreen.y - viewScale * viewStretchY * y;
    scheduleDraw();
    showToast(result.display_name || t('toasts.addressFound') || 'נמצא');
  } catch (err) {
    console.warn('[App] Geocode error:', err.message);
    showToast(t('toasts.geocodeError') || 'שגיאה בחיפוש כתובת', 'error');
  }
}

// Search input handlers
const searchNodeInput = document.getElementById('searchNodeInput');
const mobileSearchNodeInput = document.getElementById('mobileSearchNodeInput');

if (searchNodeInput) {
  searchNodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchAndCenterNode(searchNodeInput.value);
      searchNodeInput.blur(); // Close mobile keyboard
    }
  });

  // Also trigger search on input change (debounced)
  let searchTimeout;
  searchNodeInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (searchNodeInput.value.trim()) {
        searchAndCenterNode(searchNodeInput.value);
      }
    }, 500); // Wait 500ms after user stops typing
  });
}

if (mobileSearchNodeInput) {
  mobileSearchNodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchAndCenterNode(mobileSearchNodeInput.value);
      mobileSearchNodeInput.blur(); // Close mobile keyboard
    }
  });

  // Also trigger search on input change (debounced)
  let mobileSearchTimeout;
  mobileSearchNodeInput.addEventListener('input', (e) => {
    clearTimeout(mobileSearchTimeout);
    mobileSearchTimeout = setTimeout(() => {
      if (mobileSearchNodeInput.value.trim()) {
        searchAndCenterNode(mobileSearchNodeInput.value);
      }
    }, 500); // Wait 500ms after user stops typing
  });
}

// Address search input handlers
const searchAddressInput = document.getElementById('searchAddressInput');
const mobileSearchAddressInput = document.getElementById('mobileSearchAddressInput');

function runAddressSearch(inputEl) {
  if (!inputEl || !inputEl.value.trim()) return;
  searchAddressAndCenter(inputEl.value);
  inputEl.blur();
}

if (searchAddressInput) {
  searchAddressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runAddressSearch(searchAddressInput);
    }
  });
}
if (mobileSearchAddressInput) {
  mobileSearchAddressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runAddressSearch(mobileSearchAddressInput);
    }
  });
}

/**
 * Application entry point: set defaults, load persisted state, size canvas and render UI.
 */
async function init() {
  // Attempt to recover any data from IndexedDB into localStorage if localStorage is empty.
  // Wait for restoration so the UI reflects persisted data on first paint after relaunch.
  try { await restoreFromIndexedDbIfNeeded(); } catch (_) { }
  // Set default date input to today
  dateInput.value = new Date().toISOString().substr(0, 10);
  migrateSingleSketchToLibraryIfNeeded();
  // Language init
  const savedLang = localStorage.getItem(STORAGE_KEYS.lang);
  if (savedLang === 'en' || savedLang === 'he') currentLang = savedLang; else currentLang = 'he';
  try { window.currentLang = currentLang; } catch (_) { }
  if (langSelect) langSelect.value = currentLang;
  if (mobileLangSelect) mobileLangSelect.value = currentLang;
  applyLangToStaticUI();
  const hasLib = getLibrary().length > 0;
  if (hasLib) {
    renderHome();
  } else if (loadFromStorage()) {
    startPanel.style.display = 'none';
    hideHome();
  } else {
    startPanel.style.display = 'flex';
  }
  // Carry forward any name from the most recent library record if current sketch matches
  const lib = getLibrary();
  if (!currentSketchName && currentSketchId) {
    const rec = lib.find((r) => r.id === currentSketchId);
    if (rec && rec.name) currentSketchName = rec.name;
  }
  updateSketchNameDisplay();
  
  // Initialize backup manager with function to get current sketch data
  initBackupManager(() => ({
    nodes: nodes,
    edges: edges,
    nextNodeId: nextNodeId,
    creationDate: creationDate,
    sketchId: currentSketchId,
    sketchName: currentSketchName,
    createdBy: getCurrentUsername(),
    lastEditedBy: getCurrentUsername(),
  }));
  
  // Initialize coordinates system
  initCoordinates();

  // Default interaction mode is node creation
  currentMode = 'node';
  if (nodeModeBtn) nodeModeBtn.classList.add('active');
  if (homeNodeModeBtn) homeNodeModeBtn.classList.remove('active');
  if (drainageNodeModeBtn) drainageNodeModeBtn.classList.remove('active');
  if (edgeModeBtn) edgeModeBtn.classList.remove('active');
  if (editModeBtn) editModeBtn.classList.remove('active');
  resizeCanvas();
  renderDetails();
}

init();

// Listen for theme changes and redraw canvas
if (window.matchMedia) {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkModeQuery.addEventListener('change', () => {
    scheduleDraw();
  });
}

// Global error handlers to improve resilience and observability.  Errors
// surfaced here will not crash the app; instead they are logged and
// surfaced via the toast.  Developers can hook into this to send
// telemetry.
window.addEventListener('error', (e) => {
  console.error('[App] Unhandled error:', e.error?.message || e.message || e);
  showToast('⚠️ ' + (e.message || 'Unexpected error'));
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[App] Unhandled rejection:', e.reason?.message || e.reason);
  showToast('⚠️ ' + (e.reason && e.reason.message ? e.reason.message : 'Unexpected error'));
});


// ============================================
// GNSS / Live Measure Mode Integration
// ============================================

/**
 * Enable or disable Live Measure mode (unified location system).
 * Starts/stops the browser geolocation adapter and feeds positions into gnssState.
 * @param {boolean} enabled
 */
function setLiveMeasureMode(enabled) {
  if (enabled) {
    // Auto-enable coordinates display when Live Measure is turned on
    if (!coordinatesEnabled) {
      coordinatesEnabled = true;
      saveCoordinatesEnabled(true);
      syncCoordinatesToggleUI();
    }

    // Start browser geolocation → gnssState bridge
    const started = startBrowserLocationAdapter();
    if (!started) {
      showToast(t('location.notSupported') || 'Location not supported');
      liveMeasureEnabled = false;
      gnssState.setLiveMeasureEnabled(false);
      syncLiveMeasureToggleUI();
      return;
    }

    liveMeasureEnabled = true;
    gnssState.setLiveMeasureEnabled(true);
  } else {
    // Stop browser geolocation adapter
    stopBrowserLocationAdapter();
    liveMeasureEnabled = false;
    gnssState.setLiveMeasureEnabled(false);
    _liveMeasureFirstFixDone = false; // Allow auto-center on next enable
  }

  syncLiveMeasureToggleUI();
  updateLocationStatus();
  scheduleDraw();
}

/**
 * Sync Live Measure toggle UI state across desktop and mobile checkboxes
 */
function syncLiveMeasureToggleUI() {
  if (liveMeasureToggle) {
    liveMeasureToggle.checked = liveMeasureEnabled;
  }
  if (mobileLiveMeasureToggle) {
    mobileLiveMeasureToggle.checked = liveMeasureEnabled;
  }
  // Show/hide GPS Quick Capture FAB
  const fab = document.getElementById('gpsQuickCaptureBtn');
  if (fab) {
    fab.style.display = liveMeasureEnabled ? '' : 'none';
    if (liveMeasureEnabled) updateGpsQuickCaptureBtn();
  }
}

/**
 * Update location status display in menu toggles
 */
function updateLocationStatus() {
  const statusEl = document.getElementById('locationStatus');
  const mobileStatusEl = document.getElementById('mobileLocationStatus');

  let text = '';
  if (liveMeasureEnabled) {
    const pos = gnssState.getPosition();
    if (pos && pos.isValid) {
      text = pos.fixLabel || 'Active';
    } else {
      text = t('liveMeasure.waiting') || 'Waiting...';
    }
  }

  if (statusEl) statusEl.textContent = text;
  if (mobileStatusEl) mobileStatusEl.textContent = text;
}

/**
 * Open the GNSS point capture dialog
 * Called when user clicks the "Capture Point" button
 */
function openGnssPointCaptureDialog() {
  openPointCaptureDialog(
    nodes,
    (captureData) => {
      handleGnssPointCapture(captureData);
    },
    () => {
      // On cancel - nothing to do
    }
  );
}

/**
 * Handle a captured GNSS point
 * @param {object} captureData - Data from point capture dialog
 */
function handleGnssPointCapture(captureData) {
  let targetNodeId = captureData.nodeId;
  
  // Create new node if requested
  if (captureData.createNewNode) {
    const newId = getNextNodeId();
    const newNode = {
      id: newId,
      x: 400, // Will be updated by coordinates
      y: 300,
      type: 'type1',
      nodeType: 'Manhole',
      hasCoordinates: true
    };
    nodes.push(newNode);
    targetNodeId = newId;
  }
  
  // Store coordinates
  coordinatesMap.set(String(targetNodeId), {
    x: captureData.itm.x,
    y: captureData.itm.y,
    z: captureData.position.alt || 0
  });
  saveCoordinatesToStorage(coordinatesMap);
  
  // Mark the node as having coordinates
  const node = nodes.find(n => String(n.id) === String(targetNodeId));
  if (node) {
    node.hasCoordinates = true;
    node._hidden = false;
    node.surveyX = captureData.itm.x;
    node.surveyY = captureData.itm.y;
    node.surveyZ = captureData.position.alt || 0;
    node.gnssFixQuality = captureData.position.fixQuality;
    node.gnssHdop = captureData.position.hdop;
    node.measure_precision = captureData.position.accuracy || null;
  }

  // Create edge if requested
  if (captureData.createEdge && captureData.edgeFromNode) {
    const newEdge = {
      id: getNextEdgeId(),
      tail: captureData.edgeFromNode,
      head: targetNodeId,
      edge_type: captureData.edgeType || 'קו ראשי',
      material: 0,
      line_diameter: null
    };
    edges.push(newEdge);
  }
  
  // Update gnss state with the captured point
  gnssState?.capturePoint(targetNodeId, {
    itm: captureData.itm,
    fixQuality: captureData.position.fixQuality,
    hdop: captureData.position.hdop
  });
  
  // Re-apply coordinates to update node positions
  applyCoordinatesIfEnabled();
  
  // Select the node
  selectedNode = node;
  selectedEdge = null;
  renderDetails();
  
  scheduleDraw();
  showToast(`נלכדה נקודה עבור שוחה ${targetNodeId}`);
}

/**
 * Vibrate the phone based on GNSS fix quality
 * @param {number} fixQuality - GNSS fix quality value
 */
function vibrateForFixQuality(fixQuality) {
  if (!navigator.vibrate) return;
  if (fixQuality === 4) {
    // RTK Fixed — single buzz
    navigator.vibrate(100);
  } else if (fixQuality === 5) {
    // RTK Float — two buzzes
    navigator.vibrate([100, 80, 100]);
  } else {
    // GPS/DGPS — three buzzes
    navigator.vibrate([100, 80, 100, 80, 100]);
  }
}

/**
 * GPS Quick Capture — create a node at the current GPS position with one tap.
 * Node type follows the current drawing mode. Auto-chains an edge from the
 * previously captured node.
 */
function gpsQuickCapture() {
  // 1. Get current position
  const position = gnssState.getPosition();
  if (!position || !position.isValid) {
    showToast(t('gpsCapture.noFix') || 'No GPS fix available');
    return;
  }

  // 2. Get reference point for coordinate conversion
  const referencePoint = getMapReferencePoint();
  if (!referencePoint) {
    showToast(t('location.enableCoordinatesFirst') || 'Enable coordinates first');
    return;
  }

  // 3. Convert GPS → canvas world coords
  const canvasPos = gnssToCanvas(position, referencePoint, coordinateScale);
  if (!canvasPos) {
    showToast(t('gpsCapture.conversionError') || 'Could not convert GPS position');
    return;
  }

  // 4. Create node at the canvas position (gets auto-numbered ID, admin defaults)
  const node = createNode(canvasPos.x, canvasPos.y);

  // 5. Set nodeType based on current drawing mode
  if (currentMode === 'home') {
    node.nodeType = 'Home';
  } else if (currentMode === 'drainage') {
    node.nodeType = 'Drainage';
  } else {
    node.nodeType = 'Manhole';
  }

  // 6. Store survey coordinates
  const itm = wgs84ToItm(position.lat, position.lon);
  node.hasCoordinates = true;
  node._hidden = false;
  node.surveyX = itm.x;
  node.surveyY = itm.y;
  node.surveyZ = position.alt || 0;
  node.gnssFixQuality = position.fixQuality;
  node.gnssHdop = position.hdop;
  node.measure_precision = position.accuracy || null;
  coordinatesMap.set(String(node.id), {
    x: itm.x,
    y: itm.y,
    z: position.alt || 0
  });
  saveCoordinatesToStorage(coordinatesMap);

  // 7. Auto-create edge from previously captured node (chain pattern)
  const lastId = gnssState.lastCapturedNodeId;
  if (lastId != null) {
    const prevNode = nodes.find(n => String(n.id) === String(lastId));
    if (prevNode) {
      createEdge(String(lastId), String(node.id));
    }
  }

  // 8. Update gnss state
  gnssState.capturePoint(node.id, {
    itm,
    fixQuality: position.fixQuality,
    hdop: position.hdop
  });

  // 9. Position node correctly if coordinate mode is on
  applyCoordinatesIfEnabled();

  // 10. Vibrate based on fix quality
  vibrateForFixQuality(position.fixQuality);

  // 11. Select node, show toast, save, redraw
  selectedNode = node;
  selectedEdge = null;
  renderDetails();

  const fixLabels = { 4: 'RTK Fixed', 5: 'RTK Float', 2: 'DGPS', 1: 'GPS' };
  const fixLabel = fixLabels[position.fixQuality] || position.fixLabel || 'GPS';
  showToast(t('gpsCapture.captured', node.nodeType, node.id, fixLabel)
    || `Captured ${node.nodeType} #${node.id} (${fixLabel})`);

  computeNodeTypes();
  saveToStorage();
  scheduleDraw();
}

/**
 * Get the next available edge ID
 */
function getNextEdgeId() {
  if (edges.length === 0) return 1;
  return Math.max(...edges.map(e => typeof e.id === 'number' ? e.id : 0)) + 1;
}

/**
 * Center the view on a GPS location (lat/lon)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if centering was successful
 */
function centerOnGpsLocation(lat, lon) {
  const referencePoint = getMapReferencePoint();
  if (!referencePoint) {
    showToast(t('location.enableCoordinatesFirst') || 'Enable coordinates first');
    return false;
  }
  
  const position = { lat, lon };
  const rect = canvas.getBoundingClientRect();
  const newTranslate = calculateCenterOnUser(
    position,
    referencePoint,
    coordinateScale,
    rect.width,
    rect.height,
    viewScale,
    viewStretchX,
    viewStretchY
  );
  
  if (newTranslate) {
    viewTranslate.x = newTranslate.x;
    viewTranslate.y = newTranslate.y;
    scheduleDraw();
    return true;
  }
  return false;
}

/**
 * Center a new empty sketch on the user's mobile location.
 * Uses the active GNSS position if available, otherwise does a one-shot geolocation request.
 * Silently fails if location is unavailable.
 */
async function centerNewSketchOnUserLocation() {
  try {
    let lat, lon;

    // If Live Measure is active, use the already-streaming GNSS position
    if (isBrowserLocationActive()) {
      const pos = gnssState.getPosition();
      if (pos && pos.isValid) {
        lat = pos.lat;
        lon = pos.lon;
      }
    }

    // Otherwise do a one-shot geolocation request
    if (lat == null) {
      if (!navigator.geolocation) return;
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        });
      });
      lat = position.coords.latitude;
      lon = position.coords.longitude;
    }

    // Convert to ITM and set reference point at canvas center
    const itm = wgs84ToItm(lat, lon);
    const rect = canvas.getBoundingClientRect();
    setMapReferencePoint({
      itm: { x: itm.x, y: itm.y },
      canvas: { x: rect.width / 2, y: rect.height / 2 }
    });

    // Center the view on this position
    centerOnGpsLocation(lat, lon);
  } catch (err) {
    console.debug('[Location] Could not center new sketch on user location:', err.message);
  }
}

/**
 * Toggle Live Measure mode (unified location tracking).
 * Called from menu event delegation and exposed globally.
 * @returns {boolean} True if now enabled
 */
function toggleUserLocationTracking() {
  const newState = !liveMeasureEnabled;
  setLiveMeasureMode(newState);

  if (newState && liveMeasureEnabled) {
    showToast(t('liveMeasure.enabled') || 'Live measurement enabled');
    // Center on position if available
    const pos = gnssState.getPosition();
    if (pos && pos.isValid) {
      centerOnGpsLocation(pos.lat, pos.lon);
    }
  } else if (!newState) {
    showToast(t('liveMeasure.disabled') || 'Live measurement disabled');
  }

  return liveMeasureEnabled;
}

// Expose functions globally for GNSS module integration and programmatic control
window.scheduleDraw = scheduleDraw;
window.setZoom = setZoom;
window.zoomToFit = zoomToFit;
window.recenterView = recenterView;
window.getViewState = () => ({ viewScale, viewTranslate: { ...viewTranslate }, viewStretchX, viewStretchY });
window.setLiveMeasureMode = setLiveMeasureMode;
window.openGnssPointCaptureDialog = openGnssPointCaptureDialog;
window.centerOnGpsLocation = centerOnGpsLocation;
window.toggleUserLocationTracking = toggleUserLocationTracking;

// ============================================
// TSC3 Survey Device Integration
// ============================================

// Initialize dialog DOM
initSurveyNodeTypeDialog();

// Initialize sketch side panel for project-canvas mode
initSketchSidePanel();

// Wire tsc3Connection callbacks
tsc3Connection._getNodes = () => nodes;
tsc3Connection._showToast = (msg) => showToast(msg);
tsc3Connection._t = (path, ...args) => t(path, ...args);
tsc3Connection._openTypeDialog = (pointName, coords, onChoose, onCancel, tFn) => {
  openSurveyNodeTypeDialog(pointName, coords, (type) => {
    surveyAutoConnect = getSurveyAutoConnect();
    onChoose(type);
  }, onCancel, tFn, { autoConnect: surveyAutoConnect });
};
tsc3Connection._onPointUpdate = (pointName, coords, isNew, nodeType) => {
  handleTSC3PointReceived(pointName, coords, isNew, nodeType);
};

// Wire persistent connection state badge — shows a green Bluetooth icon while
// a TSC3 survey device is connected; hides automatically on disconnect.
tsc3Connection.onConnectionChange = ({ connected, name }) => {
  const badge = document.getElementById('surveyConnectionBadge');
  if (!badge) return;
  badge.style.display = connected ? 'flex' : 'none';
  badge.title = connected && name ? name : '';
};

/**
 * Handle an incoming survey point from the TSC3 connection manager.
 * @param {string} pointName - Point name/ID
 * @param {{ easting: number, northing: number, elevation: number }} coords - ITM coordinates
 * @param {boolean} isNew - Whether this is a new node (no existing match)
 * @param {string} nodeType - 'Manhole', 'Home', or 'Drainage'
 */
function handleTSC3PointReceived(pointName, coords, isNew, nodeType) {
  let node;

  if (isNew) {
    // Create a new node at canvas center; applyCoordinatesIfEnabled() will immediately
    // reposition it to the correct world coordinates once the survey data is applied below.
    node = createNode(canvas.width / 2, canvas.height / 2);
    // Override the auto-generated ID with the survey point name
    node.id = String(pointName);
    node.nodeType = nodeType || 'Manhole';
  } else {
    node = nodes.find(n => String(n.id) === String(pointName));
    if (!node) return;
  }

  // Store survey coordinates on the node
  node.hasCoordinates = true;
  node._hidden = false;
  node.surveyX = coords.easting;
  node.surveyY = coords.northing;
  node.surveyZ = coords.elevation;
  node.measure_precision = 0.02; // TSC3 RTK default precision (meters)

  // Update coordinatesMap
  coordinatesMap.set(String(pointName), {
    x: coords.easting,
    y: coords.northing,
    z: coords.elevation,
  });
  saveCoordinatesToStorage(coordinatesMap);

  // Auto-enable coordinates if not already on
  if (!coordinatesEnabled) {
    coordinatesEnabled = true;
    saveCoordinatesEnabled(coordinatesEnabled);
  }

  // Apply coordinates to reposition nodes on canvas
  applyCoordinatesIfEnabled();

  // Auto-connect to previous survey node
  if (isNew && surveyAutoConnect && lastSurveyNodeId) {
    createEdge(lastSurveyNodeId, node.id);
  }
  if (isNew) lastSurveyNodeId = node.id;

  // Select the node and update UI
  selectedNode = node;
  selectedEdge = null;
  renderDetails();
  computeNodeTypes();
  saveToStorage();
  scheduleDraw();

  // Auto zoom/recenter after new survey points
  if (isNew) {
    const surveyNodes = nodes.filter(n => n.hasCoordinates);
    if (surveyNodes.length >= 2) {
      zoomToFit();
    } else {
      recenterView();
    }
  }

  // Show toast
  if (isNew) {
    const typeLabel = t(`mode${nodeType}`) || nodeType;
    showToast(t('survey.pointCreated', typeLabel, pointName) || `Created ${nodeType} ${pointName}`);
  } else {
    showToast(t('survey.pointUpdated', pointName) || `Point ${pointName} updated`);
  }
}

// TSC3 menu event handlers
menuEvents.on('connectSurveyBluetooth', async () => {
  const devices = await tsc3Connection.getPairedDevices();
  const surveyDevices = devices.filter(d => d.isSurvey);

  if (surveyDevices.length === 1) {
    // Auto-connect when exactly one survey device is available.
    showToast(t('survey.connecting') || 'Connecting...');
    await tsc3Connection.connectBluetooth(surveyDevices[0].address);
  } else if (devices.length > 0) {
    // Show a touch-friendly modal picker — window.prompt() is broken on
    // Android WebView / Capacitor.
    const chosen = await openDevicePickerDialog(devices, t);
    if (chosen) {
      showToast(t('survey.connecting') || 'Connecting...');
      await tsc3Connection.connectBluetooth(chosen.address);
    }
  } else {
    showToast(t('survey.noDevicesFound') || 'No devices found');
  }
});

menuEvents.on('connectSurveyWebSocket', () => {
  const savedAddr = localStorage.getItem(STORAGE_KEYS.tsc3WsAddress) || 'localhost:8765';
  const input = prompt('WebSocket host:port', savedAddr);
  if (!input) return;
  localStorage.setItem(STORAGE_KEYS.tsc3WsAddress, input);
  const parts = input.split(':');
  const host = parts[0] || 'localhost';
  const port = parseInt(parts[1], 10) || 8765;
  showToast(t('survey.connecting') || 'Connecting...');
  tsc3Connection.connectWebSocket(host, port);
});

menuEvents.on('disconnectSurvey', async () => {
  await tsc3Connection.disconnect();
});

// ── Emergency save on page unload ─────────────────────────────────────────
window.addEventListener('beforeunload', (e) => {
  try {
    const lastEdit = getLastEditPosition();
    const payload = {
      nodes, edges, nextNodeId, creationDate,
      sketchId: currentSketchId,
      sketchName: currentSketchName,
      projectId: currentProjectId,
      inputFlowConfig: currentInputFlowConfig,
      lastEditedBy: getCurrentUsername(),
      lastEditedAt: new Date().toISOString(),
      lastEditX: lastEdit?.x ?? null,
      lastEditY: lastEdit?.y ?? null,
    };
    localStorage.setItem(STORAGE_KEYS.sketch, JSON.stringify(payload));
  } catch (_) {}

  // Confirm exit when there's an active sketch with data
  if (nodes?.length > 0 || edges?.length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ── Android back-button exit guard ────────────────────────────────────────
// Push a history entry so the Android back button triggers popstate instead
// of immediately exiting the app/PWA. On popstate we prompt confirmation.
(function initBackButtonGuard() {
  // Push a guard state so "back" pops it rather than leaving the page
  history.pushState({ _guard: true }, '');

  window.addEventListener('popstate', (e) => {
    // Always re-push the guard state so the barrier stays in place
    history.pushState({ _guard: true }, '');

    // If a modal/panel is open, close it instead of prompting exit
    const homePanel = document.getElementById('homePanel');
    if (homePanel && homePanel.style.display !== 'none') {
      // Close the home panel
      if (typeof hideHome === 'function') hideHome();
      return;
    }

    // If mobile menu is open, close it
    if (typeof window.closeMobileMenu === 'function' && document.body.classList.contains('mobile-menu-open')) {
      window.closeMobileMenu();
      return;
    }

    // If on a sub-route, navigate back to main canvas
    const hash = location.hash || '#/';
    if (hash !== '#/' && hash !== '#/login' && hash !== '#/signup') {
      location.hash = '#/';
      return;
    }

    // On the main canvas — ask user to confirm exit
    if (nodes?.length > 0 || edges?.length > 0) {
      const msg = typeof t === 'function' ? t('confirms.exitApp') : 'Exit the app?';
      if (confirm(msg)) {
        // Actually go back — remove guard and navigate back
        history.back();
      }
    }
  });
})();