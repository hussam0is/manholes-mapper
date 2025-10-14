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
import { restoreFromIndexedDbIfNeeded, idbSaveCurrentCompat, idbSaveRecordCompat, idbDeleteRecordCompat } from '../state/persistence.js';
import { encodeUtf16LeWithBom } from '../utils/encoding.js';
import { distanceToSegment } from '../utils/geometry.js';
import { isNumericId, generateHomeInternalId } from '../graph/id-utils.js';
import { commitIdInputIfFocused } from '../dom/dom-utils.js';
import { buildOptionsEditorModal, buildOptionsEditorScreen } from '../admin/helpers.js';
import { drawHouse as primitivesDrawHouse, drawDirectConnectionBadge as primitivesDrawDirectConnectionBadge } from '../features/drawing-primitives.js';
import { drawInfiniteGrid as drawInfiniteGridFeature, renderEdgeLegend as renderEdgeLegendFeature, drawEdge as drawEdgeFeature, drawNode as drawNodeFeature } from '../features/rendering.js';

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
const sizeIncreaseBtn = document.getElementById('sizeIncreaseBtn');
const sizeDecreaseBtn = document.getElementById('sizeDecreaseBtn');
const appTitleEl = document.getElementById('appTitle');
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
const mobileAdminBtn = document.getElementById('mobileAdminBtn');
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

// Mobile menu elements
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
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
    } catch (_) {}
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
let creationDate = null;
let currentSketchId = null; // id in library; null means unsaved new sketch
let currentSketchName = null; // human-friendly name for the sketch
let autosaveEnabled = true;
let currentLang = 'he';
// Pointer position used for edge preview in edge mode
let pendingEdgePreview = null; // { x, y } or null
// Expose language to window for modules that need it during migration
try { window.currentLang = currentLang; } catch (_) {}
// Zoom state
let viewScale = 1;
let viewTranslate = { x: 0, y: 0 }; // screen-space translation (for pan/anchored zoom)
const MIN_SCALE = 0.1;
const MAX_SCALE = 1.0;
const SCALE_STEP = 1.1; // 10%
// Size scale state for nodes and fonts
let sizeScale = 1.0;
const MIN_SIZE_SCALE = 0.5;
const MAX_SIZE_SCALE = 3.0;
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
try {
  fallIconImage = new Image();
  fallIconImage.src = './fall_icon.png';
  fallIconImage.onload = () => { fallIconReady = true; try { scheduleDraw(); } catch (_) {} };
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
const ADMIN_STORAGE_KEY = 'graphSketch.adminConfig.v1';
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
      // engineering_status removed for nodes
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
    console.warn('Failed to load admin config; using defaults', e);
    return JSON.parse(JSON.stringify(defaultAdminConfig));
  }
})();

function saveAdminConfig() {
  localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(adminConfig));
}

