/**
 * Multi-sketch state management for project canvas mode.
 *
 * Manages a Map of loaded sketches, tracks the active sketch,
 * provides visibility toggles, and supports auto-switching
 * when the user clicks on a background sketch element.
 */

import { NODE_RADIUS } from '../state/constants.js';
import { invalidateBackgroundCache } from './project-canvas-renderer.js';

/** @type {(key: string, ...args: any[]) => string} */
const t = (key, ...args) => (typeof window.t === 'function' ? window.t(key, ...args) : key);

// ── State ──────────────────────────────────────────────────────────────────

/** @type {Map<string, object>} sketchId → full sketch data */
const projectSketches = new Map();

/** @type {string|null} ID of the currently-active sketch */
let activeSketchId = null;

/** @type {string|null} Project ID when in project-canvas mode */
let currentViewProjectId = null;

/** @type {Set<string>} IDs of sketches hidden by the user */
const hiddenSketches = new Set();

/** @type {Set<string>} IDs of sketches selected for full-opacity rendering */
const _selectedSketches = new Set();

/** Whether multi-select mode is enabled */
let _multiSelectMode = false;

/** Listeners notified when state changes */
const listeners = new Set();

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Load all sketches for a project from the API and enter project-canvas mode.
 * Sets the first sketch as active.
 */
export async function loadProjectSketches(projectId) {
  console.time('[PERF] loadProjectSketches:fetch');
  const res = await fetch(`/api/projects/${projectId}?fullSketches=true`);
  if (!res.ok) throw new Error(`Failed to load project sketches: ${res.status}`);
  console.timeEnd('[PERF] loadProjectSketches:fetch');

  console.time('[PERF] loadProjectSketches:parseJSON');
  const { sketches } = await res.json();
  console.timeEnd('[PERF] loadProjectSketches:parseJSON');
  console.log(`[PERF] loadProjectSketches: received ${sketches.length} sketches`);

  projectSketches.clear();
  hiddenSketches.clear();
  _selectedSketches.clear();
  _multiSelectMode = false;

  for (const s of sketches) {
    projectSketches.set(s.id, s);
  }

  currentViewProjectId = projectId;

  // Activate the first sketch (or null if empty project)
  if (sketches.length > 0) {
    console.time('[PERF] loadProjectSketches:setActive');
    activeSketchId = sketches[0].id;
    _selectedSketches.add(sketches[0].id);
    const first = sketches[0];
    window.__setActiveSketchData?.({
      nodes: first.nodes || [],
      edges: first.edges || [],
      nextNodeId: _maxNodeId(first.nodes) + 1,
      sketchId: first.id,
      sketchName: first.name,
      projectId,
      adminConfig: first.adminConfig || {},
      inputFlowConfig: first.snapshotInputFlowConfig || {},
    });
    console.timeEnd('[PERF] loadProjectSketches:setActive');
  } else {
    activeSketchId = null;
  }

  console.time('[PERF] loadProjectSketches:notify');
  _notify();
  console.timeEnd('[PERF] loadProjectSketches:notify');
  return sketches;
}

/**
 * Return visible background sketches (all visible sketches except active).
 */
export function getBackgroundSketches() {
  const result = [];
  for (const [id, sketch] of projectSketches) {
    if (id === activeSketchId) continue;
    if (hiddenSketches.has(id)) continue;
    result.push(sketch);
  }
  return result;
}

/**
 * Return all loaded sketches with their visibility/active state.
 */
export function getAllSketches() {
  const result = [];
  for (const [id, sketch] of projectSketches) {
    result.push({
      ...sketch,
      isActive: id === activeSketchId,
      isVisible: !hiddenSketches.has(id),
      isSelected: _selectedSketches.has(id),
    });
  }
  return result;
}

/**
 * Toggle visibility of a specific sketch. Hidden sketches are not drawn.
 */
export function setSketchVisibility(sketchId, visible) {
  if (visible) {
    hiddenSketches.delete(sketchId);
  } else {
    hiddenSketches.add(sketchId);
  }
  invalidateBackgroundCache();
  _notify();
  window.__scheduleDraw?.();
}

/**
 * Switch the active sketch. Snapshots the current sketch into the map,
 * then loads the new sketch into the main globals.
 */
export function switchActiveSketch(sketchId) {
  if (sketchId === activeSketchId) return;
  if (!projectSketches.has(sketchId)) return;

  // Snapshot current active sketch back into the map
  if (activeSketchId && window.__getActiveSketchData) {
    const snapshot = window.__getActiveSketchData();
    const existing = projectSketches.get(activeSketchId);
    if (existing) {
      existing.nodes = snapshot.nodes;
      existing.edges = snapshot.edges;
    }
  }

  // Load the target sketch
  activeSketchId = sketchId;
  const target = projectSketches.get(sketchId);
  window.__setActiveSketchData?.({
    nodes: target.nodes || [],
    edges: target.edges || [],
    nextNodeId: _maxNodeId(target.nodes) + 1,
    sketchId: target.id,
    sketchName: target.name,
    projectId: currentViewProjectId,
    adminConfig: target.adminConfig || {},
    inputFlowConfig: target.snapshotInputFlowConfig || {},
  });

  invalidateBackgroundCache();

  // Unhide if it was hidden
  hiddenSketches.delete(sketchId);

  // Active sketch is always in the selected set
  _selectedSketches.add(sketchId);

  _notify();

  if (typeof window.showToast === 'function') {
    window.showToast(t('projects.canvas.switchedTo') + ' ' + (target.name || sketchId.slice(-6)));
  }
}

/**
 * Check whether we are currently in project-canvas mode.
 */
export function isProjectCanvasMode() {
  return currentViewProjectId !== null;
}

/**
 * Get the current project ID.
 */
