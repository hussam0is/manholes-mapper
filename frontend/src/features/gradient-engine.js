/**
 * gradient-engine.js — live pipe-slope intelligence.
 *
 * Computes the true hydraulic gradient of every pipe (edge, flow = tail→head)
 * the moment data arrives, and alerts the surveyor IMMEDIATELY when a segment
 * runs uphill — while they are still standing at the manhole and can re-shoot.
 *
 * Two bases, best available wins:
 *   'invert'  — both manholes have elevation (surveyZ) AND both pipe depths
 *               (tail_measurement/head_measurement): invert = surveyZ − depth.
 *               The authoritative check.
 *   'terrain' — elevations only (depths not measured yet): terrain fall along
 *               flow. A weaker early-warning signal, wider tolerance.
 *
 * Statuses: 'negative' (runs uphill), 'low' (< MIN_SLOPE_PCT, invert basis
 * only), 'ok', 'unknown' (insufficient data), 'exempt' (touches a Home /
 * ForLater / Issue node — laterals legitimately rise toward buildings).
 *
 * Alerts fire only on status TRANSITIONS (per edge), so re-renders and
 * repeated saves never spam; entering depths that confirm a terrain warning
 * re-alerts because the basis changed. Resolving a negative segment shows a
 * success confirmation.
 *
 * Bridged to window.__gradientEngine for the legacy modules and e2e tests.
 */
import { S, F } from '../legacy/shared-state.js';
import { bus } from '../state/event-bus.js';

/** Minimum acceptable pipe slope (%) before a 'low' warning (invert basis). */
export const MIN_SLOPE_PCT = 0.3;
/** Invert-basis tolerance (m) — RTK vertical noise. */
const TOL_INVERT_M = 0.02;
/** Terrain-basis tolerance (m) — terrain is only a proxy for the pipe. */
const TOL_TERRAIN_M = 0.05;
/** Node types whose edges are exempt from gradient checks. */
export const GRADIENT_EXEMPT_TYPES = new Set(['Home', 'ForLater', 'Issue']);

/** Elevation from a node; parser coerces missing elevation to 0 → treat 0 as unset. */
function elevationOf(node) {
  if (!node || node.surveyZ == null || node.surveyZ === '') return null;
  const z = Number(node.surveyZ);
  return Number.isNaN(z) || z === 0 ? null : z;
}

/** Pipe depth from an edge measurement (stored as sanitized string). */
function depthOf(value) {
  if (value == null || String(value).trim() === '') return null;
  const d = Number(value);
  return Number.isNaN(d) || d <= 0 ? null : d;
}

/** Real-world segment length in meters: ITM deltas first, world px / scale fallback. */
export function edgeLengthM(tailNode, headNode, coordinateScale = 50) {
  if (!tailNode || !headNode) return null;
  if (
    tailNode.surveyX != null && tailNode.surveyY != null &&
    headNode.surveyX != null && headNode.surveyY != null
  ) {
    return Math.hypot(headNode.surveyX - tailNode.surveyX, headNode.surveyY - tailNode.surveyY);
  }
  if (
    typeof tailNode.x === 'number' && typeof tailNode.y === 'number' &&
    typeof headNode.x === 'number' && typeof headNode.y === 'number'
  ) {
    const scale = Number(coordinateScale) > 0 ? Number(coordinateScale) : 50;
    return Math.hypot(headNode.x - tailNode.x, headNode.y - tailNode.y) / scale;
  }
  return null;
}

/**
 * Pure gradient computation for one edge.
 *
 * @param {Object} edge  — { tail, head, tail_measurement, head_measurement }
 * @param {(id: any) => Object|undefined} nodeById
 * @param {number} [coordinateScale=50] — canvas world px per meter
 * @returns {{ status: 'ok'|'negative'|'low'|'unknown'|'exempt',
 *             basis: 'invert'|'terrain'|null,
 *             drop: number|null, slopePct: number|null, lengthM: number|null }}
 */
export function computeEdgeGradient(edge, nodeById, coordinateScale = 50) {
  const none = { status: 'unknown', basis: null, drop: null, slopePct: null, lengthM: null };
  if (!edge || edge.tail == null || edge.head == null) return none;
  const tailNode = nodeById(edge.tail);
  const headNode = nodeById(edge.head);
  if (!tailNode || !headNode) return none;
  if (GRADIENT_EXEMPT_TYPES.has(tailNode.nodeType) || GRADIENT_EXEMPT_TYPES.has(headNode.nodeType)) {
    return { ...none, status: 'exempt' };
  }

  const zTail = elevationOf(tailNode);
  const zHead = elevationOf(headNode);
  if (zTail == null || zHead == null) return none;

  const dTail = depthOf(edge.tail_measurement);
  const dHead = depthOf(edge.head_measurement);
  const lengthM = edgeLengthM(tailNode, headNode, coordinateScale);

  let basis, drop;
  if (dTail != null && dHead != null) {
    basis = 'invert';
    drop = (zTail - dTail) - (zHead - dHead);
  } else {
    basis = 'terrain';
    drop = zTail - zHead;
  }

  const slopePct = lengthM != null && lengthM > 0.5 ? Number(((drop / lengthM) * 100).toFixed(2)) : null;
  const tolerance = basis === 'invert' ? TOL_INVERT_M : TOL_TERRAIN_M;

  let status = 'ok';
  if (drop < -tolerance) {
    status = 'negative';
  } else if (basis === 'invert' && slopePct != null && slopePct < MIN_SLOPE_PCT) {
    status = 'low';
  }
  return { status, basis, drop: Number(drop.toFixed(3)), slopePct, lengthM };
}

