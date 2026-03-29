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
// [mountSignIn, mountSignUp, unmountAuth — moved to src/legacy/auth-ui.js]
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
  loadSectionSettings,
  hitTestReferenceLayers
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
import { S, F, bridgedProperty, hydrateStore } from './shared-state.js';
import { bus } from '../state/event-bus.js';
import { initGnssHandlers, setLiveMeasureMode, syncLiveMeasureToggleUI, updateLocationStatus, openGnssPointCaptureDialog, handleGnssPointCapture, vibrateForFixQuality, gpsQuickCapture, createNodeFromMeasurement, getNextEdgeId, centerOnGpsLocation, centerNewSketchOnUserLocation, toggleUserLocationTracking, updateGpsQuickCaptureBtn } from './gnss-handlers.js';
import { initCoordinateHandlers, handleCoordinatesImport, applyCoordinatesIfEnabled, restoreOriginalPositions, toggleCoordinates, syncCoordinatesToggleUI, toggleMapLayer, syncMapLayerToggleUI, getMeasurementBoundsItm, startMeasurementTilesPrecache, updateMapReferencePoint, autoRepositionFromEmbeddedCoords, showCoordinatesRequiredPrompt, updateScaleDisplay, saveCoordinateScale, loadCoordinateScale, updateStretchDisplay, saveViewStretch, loadViewStretch, changeViewStretch, resetViewStretch, changeCoordinateScale, initCoordinates, addCoordinatesReferenceLayer } from './coordinate-handlers.js';
import { draw, scheduleDraw, scheduleEdgeLegendUpdate, scheduleIncompleteEdgeUpdate, renderEdgeLegend, drawInfiniteGrid, ensureVirtualPadding, autoPanWhenDragging, computeNodeTypes, drawEdge, drawDanglingEdgeLocal, drawEdgeLabels, drawNode, drawHouse, drawDirectConnectionBadge, updateCanvasEmptyState } from './canvas-draw.js';
// TSC3 survey handlers are lazy-loaded below (perf: only needed for survey device connections)
import { initAdminHandlers, openAdminModal, closeAdminModal, openAdminScreen, closeAdminScreen, openProjectsScreen, closeProjectsScreen, navigateToAdmin, navigateToProjects, getAdminSettingsModal, getAdminSettingsScreen } from './admin-handlers.js';
import { renderDetails, closeSidebarPanel, initDetailsPanel, assignHomeIdFromConnectedManhole } from './details-panel.js';
import { renderRefLayerToggles, syncRefLayerCheckboxes, initRefLayerToggles, screenToWorld, applyStretch, stretchedNodeFast, stretchedNode, setZoom, getSketchCenter, recenterView, zoomToFit, getSketchDensityCenter, recenterDensityView, searchAndCenterNode, geocodeAddress, searchAddressAndCenter, runAddressSearch, initViewHandlers } from './view-utils.js';
import { findNodeAt, findNodeAtWithExpansion, findEdgeAt, showNodeContextMenu, _contextMenuDismiss, hideNodeContextMenu, clearLongPressTimer, initPointerHandlers } from './pointer-handlers.js';
import { getLibrary, setLibrary, invalidateLibraryCache, syncProjectSketchesToLibrary, generateSketchId, saveToLibrary, loadFromLibrary, loadProjectReferenceLayers, deleteFromLibrary, migrateSingleSketchToLibraryIfNeeded, updateSyncStatusUI, formatTimeAgo } from './library-manager.js';
import { renderResumeBar, renderSearchBar, renderHome, hideHome, renderHomeModeTabs, renderProjectsHome, repositionAllProjectSketchNodes, loadProjectCanvas, precacheProjectTiles, handleChangeProject, getHomeMode } from './home-renderer.js';
import { pushUndo, pushUndoDirect, clearUndoStack, updateUndoButton, updateRedoButton, deepCopyObj, deleteNodeShared, deleteEdgeShared, nodeHasValuableData, edgeHasValuableData, performUndo, performRedo, updateIncompleteEdgeTracker, findDanglingEdgeNear, findDanglingEndpointAt, findDanglingSnapTarget, mergeDanglingEdges, connectDanglingEdge, finalizeDanglingEndpointDrag } from './undo-redo.js';
import { closeMobileMenu, initMobileMenu } from './mobile-menu.js';
import { initToolbarEvents, increaseSizeScale, decreaseSizeScale, updateAutoSizeBtnStyle, toggleAutoSize, loadSizePreferences } from './toolbar-events.js';
import { initFinishWorkday } from './finish-workday.js';
// Auth UI, login panel, routing — [Extracted to src/legacy/auth-ui.js]
import { hidePanelAnimated, showLoginPanel, hideLoginPanel, showAuthLoading, hideAuthLoading, mountAuthSignIn, mountAuthSignUp, updateUserButtonVisibility, handleRoute, preventModalScrollPropagation, initAuthUI } from './auth-ui.js';
// Storage/persistence and ID management — [Extracted to src/legacy/storage-manager.js]
import { normalizeLegacySketch, loadFromStorage, saveToStorage, debouncedSaveToStorage, clearStorage, collectUsedNumericIds, findSmallestAvailableNumericId, renameNodeIdInternal } from './storage-manager.js';
// Project dropdown and flyout UI — [Extracted to src/legacy/project-ui.js]
import { fetchProjects, renderProjectDropdown, getProjectInputFlowConfig, syncFlyoutIcon, closeFlyout, initProjectUI } from './project-ui.js';
// Utility functions and canvas helpers — [Extracted to src/legacy/app-utils.js]
import { getCurrentUsername, updateNodeTimestamp, updateEdgeTimestamp, synthesizeClickOnTap, updateSketchNameDisplay, getCachedCanvasRect, invalidateCanvasRectCache, markEdgeLabelCacheDirty, resizeCanvas, scheduleResizeCanvas, saveAdminConfig, defaultAdminConfig, loadAdminConfig } from './app-utils.js';
// Graph CRUD — [Extracted to src/legacy/graph-crud.js]
import { newSketch, createNode, createEdge, createDanglingEdge, createInboundDanglingEdge, findIncompleteEdges, markRequiredFields, isNodeIncomplete, findNextIncompleteNode, centerOnNode } from './graph-crud.js';
// Wizard helpers — [Extracted to src/legacy/wizard-helpers.js]
import { wizardIsRTKFixed, wizardGetVisibleTabs, wizardIsFieldFilled, buildWizardTabsHTML, buildWizardFieldHTML, WIZARD_TAB_DEFS } from './wizard-helpers.js';