function openAdminModal() {
  if (!adminModal || !adminContent) return;
  // Build a professional editor UI for include toggles, defaults, and options
  const buildOptionsEditor = (title, cfgKey, specs) => buildOptionsEditorModal(adminConfig, t, title, cfgKey, specs);

  adminContent.innerHTML = '';
  // Enhanced tabs with icons
  const tabs = document.createElement('div');
  tabs.className = 'admin-tabs';
  tabs.innerHTML = `
    <button class="tab active" data-tab-btn="nodes">
      <span class="material-icons">account_tree</span>
      ${t('admin.tabNodes')}
    </button>
    <button class="tab" data-tab-btn="edges">
      <span class="material-icons">timeline</span>
      ${t('admin.tabEdges')}
    </button>
  `;
  adminContent.appendChild(tabs);
  // Sections
  adminContent.appendChild(buildOptionsEditor(t('admin.tabNodes'), 'nodes', [
    { key: 'material', label: t('labels.coverMaterial'), type: 'select', optionsKey: 'material', valueKind: 'label' },
    { key: 'cover_diameter', label: t('labels.coverDiameter'), type: 'text' },
    { key: 'access', label: t('labels.access'), type: 'select', optionsKey: 'access', valueKind: 'code' },
    { key: 'accuracy_level', label: t('labels.accuracyLevel'), type: 'select', optionsKey: 'accuracy_level', valueKind: 'code' },
    
    { key: 'maintenance_status', label: t('labels.maintenanceStatus'), type: 'select', optionsKey: 'maintenance_status', valueKind: 'code' },
  ]));
  adminContent.appendChild(buildOptionsEditor(t('admin.tabEdges'), 'edges', [
    { key: 'material', label: t('labels.edgeMaterial'), type: 'select', optionsKey: 'material', valueKind: 'label' },
    { key: 'edge_type', label: t('labels.edgeType'), type: 'select', optionsKey: 'edge_type', valueKind: 'label' },
    { key: 'line_diameter', label: t('labels.lineDiameter'), type: 'select', optionsKey: 'line_diameter', valueKind: 'label' },
    { key: 'fall_position', label: t('labels.fallPosition'), type: 'select', optionsKey: 'fall_position', valueKind: 'code' },
    
  ]));

  // Initialize current default select values
  adminContent.querySelectorAll('[data-def]').forEach((el) => {
    const [scope, key] = el.getAttribute('data-def').split(':');
    const val = adminConfig[scope].defaults[key];
    if (el.tagName === 'SELECT') {
      [...el.options].forEach((opt) => { if (opt.value === String(val)) opt.selected = true; });
    } else {
      el.value = val == null ? '' : String(val);
    }
  });

  // Activate nodes tab by default
  adminContent.querySelectorAll('[data-tab="edges"]').forEach(el => { el.style.display = 'none'; });
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab-btn]');
    if (!btn) return;
    const target = btn.getAttribute('data-tab-btn');
    tabs.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    adminContent.querySelectorAll('[data-tab]').forEach(sec => {
      sec.style.display = (sec.getAttribute('data-tab') === target) ? '' : 'none';
    });
  });

  // Enhanced row add/remove handlers with validation
  adminContent.querySelectorAll('[data-opt-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [scope, optKey] = btn.getAttribute('data-opt-add').split(':');
      const tbody = adminContent.querySelector(`[data-opt-body="${scope}:${optKey}"]`);
      if (!tbody) return;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="opt-enabled"><input type="checkbox" checked data-opt-enabled="${scope}:${optKey}"/></td>
        <td class="opt-label"><input type="text" value="" data-opt-label="${scope}:${optKey}" placeholder="${t('admin.placeholders.newLabel')}"/></td>
        <td class="opt-code"><input type="text" value="" data-opt-code="${scope}:${optKey}" placeholder="${t('admin.placeholders.code')}"/></td>
        <td class="opt-actions"><button class="btn btn-danger btn-sm" title="${t('admin.delete')}" aria-label="${t('admin.delete')}" data-opt-del="${scope}:${optKey}">×</button></td>`;
      tbody.appendChild(tr);
      
      // Focus on the label input for immediate editing
      const labelInput = tr.querySelector('[data-opt-label]');
      if (labelInput) labelInput.focus();
      
      const delBtn = tr.querySelector('[data-opt-del]');
      delBtn.addEventListener('click', () => {
        if (confirm(t('admin.confirmDeleteOption'))) {
          tr.remove();
        }
      });
    });
  });
  adminContent.querySelectorAll('[data-opt-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm(t('admin.confirmDeleteOption'))) {
        const tr = btn.closest('tr');
        if (tr) tr.remove();
      }
    });
  });

  // Custom fields UI removed

  adminModal.style.display = 'flex';
  // Apply localized title if present
  const adminTitleEl = document.getElementById('adminTitle');
  if (adminTitleEl) adminTitleEl.innerHTML = '<span class="material-icons">tune</span>' + t('admin.title');

  // Ensure import/export buttons reflect current language
  applyLangToStaticUI();
}

function closeAdminModal() {
  if (adminModal) adminModal.style.display = 'none';
}

// Admin screen (separate view) open/close
function openAdminScreen() {
  if (!adminScreen || !adminScreenContent) return;
  // Build UI inside screen content
  // Build a simple editor UI for include toggles, defaults, and options
  const buildOptionsEditor = (title, cfgKey, specs) => buildOptionsEditorScreen(adminConfig, t, title, cfgKey, specs);

  adminScreenContent.innerHTML = '';
  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'admin-tabs';
  tabs.innerHTML = `
    <button class="tab active" data-tab-btn="nodes">${t('admin.tabNodes')}</button>
    <button class="tab" data-tab-btn="edges">${t('admin.tabEdges')}</button>
  `;
  adminScreenContent.appendChild(tabs);
  // Sections
  adminScreenContent.appendChild(buildOptionsEditor(t('admin.tabNodes'), 'nodes', [
    { key: 'material', label: 'חומר מכסה', type: 'select', optionsKey: 'material', valueKind: 'label' },
    { key: 'cover_diameter', label: 'קוטר מכסה', type: 'text' },
    { key: 'access', label: 'גישה', type: 'select', optionsKey: 'access', valueKind: 'code' },
    { key: 'accuracy_level', label: 'רמת דיוק', type: 'select', optionsKey: 'accuracy_level', valueKind: 'code' },
    { key: 'maintenance_status', label: 'סטטוס תחזוקה', type: 'select', optionsKey: 'maintenance_status', valueKind: 'code' },
  ]));
  adminScreenContent.appendChild(buildOptionsEditor(t('admin.tabEdges'), 'edges', [
    { key: 'material', label: 'חומר קו', type: 'select', optionsKey: 'material', valueKind: 'label' },
    { key: 'edge_type', label: 'סוג קו', type: 'select', optionsKey: 'edge_type', valueKind: 'label' },
    { key: 'line_diameter', label: 'קוטר קו', type: 'select', optionsKey: 'line_diameter', valueKind: 'label' },
    { key: 'engineering_status', label: 'סטטוס הנדסי', type: 'select', optionsKey: 'engineering_status', valueKind: 'code' },
    { key: 'fall_position', label: 'מפל פנימי/חיצוני', type: 'select', optionsKey: 'fall_position', valueKind: 'code' },
  ]));

  // Initialize defaults
  adminScreenContent.querySelectorAll('[data-def]').forEach((el) => {
    const [scope, key] = el.getAttribute('data-def').split(':');
    const val = adminConfig[scope].defaults[key];
    if (el.tagName === 'SELECT') {
      [...el.options].forEach((opt) => { if (opt.value === String(val)) opt.selected = true; });
    } else {
      el.value = val == null ? '' : String(val);
    }
  });

  // Tabs behavior
  adminScreenContent.querySelectorAll('[data-tab="edges"]').forEach(el => { el.style.display = 'none'; });
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab-btn]');
    if (!btn) return;
    const target = btn.getAttribute('data-tab-btn');
    tabs.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    adminScreenContent.querySelectorAll('[data-tab]').forEach(sec => {
      sec.style.display = (sec.getAttribute('data-tab') === target) ? '' : 'none';
    });
  });

  // Custom fields UI removed from admin screen

  if (adminScreenTitleEl) adminScreenTitleEl.innerHTML = '<span class="material-icons">settings</span>' + t('admin.title');
  if (mainEl) mainEl.style.display = 'none';
  adminScreen.style.display = 'block';
  applyLangToStaticUI();
}

function closeAdminScreen() {
  if (adminScreen) adminScreen.style.display = 'none';
  if (mainEl) mainEl.style.display = '';
}

function navigateToAdmin() {
  try { if (mobileMenu) mobileMenu.style.display = 'none'; } catch (_) {}
  try { location.hash = '#/admin'; } catch (_) {}
  try { handleRoute(); } catch (_) {}
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
  try { mobileAdminBtn.addEventListener('touchend', openAdminFromMobile, { passive: false }); } catch(_) { mobileAdminBtn.addEventListener('touchend', openAdminFromMobile); }
}
// Simple hash routing for admin screen
function handleRoute() {
  const isAdmin = (location.hash === '#/admin');
  if (isAdmin) {
    try { document.body.classList.add('admin-screen'); } catch (_) {}
    // Prefer separate screen over modal
    try { closeAdminModal(); } catch (_) {}
    try { openAdminScreen(); } catch (_) {}
  } else {
    try { document.body.classList.remove('admin-screen'); } catch (_) {}
    try { closeAdminScreen(); } catch (_) {}
  }
}
window.addEventListener('hashchange', handleRoute);
// Initialize route on load
try { handleRoute(); } catch (_) {}
if (adminCancelBtn) adminCancelBtn.addEventListener('click', () => {
  closeAdminModal();
  closeAdminScreen();
  try { if (document.body.classList.contains('admin-screen')) location.hash = '#/'; } catch (_) {}
});
if (adminSaveBtn) adminSaveBtn.addEventListener('click', () => {
  if (!adminContent) return;
  // Read include toggles
  adminContent.querySelectorAll('[data-inc]').forEach((el) => {
    const [scope, key] = el.getAttribute('data-inc').split(':');
    adminConfig[scope].include[key] = el.checked;
  });
  // Read defaults
  adminContent.querySelectorAll('[data-def]').forEach((el) => {
    const [scope, key] = el.getAttribute('data-def').split(':');
    const val = (el.tagName === 'SELECT') ? el.value : el.value;
    // Treat defaults for selects as label unless spec requested 'code'
    let stored = val;
    const numericKeys = new Set(['access','accuracy_level','fall_position','engineering_status','maintenance_status']);
    if (numericKeys.has(key)) {
      const num = Number(val);
      // Allow empty default (optional)
      stored = (val === '' ? '' : (Number.isFinite(num) ? num : 0));
    }
    adminConfig[scope].defaults[key] = stored;
  });
  // Read options
  adminContent.querySelectorAll('[data-opt-body]').forEach((tbody) => {
    const [scope, optKey] = tbody.getAttribute('data-opt-body').split(':');
    const rows = [];
    tbody.querySelectorAll('tr').forEach((tr) => {
      const labelInput = tr.querySelector(`[data-opt-label="${scope}:${optKey}"]`);
      const codeInput = tr.querySelector(`[data-opt-code="${scope}:${optKey}"]`);
      const enabledInput = tr.querySelector(`[data-opt-enabled="${scope}:${optKey}"]`);
      if (!labelInput || !codeInput) return;
      const label = labelInput.value;
      const codeRaw = codeInput.value;
      const codeNum = Number(codeRaw);
      const code = Number.isFinite(codeNum) ? codeNum : codeRaw;
      const enabled = enabledInput ? !!enabledInput.checked : true;
      if (String(label).trim() !== '') rows.push({ label, code, enabled });
    });
    adminConfig[scope].options[optKey] = rows;
  });
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
        const incNodes = { ...defaultAdminConfig.nodes.include, ...(merged.nodes.include||{}) };
        const incEdges = { ...defaultAdminConfig.edges.include, ...(merged.edges.include||{}) };
        // Coerce include flags to booleans
        Object.keys(incNodes).forEach(k => { incNodes[k] = !!incNodes[k]; });
        Object.keys(incEdges).forEach(k => { incEdges[k] = !!incEdges[k]; });
        merged.nodes.include = incNodes;
        merged.edges.include = incEdges;
        merged.nodes.defaults = { ...defaultAdminConfig.nodes.defaults, ...(merged.nodes.defaults||{}) };
        merged.edges.defaults = { ...defaultAdminConfig.edges.defaults, ...(merged.edges.defaults||{}) };
        merged.nodes.options = { ...defaultAdminConfig.nodes.options, ...(merged.nodes.options||{}) };
        merged.edges.options = { ...defaultAdminConfig.edges.options, ...(merged.edges.options||{}) };
        // customFields removed
        // Ensure options rows have enabled defaulting to true
        ['nodes','edges'].forEach(scope => {
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
      } catch (_) {}
      // Also refresh details panel options
      renderDetails();
      showToast(t('admin.importSuccess'));
    } catch (_) {
      console.warn('Admin import failed', _);
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
    } catch (_) {}
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
      const prevTab = (function() {
        try {
          const activeBtn = adminScreenContent && adminScreenContent.querySelector('.admin-tabs .tab.active');
          return activeBtn ? activeBtn.getAttribute('data-tab-btn') : null;
        } catch (_) { return null; }
      })();
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
        const incNodes = { ...defaultAdminConfig.nodes.include, ...(merged.nodes.include||{}) };
        const incEdges = { ...defaultAdminConfig.edges.include, ...(merged.edges.include||{}) };
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
      try { openAdminScreen(); } catch (_) {}
      // Restore previously selected tab if applicable
      try {
        if (prevTab && prevTab !== 'nodes') {
          const tabs = adminScreenContent && adminScreenContent.querySelector('.admin-tabs');
          const btn = tabs && tabs.querySelector(`[data-tab-btn="${prevTab}"]`);
          if (btn && typeof btn.click === 'function') btn.click();
        }
      } catch (_) {}
      // Refresh details panel to reflect updated dropdown options
      try { renderDetails(); } catch (_) {}
      showToast(t('admin.importSuccess'));
    } catch (_) {
      showToast(t('admin.importInvalid'));
    }
  });
}

// Admin screen save/cancel
if (adminScreenSaveBtn) adminScreenSaveBtn.addEventListener('click', () => {
  if (!adminScreenContent) return;
  adminScreenContent.querySelectorAll('[data-inc]').forEach((el) => {
    const [scope, key] = el.getAttribute('data-inc').split(':');
    adminConfig[scope].include[key] = el.checked;
  });
  adminScreenContent.querySelectorAll('[data-def]').forEach((el) => {
    const [scope, key] = el.getAttribute('data-def').split(':');
    let stored = (el.tagName === 'SELECT') ? el.value : el.value;
    const numericKeys = new Set(['access','accuracy_level','fall_position','engineering_status','maintenance_status']);
    if (numericKeys.has(key)) {
      const num = Number(stored);
      stored = (stored === '' ? '' : (Number.isFinite(num) ? num : 0));
    }
    adminConfig[scope].defaults[key] = stored;
  });
  adminScreenContent.querySelectorAll('[data-opt-body]').forEach((tbody) => {
    const [scope, optKey] = tbody.getAttribute('data-opt-body').split(':');
    const rows = [];
    tbody.querySelectorAll('tr').forEach((tr) => {
      const labelInput = tr.querySelector(`[data-opt-label="${scope}:${optKey}"]`);
      const codeInput = tr.querySelector(`[data-opt-code="${scope}:${optKey}"]`);
      const enabledInput = tr.querySelector(`[data-opt-enabled="${scope}:${optKey}"]`);
      if (!labelInput || !codeInput) return;
      const label = labelInput.value;
      const codeRaw = codeInput.value;
      const codeNum = Number(codeRaw);
      const code = Number.isFinite(codeNum) ? codeNum : codeRaw;
      const enabled = enabledInput ? !!enabledInput.checked : true;
      if (String(label).trim() !== '') rows.push({ label, code, enabled });
    });
    adminConfig[scope].options[optKey] = rows;
  });
  saveAdminConfig();
  closeAdminScreen();
  try { location.hash = '#/'; } catch (_) {}
  renderDetails();
  showToast(t('admin.saved'));
});
if (adminScreenCancelBtn) adminScreenCancelBtn.addEventListener('click', () => {
  closeAdminScreen();
  try { location.hash = '#/'; } catch (_) {}
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

// Also resize the canvas whenever its container changes size (e.g.,
// details panel expands/collapses on mobile and alters flex heights)
if (window.ResizeObserver) {
  const canvasContainerObserver = new ResizeObserver(() => {
    scheduleResizeCanvas();
  });
  try {
    canvasContainerObserver.observe(canvas.parentElement);
  } catch (_) {}
}

// showToast is now provided by src/utils/toast.js via window.showToast
// Keeping calls intact; this comment remains for migration traceability.

// === i18n ===
// i18n strings and translator are now provided by src/i18n.js via window.t and window.isRTL

// use global t/isRTL injected from module entry

function applyLangToStaticUI() {
  if (appTitleEl) appTitleEl.textContent = t('appTitle');
  // Helper to set a button's visible label if it has a `.label` span
  const setBtnLabel = (btn, text) => {
    if (!btn) return;
    const label = btn.querySelector && btn.querySelector('.label');
    if (label) {
      label.textContent = text;
    } else if (!btn.classList || !btn.classList.contains('btn-icon')) {
      // Fallback: only overwrite text if it's not an icon-only button
      btn.textContent = text;
    }
  };

  setBtnLabel(homeBtn, t('home'));
  if (homeBtn) homeBtn.title = t('home');
  setBtnLabel(newSketchBtn, t('newSketch'));
  if (newSketchBtn) newSketchBtn.title = t('newSketch');
  if (nodeModeBtn) {
    nodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">radio_button_unchecked</span>';
    nodeModeBtn.title = t('modeNode');
    nodeModeBtn.setAttribute('aria-label', t('modeNode'));
  }
  if (homeNodeModeBtn) {
    homeNodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">home</span>';
    homeNodeModeBtn.title = t('modeHome');
    homeNodeModeBtn.setAttribute('aria-label', t('modeHome'));
  }
  if (drainageNodeModeBtn) {
    drainageNodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">water_drop</span>';
    drainageNodeModeBtn.title = t('modeDrainage');
    drainageNodeModeBtn.setAttribute('aria-label', t('modeDrainage'));
  }
  if (edgeModeBtn) {
    edgeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">timeline</span>';
    edgeModeBtn.title = t('modeEdge');
    edgeModeBtn.setAttribute('aria-label', t('modeEdge'));
  }
  if (zoomInBtn) { zoomInBtn.title = t('zoomIn'); }
  if (zoomOutBtn) { zoomOutBtn.title = t('zoomOut'); }
  if (sizeIncreaseBtn) { sizeIncreaseBtn.title = t('sizeIncrease'); }
  if (sizeDecreaseBtn) { sizeDecreaseBtn.title = t('sizeDecrease'); }
  if (exportSketchBtn) { exportSketchBtn.title = t('exportSketch'); }
  if (importSketchBtn) { importSketchBtn.title = t('importSketch'); }
  if (exportNodesBtn) { exportNodesBtn.title = t('exportNodes'); }
  if (exportEdgesBtn) { exportEdgesBtn.title = t('exportEdges'); }
  setBtnLabel(saveBtn, t('save'));
  if (saveBtn) saveBtn.title = t('save');
  if (autosaveToggle) {
    const autosaveLabelEl = autosaveToggle.parentElement && autosaveToggle.parentElement.querySelector('.label');
    if (autosaveLabelEl) autosaveLabelEl.textContent = t('autosave');
  }
  if (helpBtn) { helpBtn.title = t('help'); setBtnLabel(helpBtn, t('help')); }
  if (adminBtn) { adminBtn.title = t('admin.manage'); }
  if (recenterBtn) { 
    recenterBtn.title = t('recenter'); 
    recenterBtn.setAttribute('aria-label', t('recenter'));
  }
  if (sidebarCloseBtn) { sidebarCloseBtn.title = t('close'); }
  if (langSelect) { langSelect.title = t('language'); }
  if (mobileMenuBtn) { mobileMenuBtn.title = t('menu'); }
  if (sidebarTitleEl) sidebarTitleEl.textContent = t('sidebarTitle');
  if (detailsDefaultEl) detailsDefaultEl.textContent = t('detailsDefault');
  if (startTitleEl) startTitleEl.textContent = t('startTitle');
  if (creationDateLabelEl) creationDateLabelEl.textContent = t('creationDate');
  if (homeTitleEl) homeTitleEl.textContent = t('homeTitle');
  if (helpTitleEl) helpTitleEl.textContent = t('helpTitle');
  if (startBtn) startBtn.textContent = t('start');
  if (cancelBtn) cancelBtn.textContent = t('cancel');
  if (closeHelpBtn) closeHelpBtn.textContent = t('close');
  setBtnLabel(createFromHomeBtn, t('createFromHome'));
  if (helpListEl) {
    helpListEl.innerHTML = '';
    t('helpLines').forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      helpListEl.appendChild(li);
    });
  }
  if (helpNoteEl) helpNoteEl.textContent = t('helpNote');
  document.documentElement.dir = isRTL(currentLang) ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isRTL(currentLang));

  // Update labels in the mobile overflow menu when language changes
  if (mobileHomeBtn) {
    const lbl = mobileHomeBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('home');
    mobileHomeBtn.title = t('home');
  }
  if (mobileNewSketchBtn) {
    const lbl = mobileNewSketchBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('newSketch');
    mobileNewSketchBtn.title = t('newSketch');
  }
  if (mobileZoomInBtn) {
    mobileZoomInBtn.title = t('zoomIn');
    const lbl = mobileZoomInBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('zoomIn');
  }
  if (mobileZoomOutBtn) {
    mobileZoomOutBtn.title = t('zoomOut');
    const lbl = mobileZoomOutBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('zoomOut');
  }
  if (mobileSizeIncreaseBtn) {
    mobileSizeIncreaseBtn.title = t('sizeIncrease');
    const lbl = mobileSizeIncreaseBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('sizeIncrease');
  }
  if (mobileSizeDecreaseBtn) {
    mobileSizeDecreaseBtn.title = t('sizeDecrease');
    const lbl = mobileSizeDecreaseBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('sizeDecrease');
  }
  if (mobileExportSketchBtn) {
    mobileExportSketchBtn.title = t('exportSketch');
    const lbl = mobileExportSketchBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('exportSketch');
  }
  if (mobileImportSketchBtn) {
    mobileImportSketchBtn.title = t('importSketch');
    const lbl = mobileImportSketchBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('importSketch');
  }
  if (mobileExportNodesBtn) {
    mobileExportNodesBtn.title = t('exportNodes');
    const lbl = mobileExportNodesBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('exportNodes');
  }
  if (mobileExportEdgesBtn) {
    mobileExportEdgesBtn.title = t('exportEdges');
    const lbl = mobileExportEdgesBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('exportEdges');
  }
  if (mobileSaveBtn) {
    mobileSaveBtn.title = t('save');
    const lbl = mobileSaveBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('save');
  }
  if (mobileHelpBtn) {
    const lbl = mobileHelpBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('help');
    mobileHelpBtn.title = t('help');
  }
  if (mobileAdminBtn) {
    const lbl = mobileAdminBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('admin.manage');
    mobileAdminBtn.title = t('admin.manage');
  }
  if (mobileAutosaveToggle) {
    const lbl = mobileAutosaveLabel && mobileAutosaveLabel.querySelector('.label');
    if (lbl) lbl.textContent = t('autosave');
  }
  // Update edge legend alignment per language
  renderEdgeLegend();
  // Update labels for admin import/export buttons
  if (adminImportBtn) {
    const lbl = adminImportBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('admin.import');
    adminImportBtn.title = t('admin.import');
  }
  if (adminExportBtn) {
    const lbl = adminExportBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('admin.export');
    adminExportBtn.title = t('admin.export');
  }
  // Admin Screen import/export
  if (typeof adminScreenImportBtn !== 'undefined' && adminScreenImportBtn) {
    const lbl = adminScreenImportBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('admin.import');
    adminScreenImportBtn.title = t('admin.import');
  }
  if (typeof adminScreenExportBtn !== 'undefined' && adminScreenExportBtn) {
    const lbl = adminScreenExportBtn.querySelector('.label');
    if (lbl) lbl.textContent = t('admin.export');
    adminScreenExportBtn.title = t('admin.export');
  }
  // Update admin action buttons (modal)
  if (typeof adminCancelBtn !== 'undefined' && adminCancelBtn) {
    adminCancelBtn.textContent = t('cancel');
  }
  if (typeof adminSaveBtn !== 'undefined' && adminSaveBtn) {
    adminSaveBtn.textContent = t('admin.saveSettings');
  }
  // Update admin action buttons (screen)
  if (typeof adminScreenCancelBtn !== 'undefined' && adminScreenCancelBtn) {
    adminScreenCancelBtn.textContent = t('cancel');
  }
  if (typeof adminScreenSaveBtn !== 'undefined' && adminScreenSaveBtn) {
    adminScreenSaveBtn.textContent = t('admin.saveSettings');
  }
  // Update search inputs
  if (typeof searchNodeInput !== 'undefined' && searchNodeInput) {
    searchNodeInput.placeholder = t('searchNode');
    searchNodeInput.title = t('searchNodeTitle');
  }
  if (typeof mobileSearchNodeInput !== 'undefined' && mobileSearchNodeInput) {
    mobileSearchNodeInput.placeholder = t('searchNode');
    mobileSearchNodeInput.title = t('searchNodeTitle');
  }
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
    const isHome = n.nodeType === 'Home';
    const include = !isHome || (isHome && n.directConnection === true);
    if (include && isNumericId(n.id)) {
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
 * Load a previously saved sketch from localStorage if present.
 * Ensures required properties exist and normalizes id types, then
 * recomputes node types based on edge measurements.
 * @returns {boolean} true if a sketch was loaded; false otherwise
 */
function loadFromStorage() {
  try {
    const data = localStorage.getItem('graphSketch');
    if (!data) return false;
    const parsed = JSON.parse(data);
    if (!parsed || !parsed.nodes || !parsed.edges) return false;
    nodes = parsed.nodes;
    edges = parsed.edges;
    creationDate = parsed.creationDate || null;
    currentSketchId = parsed.sketchId || null;
    currentSketchName = parsed.sketchName || null;
    // Ensure each node has required properties
    nodes.forEach((node) => {
      if (node.material === undefined) node.material = NODE_MATERIALS[0];
      if (node.type === undefined) node.type = NODE_TYPES[0];
      if (node.nodeType === undefined) node.nodeType = 'Manhole';
      // Normalize legacy nodeType values to 'Manhole' | 'Home'
      if (node.nodeType === 'בית' || node.nodeType === 'Home' || node.nodeType === 'B') node.nodeType = 'Home';
      else node.nodeType = 'Manhole';
    if (node.nodeType === 'Home') {
      node.material = NODE_MATERIALS[0];
      node.coverDiameter = '';
      node.access = '';
      node.nodeEngineeringStatus = '';
      node.maintenanceStatus = '';
    }
    if (node.nodeType === 'Drainage') {
      node.material = NODE_MATERIALS[0];
      node.coverDiameter = '';
      node.access = '';
      node.nodeEngineeringStatus = '';
      node.maintenanceStatus = '';
    }
      // Normalize cover diameter to integer or empty
      if (node.coverDiameter === undefined) node.coverDiameter = '';
      else {
        const cdNum = Number(node.coverDiameter);
        node.coverDiameter = Number.isFinite(cdNum) ? Math.round(cdNum) : '';
      }
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
      // convert numeric ids to strings for consistency
      node.id = String(node.id);
    });
    // Ensure each edge has required properties
    edges.forEach((edge) => {
      if (edge.material === undefined) edge.material = EDGE_MATERIALS[0];
      if (edge.fall_depth === undefined) edge.fall_depth = '';
      if (edge.line_diameter === undefined) edge.line_diameter = '';
      if (edge.edge_type === undefined) edge.edge_type = EDGE_TYPES[0];
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
      // convert ids to strings
      edge.tail = String(edge.tail);
      edge.head = String(edge.head);
    });
    // Recompute nextNodeId as (max numeric id among nodes) + 1
    let maxNumericId = 0;
    for (const n of nodes) {
      const parsedId = parseInt(String(n.id), 10);
      if (Number.isFinite(parsedId)) {
        if (parsedId > maxNumericId) maxNumericId = parsedId;
      }
    }
    nextNodeId = maxNumericId + 1;
    // Recompute node types based on measurements
    computeNodeTypes();
    return true;
  } catch (e) {
    console.error('Error loading sketch from storage:', e);
    return false;
  }
}

/**
 * Persist the current sketch to localStorage.
 */
function saveToStorage() {
  const payload = {
    nodes: nodes,
    edges: edges,
    nextNodeId: nextNodeId,
    creationDate: creationDate,
    sketchId: currentSketchId,
    sketchName: currentSketchName,
  };
  localStorage.setItem('graphSketch', JSON.stringify(payload));
  // Persist to IndexedDB for durability
  idbSaveCurrentCompat(payload);
  if (autosaveEnabled) {
    saveToLibrary();
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
      try { saveToStorage(); } catch (_) {}
    }, delayMs);
  };
})();

/**
 * Remove the stored sketch from localStorage.
 */
function clearStorage() {
  localStorage.removeItem('graphSketch');
  // Remove from IndexedDB as well
  idbSaveCurrentCompat(null);
}

// === Library management (multiple sketches) ===
function getLibrary() {
  try {
    const raw = localStorage.getItem('graphSketch.library');
    if (!raw) return [];
    const lib = JSON.parse(raw);
    if (Array.isArray(lib)) return lib;
    return [];
  } catch (e) {
    console.error('Failed to parse library', e);
    return [];
  }
}

function setLibrary(list) {
  localStorage.setItem('graphSketch.library', JSON.stringify(list));
}

function generateSketchId() {
  return 'sk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function saveToLibrary() {
  const lib = getLibrary();
  const nowIso = new Date().toISOString();
  const record = {
    id: currentSketchId || generateSketchId(),
    createdAt: creationDate || nowIso,
    updatedAt: nowIso,
    nodes,
    edges,
    nextNodeId,
    creationDate: creationDate || nowIso,
    name: currentSketchName || null,
  };
  const idx = lib.findIndex((s) => s.id === record.id);
  if (idx >= 0) {
    // Preserve existing name if current is null, so we don't accidentally clear it
    const existing = lib[idx];
    const merged = { ...record };
    if ((record.name == null || record.name === '') && (existing.name != null && existing.name !== '')) {
      merged.name = existing.name;
    }
    lib[idx] = merged;
  } else {
    lib.unshift(record);
  }
  setLibrary(lib);
  currentSketchId = record.id;
  // Mirror into IndexedDB
  idbSaveRecordCompat(record);
}

function loadFromLibrary(sketchId) {
  const lib = getLibrary();
  const rec = lib.find((r) => r.id === sketchId);
  if (!rec) return false;
  nodes = rec.nodes || [];
  edges = rec.edges || [];
  // Backward compatibility for nodes
  nodes.forEach((node) => {
    if (node.material === undefined) node.material = NODE_MATERIALS[0];
    if (node.type === undefined) node.type = NODE_TYPES[0];
    if (node.nodeType === undefined) node.nodeType = 'Manhole';
    // Normalize legacy labels to new values
    if (node.nodeType === 'בית' || node.nodeType === 'Home' || node.nodeType === 'B') node.nodeType = 'Home';
    else if (node.nodeType === 'שוחה מכוסה' || node.nodeType === 'Covered' || node.nodeType === 'C') node.nodeType = 'Covered';
    else if (node.nodeType === 'קולטן' || node.nodeType === 'Drainage' || node.nodeType === 'D') node.nodeType = 'Drainage';
    else node.nodeType = 'Manhole';
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
    if (node.coverDiameter === undefined) node.coverDiameter = NODE_COVER_DIAMETERS[0];
    if (node.maintenanceStatus === undefined) node.maintenanceStatus = 0;
    if (typeof node.maintenanceStatus !== 'number') {
      const parsed = Number(node.maintenanceStatus);
      node.maintenanceStatus = Number.isFinite(parsed) ? parsed : 0;
    }
    if (node.access === undefined) node.access = 0;
    if (typeof node.access !== 'number') {
      const acc = Number(node.access);
      node.access = Number.isFinite(acc) ? acc : 0;
    }
    node.id = String(node.id);
  });
  // Backward compatibility: ensure new fields exist
  edges.forEach((edge) => {
    if (edge.fall_depth === undefined) edge.fall_depth = '';
    if (edge.fall_position === undefined) edge.fall_position = '';
    if (edge.line_diameter === undefined) edge.line_diameter = '';
    if (edge.edge_type === undefined) edge.edge_type = EDGE_TYPES[0];
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
  });
  nextNodeId = rec.nextNodeId || 1;
  creationDate = rec.creationDate || rec.createdAt || null;
  currentSketchId = rec.id;
  currentSketchName = rec.name || null;
  computeNodeTypes();
  saveToStorage();
  draw();
  renderDetails();
  // Recenters view to the current sketch center, keeping the existing zoom level
  try { recenterView(); } catch (_) {}
  return true;
}

function deleteFromLibrary(sketchId) {
  const lib = getLibrary();
  const filtered = lib.filter((r) => r.id !== sketchId);
  setLibrary(filtered);
  if (currentSketchId === sketchId) {
    currentSketchId = null;
  }
  // Remove from IndexedDB
  idbDeleteRecordCompat(sketchId);
}

function migrateSingleSketchToLibraryIfNeeded() {
  const lib = getLibrary();
  if (lib.length > 0) return; // already migrated or has sketches
  try {
    const raw = localStorage.getItem('graphSketch');
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
    console.warn('Migration skipped', e);
  }
}

function renderHome() {
  if (!homePanel || !sketchListEl) return;
  startPanel.style.display = 'none';
  homePanel.style.display = 'flex';
  const lib = getLibrary();
  sketchListEl.innerHTML = '';
  if (lib.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = t('noSketches');
    sketchListEl.appendChild(empty);
  } else {
    lib.forEach((rec) => {
      const item = document.createElement('div');
      item.style.border = '1px solid var(--color-border)';
      item.style.borderRadius = '8px';
      item.style.padding = '0.5rem';
      item.style.marginBottom = '0.5rem';
    const displayName = rec.name && String(rec.name).trim().length > 0 ? rec.name : null;
    const title = displayName || t('listTitle', rec.id.slice(-6), (rec.creationDate || rec.createdAt));
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <div class="sketch-title" data-id="${rec.id}" style="font-weight:bold;cursor:text;">${title}</div>
            <div style="font-size:0.85rem;color:var(--color-muted);">${t('listUpdated', new Date(rec.updatedAt || rec.createdAt).toLocaleString())}</div>
            <div style="font-size:0.85rem;color:var(--color-muted);">${t('listCounts', (rec.nodes||[]).length, (rec.edges||[]).length)}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn" data-action="open" data-id="${rec.id}">${t('listOpen')}</button>
            <button class="btn" data-action="duplicate" data-id="${rec.id}">${t('listDuplicate')}</button>
            <button class="btn btn-danger" data-action="delete" data-id="${rec.id}">${t('listDelete')}</button>
          </div>
        </div>`;
      sketchListEl.appendChild(item);
    });
  }
}