// ─── Live layer (operates on the legacy S state) ─────────────────────────────

/** @type {Map<string, string>} edgeId -> `${status}:${basis}` last seen */
const lastSignature = new Map();
/** @type {Map<string, Object>} edgeId -> active alert record */
const activeAlerts = new Map();
/** @type {Map<string, number>} per-edge debounce timers for depth typing */
const depthTimers = new Map();

function nodeLookup() {
  const nodes = S.nodes || [];
  const map = S.nodeMap instanceof Map && S.nodeMap.size > 0 ? S.nodeMap : null;
  // nodeMap is rebuilt lazily on draw (_nodeMapDirty) — it can be stale at
  // measurement time, so always fall back to an array scan on a miss.
  return (id) => {
    const key = String(id);
    return (map ? map.get(key) : undefined) ?? nodes.find((n) => String(n.id) === key);
  };
}

function edgeById(edgeOrId) {
  if (edgeOrId && typeof edgeOrId === 'object') return edgeOrId;
  return (S.edges || []).find((e) => String(e.id) === String(edgeOrId)) || null;
}

function tt(path, ...args) {
  const fn = typeof window !== 'undefined' ? window.t : null;
  const out = fn ? fn(path, ...args) : null;
  return out && out !== path ? out : null;
}

function edgeMidWorld(edge, byId) {
  const tailNode = byId(edge.tail);
  const headNode = byId(edge.head);
  if (!tailNode || !headNode) return null;
  return { x: (tailNode.x + headNode.x) / 2, y: (tailNode.y + headNode.y) / 2 };
}

/** Pan to an edge and pulse-highlight its midpoint (issue-nav recipe). */
function panToEdge(edge) {
  const byId = nodeLookup();
  const mid = edgeMidWorld(edge, byId);
  const canvas = document.getElementById('graphCanvas');
  if (!mid || !canvas) return;
  const stretch = window.__getStretch?.() ?? { x: 1, y: 1 };
  const scale = 0.5;
  window.__setViewState?.(
    scale,
    canvas.width / 2 - scale * stretch.x * mid.x,
    canvas.height / 2 - scale * stretch.y * mid.y,
  );
  window.__issueHighlight?.start(mid.x, mid.y, 2500);
  window.__scheduleDraw?.();
}

function fmtSlope(slopePct) {
  return slopePct == null ? '' : `${Math.abs(slopePct).toFixed(1)}%`;
}

// A long uphill run would otherwise warn on every consecutive shot (terrain
// basis fires before depths exist) — one snackbar per cooldown window is
// enough; every alert is still recorded in activeAlerts.
let lastTerrainSnackbarAt = 0;
const TERRAIN_SNACKBAR_COOLDOWN_MS = 10_000;

function notifyFor(edge, result) {
  const show = typeof window !== 'undefined' ? window.showSnackbar : null;
  if (!show) return;
  const tail = String(edge.tail);
  const head = String(edge.head);

  if (result.status === 'negative') {
    if (result.basis === 'terrain') {
      const now = Date.now();
      if (now - lastTerrainSnackbarAt < TERRAIN_SNACKBAR_COOLDOWN_MS) return;
      lastTerrainSnackbarAt = now;
    }
    const riseCm = result.drop != null ? Math.round(Math.abs(result.drop) * 100) : null;
    // slopePct is null on very short/unmeasurable segments — fall back to the
    // absolute rise so the message never renders empty parentheses
    const slopeText = result.slopePct != null ? fmtSlope(result.slopePct) : (riseCm != null ? `${riseCm} cm` : '');
    const message =
      result.basis === 'invert'
        ? (tt('gradient.negativeInvert', tail, head, slopeText) ||
           `Pipe ${tail} → ${head} runs uphill (${slopeText}) — check measurements or flow direction`)
        : (tt('gradient.negativeTerrain', tail, head, riseCm) ||
           `Ground rises ${riseCm ?? '?'}cm along flow on ${tail} → ${head} — verify the shot`);
    show({
      title: tt('gradient.negativeTitle') || 'Negative gradient',
      message,
      variant: result.basis === 'invert' ? 'error' : 'warning',
      kind: 'gradient-negative',
      actions: [
        {
          label: tt('gradient.view') || 'View',
          primary: true,
          onClick: () => panToEdge(edge),
        },
      ],
    });
  } else if (result.status === 'low') {
    show({
      message:
        tt('gradient.lowSlope', tail, head, fmtSlope(result.slopePct)) ||
        `Low slope on ${tail} → ${head} (${fmtSlope(result.slopePct)} < ${MIN_SLOPE_PCT}%)`,
      variant: 'warning',
      kind: 'gradient-low',
      actions: [{ label: tt('gradient.view') || 'View', onClick: () => panToEdge(edge) }],
    });
  } else if (result.status === 'ok') {
    show({
      message: tt('gradient.resolved', tail, head) || `Gradient on ${tail} → ${head} is OK now`,
      variant: 'success',
      kind: 'gradient-resolved',
    });
  }
}

