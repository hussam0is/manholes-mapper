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
import { mountSignIn as _mountSignIn, mountSignUp as _mountSignUp, unmountAuth as _unmountAuth } from '../auth/auth-provider.jsx';
import { encodeUtf16LeWithBom } from '../utils/encoding.js';
import { distanceToSegment } from '../utils/geometry.js';
import { isNumericId, generateHomeInternalId } from '../graph/id-utils.js';
import { commitIdInputIfFocused } from '../dom/dom-utils.js';
// AdminSettings, getNodeSpecs, getEdgeSpecs, ProjectsSettings — moved to src/legacy/admin-handlers.js
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
  startBrowserLocationAdapter,
  stopBrowserLocationAdapter,
  isBrowserLocationActive,
  FIX_COLORS
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
  precacheTilesForMeasurementBounds,
  cancelTilePrecache
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
  clearReferenceLayers,
  loadSectionSettings
} from '../map/reference-layers.js';
import {
  initStreetView,
  setStreetViewVisible,
  updateStreetViewTranslations
} from '../map/street-view.js';
import {
  initLayersConfig,
  updateLayersPanel,
  updateLayersConfigTranslations
} from '../map/layers-config.js';
import { drawIssueHighlight } from '../project/issue-highlight.js';
import { getLastEditPosition, setLastEditPosition } from '../project/last-edit-tracker.js';
import { menuEvents } from '../menu/menu-events.js';
// tsc3Connection, initSurveyNodeTypeDialog, openSurveyNodeTypeDialog, getSurveyAutoConnect,
// openDevicePickerDialog — moved to src/legacy/tsc3-handlers.js
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
  getSelectedSketchIds,
} from '../project/project-canvas-state.js';
import { drawBackgroundSketches, drawMergeModeOverlay, invalidateBackgroundCache } from '../project/project-canvas-renderer.js';
import { initSketchSidePanel, showSketchSidePanel, hideSketchSidePanel } from '../project/sketch-side-panel.js';
import { showProjectLoadingOverlay, updateLoadingStep, hideProjectLoadingOverlay, forceCloseProjectLoadingOverlay } from '../project/project-loading-overlay.js';
import { SpatialGrid, buildNodeGrid, buildEdgeGrid } from '../utils/spatial-grid.js';
import { renderCache } from '../utils/render-cache.js';
import { renderPerf } from '../utils/render-perf.js';
import { progressiveRenderer } from '../utils/progressive-renderer.js';
import { S, F } from './shared-state.js';
import { initGnssHandlers, setLiveMeasureMode, syncLiveMeasureToggleUI, updateLocationStatus, openGnssPointCaptureDialog, handleGnssPointCapture, vibrateForFixQuality, gpsQuickCapture, createNodeFromMeasurement, getNextEdgeId, centerOnGpsLocation, centerNewSketchOnUserLocation, toggleUserLocationTracking, updateGpsQuickCaptureBtn } from './gnss-handlers.js';
import { initCoordinateHandlers, handleCoordinatesImport, applyCoordinatesIfEnabled, restoreOriginalPositions, toggleCoordinates, syncCoordinatesToggleUI, toggleMapLayer, syncMapLayerToggleUI, getMeasurementBoundsItm, startMeasurementTilesPrecache, updateMapReferencePoint, autoRepositionFromEmbeddedCoords, showCoordinatesRequiredPrompt, updateScaleDisplay, saveCoordinateScale, loadCoordinateScale, updateStretchDisplay, saveViewStretch, loadViewStretch, changeViewStretch, resetViewStretch, changeCoordinateScale, initCoordinates } from './coordinate-handlers.js';
import { draw, scheduleDraw, scheduleEdgeLegendUpdate, scheduleIncompleteEdgeUpdate, renderEdgeLegend, drawInfiniteGrid, ensureVirtualPadding, autoPanWhenDragging, computeNodeTypes, drawEdge, drawDanglingEdgeLocal, drawEdgeLabels, drawNode, drawHouse, drawDirectConnectionBadge, updateCanvasEmptyState } from './canvas-draw.js';
import { initTSC3Handlers, handleTSC3PointReceived } from './tsc3-handlers.js';
import { initAdminHandlers, openAdminModal, closeAdminModal, openAdminScreen, closeAdminScreen, openProjectsScreen, closeProjectsScreen, navigateToAdmin, navigateToProjects, getAdminSettingsModal, getAdminSettingsScreen } from './admin-handlers.js';
import { renderDetails, closeSidebarPanel, initDetailsPanel, assignHomeIdFromConnectedManhole } from './details-panel.js';
import { renderRefLayerToggles, syncRefLayerCheckboxes, initRefLayerToggles, screenToWorld, applyStretch, stretchedNodeFast, stretchedNode, setZoom, getSketchCenter, recenterView, zoomToFit, getSketchDensityCenter, recenterDensityView, searchAndCenterNode, geocodeAddress, searchAddressAndCenter, runAddressSearch, initViewHandlers } from './view-utils.js';
import { findNodeAt, findNodeAtWithExpansion, findEdgeAt, showNodeContextMenu, _contextMenuDismiss, hideNodeContextMenu, clearLongPressTimer, initPointerHandlers } from './pointer-handlers.js';
import { getLibrary, setLibrary, invalidateLibraryCache, syncProjectSketchesToLibrary, generateSketchId, saveToLibrary, loadFromLibrary, loadProjectReferenceLayers, deleteFromLibrary, migrateSingleSketchToLibraryIfNeeded, updateSyncStatusUI, formatTimeAgo } from './library-manager.js';
import { renderResumeBar, renderSearchBar, renderHome, hideHome, renderHomeModeTabs, renderProjectsHome, repositionAllProjectSketchNodes, loadProjectCanvas, precacheProjectTiles, handleChangeProject, getHomeMode } from './home-renderer.js';
import { pushUndo, pushUndoDirect, clearUndoStack, updateUndoButton, updateRedoButton, deepCopyObj, deleteNodeShared, deleteEdgeShared, nodeHasValuableData, edgeHasValuableData, performUndo, performRedo, updateIncompleteEdgeTracker, findDanglingEdgeNear, findDanglingEndpointAt, findDanglingSnapTarget, mergeDanglingEdges, connectDanglingEdge, finalizeDanglingEndpointDrag } from './undo-redo.js';
import { closeMobileMenu, initMobileMenu } from './mobile-menu.js';
import { initFinishWorkday } from './finish-workday.js';

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
const issueNodeModeBtn = document.getElementById('issueNodeModeBtn');
const edgeModeBtn = document.getElementById('edgeModeBtn');
const nodeTypeFlyoutBtn = document.getElementById('nodeTypeFlyoutBtn');
const nodeTypeFlyout = document.getElementById('nodeTypeFlyout');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const threeDViewBtn = document.getElementById('threeDViewBtn');
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
const autoSizeBtn = document.getElementById('autoSizeBtn');
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
const canvasZoomInBtn = document.getElementById('canvasZoomInBtn');
const canvasZoomOutBtn = document.getElementById('canvasZoomOutBtn');
const mobileSizeIncreaseBtn = document.getElementById('mobileSizeIncreaseBtn');
const mobileSizeDecreaseBtn = document.getElementById('mobileSizeDecreaseBtn');
const mobileAutoSizeBtn = document.getElementById('mobileAutoSizeBtn');
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
// Dangling endpoint drag state
let isDraggingDanglingEnd = false;
let draggingDanglingEdge = null;      // the edge being dragged
let draggingDanglingType = null;      // 'outbound' (danglingEndpoint) or 'inbound' (tailPosition)
let draggingDanglingStart = null;     // { x, y } pre-drag position for undo
let hoveredDanglingEndpoint = null;   // { edge, type } for hover highlight
let danglingSnapTarget = null;        // { type: 'node'|'dangling', node?, edge?, danglingType? } during drag
// Undo action history
const UNDO_STACK_MAX = 50;
const undoStack = [];
const redoStack = [];
// dragStartNodeState, longPressTimer, _longPressEdgeTail, _lastTapNodeId, _lastTapTime
// LONG_PRESS_MS, DOUBLE_TAP_MS -- moved to pointer-handlers.js
// Animation state for node/edge creation
const _animatingNodes = new Map(); // nodeId -> startTime
const _animatingEdges = new Map(); // edgeId -> startTime
const ANIM_NODE_DURATION = 150; // ms
const ANIM_EDGE_DURATION = 200; // ms
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
const MIN_SCALE = 0.005;
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
let autoSizeEnabled = true; // When true, node/edge sizes stay constant on screen during zoom
let sizeVS = 1; // Computed divisor: viewScale when autoSize is on, 1 when off
let _contrastMul = 1.0; // High-contrast multiplier: 1.5 in dark mode, 1.0 otherwise. Set per draw() frame.
let _isDarkFrame = false; // Dark mode flag cached once per draw() frame (avoids matchMedia per edge).
let _isHeatmapFrame = false; // Cached once per draw() frame
const MIN_SIZE_SCALE = 0.5;
const MAX_SIZE_SCALE = 10.0;
const SIZE_SCALE_STEP = 0.2; // 20% increments
// Pinch zoom state
let isPinching = false;
// pinchStartDistance, pinchStartScale, pinchCenterWorld -- moved to pointer-handlers.js
// Mouse/keyboard panning state
let isPanning = false;
let spacePanning = false;
let panStart = { x: 0, y: 0 };
let translateStart = { x: 0, y: 0 };
// Touch tap-to-add deferral to avoid accidental node creation during pinch or slight taps
// touchAddPending, touchAddPoint, mouse/touch constants & state,
// pendingDetailsForSelectedNode, pendingDeselect -- moved to pointer-handlers.js

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
  getOptionLabel,
} from '../state/constants.js';
const NODE_MATERIALS = NODE_MATERIAL_OPTIONS.map(o => o.label);
const EDGE_MATERIALS = EDGE_MATERIAL_OPTIONS.map(o => o.label);