function hideHome() {
  if (homePanel) homePanel.style.display = 'none';
}

/**
 * Initialize a brand new sketch and reset all transient state.
 * @param {string} date - ISO date string used for exported filenames
 */
function newSketch(date) {
  nodes = [];
  edges = [];
  nextNodeId = 1;
  selectedNode = null;
  selectedEdge = null;
  isDragging = false;
  pendingEdgeTail = null;
  creationDate = date;
  currentSketchId = null; // new unsaved sketch
  currentSketchName = null;
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
  };
  // Apply custom default fields
  if (Array.isArray(adminConfig.nodes?.customFields)) {
    adminConfig.nodes.customFields.forEach((f) => {
      if (!f || !f.key) return;
      node[f.key] = f.default ?? '';
    });
  }
  nodes.push(node);
  computeNodeTypes();
  saveToStorage();
  return node;
}

/**
 * Create a directed edge between two nodes.
 * Prevents duplicates regardless of direction (A→B or B→A).
 * @param {string|number} tailId - Source node id
 * @param {string|number} headId - Target node id
 * @returns {object|null} The created edge, or null if duplicate exists
 */
function createEdge(tailId, headId) {
  const tailStr = String(tailId);
  const headStr = String(headId);
  // Block duplicate edges in either direction
  const exists = edges.some((e) =>
    (String(e.tail) === tailStr && String(e.head) === headStr) ||
    (String(e.tail) === headStr && String(e.head) === tailStr)
  );
  if (exists) {
    return null;
  }
  const edge = {
    id: Date.now() + Math.random(), // unique id for internal use
    tail: tailStr,
    head: headStr,
    tail_measurement: (adminConfig.edges?.defaults?.tail_measurement ?? ''),
    head_measurement: (adminConfig.edges?.defaults?.head_measurement ?? ''),
    fall_depth: (adminConfig.edges?.defaults?.fall_depth ?? ''),
    fall_position: (adminConfig.edges?.defaults?.fall_position ?? ''),
    line_diameter: (adminConfig.edges?.defaults?.line_diameter ?? ''),
    edge_type: (adminConfig.edges?.defaults?.edge_type ?? EDGE_TYPES[0]),
    material: (adminConfig.edges?.defaults?.material ?? EDGE_MATERIALS[0]),
    maintenanceStatus: 0,
    engineeringStatus: (adminConfig.edges?.defaults?.engineering_status ?? 0),
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

// Drawing functions
/**
 * Redraw the entire scene (edges first, then nodes).
 */
function draw() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // Since we scaled for device pixel ratio, treat coordinates unscaled.
  // Apply view transform for zooming and translation
  // Draw infinite grid first in screen space but offset by transform
  drawInfiniteGrid();
  ctx.translate(viewTranslate.x, viewTranslate.y);
  ctx.scale(viewScale, viewScale);
  // Draw edges first
  edges.forEach((edge) => {
    drawEdge(edge);
  });
  // Draw a rubber-band preview when creating an edge
  if (currentMode === 'edge' && pendingEdgeTail && pendingEdgePreview) {
    const x1 = pendingEdgeTail.x;
    const y1 = pendingEdgeTail.y;
    const x2 = pendingEdgePreview.x;
    const y2 = pendingEdgePreview.y;
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
    ctx.restore();
  }
  // Draw nodes on top
  nodes.forEach((node) => {
    drawNode(node);
  });
  // Draw edge measurement labels above nodes for visibility
  edges.forEach((edge) => {
    drawEdgeLabels(edge);
  });
  ctx.restore();
  // Ensure edge legend is rendered/positioned
  renderEdgeLegend();
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
  drawInfiniteGridFeature(ctx, viewTranslate, viewScale, canvas);
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
    const sx = n.x * viewScale + viewTranslate.x;
    const sy = n.y * viewScale + viewTranslate.y;
    if (sx < minScreenX) minScreenX = sx;
    if (sy < minScreenY) minScreenY = sy;
    if (sx > maxScreenX) maxScreenX = sx;
    if (sy > maxScreenY) maxScreenY = sy;
  }
  const rect = canvas.getBoundingClientRect();
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
  const rect = canvas.getBoundingClientRect();
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
  // default all nodes to type1
  nodes.forEach((node) => {
    node.type = 'type1';
  });
  edges.forEach((edge) => {
    // Ignore self-loops when computing node types to avoid false orange coloring
    if (String(edge.tail) === String(edge.head)) return;
    const tailNode = nodes.find((n) => String(n.id) === String(edge.tail));
    const headNode = nodes.find((n) => String(n.id) === String(edge.head));
    // If tail measurement missing or empty, mark tail node as type2
    if (tailNode && (!edge.tail_measurement || edge.tail_measurement.trim() === '')) {
      tailNode.type = 'type2';
    }
    // If head measurement missing or empty, mark head node as type2
    if (headNode && (!edge.head_measurement || edge.head_measurement.trim() === '')) {
      headNode.type = 'type2';
    }
  });
}