// [getCurrentUsername, updateNodeTimestamp, updateEdgeTimestamp — extracted to src/legacy/app-utils.js]

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

// [synthesizeClickOnTap — extracted to src/legacy/app-utils.js]

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

// [updateSketchNameDisplay — extracted to src/legacy/app-utils.js]
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
let viewStretchX = 1.0;
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
let __wizardActiveTab = null; // persists across renderDetails re-renders

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
// [NODE_MATERIALS, EDGE_MATERIALS — moved to src/legacy/app-utils.js]

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

// [getCachedCanvasRect, invalidateCanvasRectCache — extracted to src/legacy/app-utils.js]

// Issue 3: edge label data cache — rebuilt only when edges change.
// Avoids iterating all edges twice per frame for label-collision input data.
// Invalidated via markEdgeLabelCacheDirty() whenever edges are mutated.
let _edgeLabelDataCache = null; // null means dirty / needs rebuild
let _edgeLabelCacheStretchX = NaN;
let _edgeLabelCacheStretchY = NaN;
let _edgeLabelCacheSizeScale = NaN;
let _edgeLabelCacheViewScale = NaN;
// [markEdgeLabelCacheDirty — extracted to src/legacy/app-utils.js]
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

// [Admin configuration (defaultAdminConfig, adminConfig loader, saveAdminConfig) — extracted to src/legacy/app-utils.js]
let adminConfig = loadAdminConfig();