// Fall icon image (used to mark edges with a fall depth)
let fallIconImage = null;
let fallIconReady = false;

// Fast node lookup map – rebuilt lazily when nodes array changes
let nodeMap = new Map(); // Map<String(id), node>
let _nodeMapDirty = true; // Set true when nodes array is mutated

// Issue indicator sets — computed once per frame when dirty, used by drawNode/drawEdge
let _issueNodeIds = new Set(); // Set<String(nodeId)> — nodes with active issues
let _issueEdgeIds = new Set(); // Set<String(edgeId)> — edges with active issues
let _issueSetsDirty = true;   // Recompute when data changes

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
let _edgeLabelCacheViewScale = NaN;
function markEdgeLabelCacheDirty() {
  _edgeLabelDataCache = null;
}
// ── Spatial grid caches ──────────────────────────────────────────────────
// Grid-based spatial index for fast viewport culling. Rebuilt lazily when
// nodes/edges change (tracked by the same _nodeMapDirty flag).
let _nodeGrid = null;   // SpatialGrid<node>
let _edgeGrid = null;   // SpatialGrid<edge>
let _spatialGridDirty = true;
// Data version counter — incremented on every structural data change.
// Used to invalidate off-screen canvas caches.
let _dataVersion = 0;
// Grid rendering cache version — incremented when grid visual params change
let _gridCacheVersion = 0;

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
        { code: 0, label: typeof t === 'function' ? t('labels.fallPositionInternal') : 'פנימי', enabled: true },
        { code: 1, label: typeof t === 'function' ? t('labels.fallPositionExternal') : 'חיצוני', enabled: true },
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

// ─── Shared state proxy for extracted modules ───────────────────────────────
// Populated immediately so that all imported extracted modules (gnss-handlers,
// tsc3-handlers, etc.) can read/write main.js local variables through S.X.
// Getters ensure we always return the current value; setters update the local var.
/* eslint-disable no-unused-vars */
(function _initStateProxy() {
  const def = (name, get, set) => ({
    get, set, enumerable: true, configurable: true,
  });
  Object.defineProperties(S, {
    nodes:                    def('nodes',                    () => nodes,                    (v) => { nodes = v; }),
    edges:                    def('edges',                    () => edges,                    (v) => { edges = v; }),
    nextNodeId:               def('nextNodeId',               () => nextNodeId,               (v) => { nextNodeId = v; }),
    selectedNode:             def('selectedNode',             () => selectedNode,             (v) => { selectedNode = v; }),
    selectedEdge:             def('selectedEdge',             () => selectedEdge,             (v) => { selectedEdge = v; }),
    isDragging:               def('isDragging',               () => isDragging,               (v) => { isDragging = v; }),
    dragOffset:               def('dragOffset',               () => dragOffset,               (v) => { dragOffset = v; }),
    isDraggingDanglingEnd:    def('isDraggingDanglingEnd',    () => isDraggingDanglingEnd,    (v) => { isDraggingDanglingEnd = v; }),
    draggingDanglingEdge:     def('draggingDanglingEdge',     () => draggingDanglingEdge,     (v) => { draggingDanglingEdge = v; }),
    draggingDanglingType:     def('draggingDanglingType',     () => draggingDanglingType,     (v) => { draggingDanglingType = v; }),
    hoveredDanglingEndpoint:  def('hoveredDanglingEndpoint',  () => hoveredDanglingEndpoint,  (v) => { hoveredDanglingEndpoint = v; }),
    danglingSnapTarget:       def('danglingSnapTarget',       () => danglingSnapTarget,       (v) => { danglingSnapTarget = v; }),
    currentMode:              def('currentMode',              () => currentMode,              (v) => { currentMode = v; }),
    pendingEdgeTail:          def('pendingEdgeTail',          () => pendingEdgeTail,          (v) => { pendingEdgeTail = v; }),
    pendingEdgeStartPosition: def('pendingEdgeStartPosition', () => pendingEdgeStartPosition, (v) => { pendingEdgeStartPosition = v; }),
    creationDate:             def('creationDate',             () => creationDate,             (v) => { creationDate = v; }),
    currentSketchId:          def('currentSketchId',          () => currentSketchId,          (v) => { currentSketchId = v; }),
    currentSketchName:        def('currentSketchName',        () => currentSketchName,        (v) => { currentSketchName = v; }),
    currentProjectId:         def('currentProjectId',         () => currentProjectId,         (v) => { currentProjectId = v; }),
    currentInputFlowConfig:   def('currentInputFlowConfig',   () => currentInputFlowConfig,   (v) => { currentInputFlowConfig = v; }),
    availableProjects:        def('availableProjects',        () => availableProjects,        (v) => { availableProjects = v; }),
    autosaveEnabled:          def('autosaveEnabled',          () => autosaveEnabled,          (v) => { autosaveEnabled = v; }),
    lastSurveyNodeId:         def('lastSurveyNodeId',         () => lastSurveyNodeId,         (v) => { lastSurveyNodeId = v; }),
    surveyAutoConnect:        def('surveyAutoConnect',        () => surveyAutoConnect,        (v) => { surveyAutoConnect = v; }),
    currentLang:              def('currentLang',              () => currentLang,              (v) => { currentLang = v; }),
    pendingEdgePreview:       def('pendingEdgePreview',       () => pendingEdgePreview,       (v) => { pendingEdgePreview = v; }),
    viewScale:                def('viewScale',                () => viewScale,                (v) => { viewScale = v; }),
    drawScheduled:            def('drawScheduled',            () => drawScheduled,            (v) => { drawScheduled = v; }),
    viewTranslate:            def('viewTranslate',            () => viewTranslate,            (v) => { viewTranslate = v; }),
    viewStretchX:             def('viewStretchX',             () => viewStretchX,             (v) => { viewStretchX = v; }),
    viewStretchY:             def('viewStretchY',             () => viewStretchY,             (v) => { viewStretchY = v; }),
    sizeScale:                def('sizeScale',                () => sizeScale,                (v) => { sizeScale = v; }),
    autoSizeEnabled:          def('autoSizeEnabled',          () => autoSizeEnabled,          (v) => { autoSizeEnabled = v; }),
    sizeVS:                   def('sizeVS',                   () => sizeVS,                   (v) => { sizeVS = v; }),
    isPinching:               def('isPinching',               () => isPinching,               (v) => { isPinching = v; }),
    isPanning:                def('isPanning',                () => isPanning,                (v) => { isPanning = v; }),
    spacePanning:             def('spacePanning',             () => spacePanning,             (v) => { spacePanning = v; }),
    panStart:                 def('panStart',                 () => panStart,                 (v) => { panStart = v; }),
    translateStart:           def('translateStart',           () => translateStart,           (v) => { translateStart = v; }),
    highlightedHalfEdge:      def('highlightedHalfEdge',      () => highlightedHalfEdge,      (v) => { highlightedHalfEdge = v; }),
    coordinatesMap:           def('coordinatesMap',           () => coordinatesMap,           (v) => { coordinatesMap = v; }),
    coordinatesEnabled:       def('coordinatesEnabled',       () => coordinatesEnabled,       (v) => { coordinatesEnabled = v; }),
    originalNodePositions:    def('originalNodePositions',    () => originalNodePositions,    (v) => { originalNodePositions = v; }),
    geoNodePositions:         def('geoNodePositions',         () => geoNodePositions,         (v) => { geoNodePositions = v; }),
    coordinateScale:          def('coordinateScale',          () => coordinateScale,          (v) => { coordinateScale = v; }),
    liveMeasureEnabled:       def('liveMeasureEnabled',       () => liveMeasureEnabled,       (v) => { liveMeasureEnabled = v; }),
    mapLayerEnabled:          def('mapLayerEnabled',          () => mapLayerEnabled,          (v) => { mapLayerEnabled = v; }),
    adminConfig:              def('adminConfig',              () => adminConfig,              (v) => { adminConfig = v; }),
    _nodeMapDirty:            def('_nodeMapDirty',            () => _nodeMapDirty,            (v) => { _nodeMapDirty = v; }),
    _spatialGridDirty:        def('_spatialGridDirty',        () => _spatialGridDirty,        (v) => { _spatialGridDirty = v; }),
    _dataVersion:             def('_dataVersion',             () => _dataVersion,             (v) => { _dataVersion = v; }),
    _issueSetsDirty:          def('_issueSetsDirty',          () => _issueSetsDirty,          (v) => { _issueSetsDirty = v; }),
    _liveMeasureFirstFixDone: def('_liveMeasureFirstFixDone', () => _liveMeasureFirstFixDone, (v) => { _liveMeasureFirstFixDone = v; }),
    __wizardActiveTab:        def('__wizardActiveTab',        () => __wizardActiveTab,        (v) => { __wizardActiveTab = v; }),
    // DOM refs used by extracted modules
    canvas:                   def('canvas',                   () => canvas,                   null),
    ctx:                      def('ctx',                      () => ctx,                      null),
    homePanel:                def('homePanel',                () => homePanel,                null),
    startPanel:               def('startPanel',               () => startPanel,               null),
    detailsContainer:         def('detailsContainer',         () => detailsContainer,         null),
    sidebarTitleEl:           def('sidebarTitleEl',           () => sidebarTitleEl,            null),
    sidebarEl:                def('sidebarEl',                () => sidebarEl,                 null),
    sidebarCloseBtn:          def('sidebarCloseBtn',          () => sidebarCloseBtn,           null),
    // Canvas-draw module state
    nodeMap:                  def('nodeMap',                  () => nodeMap,                  (v) => { nodeMap = v; }),
    fallIconImage:            def('fallIconImage',            () => fallIconImage,            (v) => { fallIconImage = v; }),
    fallIconReady:            def('fallIconReady',            () => fallIconReady,            (v) => { fallIconReady = v; }),
    _animatingNodes:          def('_animatingNodes',          () => _animatingNodes,          null),
    _animatingEdges:          def('_animatingEdges',          () => _animatingEdges,          null),
    ANIM_NODE_DURATION:       def('ANIM_NODE_DURATION',       () => ANIM_NODE_DURATION,       null),
    ANIM_EDGE_DURATION:       def('ANIM_EDGE_DURATION',       () => ANIM_EDGE_DURATION,       null),
    _issueNodeIds:            def('_issueNodeIds',            () => _issueNodeIds,            null),
    _issueEdgeIds:            def('_issueEdgeIds',            () => _issueEdgeIds,            null),
    _isDarkFrame:             def('_isDarkFrame',             () => _isDarkFrame,             (v) => { _isDarkFrame = v; }),
    _contrastMul:             def('_contrastMul',             () => _contrastMul,             (v) => { _contrastMul = v; }),
    _isHeatmapFrame:          def('_isHeatmapFrame',          () => _isHeatmapFrame,          (v) => { _isHeatmapFrame = v; }),
    _edgeLabelDataCache:      def('_edgeLabelDataCache',      () => _edgeLabelDataCache,      (v) => { _edgeLabelDataCache = v; }),
    _edgeLabelCacheStretchX:  def('_edgeLabelCacheStretchX',  () => _edgeLabelCacheStretchX,  (v) => { _edgeLabelCacheStretchX = v; }),
    _edgeLabelCacheStretchY:  def('_edgeLabelCacheStretchY',  () => _edgeLabelCacheStretchY,  (v) => { _edgeLabelCacheStretchY = v; }),
    _edgeLabelCacheSizeScale: def('_edgeLabelCacheSizeScale', () => _edgeLabelCacheSizeScale, (v) => { _edgeLabelCacheSizeScale = v; }),
    _edgeLabelCacheViewScale: def('_edgeLabelCacheViewScale', () => _edgeLabelCacheViewScale, (v) => { _edgeLabelCacheViewScale = v; }),
    _nodeGrid:                def('_nodeGrid',                () => _nodeGrid,                (v) => { _nodeGrid = v; }),
    _edgeGrid:                def('_edgeGrid',                () => _edgeGrid,                (v) => { _edgeGrid = v; }),
    // Undo/redo module state
    undoStack:                def('undoStack',                () => undoStack,                null),
    redoStack:                def('redoStack',                () => redoStack,                null),
    undoBtn:                  def('undoBtn',                  () => undoBtn,                  null),
    redoBtn:                  def('redoBtn',                  () => redoBtn,                  null),
    draggingDanglingStart:    def('draggingDanglingStart',    () => draggingDanglingStart,    (v) => { draggingDanglingStart = v; }),
  });
})();
/* eslint-enable no-unused-vars */
// ────────────────────────────────────────────────────────────────────────────