function drawEdge(edge) {
  const tailNode = nodes.find((n) => n.id === edge.tail);
  const headNode = nodes.find((n) => n.id === edge.head);
  const angle = tailNode && headNode ? Math.atan2(headNode.y - tailNode.y, headNode.x - tailNode.x) : 0;
  drawEdgeFeature(ctx, edge, tailNode, headNode, {
    selectedEdge,
    edgeTypeColors: EDGE_TYPE_COLORS,
    highlightedHalfEdge,
    colors: COLORS,
  });
  if (!tailNode || !headNode) return;
  if (edge.fall_depth !== '' && edge.fall_depth !== null && edge.fall_depth !== undefined) {
    const iconDistanceFromHead = ((typeof NODE_RADIUS === 'number' ? NODE_RADIUS : 20) * sizeScale) + (7 * sizeScale);
    const iconX = headNode.x - Math.cos(angle) * iconDistanceFromHead;
    const iconY = headNode.y - Math.sin(angle) * iconDistanceFromHead;
    const size = 16 * sizeScale;
    if (fallIconImage && fallIconReady) {
      ctx.save();
      const bgRadius = size * 0.45;
      ctx.beginPath();
      ctx.arc(iconX, iconY, bgRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#bfdbfe';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      const innerSize = size - (6 * sizeScale);
      ctx.drawImage(fallIconImage, iconX - innerSize / 2, iconY - innerSize / 2, innerSize, innerSize);
      ctx.restore();
    } else {
      const iconRadius = 6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0ea5e9';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F', iconX, iconY);
      ctx.restore();
    }
  }
  // mid-arrow remains inline; labels are drawn in a later pass above nodes
  const x1 = tailNode.x, y1 = tailNode.y, x2 = headNode.x, y2 = headNode.y;
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

function drawEdgeLabels(edge) {
  const tailNode = nodes.find((n) => n.id === edge.tail);
  const headNode = nodes.find((n) => n.id === edge.head);
  if (!tailNode || !headNode) return;
  const x1 = tailNode.x, y1 = tailNode.y, x2 = headNode.x, y2 = headNode.y;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length <= 0) return;
  const normX = dx / length;
  const normY = dy / length;
  const offset = 6 * sizeScale;
  ctx.save();
  const fontSize = Math.round(14 * sizeScale);
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = COLORS.edge.label;
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
  drawNodeFeature(ctx, node, { radius, colors: COLORS, selectedNode });
  if (node.nodeType === 'Home') {
    const iconRadius = node.directConnection ? radius * 0.7 : radius;
    drawHouse(node.x, node.y, iconRadius);
    if (node.directConnection) {
      drawDirectConnectionBadge(node.x, node.y, radius);
    }
    const idStr = String(node.id);
    if (/^\d+$/.test(idStr)) {
      ctx.fillStyle = COLORS.node.label;
      const fontSize = Math.round(16 * sizeScale);
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelY = node.y + (node.directConnection ? iconRadius * 0.9 : iconRadius * 0.6);
      ctx.fillText(idStr, node.x, labelY);
    }
  } else {
    ctx.fillStyle = COLORS.node.label;
    const fontSize = Math.round(16 * sizeScale);
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(node.id), node.x, node.y);
  }
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
  window.requestAnimationFrame(draw);
}

