/**
 * Cross-sketch merge mode.
 *
 * When merge mode is enabled for the active sketch, this module:
 *   1. Scans all other visible sketches for nodes within MERGE_RADIUS_M metres
 *      of the active sketch's bounding box (expanded by the radius).
 *   2. For each such nearby node, checks whether it is a duplicate of an
 *      active-sketch node (within DUPLICATE_THRESHOLD_M).
 *   3. Produces two lists:
 *        - nearbyNodes: nodes from other sketches that sit inside the radius
 *        - crossMergeIssues: pairs of (activeNode, nearbyNode) that are close
 *          enough to be considered duplicate manholes
 *
 * Coordinate system:
 *   All distance calculations use ITM survey metres (surveyX / surveyY).
 *   Nodes that have no survey coords fall back to canvas-world / 50 (same
 *   heuristic as sketch-issues.js).
 *
 * The module exposes state via getters and a listener pattern that matches
 * the rest of the project-canvas architecture.
 */

/** Radius (metres) around the active sketch's AABB to pull in neighbour nodes */
export const MERGE_RADIUS_M = 50;

/** Distance (metres) below which two nodes from different sketches are flagged
 *  as potential duplicates */
export const DUPLICATE_THRESHOLD_M = 3;

// ── State ─────────────────────────────────────────────────────────────────

let _enabled = false;

/**
 * @typedef {{
 *   node: object,
 *   sketchId: string,
 *   sketchName: string,
 *   itmX: number,
 *   itmY: number,
 * }} NearbyNode
 *
 * @typedef {{
 *   type: 'cross_sketch_duplicate',
 *   activeNodeId: string|number,
 *   activeSketchId: string,
 *   nearbyNodeId: string|number,
 *   nearbySketchId: string,
 *   nearbySketchName: string,
 *   distanceM: number,
 *   worldX: number,
 *   worldY: number,
 *   nearbyWorldX: number,
 *   nearbyWorldY: number,
 * }} CrossMergeIssue
 */

/** @type {NearbyNode[]} */
let _nearbyNodes = [];

/** @type {CrossMergeIssue[]} */
let _crossMergeIssues = [];

/** Listeners notified when merge-mode state changes */
const _listeners = new Set();

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Enable or disable merge mode. Recomputes data when enabled.
 *
 * @param {boolean} enabled
 * @param {object} [context] - Required when enabling:
 *   @param {object[]} context.activeNodes
 *   @param {object[]} context.otherSketches  - array of { id, name, nodes[] }
 */
export function setMergeMode(enabled, context = {}) {
  _enabled = enabled;

  if (!enabled) {
    _nearbyNodes = [];
    _crossMergeIssues = [];
    _notify();
    return;
  }

  const { activeNodes = [], otherSketches = [] } = context;
  _compute(activeNodes, otherSketches);
  _notify();
}

/** Whether merge mode is currently active */
export function isMergeModeEnabled() {
  return _enabled;
}

/** Nearby nodes from other sketches (for canvas overlay rendering) */
export function getNearbyNodes() {
  return _nearbyNodes;
}

/** Detected cross-sketch duplicate pairs (for the issues sub-panel) */
export function getCrossMergeIssues() {
  return _crossMergeIssues;
}

/**
 * Subscribe to merge-mode state changes.
 * Returns an unsubscribe function.
 */
export function onMergeModeChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Refresh merge mode data with updated sketch contents.
 * No-op when not enabled.
 */
export function refreshMergeMode(activeNodes, otherSketches) {
  if (!_enabled) return;
  _compute(activeNodes, otherSketches);
  _notify();
}

// ── Internal computation ──────────────────────────────────────────────────

/**
 * Convert a node to ITM coordinates (metres).
 * Uses surveyX/Y when available, canvas fallback otherwise.
 */
function _nodeItm(node) {
  if (node.surveyX != null && node.surveyY != null) {
    return { x: node.surveyX, y: node.surveyY };
  }
  // canvas-world units are px where 50px ≈ 1 metre (established convention)
  return { x: (node.x || 0) / 50, y: (node.y || 0) / 50 };
}