// === Field History Tracking System — [Extracted to src/legacy/field-history.js] ===
import { loadFieldHistory, saveFieldHistory, diameterToColor, trackFieldUsage, getSortedOptions, importFieldHistoryFromSketch, getSketchesForHistoryImport, formatSketchDisplayName } from './field-history.js';

// Admin/projects handlers — [Extracted to src/legacy/admin-handlers.js]
// openAdminModal, closeAdminModal, openAdminScreen, closeAdminScreen,
// openProjectsScreen, closeProjectsScreen, navigateToAdmin, navigateToProjects
// and button event wiring are initialized via initAdminHandlers() in init().

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
// Re-uses the existing React root via getRoot() — no unmount needed.
// React handles re-rendering internally when switching between SignIn/SignUp.
function mountAuthSignIn() {
  if (!authContainer) return;
  _mountSignIn(authContainer, { signUpUrl: '#/signup' });
}

// Mount SignUp component (Better Auth)
// Re-uses the existing React root via getRoot() — no unmount needed.
function mountAuthSignUp() {
  if (!authContainer) return;
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

  // Hide admin/project menu items from non-admin users
  const userRole = window.permissionsService?.getUserRole?.();
  const isAdminRole = userRole?.isAdmin === true;
  const adminDisplay = isSignedIn && isAdminRole ? '' : 'none';
  if (adminBtn) adminBtn.style.display = adminDisplay;
  if (mobileAdminBtn) mobileAdminBtn.style.display = adminDisplay;
  if (projectsBtn) projectsBtn.style.display = adminDisplay;
  if (mobileProjectsBtn) mobileProjectsBtn.style.display = adminDisplay;
}