/**
 * Render the right-hand details panel based on the current selection.
 * Supports editing node id, note, material and edge type/material/measurements.
 */
function renderDetails() {
  detailsContainer.innerHTML = '';
  if (selectedNode) {
    const node = selectedNode;
    const container = document.createElement('div');
    // Build node details form
    let materialOptions = '';
    const nodeMaterialOptionLabels = (adminConfig.nodes?.options?.material ?? NODE_MATERIAL_OPTIONS)
      .filter(o => (o.enabled !== false))
      .map(o => o.label || o);
    nodeMaterialOptionLabels.forEach((mat) => {
      materialOptions += `<option value="${mat}" ${node.material === mat ? 'selected' : ''}>${mat}</option>`;
    });
    // Cover diameter as free integer input
    // Access options
    const accessOptions = (adminConfig.nodes?.options?.access ?? NODE_ACCESS_OPTIONS)
      .filter(o => (o.enabled !== false))
      .map(({ code, label }) => `<option value="${code}" ${Number(node.access)===Number(code)?'selected':''}>${label}</option>`)
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
          <input id="idInput" type="text" value="${node.id}" dir="auto" />
        </div>
        <div class="field">
          <label for="noteInput">${t('labels.note')}</label>
          <textarea id="noteInput" rows="3" placeholder="${t('labels.notePlaceholder')}" dir="auto">${node.note || ''}</textarea>
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
            <input id="idInput" type="text" value="${node.id}" dir="auto" />
          </div>
        </div>
        <div class="details-section">
          <div class="details-section-title">${t('labels.indicator')}</div>
          <div class="details-grid two-col">
            <div class="field">
              <div class="chip ${node.type === 'type2' ? 'chip-warn' : 'chip-ok'}">${node.type === 'type2' ? t('labels.indicatorMissing') : t('labels.indicatorOk')}</div>
            </div>
            <div class="field"></div>
            <div class="field">
              <label for="materialSelect">${t('labels.coverMaterial')}</label>
              <select id="materialSelect">${materialOptions}</select>
            </div>
            ${adminConfig.nodes.include.access ? `
            <div class="field">
              <label for="accessSelect">${t('labels.access')}</label>
              <select id="accessSelect">${accessOptions}</select>
            </div>` : ''}
            ${adminConfig.nodes.include.cover_diameter ? `
            <div class="field">
              <label for="coverDiameterInput">${t('labels.coverDiameter')}</label>
              <input id="coverDiameterInput" type="number" step="1" min="0" value="${node.coverDiameter !== '' ? node.coverDiameter : ''}" placeholder="${t('labels.optional')}" />
            </div>` : ''}
            ${adminConfig.nodes.include.maintenance_status ? `
            <div class="field">
              <label for="nodeMaintenanceStatusSelect">${t('labels.maintenanceStatus')}</label>
              <select id="nodeMaintenanceStatusSelect">${(adminConfig.nodes?.options?.maintenance_status ?? NODE_MAINTENANCE_OPTIONS).filter(o => (o.enabled !== false)).map(({code,label}) => `<option value="${code}" ${Number(node.maintenanceStatus)===Number(code)?'selected':''}>${label}</option>`).join('')}</select>
            </div>` : ''}
            ${adminConfig.nodes.include.accuracy_level ? `
            <div class="field">
              <label for="accuracyLevelSelect">${t('labels.accuracyLevel')}</label>
              <select id="accuracyLevelSelect">${(adminConfig.nodes?.options?.accuracy_level ?? NODE_ACCURACY_OPTIONS).filter(o => (o.enabled !== false)).map(({code,label}) => `<option value="${code}" ${Number(node.accuracyLevel)===Number(code)?'selected':''}>${label}</option>`).join('')}</select>
            </div>` : ''}
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
                <option value="" ${e.line_diameter===''?'selected':''}>${t('labels.optional')}</option>
                ${diameterOptions.map((d) => `<option value="${String(d.code)}" ${String(e.line_diameter)===String(d.code)?'selected':''}>${String(d.label)}</option>`).join('')}
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
    } catch (_) {}
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
      debouncedSaveToStorage();
    });
    // Direct connection toggle (Home only)
    const directToggle = container.querySelector('#directConnectionToggle');
    if (directToggle) {
      directToggle.addEventListener('change', (e) => {
        node.directConnection = !!e.target.checked;
        if (node.directConnection) {
          try { assignHomeIdFromConnectedManhole(node); } catch (_) {}
        } else {
          // Revert Home id to a non-numeric internal id when direct connection is off
          try {
            const oldId = String(node.id);
            let newId = (typeof generateHomeInternalId === 'function') ? generateHomeInternalId() : ('home_' + Math.random().toString(36).slice(2, 12));
            // Ensure uniqueness
            while (nodes.some((n) => n !== node && String(n.id) === String(newId))) {
              newId = (typeof generateHomeInternalId === 'function') ? generateHomeInternalId() : ('home_' + Math.random().toString(36).slice(2, 12));
            }
            if (String(oldId) !== String(newId)) {
              renameNodeIdInternal(oldId, newId);
            }
          } catch (_) {}
        }
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
        saveToStorage();
        scheduleDraw();
      });
    }
    
    // Node maintenance status selection listener
    const nodeMaintenanceStatusSelect = container.querySelector('#nodeMaintenanceStatusSelect');
    if (nodeMaintenanceStatusSelect) {
      nodeMaintenanceStatusSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        node.maintenanceStatus = Number.isFinite(num) ? num : 0;
        saveToStorage();
        scheduleDraw();
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
    // Build dropdown options for material
    let materialOptions = '';
    const edgeMaterialOptionLabels = (adminConfig.edges?.options?.material ?? EDGE_MATERIAL_OPTIONS)
      .filter(o => (o.enabled !== false))
      .map(o => o.label || o);
    edgeMaterialOptionLabels.forEach((m) => {
      materialOptions += `<option value="${m}" ${edge.material === m ? 'selected' : ''}>${m}</option>`;
    });
    // Compute current material code based on label
    const materialCodeFor = (label) => {
      const list = adminConfig.edges?.options?.material ?? EDGE_MATERIAL_OPTIONS;
      const found = list.find(o => o.label === label);
      if (found) return found.code;
      const idx = (adminConfig.edges?.options?.material ? list.map(o=>o.label) : EDGE_MATERIALS).indexOf(label);
      return idx >= 0 ? idx : 0;
    };
    // Build dropdown options for edge type
    let edgeTypeOptions = '';
    const edgeTypeOptionLabels = (adminConfig.edges?.options?.edge_type ?? EDGE_TYPE_OPTIONS)
      .filter(o => (o.enabled !== false))
      .map(o => o.label || o);
    edgeTypeOptionLabels.forEach((et) => {
      edgeTypeOptions += `<option value="${et}" ${edge.edge_type === et ? 'selected' : ''}>${et}</option>`;
    });
    // Engineering status options for edge
    const edgeEngineeringOptions = (adminConfig.edges?.options?.engineering_status ?? EDGE_ENGINEERING_STATUS)
      .map(({ code, label }) => `<option value="${code}" ${Number(edge.engineeringStatus)===Number(code)?'selected':''}>${label}</option>`)
      .join('');
    // Normalize line diameter options for slider
    const diameterOptions = (adminConfig.edges?.options?.line_diameter ?? EDGE_LINE_DIAMETERS)
      .filter(o => (o.enabled !== false))
      .map(d => ({ code: d.code ?? d, label: d.label ?? d }));
    const diameterIndexFromCode = (code) => {
      if (code === '' || code == null) return 0; // 0 represents Optional/empty
      const idx = diameterOptions.findIndex((d) => String(d.code) === String(code));
      return idx >= 0 ? (idx + 1) : 0;
    };
    const currentDiameterIndex = diameterIndexFromCode(edge.line_diameter);

    container.innerHTML = `
      <div class="details-section">
        <div class="details-grid two-col">
          <div class="field col-span-2">
            <div>${edge.tail} → ${edge.head}</div>
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
              <option value="" ${edge.line_diameter===''?'selected':''}>${t('labels.optional')}</option>
              ${diameterOptions.map((d) => `<option value="${String(d.code)}" ${String(edge.line_diameter)===String(d.code)?'selected':''}>${String(d.label)}</option>`).join('')}
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
              ${(adminConfig.edges?.options?.fall_position || [{code:0,label:'פנימי'},{code:1,label:'חיצוני'}])
                .filter(o => (o.enabled !== false))
                .map(({code,label}) => `<option value="${String(code)}" ${Number(edge.fall_position)===Number(code)?'selected':''}>${label}</option>`)
                .join('')}
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
    // Attach listeners
    const edgeTypeSelect = container.querySelector('#edgeTypeSelect');
    const edgeMaterialSelect = container.querySelector('#edgeMaterialSelect');
    const edgeDiameterSelect = container.querySelector('#edgeDiameterSelect');
    const edgeEngineeringStatusSelect = container.querySelector('#edgeEngineeringStatusSelect');
    const fallPositionSelect = container.querySelector('#fallPositionSelect');
    edgeTypeSelect.addEventListener('change', (e) => {
      edge.edge_type = e.target.value;
      saveToStorage();
      scheduleDraw();
    });
    edgeMaterialSelect.addEventListener('change', (e) => {
      edge.material = e.target.value;
      saveToStorage();
      scheduleDraw();
    });
    if (edgeDiameterSelect) {
      edgeDiameterSelect.addEventListener('change', (e) => {
        edge.line_diameter = String(e.target.value || '');
        saveToStorage();
        scheduleDraw();
      });
    }
    edgeEngineeringStatusSelect.addEventListener('change', (e) => {
      const num = Number(e.target.value);
      edge.engineeringStatus = Number.isFinite(num) ? num : 0;
      saveToStorage();
      scheduleDraw();
    });
    if (fallPositionSelect) {
      fallPositionSelect.addEventListener('change', (e) => {
        const raw = e.target.value;
        const num = Number(raw);
        edge.fall_position = raw === '' || !Number.isFinite(num) ? '' : num;
        saveToStorage();
      });
    }
    const tailInput = container.querySelector('#tailInput');
    const headInput = container.querySelector('#headInput');
    const fallDepthInput = container.querySelector('#fallDepthInput');
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
      // Recompute node types because missing measurement may affect connected node type
      computeNodeTypes();
      debouncedSaveToStorage();
      scheduleDraw();
    });
    headInput.addEventListener('input', (e) => {
      const raw = String(e.target.value || '');
      const sanitized = raw
        .replace(/[^0-9.]/g, '')
        .replace(/\.(?=.*\.)/g, '');
      if (sanitized !== raw) {
        e.target.value = sanitized;
      }
      edge.head_measurement = sanitized;
      computeNodeTypes();
      debouncedSaveToStorage();
      scheduleDraw();
    });
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
      
      debouncedSaveToStorage();
      scheduleDraw();
    });
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
  } catch (_) {}
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
    const tailNode = nodes.find((n) => n.id === edge.tail);
    const headNode = nodes.find((n) => n.id === edge.head);
    if (!tailNode || !headNode) return;
    const dist = distanceToSegment(x, y, tailNode.x, tailNode.y, headNode.x, headNode.y);
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
    if (!pendingEdgeTail) {
      if (node) {
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
      // Nothing under cursor; do nothing
    } else {
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
      // Clicked empty space; cancel
      pendingEdgeTail = null;
      pendingEdgePreview = null;
      showToast(t('toasts.edgeCancelled'));
      scheduleDraw();
      return;
    }
  }
  // Contextual edit: in Node/Home/Drainage mode, allow selecting and dragging existing nodes when clicking on them
  if ((currentMode === 'node' || currentMode === 'home' || currentMode === 'drainage') && node) {
    // Toggle close if clicking the same node again
    if (selectedNode && String(selectedNode.id) === String(node.id)) {
      selectedNode = null;
      selectedEdge = null;
      pendingDetailsForSelectedNode = false;
      renderDetails();
      scheduleDraw();
      return;
    }
    selectedNode = node;
    selectedEdge = null;
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
    // Switch the created node to Home type and assign internal id
    const oldId = String(created.id);
    const newId = generateHomeInternalId();
    created.nodeType = 'Home';
    renameNodeIdInternal(oldId, newId);
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
    }
  }
  if (isDragging && selectedNode) {
    selectedNode.x = world.x - dragOffset.x;
    selectedNode.y = world.y - dragOffset.y;
    saveToStorage();
    scheduleDraw();
    // Auto-pan only while dragging to create infinite feel, not every frame in draw
    autoPanWhenDragging(x, y);
    return;
  }
  // Update edge preview while selecting target in edge mode
  if (currentMode === 'edge' && pendingEdgeTail) {
    pendingEdgePreview = { x: world.x, y: world.y };
    scheduleDraw();
  }
}

/**
 * Handle pointer up/cancel to end dragging.
 */
function pointerUp() {
  isDragging = false;
  // If a node was grabbed but not moved significantly, open details now
  if (pendingDetailsForSelectedNode && selectedNode) {
    renderDetails();
    scheduleDraw();
  }
  // Reset pending click/drag-open state
  pendingDetailsForSelectedNode = false;
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
        mouseAddPending = (currentMode === 'node' || currentMode === 'home' || currentMode === 'drainage');
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
        if (nodeAt) {
          // Edge creation: first tap selects tail, second tap on another node creates edge
          if (!pendingEdgeTail) {
            pendingEdgeTail = nodeAt;
            pendingEdgePreview = { x: world.x, y: world.y };
            selectedNode = null;
            selectedEdge = null;
            touchAddPending = false;
            touchAddPoint = null;
            renderDetails();
            scheduleDraw();
            showToast(t('toasts.chooseTarget'));
          } else {
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
          }
        } else if (edgeAt && !pendingEdgeTail) {
          // Select edge for editing in edge mode
          selectedEdge = edgeAt;
          selectedNode = null;
          touchAddPending = false;
          touchAddPoint = null;
          renderDetails();
          scheduleDraw();
        } else {
          // Empty background in edge mode
          if (pendingEdgeTail) {
            // Tapped empty space while an edge is pending: cancel
            pendingEdgeTail = null;
            pendingEdgePreview = null;
            scheduleDraw();
            showToast(t('toasts.edgeCancelled'));
          } else {
            // No pending edge and empty space: candidate for background pan
            touchPanCandidate = true;
            touchAddPending = false; // do not create nodes in edge mode
            touchAddPoint = { x, y };
          }
        }
      } else {
        const nodeAt = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION);
        if (nodeAt) {
          // Toggle close if tapping the same node again
          if (selectedNode && String(selectedNode.id) === String(nodeAt.id)) {
            selectedNode = null;
            selectedEdge = null;
            pendingDetailsForSelectedNode = false;
            renderDetails();
            scheduleDraw();
            return;
          }
          // Begin drag/select without risking accidental creation via pointerDown
          selectedNode = nodeAt;
          selectedEdge = null;
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
        viewTranslate.x = centerScreen.x - viewScale * pinchCenterWorld.x;
        viewTranslate.y = centerScreen.y - viewScale * pinchCenterWorld.y;
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
      if (currentMode === 'edge' && pendingEdgeTail) {
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
    // If a tap-to-add is pending and didn't move much, create node now (Node or Home or Drainage mode)
    if (touchAddPending && touchAddPoint && (currentMode === 'node' || currentMode === 'home' || currentMode === 'drainage') && !isDragging) {
      const world = screenToWorld(touchAddPoint.x, touchAddPoint.y);
      // Re-check proximity with touch-friendly thresholds to avoid creating next to an existing node/edge
      const nearNode = findNodeAtWithExpansion(world.x, world.y, TOUCH_SELECT_EXPANSION);
      const nearEdge = findEdgeAt(world.x, world.y, TOUCH_EDGE_HIT_THRESHOLD);
      if (!nearNode && !nearEdge) {
        const created = createNode(world.x, world.y);
        if (currentMode === 'home' && created) {
          const oldId = String(created.id);
          const newId = generateHomeInternalId();
          created.nodeType = 'Home';
          renameNodeIdInternal(oldId, newId);
        } else if (currentMode === 'drainage' && created) {
          // Keep numeric ID for drainage (like manholes)
          created.nodeType = 'Drainage';
        }
        scheduleDraw();
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

// Control buttons handlers
newSketchBtn.addEventListener('click', () => {
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
  // Confirm if existing sketch has content
  if ((nodes.length > 0 || edges.length > 0)) {
    const ok = confirm(t('confirms.newClears'));
    if (!ok) return;
  }
  newSketch(dateVal);
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
    edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
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
    edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
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
    edgeModeBtn.classList.remove('active');
    pendingEdgeTail = null;
    pendingEdgePreview = null;
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
      console.error('Export error:', error);
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
      
      // Recompute node types and save
      computeNodeTypes();
      saveToStorage();
      draw();
      renderDetails();
      
      // Recenter view
      try { recenterView(); } catch (_) {}
      
      showToast(t('toasts.sketchImported'));
      
    } catch (error) {
      console.error('Import error:', error);
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
if (sketchListEl) {
  sketchListEl.addEventListener('click', (e) => {
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
        setLibrary(lib);
        if (currentSketchId === rec.id) {
          currentSketchName = rec.name || null;
          saveToStorage();
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
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');
    if (!action || !id) return;
    if (action === 'open') {
      hideHome();
      loadFromLibrary(id);
      showToast(t('toasts.opened'));
    } else if (action === 'duplicate') {
      const lib = getLibrary();
      const rec = lib.find((r) => r.id === id);
      if (rec) {
        const copy = { ...rec, id: generateSketchId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        lib.unshift(copy);
        setLibrary(lib);
        renderHome();
        showToast(t('toasts.duplicated'));
      }
    } else if (action === 'delete') {
      const ok = confirm(t('confirms.deleteSketch'));
      if (!ok) return;
      deleteFromLibrary(id);
      renderHome();
      showToast(t('toasts.deleted'));
    }
  });
}

// Save button and autosave toggle
if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    const before = autosaveEnabled;
    autosaveEnabled = false; // avoid double-save side effects
    saveToLibrary();
    autosaveEnabled = before;
    saveToStorage();
    showToast(t('toasts.saved'));
  });
}
if (autosaveToggle) {
  const savedPref = localStorage.getItem('graphSketch.autosave');
  if (savedPref !== null) autosaveEnabled = savedPref === 'true';
  autosaveToggle.checked = autosaveEnabled;
  autosaveToggle.addEventListener('change', () => {
    autosaveEnabled = !!autosaveToggle.checked;
    localStorage.setItem('graphSketch.autosave', String(autosaveEnabled));
    showToast(autosaveEnabled ? t('toasts.autosaveOn') : t('toasts.autosaveOff'));
    if (autosaveEnabled) saveToLibrary();
  });
}

// Load size scale preference
try {
  const savedSizeScale = localStorage.getItem('graphSketch.sizeScale');
  if (savedSizeScale !== null) {
    const parsed = parseFloat(savedSizeScale);
    if (!isNaN(parsed) && parsed >= MIN_SIZE_SCALE && parsed <= MAX_SIZE_SCALE) {
      sizeScale = parsed;
    }
  }
} catch (e) {
  console.warn('Failed to load size scale preference:', e);
}

// Size control buttons
function increaseSizeScale() {
  const newScale = Math.min(sizeScale + SIZE_SCALE_STEP, MAX_SIZE_SCALE);
  if (newScale !== sizeScale) {
    sizeScale = newScale;
    localStorage.setItem('graphSketch.sizeScale', String(sizeScale));
    scheduleDraw();
    const pct = Math.round(sizeScale * 100);
    showToast(t('toasts.sizeChanged', pct));
  }
}

function decreaseSizeScale() {
  const newScale = Math.max(sizeScale - SIZE_SCALE_STEP, MIN_SIZE_SCALE);
  if (newScale !== sizeScale) {
    sizeScale = newScale;
    localStorage.setItem('graphSketch.sizeScale', String(sizeScale));
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
    helpModal.style.display = 'flex';
  });
}
if (closeHelpBtn && helpModal) {
  closeHelpBtn.addEventListener('click', () => {
    helpModal.style.display = 'none';
  });
}
if (helpModal) {
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.style.display = 'none';
  });
}

// Language selector
if (langSelect) {
  langSelect.addEventListener('change', () => {
    const value = langSelect.value === 'en' ? 'en' : 'he';
    currentLang = value;
    try { window.currentLang = currentLang; } catch (_) {}
    localStorage.setItem('graphSketch.lang', currentLang);
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
    } catch (_) {}
  });
}

// === Mobile menu controls ===
// Toggle the overflow menu on small screens
if (mobileMenuBtn && mobileMenu) {
  mobileMenuBtn.addEventListener('click', () => {
    const isOpen = mobileMenu.style.display === 'block';
    mobileMenu.style.display = isOpen ? 'none' : 'block';
  });
}

// Helper to hide the mobile menu after selecting an action
function closeMobileMenu() {
  if (mobileMenu) mobileMenu.style.display = 'none';
}

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
// Language selector sync
if (mobileLangSelect && langSelect) {
  // Initialize to current value
  mobileLangSelect.value = langSelect.value;
  mobileLangSelect.addEventListener('change', () => {
    langSelect.value = mobileLangSelect.value;
    langSelect.dispatchEvent(new Event('change'));
    closeMobileMenu();
  });
  // Update when desktop selector changes
  langSelect.addEventListener('change', () => {
    mobileLangSelect.value = langSelect.value;
  });
}
// Help button
if (mobileHelpBtn && helpBtn) {
  mobileHelpBtn.addEventListener('click', () => {
    closeMobileMenu();
    helpBtn.click();
  });
}

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
      helpModal.style.display = 'none';
      e.preventDefault();
      return;
    }
    if (pendingEdgeTail) {
      pendingEdgeTail = null;
      pendingEdgePreview = null;
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
document.addEventListener('mousedown', () => { try { commitIdInputIfFocused(); } catch (_) {} }, true);
document.addEventListener('touchstart', () => { try { commitIdInputIfFocused(); } catch (_) {} }, true);
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
  viewTranslate.x = mouseX - viewScale * focusWorld.x;
  viewTranslate.y = mouseY - viewScale * focusWorld.y;
  scheduleDraw();
  showToast(t('toasts.zoom', (viewScale * 100).toFixed(0)));
}, { passive: false });

/**
 * Convert screen space (canvas client) coords to world coords (pre-zoom space).
 */
function screenToWorld(x, y) {
  return {
    x: (x - viewTranslate.x) / viewScale,
    y: (y - viewTranslate.y) / viewScale,
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
  viewTranslate.x = centerScreen.x - viewScale * centerWorld.x;
  viewTranslate.y = centerScreen.y - viewScale * centerWorld.y;
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
    if (!node) continue;
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
  viewTranslate.x = centerScreen.x - viewScale * centerWorld.x;
  viewTranslate.y = centerScreen.y - viewScale * centerWorld.y;
  scheduleDraw();
}

// Recenter button handler
if (recenterBtn) {
  recenterBtn.addEventListener('click', () => {
    try { recenterView(); } catch (_) {}
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
    viewTranslate.x = centerScreen.x - viewScale * foundNode.x;
    viewTranslate.y = centerScreen.y - viewScale * foundNode.y;
    
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

/**
 * Application entry point: set defaults, load persisted state, size canvas and render UI.
 */
async function init() {
  // Attempt to recover any data from IndexedDB into localStorage if localStorage is empty.
  // Wait for restoration so the UI reflects persisted data on first paint after relaunch.
  try { await restoreFromIndexedDbIfNeeded(); } catch (_) {}
  // Set default date input to today
  dateInput.value = new Date().toISOString().substr(0, 10);
  migrateSingleSketchToLibraryIfNeeded();
  // Language init
  const savedLang = localStorage.getItem('graphSketch.lang');
  if (savedLang === 'en' || savedLang === 'he') currentLang = savedLang; else currentLang = 'he';
  try { window.currentLang = currentLang; } catch (_) {}
  if (langSelect) langSelect.value = currentLang;
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

// Global error handlers to improve resilience and observability.  Errors
// surfaced here will not crash the app; instead they are logged and
// surfaced via the toast.  Developers can hook into this to send
// telemetry.
window.addEventListener('error', (e) => {
  console.error('Unhandled error:', e.error || e.message || e);
  showToast('⚠️ ' + (e.message || 'Unexpected error'));
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
  showToast('⚠️ ' + (e.reason && e.reason.message ? e.reason.message : 'Unexpected error'));
});

// Connectivity toasts are now handled in src/serviceWorker/register-sw.js.
// Keep legacy listeners as no-ops to avoid duplicate toasts.
window.addEventListener('online', () => {
  /* handled in register-sw.js */
});
window.addEventListener('offline', () => {
  /* handled in register-sw.js */
});