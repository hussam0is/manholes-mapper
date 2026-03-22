/**
 * app-utils.js
 *
 * Utility functions and canvas helpers extracted from main.js.
 * Uses the S/F shared-state pattern for accessing main.js local variables.
 */

import { S, F } from './shared-state.js';
import { getUsername as getAuthUsername } from '../auth/auth-guard.js';
import { STORAGE_KEYS } from '../state/persistence.js';
import {
  NODE_MATERIAL_OPTIONS,
  NODE_ACCESS_OPTIONS,
  NODE_ENGINEERING_STATUS,
  NODE_MAINTENANCE_OPTIONS,
  EDGE_MATERIAL_OPTIONS,
  EDGE_LINE_DIAMETERS,
  EDGE_TYPES,
  EDGE_TYPE_OPTIONS,
  EDGE_ENGINEERING_STATUS,
  NODE_ACCURACY_OPTIONS,
} from '../state/constants.js';

// ─── Username / Timestamp helpers ───────────────────────────────────────────

/**
 * Get the current username from authentication or return a default.
 * @returns {string}
 */
export function getCurrentUsername() {
  try {
    const username = getAuthUsername();
    return username || 'anonymous';
  } catch (_) {
    return 'anonymous';
  }
}

/**
 * Update timestamp fields on a node when it's modified.
 * @param {object} node - The node to update
 */
export function updateNodeTimestamp(node) {
  node.updatedAt = new Date().toISOString();
  node.modifiedBy = getCurrentUsername();
}

/**
 * Update timestamp fields on an edge when it's modified.
 * @param {object} edge - The edge to update
 */
export function updateEdgeTimestamp(edge) {
  edge.updatedAt = new Date().toISOString();
  edge.modifiedBy = getCurrentUsername();
}

// ─── iOS tap-to-click fix ───────────────────────────────────────────────────

/**
 * iPad/iOS: ensure taps trigger clicks on header buttons
 * (Safari sometimes suppresses click).
 * @param {HTMLElement|null} element
 */
export function synthesizeClickOnTap(element) {
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

// ─── Sketch name display ────────────────────────────────────────────────────

/**
 * Update the sketch name display in the header (desktop and mobile).
 * Reads currentSketchName and DOM refs from S.
 */
export function updateSketchNameDisplay() {
  const name = S.currentSketchName || '';
  const el = S.sketchNameDisplayEl;
  const mobileEl = S.sketchNameDisplayMobileEl;
  if (el) {
    el.textContent = name;
  }
  if (mobileEl) {
    mobileEl.textContent = name;
  }
}

// ─── Canvas rect cache ──────────────────────────────────────────────────────

/** @type {DOMRect|null} */
let _cachedCanvasRect = null;

/**
 * Return cached canvas bounding rect to avoid forced layout flush during
 * drag frames. Lazily re-measures when cache is null.
 * @returns {DOMRect}
 */
export function getCachedCanvasRect() {
  if (!_cachedCanvasRect) {
    _cachedCanvasRect = S.canvas.getBoundingClientRect();
  }
  return _cachedCanvasRect;
}

/**
 * Invalidate the canvas rect cache (called on resize/scroll).
 */
export function invalidateCanvasRectCache() {
  _cachedCanvasRect = null;
}

// ─── Edge label cache dirty flag ────────────────────────────────────────────

/**
 * Mark the edge-label data cache as dirty so it is rebuilt next frame.
 * The actual cache variables live on S (_edgeLabelDataCache etc.).
 */
export function markEdgeLabelCacheDirty() {
  S._edgeLabelDataCache = null;
}

// ─── Canvas resize ──────────────────────────────────────────────────────────

/**
 * Resize the canvas to match its container and device pixel ratio,
 * then trigger a redraw.
 */
export function resizeCanvas() {
  const canvas = S.canvas;
  const ctx = S.ctx;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.round(rect.width * dpr);
  const targetHeight = Math.round(rect.height * dpr);
  // Only update backing store if dimensions actually changed to avoid extra layout
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    // Adjust viewTranslate to keep the center of the view stable
    const viewTranslate = S.viewTranslate;
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
  F.draw();
}

// Coalesce resize-triggered work to the next animation frame
let _resizeRafId = 0;

/**
 * Schedule a canvas resize on the next animation frame.
 */
export function scheduleResizeCanvas() {
  if (_resizeRafId) return;
  if (typeof requestAnimationFrame === 'function') {
    _resizeRafId = requestAnimationFrame(() => {
      _resizeRafId = 0;
      resizeCanvas();
    });
  } else {
    _resizeRafId = setTimeout(() => {
      _resizeRafId = 0;
      resizeCanvas();
    }, 0);
  }
}

// ─── Admin configuration ────────────────────────────────────────────────────

const NODE_MATERIALS = NODE_MATERIAL_OPTIONS.map(o => o.label);
const EDGE_MATERIALS = EDGE_MATERIAL_OPTIONS.map(o => o.label);

const ADMIN_STORAGE_KEY = STORAGE_KEYS.adminConfig;

/**
 * Default admin configuration shape.
 * Controls which fields are included in CSV export, default values for new
 * entities, and option lists for selectable fields.
 */
export const defaultAdminConfig = {
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
        { code: 0, label: typeof window.t === 'function' ? window.t('labels.fallPositionInternal') : 'פנימי', enabled: true },
        { code: 1, label: typeof window.t === 'function' ? window.t('labels.fallPositionExternal') : 'חיצוני', enabled: true },
      ],
    },
  }
};

/**
 * Load admin config from localStorage, merging with defaults for backward
 * compatibility. Returns a fully normalised config object.
 * @returns {object}
 */
export function loadAdminConfig() {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(defaultAdminConfig));
    const parsed = JSON.parse(raw);
    const merged = { ...JSON.parse(JSON.stringify(defaultAdminConfig)), ...parsed };
    // Normalize nested shapes for backward compatibility
    merged.nodes = merged.nodes || {};
    merged.edges = merged.edges || {};
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
}

/**
 * Persist the current admin config (read from S.adminConfig) to localStorage.
 */
export function saveAdminConfig() {
  localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(S.adminConfig));
}