// Simple hash routing for admin screen and login
let _routePending = false;
function handleRoute() {
  // Debounce: coalesce rapid calls (auth changes, hashchange, init) into one frame
  if (_routePending) return;
  _routePending = true;
  requestAnimationFrame(() => {
    _routePending = false;
    _handleRouteImpl();
  });
}
function _handleRouteImpl() {
  const hash = location.hash || '#/';
  if (window.__fcShell?.onRouteChange) window.__fcShell.onRouteChange(hash);
  const isAdmin = (hash === '#/admin');
  const isProjects = (hash === '#/projects');
  const isLogin = (hash === '#/login');
  const isSignup = (hash === '#/signup');
  const isProfile = (hash === '#/profile');
  const isLeaderboard = (hash === '#/leaderboard');
  // Must check /stats BEFORE generic project match to avoid capturing stats as project ID
  const projectStatsMatch = hash.match(/^#\/project\/([^/]+)\/stats$/);
  const projectMatch = projectStatsMatch ? null : hash.match(/^#\/project\/([^/]+)$/);

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

  // Hide page panels when navigating away from them
  if (!isProfile) {
    import('../pages/profile-page.js').then(m => m.hideProfilePage()).catch(() => {});
  }
  if (!isLeaderboard) {
    import('../pages/leaderboard-page.js').then(m => m.hideLeaderboardPage()).catch(() => {});
  }
  if (!projectStatsMatch) {
    import('../pages/project-stats-page.js').then(m => m.hideProjectStatsPage()).catch(() => {});
  }

  // Leave project-canvas mode when navigating away from #/project/:id
  if (!projectMatch && !projectStatsMatch && isProjectCanvasMode()) {
    // Sync project sketches back to localStorage so the home view is up to date
    syncProjectSketchesToLibrary();
    clearProjectCanvas();
    hideSketchSidePanel();
  }

  // Handle admin route
  if (isAdmin) {
    try { document.body.classList.add('admin-screen'); } catch (_) { }
    try { closeAdminModal(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true);
    openAdminScreen().catch(e => console.error('[Admin] Failed to open admin screen:', e));
  } else if (isProjects) {
    // Handle projects route
    try { document.body.classList.add('admin-screen'); } catch (_) { }
    try { closeAdminModal(); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { openProjectsScreen(); } catch (_) { }
  } else if (isProfile) {
    // Handle #/profile route
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true);
    import('../pages/profile-page.js').then(m => m.renderProfilePage()).catch(e => console.error('[Profile]', e));
  } else if (isLeaderboard) {
    // Handle #/leaderboard route
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true);
    import('../pages/leaderboard-page.js').then(m => m.renderLeaderboardPage()).catch(e => console.error('[Leaderboard]', e));
  } else if (projectStatsMatch) {
    // Handle #/project/:id/stats route
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true);
    import('../pages/project-stats-page.js').then(m => m.renderProjectStatsPage(projectStatsMatch[1])).catch(e => console.error('[ProjectStats]', e));
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

// Re-evaluate admin button visibility when permissions are loaded (async after auth)
if (window.permissionsService?.onPermissionChange) {
  window.permissionsService.onPermissionChange((roleData) => {
    const authState = window.authGuard?.getAuthState?.() || {};
    updateUserButtonVisibility(!!authState.isSignedIn);
    // Show 3D View button for admin/super_admin only
    if (threeDViewBtn) {
      threeDViewBtn.style.display = roleData?.isAdmin ? '' : 'none';
    }
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
  const _adminSettingsModal = getAdminSettingsModal();
  if (!_adminSettingsModal) return;

  // Validate before saving
  const validation = _adminSettingsModal.validate();
  if (!validation.valid) {
    // Scroll to first error
    if (validation.errors[0]?.field) {
      validation.errors[0].field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      validation.errors[0].field.focus();
    }
    return;
  }

  // Collect and save configuration
  const newConfig = _adminSettingsModal.collectConfig();
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
      const _adminScrInst = getAdminSettingsScreen();
      const prevTab = _adminScrInst ? _adminScrInst.getActiveTab() : 'nodes';
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
        const _scrInst = getAdminSettingsScreen();
        if (prevTab && prevTab !== 'nodes' && _scrInst) {
          _scrInst.setActiveTab(prevTab);
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
  const _adminSettingsScreen = getAdminSettingsScreen();
  if (!_adminSettingsScreen) return;

  // Validate before saving
  const validation = _adminSettingsScreen.validate();
  if (!validation.valid) {
    // Scroll to first error
    if (validation.errors[0]?.field) {
      validation.errors[0].field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      validation.errors[0].field.focus();
    }
    return;
  }

  // Collect and save configuration
  const newConfig = _adminSettingsScreen.collectConfig();
  Object.assign(adminConfig, newConfig);
  saveAdminConfig();
  markInternalNavigation();
  closeAdminScreen();
  try { location.hash = '#/'; } catch (_) { }
  renderDetails();
  showToast(t('admin.saved'));
});
if (adminScreenCancelBtn) adminScreenCancelBtn.addEventListener('click', () => {
  markInternalNavigation();
  closeAdminScreen();
  try { location.hash = '#/'; } catch (_) { }
});

// Projects screen close button handler
if (projectsScreenCloseBtn) projectsScreenCloseBtn.addEventListener('click', () => {
  markInternalNavigation();
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
    // Adjust viewTranslate to keep the center of the view stable
    const oldLogicalW = canvas.width / dpr;
    const oldLogicalH = canvas.height / dpr;
    const newLogicalW = targetWidth / dpr;
    const newLogicalH = targetHeight / dpr;
    if (oldLogicalW > 0 && oldLogicalH > 0) {
      viewTranslate.x += (newLogicalW - oldLogicalW) / 2;
      viewTranslate.y += (newLogicalH - oldLogicalH) / 2;
    }
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

// === i18n — [Extracted to src/legacy/i18n-ui.js] ===
import { applyLangToStaticUI } from './i18n-ui.js';

// CSV helpers and sketch I/O are lazy-loaded on demand (export/import actions only)

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
      // maintenanceStatus is editable for Home — initialize if missing
      if (node.maintenanceStatus === undefined) node.maintenanceStatus = 0;
      if (node.directConnection === undefined) node.directConnection = false;
    }
    if (node.nodeType === 'Drainage') {
      node.material = NODE_MATERIALS[0];
      node.coverDiameter = '';
      node.access = '';
      node.nodeEngineeringStatus = '';
      // maintenanceStatus is editable for Drainage via wizard — initialize if missing
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
    // Existing nodes with survey coords but no gnssFixQuality default to Fixed (4)
    // since all historical survey data came from RTK Fixed measurements.
    // Nodes with gnssFixQuality === 6 (Manual Float) that have surveyX/surveyY
    // should move those coords to manual_x/manual_y.
    if (node.gnssFixQuality === undefined && node.surveyX != null && node.surveyY != null) {
      node.gnssFixQuality = 4; // Assume Fixed from historical cords data
    }
    if (node.gnssFixQuality === 6 && node.surveyX != null && node.surveyY != null) {
      if (node.manual_x == null) node.manual_x = node.surveyX;
      if (node.manual_y == null) node.manual_y = node.surveyY;
      node.surveyX = null;
      node.surveyY = null;
      node.surveyZ = null;
      node.measure_precision = null;
    }
    // Sub-RTK quality (GPS/DGPS/etc.) nodes should not lock their position.
    // Demote surveyX/Y to manual coords and clear the survey fields.
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
    _nodeMapDirty = true; _spatialGridDirty = true; _dataVersion++;
    edges = parsed.edges;
    clearUndoStack();
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
    updateCanvasEmptyState();
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
  _issueSetsDirty = true;    // recompute issue indicators on next draw
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
      try { saveToStorage(); showToast(t('toasts.saved') || 'Saved', 'success', 1000); } catch (_) { }
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
// [Extracted to src/legacy/library-manager.js]
// getLibrary cache variables and function body live in library-manager.js

// [Extracted to src/legacy/library-manager.js]

// [Extracted to src/legacy/library-manager.js]
// loadFromLibrary, loadProjectReferenceLayers, deleteFromLibrary,
// migrateSingleSketchToLibraryIfNeeded, updateSyncStatusUI, formatTimeAgo
// are all imported from library-manager.js (see import at top of file).

// Expose for external use (menu, admin)
window.loadProjectReferenceLayers = loadProjectReferenceLayers;
window.getReferenceLayers = getReferenceLayers;
window.setLayerVisibility = setLayerVisibility;
window.setRefLayersEnabled = setRefLayersEnabled;
window.isRefLayersEnabled = isRefLayersEnabled;
window.saveRefLayerSettings = saveRefLayerSettings;

// Subscribe to sync state changes
if (window.syncService?.onSyncStateChange) {
  window.syncService.onSyncStateChange((state) => {
    updateSyncStatusUI(state);
    // Re-render home panel when sync completes while it is visible (but not in project canvas mode)
    if (homePanel && homePanel.style.display === 'flex' && !isProjectCanvasMode()) {
      if (getHomeMode() === 'projects') {
        renderProjectsHome();
      } else {
        renderHome();
      }
    }
  });
}

// [Extracted to src/legacy/home-renderer.js]
// renderResumeBar, renderSearchBar, renderHome, hideHome, renderHomeModeTabs,
// renderProjectsHome, repositionAllProjectSketchNodes, loadProjectCanvas,
// precacheProjectTiles, handleChangeProject
// State: currentSketchTab, homeMode, homeSearchQuery

/**
 * Initialize a brand new sketch and reset all transient state.
 * @param {string} date - ISO date string used for exported filenames
 * @param {string} projectId - Optional project ID to associate with this sketch
 * @param {Object} inputFlowConfig - Optional input flow configuration (copied from project)
 */
function newSketch(date, projectId = null, inputFlowConfig = null) {
  nodes = [];
  _nodeMapDirty = true; _spatialGridDirty = true; _dataVersion++;
  edges = [];
  clearUndoStack();
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
  updateCanvasEmptyState();
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
  // Compute manual ITM coordinates from canvas position (not survey-grade)
  const ref = getMapReferencePoint();
  if (ref && ref.itm && ref.canvas && coordinateScale > 0) {
    node.manual_x = ref.itm.x + (x - ref.canvas.x) / coordinateScale;
    node.manual_y = ref.itm.y - (y - ref.canvas.y) / coordinateScale;
    // surveyX/surveyY are NOT set — those are reserved for GNSS/TSC3 survey captures
  }
  // Apply custom default fields
  if (Array.isArray(adminConfig.nodes?.customFields)) {
    adminConfig.nodes.customFields.forEach((f) => {
      if (!f || !f.key) return;
      node[f.key] = f.default ?? '';
    });
  }
  nodes.push(node);
  _nodeMapDirty = true; _spatialGridDirty = true; _dataVersion++;

  // Check for nearby dangling edges and auto-connect
  const nearbyDangling = findDanglingEdgeNear(x, y);
  if (nearbyDangling) {
    connectDanglingEdge(nearbyDangling.edge, node.id, nearbyDangling.type);
    showToast(t('toasts.danglingEdgeConnected'));
  }
  
  computeNodeTypes();
  pushUndo({ type: 'nodeCreate', nodeId: node.id });
  saveToStorage();
  updateCanvasEmptyState();
  // Trigger placement animation + haptic feedback
  _animatingNodes.set(String(node.id), performance.now());
  navigator.vibrate?.(10);
  scheduleDraw();
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
  pushUndo({ type: 'edgeCreate', edgeId: edge.id });
  saveToStorage();
  // Trigger snap animation + haptic feedback
  _animatingEdges.set(edge.id, performance.now());
  navigator.vibrate?.(10);
  scheduleDraw();
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

// ── Required Field Validation ──────────────────────────────────────────────

/**
 * Mark required fields in a details container with visual indicators.
 * Adds a red asterisk to labels of required fields and applies `.invalid`
 * class to empty selects/inputs, with a small error message below.
 *
 * @param {HTMLElement} container - The form container
 * @param {Set|Array} requiredFields - Field keys that are required (snake_case)
 */
function markRequiredFields(container, requiredFields) {
  if (!requiredFields || requiredFields.size === 0) return;
  const required = requiredFields instanceof Set ? requiredFields : new Set(requiredFields);

  // Map snake_case field keys to DOM element IDs
  const fieldIdMap = {
    'accuracy_level': 'accuracyLevelSelect',
    'maintenance_status': 'nodeMaintenanceStatusSelect',
    'material': 'materialSelect',
    'cover_diameter': 'coverDiameterSelect',
    'access': 'accessSelect',
    'note': 'noteInput',
    'edge_type': 'edgeTypeSelect',
    'engineering_status': 'edgeEngineeringStatusSelect',
    'line_diameter': 'edgeDiameterSelect',
    'tail_measurement': 'tailInput',
    'head_measurement': 'headInput',
    'fall_depth': 'fallDepthInput',
    'fall_position': 'fallPositionSelect',
  };

  for (const fieldKey of required) {
    const elId = fieldIdMap[fieldKey];
    if (!elId) continue;
    const el = container.querySelector('#' + elId);
    if (!el) continue;

    // Add required asterisk to the label
    const field = el.closest('.field');
    if (field) {
      const label = field.querySelector('label');
      if (label && !label.querySelector('.field-required-mark')) {
        const mark = document.createElement('span');
        mark.className = 'field-required-mark';
        mark.textContent = ' *';
        label.appendChild(mark);
      }
    }

    // Check if the field value is empty
    const isEmpty = el.tagName === 'TEXTAREA'
      ? !el.value.trim()
      : (el.tagName === 'SELECT' ? (!el.value || el.value === '') : !el.value.trim());

    if (isEmpty) {
      el.classList.add('invalid');
      // Add error message below the field if not already present
      if (field && !field.querySelector('.field-error')) {
        const err = document.createElement('div');
        err.className = 'field-error';
        err.innerHTML = `<span class="material-icons" style="font-size:14px">error_outline</span> ${t('validation.required')}`;
        field.appendChild(err);
      }
    }

    // On change, re-evaluate validity
    el.addEventListener('change', () => {
      const nowEmpty = el.tagName === 'TEXTAREA'
        ? !el.value.trim()
        : (el.tagName === 'SELECT' ? (!el.value || el.value === '') : !el.value.trim());
      el.classList.toggle('invalid', nowEmpty);
      const errEl = field?.querySelector('.field-error');
      if (nowEmpty && !errEl && field) {
        const err = document.createElement('div');
        err.className = 'field-error';
        err.innerHTML = `<span class="material-icons" style="font-size:14px">error_outline</span> ${t('validation.required')}`;
        field.appendChild(err);
      } else if (!nowEmpty && errEl) {
        errEl.remove();
      }
    });
  }
}

// Long-Press Context Menu -- [Extracted to src/legacy/pointer-handlers.js]
// showNodeContextMenu, _contextMenuDismiss, hideNodeContextMenu, clearLongPressTimer

// ── Undo Action System ──────────────────────────────────────────────────────
// [Extracted to src/legacy/undo-redo.js]
// pushUndo, pushUndoDirect, clearUndoStack, updateUndoButton, updateRedoButton,
// deepCopyObj, deleteNodeShared, deleteEdgeShared, nodeHasValuableData, edgeHasValuableData,
// performUndo, performRedo, updateIncompleteEdgeTracker, findDanglingEdgeNear,
// findDanglingEndpointAt, findDanglingSnapTarget, mergeDanglingEdges, connectDanglingEdge,
// finalizeDanglingEndpointDrag

// Drawing functions — extracted to ./canvas-draw.js

// ── Node Tab Wizard helpers ──────────────────────────────────
let __wizardActiveTab = null; // persists across renderDetails re-renders

const WIZARD_TAB_DEFS = {
  accuracy_level:     { icon: 'gps_fixed', color: '#1565C0', bg: '#E3F2FD', labelKey: 'labels.accuracyLevel' },
  maintenance_status: { icon: 'build',     color: '#E65100', bg: '#FFF3E0', labelKey: 'labels.maintenanceStatus' },
  material:           { icon: 'layers',    color: '#6A1B9A', bg: '#F3E5F5', labelKey: 'labels.coverMaterial' },
  cover_diameter:     { icon: 'circle',    color: '#2E7D32', bg: '#E8F5E9', labelKey: 'labels.coverDiameter' },
  access:             { icon: 'stairs',    color: '#C62828', bg: '#FFEBEE', labelKey: 'labels.access' },
  note:               { icon: 'notes',     color: '#37474F', bg: '#ECEFF1', labelKey: 'labels.note' },
};

// Maintenance codes that block access to manhole internals
const WIZARD_CLOSED_MAINT = new Set([3, 4, 5, 13]);
// Maintenance codes where there's no cover (skip material/diameter)
const WIZARD_NO_COVER_MAINT = new Set([10]);

/**
 * Check if a node has incomplete wizard tabs (any visible tab not filled).
 */
function isNodeIncomplete(node) {
  if (node.nodeType === 'Home' || node.nodeType === 'ForLater' || node.nodeType === 'למדידה מאוחרת' || node.nodeType === 'Issue') return false;
  const visibleTabs = wizardGetVisibleTabs(node);
  return visibleTabs.some(key => !wizardIsFieldFilled(node, key));
}

/**
 * Find the next incomplete node after the given node.
 * Priority: BFS through connected nodes first, then by ID order.
 */
function findNextIncompleteNode(currentNode) {
  // BFS through connected nodes
  const visited = new Set([String(currentNode.id)]);
  const queue = [currentNode];
  while (queue.length > 0) {
    const n = queue.shift();
    // Find neighbors
    for (const edge of edges) {
      let neighborId = null;
      if (String(edge.tail) === String(n.id) && edge.head != null) neighborId = String(edge.head);
      else if (String(edge.head) === String(n.id) && edge.tail != null) neighborId = String(edge.tail);
      if (neighborId && !visited.has(neighborId)) {
        visited.add(neighborId);
        const neighbor = nodeMap.get(neighborId);
        if (neighbor) {
          if (isNodeIncomplete(neighbor)) return neighbor;
          queue.push(neighbor);
        }
      }
    }
  }
  // Fallback: any incomplete node by order
  for (const node of nodes) {
    if (String(node.id) === String(currentNode.id)) continue;
    if (isNodeIncomplete(node)) return node;
  }
  return null;
}

/**
 * Center the viewport on a given node.
 */
function centerOnNode(node) {
  const canvasW = canvas.width / (window.devicePixelRatio || 1);
  const canvasH = canvas.height / (window.devicePixelRatio || 1);
  const tx = canvasW / 2 - viewScale * viewStretchX * node.x;
  const ty = canvasH / 2 - viewScale * viewStretchY * node.y;
  window.__setViewState?.(viewScale, tx, ty);
}

function wizardIsRTKFixed(node) {
  const inMap = typeof coordinatesMap !== 'undefined' && coordinatesMap && coordinatesMap.has(String(node.id));
  return node.gnssFixQuality === 4 ||
    (inMap && node.gnssFixQuality !== 5 && node.gnssFixQuality !== 6) ||
    (node.measure_precision != null && node.measure_precision <= 0.05);
}

function wizardGetVisibleTabs(node) {
  const tabs = [];
  const autoFixed = wizardIsRTKFixed(node);
  if (!autoFixed) tabs.push('accuracy_level');
  tabs.push('maintenance_status');
  const maint = Number(node.maintenanceStatus);
  if (maint === 0) return tabs; // not set yet, stop here
  if (WIZARD_CLOSED_MAINT.has(maint)) { tabs.push('note'); return tabs; }
  if (WIZARD_NO_COVER_MAINT.has(maint)) { tabs.push('access'); tabs.push('note'); return tabs; }
  tabs.push('material'); tabs.push('cover_diameter'); tabs.push('access'); tabs.push('note');
  return tabs;
}

function wizardIsFieldFilled(node, key) {
  switch (key) {
    case 'accuracy_level':     return Number(node.accuracyLevel) !== 0 || wizardIsRTKFixed(node);
    case 'maintenance_status': return Number(node.maintenanceStatus) !== 0;
    case 'material':           { const m = node.material; return m && m !== 'לא ידוע' && m !== ''; }
    case 'cover_diameter':     return node.coverDiameter !== '' && node.coverDiameter != null && node.coverDiameter !== 'לא ידוע';
    case 'access':             return Number(node.access) !== 0;
    case 'note':               return !!(node.note && node.note.trim());
    default:                   return false;
  }
}

function buildWizardTabsHTML(node, activeKey, visibleTabs) {
  return visibleTabs.map(key => {
    const def = WIZARD_TAB_DEFS[key];
    const filled = wizardIsFieldFilled(node, key);
    const isActive = key === activeKey;
    let cls = 'wizard-tab';
    if (isActive) cls += ' wizard-tab--active';
    if (filled) cls += ' wizard-tab--filled';
    const label = t(def.labelKey);
    return `<button class="${cls}" data-wizard-tab="${key}" title="${label}"
              style="--tab-color:${def.color};--tab-bg:${def.bg}">
      <span class="material-icons">${def.icon}</span>
      <span class="wizard-check material-icons ${filled ? 'wizard-check--filled' : 'wizard-check--empty'}">${filled ? 'check_circle' : 'radio_button_unchecked'}</span>
    </button>`;
  }).join('');
}

function buildWizardFieldHTML(node, activeKey, ruleResults, opts) {
  const def = WIZARD_TAB_DEFS[activeKey];
  const label = t(def.labelKey);
  let inputHtml = '';
  switch (activeKey) {
    case 'accuracy_level':
      inputHtml = `<select id="accuracyLevelSelect" class="wizard-field-input">${opts.accuracyLevelOptions}</select>`;
      break;
    case 'maintenance_status':
      inputHtml = `<select id="nodeMaintenanceStatusSelect" class="wizard-field-input">${opts.maintenanceStatusOptions}</select>`;
      break;
    case 'material':
      inputHtml = `<select id="materialSelect" class="wizard-field-input">${opts.materialOptions}</select>`;
      break;
    case 'cover_diameter':
      inputHtml = `<select id="coverDiameterSelect" class="wizard-field-input">
        ${NODE_COVER_DIAMETERS.map(d => `<option value="${d}" ${String(node.coverDiameter) === d ? 'selected' : ''}>${getOptionLabel(d)}</option>`).join('')}
      </select>`;
      break;
    case 'access':
      inputHtml = `<select id="accessSelect" class="wizard-field-input">${opts.accessOptions}</select>`;
      break;
    case 'note':
      inputHtml = `<textarea id="noteInput" rows="3" class="wizard-field-input" placeholder="${t('labels.notePlaceholder')}" dir="auto">${escapeHtml(node.note || '')}</textarea>`;
      break;
  }
  return `
    <div class="wizard-field-header" style="color:${def.color}">
      <span class="material-icons">${def.icon}</span>
      <span class="wizard-field-label">${label}</span>
    </div>
    ${inputHtml}
  `;
}

// ============================================
// Details panel, sidebar, issue comments - [Extracted to src/legacy/details-panel.js]
// renderDetails, closeSidebarPanel, assignHomeIdFromConnectedManhole,
// _fetchOrgMembers, _attachMentionAutocomplete, _extractMentionedUserIds,
// _loadIssueComments, _sendIssueComment, initDetailsPanel
// ============================================

// Hit-testing & Pointer event handlers -- [Extracted to src/legacy/pointer-handlers.js]
// findNodeAt, findNodeAtWithExpansion, findEdgeAt, pointerDown, pointerMove, pointerUp
// Canvas event listeners wired via initPointerHandlers().

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
if (newSketchBtn) newSketchBtn.addEventListener('click', async () => {
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
  syncFlyoutIcon();
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
  // Always show Cancel so first-time users can dismiss the start panel
  if (cancelBtn) cancelBtn.style.display = 'inline-block';
});

startBtn.addEventListener('click', () => {
  commitIdInputIfFocused();
  const dateVal = dateInput.value;
  if (!dateVal) {
    showToast(t('alerts.pickDate'));
    return;
  }
  
  // Get selected project
  const projectSelect = document.getElementById('projectSelect');
  const selectedProjectId = projectSelect?.value || null;
  
  // If projects are available, require selection
  if (availableProjects.length > 0 && !selectedProjectId) {
    showToast(t('alerts.selectProject'));
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
  syncFlyoutIcon();
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
    showToast(t('toasts.cancelled'));
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
    if (issueNodeModeBtn) issueNodeModeBtn.classList.remove('active');
    if (edgeModeBtn) edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
    pendingEdgeStartPosition = null;
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    showToast(t('toasts.nodeMode'), 1200);
  });
}
if (homeNodeModeBtn) {
  homeNodeModeBtn.addEventListener('click', () => {
    commitIdInputIfFocused();
    currentMode = 'home';
    homeNodeModeBtn.classList.add('active');
    if (nodeModeBtn) nodeModeBtn.classList.remove('active');
    if (drainageNodeModeBtn) drainageNodeModeBtn.classList.remove('active');
    if (issueNodeModeBtn) issueNodeModeBtn.classList.remove('active');
    if (edgeModeBtn) edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
    pendingEdgeStartPosition = null;
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    showToast(t('home'), 1200);
  });
}
if (drainageNodeModeBtn) {
  drainageNodeModeBtn.addEventListener('click', () => {
    commitIdInputIfFocused();
    currentMode = 'drainage';
    drainageNodeModeBtn.classList.add('active');
    if (nodeModeBtn) nodeModeBtn.classList.remove('active');
    if (homeNodeModeBtn) homeNodeModeBtn.classList.remove('active');
    if (issueNodeModeBtn) issueNodeModeBtn.classList.remove('active');
    if (edgeModeBtn) edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
    pendingEdgeStartPosition = null;
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    showToast(t('drainage'), 1200);
  });
}
if (issueNodeModeBtn) {
  issueNodeModeBtn.addEventListener('click', () => {
    commitIdInputIfFocused();
    currentMode = 'issue';
    issueNodeModeBtn.classList.add('active');
    if (nodeModeBtn) nodeModeBtn.classList.remove('active');
    if (homeNodeModeBtn) homeNodeModeBtn.classList.remove('active');
    if (drainageNodeModeBtn) drainageNodeModeBtn.classList.remove('active');
    if (edgeModeBtn) edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
    pendingEdgeStartPosition = null;
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    showToast(t('toasts.issueMode'), 1200);
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
    if (issueNodeModeBtn) issueNodeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
    pendingEdgeStartPosition = null;
    selectedNode = null;
    selectedEdge = null;
    renderDetails();
    showToast(t('toasts.edgeMode'), 1200);
  });
}
// ── Node-type flyout (mobile) ──────────────────────────────────
// On mobile, 4 node-type buttons collapse into a single trigger
// that opens a flyout panel.  Selecting a type closes the flyout
// and updates the trigger icon to reflect the active type.
const NODE_TYPE_ICONS = {
  node:     'radio_button_unchecked',
  home:     'home',
  drainage: 'water_drop',
  issue:    'report_problem',
};

// Safe to call at any time — no-ops if flyout elements are absent.
function syncFlyoutIcon() {
  if (!nodeTypeFlyoutBtn) return;
  const iconEl = nodeTypeFlyoutBtn.querySelector('.material-icons');
  if (!iconEl) return;
  const isNodeType = ['node', 'home', 'drainage', 'issue'].includes(currentMode);
  iconEl.textContent = isNodeType
    ? (NODE_TYPE_ICONS[currentMode] || 'radio_button_unchecked')
    : 'radio_button_unchecked';
  nodeTypeFlyoutBtn.classList.toggle('has-active-type', isNodeType);
  nodeTypeFlyoutBtn.classList.toggle('active', isNodeType);
}

function closeFlyout() {
  if (!nodeTypeFlyout || !nodeTypeFlyoutBtn) return;
  nodeTypeFlyout.classList.remove('open');
  nodeTypeFlyoutBtn.setAttribute('aria-expanded', 'false');
}

if (nodeTypeFlyoutBtn && nodeTypeFlyout) {
  function toggleFlyout() {
    const isOpen = nodeTypeFlyout.classList.toggle('open');
    nodeTypeFlyoutBtn.setAttribute('aria-expanded', String(isOpen));
  }

  nodeTypeFlyoutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFlyout();
  });

  // Close flyout when a node-type button is clicked
  [nodeModeBtn, homeNodeModeBtn, drainageNodeModeBtn, issueNodeModeBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', () => {
      closeFlyout();
      syncFlyoutIcon();
    });
  });

  // Close flyout when edge mode or any non-node-type is chosen
  if (edgeModeBtn) edgeModeBtn.addEventListener('click', () => {
    closeFlyout();
    syncFlyoutIcon();
  });

  // Close flyout on outside tap
  document.addEventListener('click', (e) => {
    if (!nodeTypeFlyout.classList.contains('open')) return;
    if (nodeTypeFlyoutBtn.contains(e.target) || nodeTypeFlyout.contains(e.target)) return;
    closeFlyout();
  });

  // Initial sync
  syncFlyoutIcon();
}

// Undo button
if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    performUndo();
  });
  updateUndoButton();
}
// Redo button
if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    performRedo();
  });
  updateRedoButton();
}
// 3D View button (admin/super_admin only)
if (threeDViewBtn) {
  threeDViewBtn.addEventListener('click', async () => {
    if (nodes.length === 0) {
      showToast(t('threeD.noNodes'));
      return;
    }
    try {
      threeDViewBtn.disabled = true;
      const { open3DView } = await import('../three-d/three-d-view.js');
      const selection = window.__getSelection?.() ?? null;
      await open3DView({ selection });
    } catch (err) {
      console.error('[3D View] Failed to load:', err);
      showToast(t('threeD.loadError'));
    } finally {
      threeDViewBtn.disabled = false;
    }
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
  exportNodesBtn.addEventListener('click', async () => {
    if (nodes.length === 0) {
      showToast(t('alerts.noNodesToExport'));
      return;
    }
    showToast(t('toasts.exporting'));
    const { exportNodesCsv } = await import('../utils/csv.js');
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
  exportEdgesBtn.addEventListener('click', async () => {
    if (edges.length === 0) {
      showToast(t('alerts.noEdgesToExport'));
      return;
    }
    showToast(t('toasts.exporting'));
    const { exportEdgesCsv } = await import('../utils/csv.js');
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
  exportSketchBtn.addEventListener('click', async () => {
    if (nodes.length === 0 && edges.length === 0) {
      showToast(t('alerts.noSketchToExport'));
      return;
    }
    try {
      showToast(t('toasts.exporting'));
      const { exportSketchToJson } = await import('../utils/sketch-io.js');
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
      showToast(t('alerts.exportFailed'));
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
      const { importSketchFromJson } = await import('../utils/sketch-io.js');
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
      _nodeMapDirty = true; _spatialGridDirty = true; _dataVersion++;
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
      updateCanvasEmptyState();
      draw();
      renderDetails();

      // Recenter view
      try { recenterView(); } catch (_) { }

      showToast(t('toasts.sketchImported'));

    } catch (error) {
      console.error('[App] Import error:', error.message);
      showToast(t('alerts.importFailed'));
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
    hideHome();
    updateCanvasEmptyState();
  });
}
if (sketchListEl) {
  // S-04: Allow keyboard activation (Enter/Space) on sketch titles with role="button"
  sketchListEl.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains('sketch-title') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      target.click();
    }
  });
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

// Auto size toggle — keeps nodes/edges at constant screen pixel size during zoom
function updateAutoSizeBtnStyle() {
  const activeClass = 'menu-btn--active';
  if (autoSizeBtn) {
    autoSizeBtn.classList.toggle(activeClass, autoSizeEnabled);
  }
  if (mobileAutoSizeBtn) {
    mobileAutoSizeBtn.classList.toggle('active', autoSizeEnabled);
  }
}

function toggleAutoSize() {
  autoSizeEnabled = !autoSizeEnabled;
  localStorage.setItem(STORAGE_KEYS.autoSize, String(autoSizeEnabled));
  updateAutoSizeBtnStyle();
  scheduleDraw();
  showToast(autoSizeEnabled ? t('toasts.autoSizeOn') : t('toasts.autoSizeOff'));
}

// Load auto size preference
try {
  const savedAutoSize = localStorage.getItem(STORAGE_KEYS.autoSize);
  if (savedAutoSize === 'false') {
    autoSizeEnabled = false;
  }
} catch (e) {
  console.warn('[App] Failed to load auto size preference:', e.message);
}
updateAutoSizeBtnStyle();

if (autoSizeBtn) {
  autoSizeBtn.addEventListener('click', toggleAutoSize);
}
if (mobileAutoSizeBtn) {
  mobileAutoSizeBtn.addEventListener('click', toggleAutoSize);
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
  // Update page title
  document.title = t('appTitle') || 'Manhole Mapper';
  // Dispatch custom event for language change (for floating keyboard and other modules)
  document.dispatchEvent(new Event('appLanguageChanged'));
  // Re-render dynamic lists and details with translated labels
  if (homePanel && homePanel.style.display === 'flex') {
    renderHome();
  }
  renderDetails();
  // Re-mount auth forms if login panel is visible (so translations update)
  if (loginPanel && loginPanel.style.display === 'flex') {
    const hash = location.hash;
    if (hash === '#/signup') {
      mountAuthSignUp();
    } else {
      mountAuthSignIn();
    }
    // Update login panel wrapper text
    if (loginTitle) loginTitle.textContent = t('auth.loginTitle');
    if (loginSubtitle) loginSubtitle.textContent = t('auth.loginSubtitle');
  }
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

// [Extracted to src/legacy/mobile-menu.js]
initMobileMenu();

// [Extracted to src/legacy/finish-workday.js]
initFinishWorkday();

// [Extracted to src/legacy/coordinate-handlers.js]
initCoordinateHandlers();

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

// [Moved to src/legacy/gnss-handlers.js → initGnssHandlers()]
// gnssState 'position' subscription, gpsQuickCaptureBtn click wiring,
// and updateGpsQuickCaptureBtn are now in gnss-handlers.js.
let _liveMeasureFirstFixDone = false; // kept here so S proxy getter/setter still works

// ============================================
// Reference Layers UI Controls  (→ view-utils.js)
// ============================================
initRefLayerToggles();

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

  // Ctrl+Z / Cmd+Z — undo last action
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    performUndo();
    return;
  }

  // Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y / Cmd+Y — redo last action
  if ((e.ctrlKey || e.metaKey) && (
    (e.key === 'z' && e.shiftKey) ||
    (e.key === 'y' && !e.shiftKey) ||
    (e.key === 'Z' && e.shiftKey)
  )) {
    e.preventDefault();
    performRedo();
    return;
  }

  // Mode toggles
  if (!isTyping && (e.key === 'n' || e.key === 'N')) {
    if (nodeModeBtn && edgeModeBtn) {
      nodeModeBtn.click();
      e.preventDefault();
    } else {
      currentMode = 'node';
      pendingEdgeTail = null;
      pendingEdgePreview = null;
      showToast(t('toasts.nodeMode'), 1200);
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
      showToast(t('toasts.edgeMode'), 1200);
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

  // Escape: close modals/panels, cancel pending edge, or clear selection
  if (e.key === 'Escape') {
    // K-01: Close admin screen if open
    if (adminScreen && adminScreen.style.display !== 'none') {
      closeAdminScreen();
      try { location.hash = '#/'; } catch (_) {}
      e.preventDefault();
      return;
    }
    // K-01: Close projects screen if open
    if (projectsScreen && projectsScreen.style.display !== 'none') {
      closeProjectsScreen();
      try { location.hash = '#/'; } catch (_) {}
      e.preventDefault();
      return;
    }
    // K-01: Close admin modal if open
    if (adminModal && adminModal.style.display !== 'none') {
      closeAdminModal();
      e.preventDefault();
      return;
    }
    if (helpModal && helpModal.style.display === 'flex') {
      hidePanelAnimated(helpModal);
      e.preventDefault();
      return;
    }
    // K-02: Close home panel if open
    if (homePanel && homePanel.style.display === 'flex') {
      hideHome();
      e.preventDefault();
      return;
    }
    // Close start panel if open
    if (startPanel && startPanel.style.display === 'flex') {
      startPanel.style.display = 'none';
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
      deleteNodeShared(selectedNode);
      e.preventDefault();
    } else if (selectedEdge) {
      deleteEdgeShared(selectedEdge);
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
// Throttled zoom toast — avoid DOM manipulation on every wheel tick
let _zoomToastTimer = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect(); // fresh rect — panels/drawers can shift canvas position
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
  // Throttle toast to once per 120ms to reduce DOM churn during rapid scrolling
  clearTimeout(_zoomToastTimer);
  _zoomToastTimer = setTimeout(() => {
    showToast(t('toasts.zoom', (viewScale * 100).toFixed(0)));
  }, 120);
}, { passive: false });

// ============================================
// View / Zoom Utilities + Search  (→ view-utils.js)
// ============================================
initViewHandlers();
  initPointerHandlers();

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
  syncFlyoutIcon();
  resizeCanvas();
  renderDetails();
}

// ─── Function registry for extracted modules ────────────────────────────────
// Set here (after all function definitions) so extracted modules can call
// cross-module functions via F.X() without circular imports.
F.scheduleDraw            = (...a) => scheduleDraw(...a);
F.getCachedCanvasRect     = (...a) => getCachedCanvasRect(...a);
F.stretchedNode           = (...a) => stretchedNode(...a);
F.stretchedNodeFast       = (...a) => stretchedNodeFast(...a);
F.diameterToColor         = (...a) => diameterToColor(...a);
F.updateIncompleteEdgeTracker = (...a) => updateIncompleteEdgeTracker(...a);
F.getSelectedSketchIds    = (...a) => getSelectedSketchIds(...a);
F.saveToStorage           = (...a) => saveToStorage(...a);
F.renderDetails           = (...a) => renderDetails(...a);
F.showToast               = (...a) => showToast(...a);
F.applyCoordinatesIfEnabled = (...a) => applyCoordinatesIfEnabled(...a);
F.createNode              = (...a) => createNode(...a);
F.createEdge              = (...a) => createEdge(...a);
F.computeNodeTypes        = (...a) => computeNodeTypes(...a);
F.syncCoordinatesToggleUI = (...a) => syncCoordinatesToggleUI(...a);
F.saveCoordinatesEnabled  = (...a) => saveCoordinatesEnabled(...a);
F.updateGpsQuickCaptureBtn = (...a) => updateGpsQuickCaptureBtn(...a);
F.zoomToFit               = (...a) => zoomToFit(...a);
F.recenterView            = (...a) => recenterView(...a);
F.updateLocationStatus    = (...a) => updateLocationStatus(...a);
F.syncLiveMeasureToggleUI = (...a) => syncLiveMeasureToggleUI(...a);
F.setLiveMeasureMode      = (...a) => setLiveMeasureMode(...a);
F.updateSketchNameDisplay = (...a) => updateSketchNameDisplay(...a);
F.t                       = (...a) => t(...a);
F.getNextNodeId           = () => nextNodeId++;
F.applyLangToStaticUI     = (...a) => applyLangToStaticUI(...a);
F.saveAdminConfig         = (...a) => saveAdminConfig(...a);
F.markInternalNavigation  = (...a) => markInternalNavigation(...a);
F.closeMobileMenu         = (...a) => closeMobileMenu(...a);
F.hidePanelAnimated       = (...a) => hidePanelAnimated(...a);
F.getCurrentUsername      = (...a) => getCurrentUsername(...a);
F.handleRoute             = (...a) => handleRoute(...a);
// Details-panel module dependencies
F.debouncedSaveToStorage  = (...a) => debouncedSaveToStorage(...a);
F.getSortedOptions        = (...a) => getSortedOptions(...a);
F.trackFieldUsage         = (...a) => trackFieldUsage(...a);
F.centerOnNode            = (...a) => centerOnNode(...a);
F.findNextIncompleteNode  = (...a) => findNextIncompleteNode(...a);
F.renameNodeIdInternal    = (...a) => renameNodeIdInternal(...a);
F.collectUsedNumericIds   = (...a) => collectUsedNumericIds(...a);
F.findSmallestAvailableNumericId = (...a) => findSmallestAvailableNumericId(...a);
F.updateNodeTimestamp     = (...a) => updateNodeTimestamp(...a);
F.updateEdgeTimestamp     = (...a) => updateEdgeTimestamp(...a);
F.deleteNodeShared        = (...a) => deleteNodeShared(...a);
F.deleteEdgeShared        = (...a) => deleteEdgeShared(...a);
F.markRequiredFields      = (...a) => markRequiredFields(...a);
F.wizardGetVisibleTabs    = (...a) => wizardGetVisibleTabs(...a);
F.wizardIsRTKFixed        = (...a) => wizardIsRTKFixed(...a);
F.buildWizardTabsHTML     = (...a) => buildWizardTabsHTML(...a);
F.buildWizardFieldHTML    = (...a) => buildWizardFieldHTML(...a);
F.resizeCanvas            = (...a) => resizeCanvas(...a);
F.updateIncompleteEdgeTracker = (...a) => updateIncompleteEdgeTracker(...a);
// Undo-redo module dependencies
F.findIncompleteEdges     = (...a) => findIncompleteEdges(...a);
F.findNodeAt              = (...a) => findNodeAt(...a);
F.updateCanvasEmptyState  = (...a) => updateCanvasEmptyState(...a);
F.markEdgeLabelCacheDirty = (...a) => markEdgeLabelCacheDirty(...a);
// Pointer-handlers module dependencies
F.screenToWorld           = (...a) => screenToWorld(...a);
F.createDanglingEdge      = (...a) => createDanglingEdge(...a);
F.createInboundDanglingEdge = (...a) => createInboundDanglingEdge(...a);
F.pushUndo                = (...a) => pushUndo(...a);
F.autoPanWhenDragging     = (...a) => autoPanWhenDragging(...a);
F.getMapReferencePoint    = (...a) => getMapReferencePoint(...a);
F.draw                    = (...a) => draw(...a);
F.findDanglingEndpointAt  = (...a) => findDanglingEndpointAt(...a);
F.findDanglingSnapTarget  = (...a) => findDanglingSnapTarget(...a);
F.finalizeDanglingEndpointDrag = (...a) => finalizeDanglingEndpointDrag(...a);
F.invalidateCanvasRectCache = (...a) => invalidateCanvasRectCache(...a);
F._setDraggingDanglingStart = (v) => { draggingDanglingStart = v; };
// ────────────────────────────────────────────────────────────────────────────

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
  showToast(e.message || t('errors.unexpected'));
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[App] Unhandled rejection:', e.reason?.message || e.reason);
  showToast(e.reason && e.reason.message ? e.reason.message : t('errors.unexpected'));
});

// ============================================
// GNSS / Live Measure Mode Integration
// ============================================
// [Extracted to src/legacy/gnss-handlers.js]
initGnssHandlers();

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
window.__createNodeFromMeasurement = createNodeFromMeasurement;

// ============================================
// TSC3 Survey Device Integration
// ============================================
// [Extracted to src/legacy/tsc3-handlers.js]
initTSC3Handlers();

// Admin/Projects screen handlers
// [Extracted to src/legacy/admin-handlers.js]
initAdminHandlers();

// Details panel / sidebar close listeners
// [Extracted to src/legacy/details-panel.js]
initDetailsPanel();

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

  // Confirm exit when there's an active sketch with data.
  // Skip during intentional in-app navigation (see markInternalNavigation).
  if (!_internalNavigation && (nodes?.length > 0 || edges?.length > 0)) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ── Internal-navigation flag ───────────────────────────────────────────────
// On Android/Capacitor WebView, location.hash changes can fire popstate before
// the hash updates. This flag suppresses the exit-guard during those transitions.
let _internalNavigation = false;
function markInternalNavigation() {
  _internalNavigation = true;
  setTimeout(() => { _internalNavigation = false; }, 100);
}

// ── Android back-button exit guard ────────────────────────────────────────
// Push a history entry so the Android back button triggers popstate instead
// of immediately exiting the app/PWA. On popstate we prompt confirmation.
(function initBackButtonGuard() {
  // Push a guard state so "back" pops it rather than leaving the page
  history.pushState({ _guard: true }, '');

  window.addEventListener('popstate', (e) => {
    // Ignore popstate triggered by intentional in-app navigation (e.g. navigateToProjects)
    if (_internalNavigation) return;

    // Always re-push the guard state so the barrier stays in place
    history.pushState({ _guard: true }, '');

    // If the details/sidebar drawer is open, close it first
    if (sidebarEl && sidebarEl.classList.contains('open')) {
      sidebarEl.classList.remove('open');
      if (document.body && document.body.classList) document.body.classList.remove('drawer-open');
      selectedNode = null;
      selectedEdge = null;
      renderDetails();
      scheduleDraw();
      return;
    }

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