// ─── Shared state proxy for extracted modules ───────────────────────────────
// Populated immediately so that all imported extracted modules (gnss-handlers,
// tsc3-handlers, etc.) can read/write main.js local variables through S.X.
// Getters ensure we always return the current value; setters update the local var.
// bridgedProperty() also mirrors writes into AppStore so subscribers get notified.
/* eslint-disable no-unused-vars */
(function _initStateProxy() {
  const bp = bridgedProperty;
  Object.defineProperties(S, {
    nodes:                    bp('nodes',                    () => nodes,                    (v) => { nodes = v; }),
    edges:                    bp('edges',                    () => edges,                    (v) => { edges = v; }),
    nextNodeId:               bp('nextNodeId',               () => nextNodeId,               (v) => { nextNodeId = v; }),
    selectedNode:             bp('selectedNode',             () => selectedNode,             (v) => { selectedNode = v; }),
    selectedEdge:             bp('selectedEdge',             () => selectedEdge,             (v) => { selectedEdge = v; }),
    isDragging:               bp('isDragging',               () => isDragging,               (v) => { isDragging = v; }),
    dragOffset:               bp('dragOffset',               () => dragOffset,               (v) => { dragOffset = v; }),
    isDraggingDanglingEnd:    bp('isDraggingDanglingEnd',    () => isDraggingDanglingEnd,    (v) => { isDraggingDanglingEnd = v; }),
    draggingDanglingEdge:     bp('draggingDanglingEdge',     () => draggingDanglingEdge,     (v) => { draggingDanglingEdge = v; }),
    draggingDanglingType:     bp('draggingDanglingType',     () => draggingDanglingType,     (v) => { draggingDanglingType = v; }),
    hoveredDanglingEndpoint:  bp('hoveredDanglingEndpoint',  () => hoveredDanglingEndpoint,  (v) => { hoveredDanglingEndpoint = v; }),
    danglingSnapTarget:       bp('danglingSnapTarget',       () => danglingSnapTarget,       (v) => { danglingSnapTarget = v; }),
    currentMode:              bp('currentMode',              () => currentMode,              (v) => { currentMode = v; }),
    pendingEdgeTail:          bp('pendingEdgeTail',          () => pendingEdgeTail,          (v) => { pendingEdgeTail = v; }),
    pendingEdgeStartPosition: bp('pendingEdgeStartPosition', () => pendingEdgeStartPosition, (v) => { pendingEdgeStartPosition = v; }),
    creationDate:             bp('creationDate',             () => creationDate,             (v) => { creationDate = v; }),
    currentSketchId:          bp('currentSketchId',          () => currentSketchId,          (v) => { currentSketchId = v; }),
    currentSketchName:        bp('currentSketchName',        () => currentSketchName,        (v) => { currentSketchName = v; }),
    currentProjectId:         bp('currentProjectId',         () => currentProjectId,         (v) => { currentProjectId = v; }),
    currentInputFlowConfig:   bp('currentInputFlowConfig',   () => currentInputFlowConfig,   (v) => { currentInputFlowConfig = v; }),
    availableProjects:        bp('availableProjects',        () => availableProjects,        (v) => { availableProjects = v; }),
    autosaveEnabled:          bp('autosaveEnabled',          () => autosaveEnabled,          (v) => { autosaveEnabled = v; }),
    lastSurveyNodeId:         bp('lastSurveyNodeId',         () => lastSurveyNodeId,         (v) => { lastSurveyNodeId = v; }),
    surveyAutoConnect:        bp('surveyAutoConnect',        () => surveyAutoConnect,        (v) => { surveyAutoConnect = v; }),
    currentLang:              bp('currentLang',              () => currentLang,              (v) => { currentLang = v; }),
    pendingEdgePreview:       bp('pendingEdgePreview',       () => pendingEdgePreview,       (v) => { pendingEdgePreview = v; }),
    viewScale:                bp('viewScale',                () => viewScale,                (v) => { viewScale = v; }),
    drawScheduled:            bp('drawScheduled',            () => drawScheduled,            (v) => { drawScheduled = v; }),
    viewTranslate:            bp('viewTranslate',            () => viewTranslate,            (v) => { viewTranslate = v; }),
    viewStretchX:             bp('viewStretchX',             () => viewStretchX,             (v) => { viewStretchX = v; }),
    viewStretchY:             bp('viewStretchY',             () => viewStretchY,             (v) => { viewStretchY = v; }),
    sizeScale:                bp('sizeScale',                () => sizeScale,                (v) => { sizeScale = v; }),
    autoSizeEnabled:          bp('autoSizeEnabled',          () => autoSizeEnabled,          (v) => { autoSizeEnabled = v; }),
    sizeVS:                   bp('sizeVS',                   () => sizeVS,                   (v) => { sizeVS = v; }),
    isPinching:               bp('isPinching',               () => isPinching,               (v) => { isPinching = v; }),
    isPanning:                bp('isPanning',                () => isPanning,                (v) => { isPanning = v; }),
    spacePanning:             bp('spacePanning',             () => spacePanning,             (v) => { spacePanning = v; }),
    panStart:                 bp('panStart',                 () => panStart,                 (v) => { panStart = v; }),
    translateStart:           bp('translateStart',           () => translateStart,           (v) => { translateStart = v; }),
    highlightedHalfEdge:      bp('highlightedHalfEdge',      () => highlightedHalfEdge,      (v) => { highlightedHalfEdge = v; }),
    coordinatesMap:           bp('coordinatesMap',           () => coordinatesMap,           (v) => { coordinatesMap = v; }),
    coordinatesEnabled:       bp('coordinatesEnabled',       () => coordinatesEnabled,       (v) => { coordinatesEnabled = v; }),
    originalNodePositions:    bp('originalNodePositions',    () => originalNodePositions,    (v) => { originalNodePositions = v; }),
    geoNodePositions:         bp('geoNodePositions',         () => geoNodePositions,         (v) => { geoNodePositions = v; }),
    coordinateScale:          bp('coordinateScale',          () => coordinateScale,          (v) => { coordinateScale = v; }),
    liveMeasureEnabled:       bp('liveMeasureEnabled',       () => liveMeasureEnabled,       (v) => { liveMeasureEnabled = v; }),
    mapLayerEnabled:          bp('mapLayerEnabled',          () => mapLayerEnabled,          (v) => { mapLayerEnabled = v; }),
    adminConfig:              bp('adminConfig',              () => adminConfig,              (v) => { adminConfig = v; }),
    _nodeMapDirty:            bp('_nodeMapDirty',            () => _nodeMapDirty,            (v) => { _nodeMapDirty = v; }),
    _spatialGridDirty:        bp('_spatialGridDirty',        () => _spatialGridDirty,        (v) => { _spatialGridDirty = v; }),
    _dataVersion:             bp('_dataVersion',             () => _dataVersion,             (v) => { _dataVersion = v; }),
    _issueSetsDirty:          bp('_issueSetsDirty',          () => _issueSetsDirty,          (v) => { _issueSetsDirty = v; }),
    _liveMeasureFirstFixDone: bp('_liveMeasureFirstFixDone', () => _liveMeasureFirstFixDone, (v) => { _liveMeasureFirstFixDone = v; }),
    __wizardActiveTab:        bp('__wizardActiveTab',        () => __wizardActiveTab,        (v) => { __wizardActiveTab = v; }),
    // DOM refs used by extracted modules (read-only, no store bridging needed)
    canvas:                   bp('canvas',                   () => canvas,                   null),
    ctx:                      bp('ctx',                      () => ctx,                      null),
    homePanel:                bp('homePanel',                () => homePanel,                null),
    startPanel:               bp('startPanel',               () => startPanel,               null),
    detailsContainer:         bp('detailsContainer',         () => detailsContainer,         null),
    sidebarTitleEl:           bp('sidebarTitleEl',           () => sidebarTitleEl,            null),
    sidebarEl:                bp('sidebarEl',                () => sidebarEl,                 null),
    sidebarCloseBtn:          bp('sidebarCloseBtn',          () => sidebarCloseBtn,           null),
    sketchNameDisplayEl:      bp('sketchNameDisplayEl',      () => sketchNameDisplayEl,       null),
    sketchNameDisplayMobileEl: bp('sketchNameDisplayMobileEl', () => sketchNameDisplayMobileEl, null),
    // Canvas-draw module state
    nodeMap:                  bp('nodeMap',                  () => nodeMap,                  (v) => { nodeMap = v; }),
    fallIconImage:            bp('fallIconImage',            () => fallIconImage,            (v) => { fallIconImage = v; }),
    fallIconReady:            bp('fallIconReady',            () => fallIconReady,            (v) => { fallIconReady = v; }),
    _animatingNodes:          bp('_animatingNodes',          () => _animatingNodes,          null),
    _animatingEdges:          bp('_animatingEdges',          () => _animatingEdges,          null),
    ANIM_NODE_DURATION:       bp('ANIM_NODE_DURATION',       () => ANIM_NODE_DURATION,       null),
    ANIM_EDGE_DURATION:       bp('ANIM_EDGE_DURATION',       () => ANIM_EDGE_DURATION,       null),
    _issueNodeIds:            bp('_issueNodeIds',            () => _issueNodeIds,            null),
    _issueEdgeIds:            bp('_issueEdgeIds',            () => _issueEdgeIds,            null),
    _isDarkFrame:             bp('_isDarkFrame',             () => _isDarkFrame,             (v) => { _isDarkFrame = v; }),
    _contrastMul:             bp('_contrastMul',             () => _contrastMul,             (v) => { _contrastMul = v; }),
    _isHeatmapFrame:          bp('_isHeatmapFrame',          () => _isHeatmapFrame,          (v) => { _isHeatmapFrame = v; }),
    _edgeLabelDataCache:      bp('_edgeLabelDataCache',      () => _edgeLabelDataCache,      (v) => { _edgeLabelDataCache = v; }),
    _edgeLabelCacheStretchX:  bp('_edgeLabelCacheStretchX',  () => _edgeLabelCacheStretchX,  (v) => { _edgeLabelCacheStretchX = v; }),
    _edgeLabelCacheStretchY:  bp('_edgeLabelCacheStretchY',  () => _edgeLabelCacheStretchY,  (v) => { _edgeLabelCacheStretchY = v; }),
    _edgeLabelCacheSizeScale: bp('_edgeLabelCacheSizeScale', () => _edgeLabelCacheSizeScale, (v) => { _edgeLabelCacheSizeScale = v; }),
    _edgeLabelCacheViewScale: bp('_edgeLabelCacheViewScale', () => _edgeLabelCacheViewScale, (v) => { _edgeLabelCacheViewScale = v; }),
    _nodeGrid:                bp('_nodeGrid',                () => _nodeGrid,                (v) => { _nodeGrid = v; }),
    _edgeGrid:                bp('_edgeGrid',                () => _edgeGrid,                (v) => { _edgeGrid = v; }),
    // Undo/redo module state
    undoStack:                bp('undoStack',                () => undoStack,                null),
    redoStack:                bp('redoStack',                () => redoStack,                null),
    undoBtn:                  bp('undoBtn',                  () => undoBtn,                  null),
    redoBtn:                  bp('redoBtn',                  () => redoBtn,                  null),
    draggingDanglingStart:    bp('draggingDanglingStart',    () => draggingDanglingStart,    (v) => { draggingDanglingStart = v; }),
    // Computed: true when sketch has nodes but no survey coordinates
    isSchematicView:          { get() { return nodes.length > 0 && coordinatesMap.size === 0; }, enumerable: true, configurable: true },
  });
  // Hydrate AppStore with initial values
  hydrateStore();
})();
/* eslint-enable no-unused-vars */
// ────────────────────────────────────────────────────────────────────────────