/**
 * Compute the ITM AABB of the active sketch nodes.
 * Returns null when there are no georeferenced nodes.
 */
function _activeAabb(activeNodes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasCoords = false;

  for (const n of activeNodes) {
    const itm = _nodeItm(n);
    if (itm.x === 0 && itm.y === 0 && n.surveyX == null) continue; // skip origin-only fallbacks when sketch has no coords at all
    hasCoords = true;
    if (itm.x < minX) minX = itm.x;
    if (itm.y < minY) minY = itm.y;
    if (itm.x > maxX) maxX = itm.x;
    if (itm.y > maxY) maxY = itm.y;
  }

  if (!hasCoords) return null;
  return { minX, minY, maxX, maxY };
}

function _compute(activeNodes, otherSketches) {
  _nearbyNodes = [];
  _crossMergeIssues = [];

  if (activeNodes.length === 0) return;

  const aabb = _activeAabb(activeNodes);
  // Fall back: if no survey coords in active sketch, use canvas bounding box
  // expanded by the radius threshold.
  let expandedMinX, expandedMinY, expandedMaxX, expandedMaxY;

  if (aabb) {
    expandedMinX = aabb.minX - MERGE_RADIUS_M;
    expandedMinY = aabb.minY - MERGE_RADIUS_M;
    expandedMaxX = aabb.maxX + MERGE_RADIUS_M;
    expandedMaxY = aabb.maxY + MERGE_RADIUS_M;
  } else {
    // No survey data — skip computation; nothing to match on
    return;
  }

  // Build ITM cache for active nodes
  /** @type {{ node: object, itm: { x: number, y: number } }[]} */
  const activeItm = activeNodes.map(n => ({ node: n, itm: _nodeItm(n) }));

  for (const sketch of otherSketches) {
    const sketchNodes = sketch.nodes || [];
    for (const node of sketchNodes) {
      const itm = _nodeItm(node);

      // Check if node falls within expanded AABB
      if (
        itm.x < expandedMinX || itm.x > expandedMaxX ||
        itm.y < expandedMinY || itm.y > expandedMaxY
      ) continue;

      // More precise distance check: within MERGE_RADIUS_M of ANY active node
      let withinRadius = false;
      let minDistToActive = Infinity;
      let closestActive = null;

      for (const { node: an, itm: aitm } of activeItm) {
        const d = Math.sqrt((itm.x - aitm.x) ** 2 + (itm.y - aitm.y) ** 2);
        if (d <= MERGE_RADIUS_M) {
          withinRadius = true;
          if (d < minDistToActive) {
            minDistToActive = d;
            closestActive = an;
          }
        }
      }

      if (!withinRadius) continue;

      _nearbyNodes.push({
        node,
        sketchId: sketch.id,
        sketchName: sketch.name || sketch.id.slice(-6),
        itmX: itm.x,
        itmY: itm.y,
      });

      // Check duplicate: is this nearby node within DUPLICATE_THRESHOLD_M of
      // the closest active node?
      if (closestActive && minDistToActive <= DUPLICATE_THRESHOLD_M) {
        // Avoid double-reporting the same pair
        const alreadyReported = _crossMergeIssues.some(
          i => String(i.activeNodeId) === String(closestActive.id) &&
               String(i.nearbyNodeId) === String(node.id) &&
               i.nearbySketchId === sketch.id
        );
        if (!alreadyReported) {
          _crossMergeIssues.push({
            type: 'cross_sketch_duplicate',
            activeNodeId: closestActive.id,
            activeSketchId: null, // filled in by the caller (sketch-side-panel)
            nearbyNodeId: node.id,
            nearbySketchId: sketch.id,
            nearbySketchName: sketch.name || sketch.id.slice(-6),
            distanceM: Math.round(minDistToActive * 10) / 10,
            worldX: closestActive.x || 0,
            worldY: closestActive.y || 0,
            nearbyWorldX: node.x || 0,
            nearbyWorldY: node.y || 0,
          });
        }
      }
    }
  }
}

function _notify() {
  for (const fn of _listeners) {
    try { fn(); } catch (_) { /* ignore */ }
  }
}