/**
 * Evaluate one edge; on a status transition, alert + refresh canvas badges.
 * @returns the computation result (also for callers building status copy).
 */
export function evaluateEdge(edgeOrId, { notify = true } = {}) {
  const edge = edgeById(edgeOrId);
  if (!edge) return null;
  const byId = nodeLookup();
  const result = computeEdgeGradient(edge, byId, S.coordinateScale ?? 50);
  const key = String(edge.id);
  const signature = `${result.status}:${result.basis}`;
  const previous = lastSignature.get(key);
  lastSignature.set(key, signature);

  if (result.status === 'negative' || result.status === 'low') {
    activeAlerts.set(key, {
      edgeId: key,
      tail: String(edge.tail),
      head: String(edge.head),
      status: result.status,
      basis: result.basis,
      slopePct: result.slopePct,
      drop: result.drop,
    });
  } else {
    activeAlerts.delete(key);
  }

  if (signature !== previous) {
    const wasProblem = previous != null && (previous.startsWith('negative') || previous.startsWith('low'));
    if (notify && (result.status === 'negative' || result.status === 'low')) {
      notifyFor(edge, result);
      const mid = edgeMidWorld(edge, byId);
      if (mid && result.status === 'negative') window.__issueHighlight?.start(mid.x, mid.y, 2500);
    } else if (notify && result.status === 'ok' && wasProblem) {
      notifyFor(edge, result);
    }
    try {
      bus.emit('gradient:status', { edgeId: key, ...result });
    } catch { /* bus is best-effort */ }
    try {
      S._issueSetsDirty = true;
      F.scheduleDraw?.();
    } catch { /* outside legacy runtime (tests) */ }
  }
  return result;
}

/** A measurement landed on a node — re-check every pipe touching it. */
export function onMeasurementApplied(nodeId) {
  const id = String(nodeId);
  const touching = (S.edges || []).filter(
    (e) => String(e.tail) === id || String(e.head) === id,
  );
  return touching.map((e) => evaluateEdge(e));
}

/** A pipe was created (or became fully connected). */
export function onEdgeCreated(edgeOrId) {
  return evaluateEdge(edgeOrId);
}

/** Depth measurement typing — debounced per edge. */
export function onDepthChanged(edgeOrId, delayMs = 600) {
  const edge = edgeById(edgeOrId);
  if (!edge) return;
  const key = String(edge.id);
  clearTimeout(depthTimers.get(key));
  depthTimers.set(
    key,
    setTimeout(() => {
      depthTimers.delete(key);
      // Re-resolve by id at fire time: the edge may have been deleted (or the
      // active sketch switched) during the debounce window.
      const live = (S.edges || []).find((e) => String(e.id) === key);
      if (live) evaluateEdge(live);
    }, delayMs),
  );
}

/** An edge was removed — drop its timers, transition memory, and alert. */
export function onEdgeDeleted(edgeOrId) {
  const key = String(edgeOrId && typeof edgeOrId === 'object' ? edgeOrId.id : edgeOrId);
  const timer = depthTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    depthTimers.delete(key);
  }
  lastSignature.delete(key);
  activeAlerts.delete(key);
}

/** Re-evaluate the whole sketch (silent by default — used on load/import). */
export function recheckAll({ notify = false } = {}) {
  return (S.edges || []).map((e) => evaluateEdge(e, { notify }));
}

/** Currently-standing problems, for tests, HUDs, and future panels. */
export function getAlerts() {
  return Array.from(activeAlerts.values());
}

/** Compute without side effects for an edge in the live sketch. */
export function compute(edgeOrId) {
  const edge = edgeById(edgeOrId);
  if (!edge) return null;
  return computeEdgeGradient(edge, nodeLookup(), S.coordinateScale ?? 50);
}

/** Reset transition memory (project-canvas sketch switches, tests). */
export function resetGradientState() {
  lastSignature.clear();
  activeAlerts.clear();
  for (const t of depthTimers.values()) clearTimeout(t);
  depthTimers.clear();
}

if (typeof window !== 'undefined') {
  window.__gradientEngine = {
    compute,
    computeEdgeGradient,
    evaluateEdge,
    onMeasurementApplied,
    onEdgeCreated,
    onEdgeDeleted,
    onDepthChanged,
    recheckAll,
    getAlerts,
    reset: resetGradientState,
    MIN_SLOPE_PCT,
  };
}