// === Field History Tracking System — [Extracted to src/legacy/field-history.js] ===
import { loadFieldHistory, saveFieldHistory, diameterToColor, trackFieldUsage, getSortedOptions, importFieldHistoryFromSketch, getSketchesForHistoryImport, formatSketchDisplayName } from './field-history.js';

// Admin/projects handlers — [Extracted to src/legacy/admin-handlers.js]
// openAdminModal, closeAdminModal, openAdminScreen, closeAdminScreen,
// openProjectsScreen, closeProjectsScreen, navigateToAdmin, navigateToProjects
// and button event wiring are initialized via initAdminHandlers() in init().

// [Auth UI DOM refs and functions — extracted to src/legacy/auth-ui.js]

// [Routing, auth listeners, scroll propagation — extracted to src/legacy/auth-ui.js]
// initAuthUI() is called from init().
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

// [resizeCanvas, scheduleResizeCanvas — extracted to src/legacy/app-utils.js]

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

// [collectUsedNumericIds, findSmallestAvailableNumericId, renameNodeIdInternal — extracted to src/legacy/storage-manager.js]

// [encodeUtf16LeWithBom, distanceToSegment — extracted earlier to src/utils/]

// [normalizeLegacySketch — extracted to src/legacy/storage-manager.js]
// [loadFromStorage, saveToStorage, debouncedSaveToStorage, clearStorage � extracted to src/legacy/storage-manager.js]

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