export function getCurrentProjectId() {
  return currentViewProjectId;
}

/**
 * Leave project-canvas mode. Snapshots active sketch, clears map.
 */
export function clearProjectCanvas() {
  // Snapshot active sketch before leaving
  if (activeSketchId && window.__getActiveSketchData) {
    const snapshot = window.__getActiveSketchData();
    const existing = projectSketches.get(activeSketchId);
    if (existing) {
      existing.nodes = snapshot.nodes;
      existing.edges = snapshot.edges;
    }
  }

  projectSketches.clear();
  hiddenSketches.clear();
  _selectedSketches.clear();
  _multiSelectMode = false;
  activeSketchId = null;
  currentViewProjectId = null;
  _notify();
}

/**
 * Find a node in any visible background sketch near (worldX, worldY).
 * Returns { sketchId, node } or null.
 */
export function findNodeInBackground(worldX, worldY, sizeScaleVal, viewScaleVal) {
  const vs = viewScaleVal || 1;
  const radius = NODE_RADIUS * (sizeScaleVal || 1) / vs;
  const pad = 2 / vs;
  for (const [id, sketch] of projectSketches) {
    if (id === activeSketchId) continue;
    if (hiddenSketches.has(id)) continue;
    const nodes = sketch.nodes || [];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius + pad) {
        return { sketchId: id, node: n };
      }
    }
  }
  return null;
}

/**
 * Find an edge in any visible background sketch near (worldX, worldY).
 * Returns { sketchId, edge } or null.
 */
export function findEdgeInBackground(worldX, worldY, viewScaleVal) {
  const threshold = 8 / (viewScaleVal || 1);
  for (const [id, sketch] of projectSketches) {
    if (id === activeSketchId) continue;
    if (hiddenSketches.has(id)) continue;
    const sketchNodes = sketch.nodes || [];
    const sketchEdges = sketch.edges || [];
    // Build a temporary node map for this sketch
    const nMap = new Map();
    for (const n of sketchNodes) nMap.set(String(n.id), n);

    for (const edge of sketchEdges) {
      const tail = edge.tail != null ? nMap.get(String(edge.tail)) : null;
      const head = edge.head != null ? nMap.get(String(edge.head)) : null;
      if (!tail || !head) continue;
      const dist = _distToSegment(worldX, worldY, tail.x, tail.y, head.x, head.y);
      if (dist <= threshold) {
        return { sketchId: id, edge };
      }
    }
  }
  return null;
}

// ── Multi-select API ──────────────────────────────────────────────────────

/**
 * Check whether multi-select mode is enabled.
 */
export function isMultiSelectMode() {
  return _multiSelectMode;
}

/**
 * Enable or disable multi-select mode.
 * When disabling, clears the selection set (only active sketch remains selected).
 */
export function toggleMultiSelect(enabled) {
  _multiSelectMode = enabled;
  if (!enabled) {
    _selectedSketches.clear();
    if (activeSketchId) _selectedSketches.add(activeSketchId);
  }
  invalidateBackgroundCache();
  _notify();
  window.__scheduleDraw?.();
}

/**
 * Toggle whether a sketch is in the selected set.
 * The active sketch cannot be deselected.
 * Selecting a hidden sketch also unhides it.
 */
export function toggleSketchSelected(sketchId) {
  // Active sketch is always selected
  if (sketchId === activeSketchId) return;

  if (_selectedSketches.has(sketchId)) {
    _selectedSketches.delete(sketchId);
  } else {
    _selectedSketches.add(sketchId);
    // Selecting a sketch also unhides it
    hiddenSketches.delete(sketchId);
  }
  invalidateBackgroundCache();
  _notify();
  window.__scheduleDraw?.();
}

/**
 * Check whether a sketch is in the selected set.
 */
export function isSketchSelected(sketchId) {
  return _selectedSketches.has(sketchId);
}

/**
 * Get a copy of the selected sketch IDs set.
 */
export function getSelectedSketchIds() {
  return new Set(_selectedSketches);
}

/**
 * Select ALL sketches (View All). Unhides everything.
 */
export function selectAllSketches() {
  _multiSelectMode = true;
  _selectedSketches.clear();
  hiddenSketches.clear();
  for (const id of projectSketches.keys()) {
    _selectedSketches.add(id);
  }
  invalidateBackgroundCache();
  _notify();
  window.__scheduleDraw?.();
}

/**
 * Check whether all sketches are currently selected.
 */
export function areAllSketchesSelected() {
  if (projectSketches.size === 0) return false;
  for (const id of projectSketches.keys()) {
    if (!_selectedSketches.has(id)) return false;
  }
  return true;
}

/**
 * Subscribe to state changes.
 */
export function onProjectCanvasChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Refresh the active sketch's data in the projectSketches Map from the
 * live canvas state, then notify listeners with a 'data' change type.
 * Called from saveToStorage() so the side panel stats stay up-to-date.
 */
export function refreshActiveSketchData() {
  if (!activeSketchId) return;
  const existing = projectSketches.get(activeSketchId);
  if (!existing) return;
  const snapshot = window.__getActiveSketchData?.();
  if (!snapshot) return;
  existing.nodes = snapshot.nodes;
  existing.edges = snapshot.edges;
  _notify('data');
}

// ── Private helpers ────────────────────────────────────────────────────────

function _notify(changeType) {
  for (const fn of listeners) {
    try { fn(changeType); } catch (e) { console.warn('[ProjectCanvas] Listener error:', e); }
  }
}

function _maxNodeId(nodes) {
  if (!nodes || nodes.length === 0) return 0;
  let max = 0;
  for (const n of nodes) {
    const id = parseInt(n.id, 10);
    if (!isNaN(id) && id > max) max = id;
  }
  return max;
}

function _distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx, projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}