// [Extracted to src/legacy/graph-crud.js]
// newSketch, createNode, createEdge, createDanglingEdge, createInboundDanglingEdge,
// findIncompleteEdges, markRequiredFields, isNodeIncomplete, findNextIncompleteNode, centerOnNode

// [Extracted to src/legacy/wizard-helpers.js]
// wizardIsRTKFixed, wizardGetVisibleTabs, wizardIsFieldFilled,
// buildWizardTabsHTML, buildWizardFieldHTML
// Constants: WIZARD_TAB_DEFS, WIZARD_CLOSED_MAINT, WIZARD_NO_COVER_MAINT


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

// [fetchProjects, renderProjectDropdown, getProjectInputFlowConfig � extracted to src/legacy/project-ui.js]

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

// Mode selection buttons — [Extracted to src/legacy/toolbar-events.js]
// nodeModeBtn, homeNodeModeBtn, drainageNodeModeBtn, issueNodeModeBtn, edgeModeBtn
// event listeners are wired via initToolbarEvents() in init().
// [Node-type flyout (syncFlyoutIcon, closeFlyout, event listeners) � extracted to src/legacy/project-ui.js]
// initProjectUI() is called from init().

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

// Export/import buttons — [Extracted to src/legacy/toolbar-events.js]
// exportNodesBtn, exportEdgesBtn, exportSketchBtn, importSketchBtn/importSketchFile
// event listeners are wired via initToolbarEvents() in init().

// Home button — [Extracted to src/legacy/toolbar-events.js]
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
      markInternalNavigation();
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
// Autosave toggle — [Extracted to src/legacy/toolbar-events.js]

// Size scale, auto-size, help modal, language selector, autosave toggle
// — [Extracted to src/legacy/toolbar-events.js]
// Loaded and wired via loadSizePreferences() (above) and initToolbarEvents() in init().
loadSizePreferences();

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

  // Tab / Shift+Tab: cycle through nodes on the canvas for keyboard-based selection
  if (!isTyping && e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Only cycle when no modal/panel is open
    const anyModalOpen = [homePanel, startPanel, helpModal, adminModal, adminScreen, projectsScreen]
      .some(el => el && el.style.display !== 'none' && el.style.display !== '');
    const totalItems = nodes.length + edges.length;
    if (!anyModalOpen && totalItems > 0) {
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      // Build a unified list: nodes first, then edges
      let currentIndex = -1;
      if (selectedNode) {
        currentIndex = nodes.indexOf(selectedNode);
      } else if (selectedEdge) {
        currentIndex = nodes.length + edges.indexOf(selectedEdge);
      }
      let nextIndex;
      if (currentIndex < 0) {
        nextIndex = direction === 1 ? 0 : totalItems - 1;
      } else {
        nextIndex = (currentIndex + direction + totalItems) % totalItems;
      }
      if (nextIndex < nodes.length) {
        // Select a node
        selectedNode = nodes[nextIndex];
        selectedEdge = null;
        centerOnNode(selectedNode);
        showToast(t('toasts.nodeSelected', selectedNode.id), 1200);
      } else {
        // Select an edge
        const edgeIdx = nextIndex - nodes.length;
        selectedEdge = edges[edgeIdx];
        selectedNode = null;
        // Center on edge midpoint
        const tn = nodeMap.get(String(selectedEdge.tail));
        const hn = nodeMap.get(String(selectedEdge.head));
        if (tn && hn) {
          const midX = (tn.x + hn.x) / 2;
          const midY = (tn.y + hn.y) / 2;
          const cw = canvas.width, ch = canvas.height;
          viewTranslate.x = cw / 2 - viewScale * viewStretchX * midX;
          viewTranslate.y = ch / 2 - viewScale * viewStretchY * midY;
        }
        showToast(t('toasts.edgeSelected', selectedEdge.tail, selectedEdge.head), 1200);
      }
      renderDetails();
      scheduleDraw();
    }
  }

  // Enter: open the details sidebar for the currently selected node/edge
  if (!isTyping && e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    if (selectedNode || selectedEdge) {
      const sidebarEl = document.getElementById('sidebar');
      if (sidebarEl && !sidebarEl.classList.contains('open')) {
        sidebarEl.classList.add('open');
        document.body.classList.add('drawer-open');
        renderDetails();
        e.preventDefault();
      }
    }
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

  // Signal that the app is fully initialized
  bus.emit('app:initialized', { lang: currentLang, mode: currentMode });
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
F.addCoordinatesReferenceLayer = (...a) => addCoordinatesReferenceLayer(...a);
F.updateMapReferencePoint = (...a) => updateMapReferencePoint(...a);
F.renderRefLayerToggles   = (...a) => renderRefLayerToggles(...a);
F.hitTestReferenceLayers  = (...a) => hitTestReferenceLayers(...a);
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
F.wizardIsFieldFilled     = (...a) => wizardIsFieldFilled(...a);
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
F.findDanglingEdgeNear    = (...a) => findDanglingEdgeNear(...a);
F.connectDanglingEdge     = (...a) => connectDanglingEdge(...a);
F.autoPanWhenDragging     = (...a) => autoPanWhenDragging(...a);
F.getMapReferencePoint    = (...a) => getMapReferencePoint(...a);
F.draw                    = (...a) => draw(...a);
F.findDanglingEndpointAt  = (...a) => findDanglingEndpointAt(...a);
F.findDanglingSnapTarget  = (...a) => findDanglingSnapTarget(...a);
F.finalizeDanglingEndpointDrag = (...a) => finalizeDanglingEndpointDrag(...a);
F.invalidateCanvasRectCache = (...a) => invalidateCanvasRectCache(...a);
F._setDraggingDanglingStart = (v) => { draggingDanglingStart = v; };
// Auth-ui module dependencies
F.hideHome                = (...a) => hideHome(...a);
F.renderProjectsHome      = (...a) => renderProjectsHome(...a);
F.loadProjectCanvas       = (...a) => loadProjectCanvas(...a);
F.openAdminScreen         = (...a) => openAdminScreen(...a);
F.closeAdminScreen        = (...a) => closeAdminScreen(...a);
F.closeAdminModal         = (...a) => closeAdminModal(...a);
F.openProjectsScreen      = (...a) => openProjectsScreen(...a);
F.closeProjectsScreen     = (...a) => closeProjectsScreen(...a);
// Storage-manager module dependencies
F.clearUndoStack          = (...a) => clearUndoStack(...a);
F.autoRepositionFromEmbeddedCoords = (...a) => autoRepositionFromEmbeddedCoords(...a);
F.loadProjectReferenceLayers = (...a) => loadProjectReferenceLayers(...a);
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
window.__markInternalNavigation = () => markInternalNavigation();

// ============================================
// TSC3 Survey Device Integration
// ============================================
// [Extracted to src/legacy/tsc3-handlers.js — lazy-loaded]
import('./tsc3-handlers.js').then(m => m.initTSC3Handlers());

// Admin/Projects screen handlers
// [Extracted to src/legacy/admin-handlers.js]
initAdminHandlers();

// Details panel / sidebar close listeners
// [Extracted to src/legacy/details-panel.js]
initDetailsPanel();

// Auth UI (login panel, routing, auth listeners)
// [Extracted to src/legacy/auth-ui.js]
initAuthUI();

// Project UI (flyout, project dropdown)
// [Extracted to src/legacy/project-ui.js]
initProjectUI();

// Toolbar events (mode buttons, export/import, size controls, help, language, autosave, home)
// [Extracted to src/legacy/toolbar-events.js]
initToolbarEvents();

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

// ── Exit confirmation modal ───────────────────────────────────────────────
// Styled confirm dialog for back-button exit guard (replaces window.confirm).
function _showExitConfirmModal(message, confirmLabel, cancelLabel, onConfirm) {
  // Remove any existing modal
  document.querySelector('.exit-confirm-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'exit-confirm-overlay panel-overlay';
  const modal = document.createElement('div');
  modal.className = 'exit-confirm-modal panel-modal';
  modal.innerHTML = `
    <div class="panel-modal-header">
      <span class="material-icons">warning</span>
      <span>${message}</span>
    </div>
    <div class="panel-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;">
      <button class="exit-confirm-cancel" style="padding:8px 16px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">${cancelLabel}</button>
      <button class="exit-confirm-ok" style="padding:8px 16px;border:none;border-radius:6px;background:#ef4444;color:#fff;cursor:pointer;">${confirmLabel}</button>
    </div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.exit-confirm-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.exit-confirm-ok').addEventListener('click', () => {
    close();
    if (typeof onConfirm === 'function') onConfirm();
  });
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

    // On the main canvas — ask user to confirm exit with styled modal (#26)
    if (nodes?.length > 0 || edges?.length > 0) {
      const msg = typeof t === 'function' ? t('confirms.exitApp') : 'Exit the app?';
      const exitLabel = typeof t === 'function' ? t('confirms.exitButton') || 'Exit' : 'Exit';
      const stayLabel = typeof t === 'function' ? t('confirms.stayButton') || 'Stay' : 'Stay';
      _showExitConfirmModal(msg, exitLabel, stayLabel, () => {
        history.back();
      });
    }
  });
})();
