/**
 * Renders background sketches on the canvas at reduced opacity.
 *
 * Called from draw() in main.js when in project-canvas mode.
 * Uses offscreen canvas cache — background sketches are drawn once in
 * world-space to a buffer, then blitted via drawImage() each frame.
 * Only re-rendered when zoom/stretch/visibility changes (not on pan).
 *
 * Also draws the merge-mode overlay: nearby nodes from other sketches
 * rendered with a distinctive amber highlight, plus dashed connector lines
 * between detected duplicate pairs.
 */

import { COLORS, NODE_RADIUS } from '../state/constants.js';
import { isMergeModeEnabled, getNearbyNodes, getCrossMergeIssues } from './merge-mode.js';

const BG_ALPHA = 0.35;

// Cache node Maps for background sketches to avoid rebuilding per frame.
// WeakMap keyed by sketch object → Map<nodeId, node>
const _bgNodeMapCache = new WeakMap();

// Merge mode visual constants
const MERGE_NODE_FILL = 'rgba(251, 146, 60, 0.55)';    // amber-400 semi-transparent
const MERGE_NODE_STROKE = '#f59e0b';                    // amber-500 solid
const MERGE_NODE_STROKE_WIDTH_FACTOR = 2.5;             // thicker stroke than BG nodes
const MERGE_DUP_FILL = 'rgba(239, 68, 68, 0.65)';      // red for confirmed duplicates
const MERGE_DUP_STROKE = '#dc2626';
const MERGE_CONNECTOR_COLOR = 'rgba(239, 68, 68, 0.7)'; // red dashed line for dup pairs
const MERGE_CONNECTOR_NEARBY = 'rgba(251, 146, 60, 0.4)'; // amber dashed for nearby

// ── Offscreen canvas cache ──────────────────────────────────────────────────
// Background sketches are rendered to an offscreen canvas in world-space
// (the same coordinate system as the main canvas after translate+scale).
// Only re-rendered when zoom/data/visibility changes — panning is free.
let _offCanvas = null;
let _offCtx = null;
let _cacheKey = '';
// World-space bounding box of the offscreen canvas content
let _offWorldMinX = 0;
let _offWorldMinY = 0;

/**
 * Invalidate the background cache so next draw re-renders.
 * Call this when sketch visibility/data changes.
 */
export function invalidateBackgroundCache() {
  _cacheKey = '';
}

/**
 * Build cache key — invalidate when zoom, stretch, data, or sketch set changes.
 * Pan (viewTranslate) is NOT included — that's the whole point of caching.
 */
function _buildCacheKey(sketches, opts) {
  let totalNodes = 0;
  let ids = '';
  for (const s of sketches) {
    totalNodes += (s.nodes?.length || 0);
    ids += s.id.slice(-4);
  }
  // Quantize viewScale to 1 decimal place: the background cache is only
  // invalidated when zoom changes by 10%+ steps, not every pixel of scroll.
  const qScale = Math.round(opts.viewScale * 10) / 10;
  return `${ids}|${totalNodes}|${qScale}|${opts.viewStretchX}|${opts.viewStretchY}|${opts.sizeScale}`;
}

/**
 * Render all background sketches to the offscreen canvas in world-space.
 * No culling — we render everything so panning doesn't invalidate the cache.
 */
function _renderToOffscreen(sketches, opts) {
  const {
    sizeScale = 1,
    viewScale = 1,
    viewStretchX = 1,
    viewStretchY = 1,
  } = opts;

  // 1. Compute world-space bounding box of all background nodes
  let wMinX = Infinity, wMinY = Infinity, wMaxX = -Infinity, wMaxY = -Infinity;
  for (const sketch of sketches) {
    for (const node of (sketch.nodes || [])) {
      const sx = node.x * viewStretchX;
      const sy = node.y * viewStretchY;
      if (sx < wMinX) wMinX = sx;
      if (sy < wMinY) wMinY = sy;
      if (sx > wMaxX) wMaxX = sx;
      if (sy > wMaxY) wMaxY = sy;
    }
  }
  if (wMinX > wMaxX) return; // no nodes

  const nodeRadius = NODE_RADIUS * sizeScale / viewScale;
  // Add padding for node radius + arrow overshoot
  const pad = nodeRadius * 2 + 20 / viewScale;
  wMinX -= pad;
  wMinY -= pad;
  wMaxX += pad;
  wMaxY += pad;

  // 2. Compute pixel dimensions of offscreen canvas (world range × viewScale)
  // Cap at a reasonable max to avoid huge allocations
  const MAX_DIM = 4096;
  const pxW = Math.min(MAX_DIM, Math.ceil((wMaxX - wMinX) * viewScale));
  const pxH = Math.min(MAX_DIM, Math.ceil((wMaxY - wMinY) * viewScale));
  if (pxW <= 0 || pxH <= 0) return;

  // Actual scale might be reduced if we hit MAX_DIM
  const actualScaleX = pxW / (wMaxX - wMinX);
  const actualScaleY = pxH / (wMaxY - wMinY);

  // 3. Create/resize offscreen canvas
  if (!_offCanvas) {
    _offCanvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(pxW, pxH)
      : document.createElement('canvas');
    _offCtx = _offCanvas.getContext('2d');
  }
  _offCanvas.width = pxW;
  _offCanvas.height = pxH;
  _offWorldMinX = wMinX;
  _offWorldMinY = wMinY;

  const ctx = _offCtx;
  ctx.clearRect(0, 0, pxW, pxH);

  // 4. Set up transform: world-space → pixel-space
  ctx.save();
  ctx.scale(actualScaleX, actualScaleY);
  ctx.translate(-wMinX, -wMinY);

  ctx.globalAlpha = BG_ALPHA;

  const arrowLen = 8 / viewScale;

  for (const sketch of sketches) {
    const nodes = sketch.nodes || [];
    const edges = sketch.edges || [];
    if (nodes.length === 0 && edges.length === 0) continue;

    let nMap = _bgNodeMapCache.get(sketch);
    if (!nMap || nMap.size !== nodes.length) {
      nMap = new Map();
      for (const n of nodes) nMap.set(String(n.id), n);
      _bgNodeMapCache.set(sketch, nMap);
    }

    // ── Draw edges (batched by color group) ─────────────────────────
    const colorPrimary = COLORS.edge.typePrimary;
    const colorDrainage = COLORS.edge.typeDrainage;
    const colorSecondary = COLORS.edge.typeSecondary;
    const lineBuckets = { primary: [], drainage: [], secondary: [] };
    const arrowBuckets = { primary: [], drainage: [], secondary: [] };

    for (const edge of edges) {
      const tn = edge.tail != null ? nMap.get(String(edge.tail)) : null;
      const hn = edge.head != null ? nMap.get(String(edge.head)) : null;

      let x1, y1, x2, y2;

      if (tn && hn) {
        x1 = tn.x * viewStretchX;
        y1 = tn.y * viewStretchY;
        x2 = hn.x * viewStretchX;
        y2 = hn.y * viewStretchY;
      } else if (tn && edge.headPosition) {
        x1 = tn.x * viewStretchX;
        y1 = tn.y * viewStretchY;
        x2 = edge.headPosition.x * viewStretchX;
        y2 = edge.headPosition.y * viewStretchY;
      } else if (hn && edge.tailPosition) {
        x1 = edge.tailPosition.x * viewStretchX;
        y1 = edge.tailPosition.y * viewStretchY;
        x2 = hn.x * viewStretchX;
        y2 = hn.y * viewStretchY;
      } else {
        continue;
      }

      const edgeType = edge.pipeType || edge.lineType || 'primary';
      const bucket = edgeType === 'secondary' ? 'secondary'
        : edgeType === 'drainage' ? 'drainage' : 'primary';

      lineBuckets[bucket].push(x1, y1, x2, y2);

      const angle = Math.atan2(y2 - y1, x2 - x1);
      const cosA1 = Math.cos(angle - Math.PI / 6), sinA1 = Math.sin(angle - Math.PI / 6);
      const cosA2 = Math.cos(angle + Math.PI / 6), sinA2 = Math.sin(angle + Math.PI / 6);
      arrowBuckets[bucket].push(
        x2, y2,
        x2 - arrowLen * cosA1, y2 - arrowLen * sinA1,
        x2 - arrowLen * cosA2, y2 - arrowLen * sinA2
      );
    }

    ctx.lineWidth = 2 / viewScale;
    const bucketKeys = ['primary', 'drainage', 'secondary'];
    const bucketColors = [colorPrimary, colorDrainage, colorSecondary];
    for (let bi = 0; bi < 3; bi++) {
      const lines = lineBuckets[bucketKeys[bi]];
      const arrows = arrowBuckets[bucketKeys[bi]];
      if (lines.length === 0) continue;
      const color = bucketColors[bi];

      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let li = 0; li < lines.length; li += 4) {
        ctx.moveTo(lines[li], lines[li + 1]);
        ctx.lineTo(lines[li + 2], lines[li + 3]);
      }
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      for (let ai = 0; ai < arrows.length; ai += 6) {
        ctx.moveTo(arrows[ai], arrows[ai + 1]);
        ctx.lineTo(arrows[ai + 2], arrows[ai + 3]);
        ctx.lineTo(arrows[ai + 4], arrows[ai + 5]);
        ctx.closePath();
      }
      ctx.fill();
    }

    // ── Draw nodes ────────────────────────────────────────────────────
    for (const node of nodes) {
      const sx = node.x * viewStretchX;
      const sy = node.y * viewStretchY;

      const isDrainage = node.nodeType === 'Drainage' || node.nodeType === 'קולטן';
      const isHome = node.nodeType === 'Home' || node.nodeType === 'בית';

      if (isDrainage) {
        const w = nodeRadius * 1.8;
        const h = nodeRadius * 1.3;
        ctx.fillStyle = COLORS.node.fillDrainageComplete || '#0ea5e9';
        ctx.strokeStyle = COLORS.node.stroke;
        ctx.lineWidth = 1.5 / viewScale;
        ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
        ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
      } else if (isHome) {
        ctx.fillStyle = COLORS.node.houseBody || '#d7ccc8';
        ctx.strokeStyle = COLORS.node.stroke;
        ctx.lineWidth = 1.5 / viewScale;
        const r = nodeRadius * 0.9;
        ctx.beginPath();
        ctx.moveTo(sx - r, sy + r * 0.5);
        ctx.lineTo(sx - r, sy - r * 0.2);
        ctx.lineTo(sx, sy - r);
        ctx.lineTo(sx + r, sy - r * 0.2);
        ctx.lineTo(sx + r, sy + r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.node.fillDefault;
        ctx.fill();
        ctx.strokeStyle = COLORS.node.stroke;
        ctx.lineWidth = 1.5 / viewScale;
        ctx.stroke();
      }

      if (node.id != null) {
        const fontSize = Math.round(11 * sizeScale / viewScale);
        ctx.fillStyle = COLORS.node.label;
        ctx.font = `${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(node.id), sx, sy);
      }
    }
  }

  ctx.restore();
}

/**
 * Draw all background sketches onto the canvas context.
 * Uses offscreen canvas cache — re-renders only when zoom/stretch/data changes.
 * Panning is free (just blits the cached image at the right position).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<object>} sketches - array of sketch data objects
 * @param {object} opts
 */
export function drawBackgroundSketches(ctx, sketches, opts) {
  if (!sketches || sketches.length === 0) return;

  const newKey = _buildCacheKey(sketches, opts);

  if (newKey !== _cacheKey) {
    console.time('[PERF] draw:bgCache MISS (re-render offscreen)');
    _renderToOffscreen(sketches, opts);
    _cacheKey = newKey;
    console.timeEnd('[PERF] draw:bgCache MISS (re-render offscreen)');
  }

  // Blit the offscreen canvas. The main canvas context already has
  // translate(viewTranslate) + scale(viewScale) applied, so we draw at
  // the world-space origin of the offscreen buffer.
  if (_offCanvas && _offCanvas.width > 0 && _offCanvas.height > 0) {
    const worldW = _offCanvas.width / (opts.viewScale || 1);
    const worldH = _offCanvas.height / (opts.viewScale || 1);
    // drawImage(source, dx, dy, dw, dh) — draw at world coords, scaled to world size
    ctx.drawImage(_offCanvas, _offWorldMinX, _offWorldMinY, worldW, worldH);
  }
}

/**
 * Draw the merge-mode overlay.
 *
 * Renders nearby nodes from other sketches in an amber highlight above the
 * background sketches but below the active sketch. Also draws dashed connector
 * lines between detected duplicate pairs.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object[]} activeNodes - nodes from the currently active sketch
 * @param {object} opts - same shape as drawBackgroundSketches opts
 */
export function drawMergeModeOverlay(ctx, activeNodes, opts) {
  if (!isMergeModeEnabled()) return;

  const nearbyNodes = getNearbyNodes();
  const crossIssues = getCrossMergeIssues();
  if (nearbyNodes.length === 0) return;

  const {
    sizeScale = 1,
    viewScale = 1,
    viewStretchX = 1,
    viewStretchY = 1,
    visMinX = -Infinity,
    visMinY = -Infinity,
    visMaxX = Infinity,
    visMaxY = Infinity,
  } = opts;

  const nodeRadius = NODE_RADIUS * sizeScale / viewScale;

  /** @type {Set<string>} key = `${sketchId}:${nodeId}` */
  const dupKeys = new Set(
    crossIssues.map(i => `${i.nearbySketchId}:${i.nearbyNodeId}`)
  );

  const activeNodeMap = new Map();
  for (const n of activeNodes) activeNodeMap.set(String(n.id), n);

  ctx.save();

  // ── 1. Draw connector lines (dashed) ─────────────────────────────────────
  ctx.setLineDash([4 / viewScale, 4 / viewScale]);

  const dupActiveIds = new Set(crossIssues.map(i => `${i.nearbySketchId}:${i.nearbyNodeId}`));

  const _activeXs = new Float64Array(activeNodes.length);
  const _activeYs = new Float64Array(activeNodes.length);
  for (let i = 0; i < activeNodes.length; i++) {
    _activeXs[i] = activeNodes[i].x;
    _activeYs[i] = activeNodes[i].y;
  }

  for (const nearby of nearbyNodes) {
    const key = `${nearby.sketchId}:${nearby.node.id}`;
    if (dupActiveIds.has(key)) continue;

    const sx = nearby.node.x * viewStretchX;
    const sy = nearby.node.y * viewStretchY;
    if (sx + nodeRadius < visMinX || sx - nodeRadius > visMaxX ||
        sy + nodeRadius < visMinY || sy - nodeRadius > visMaxY) continue;

    let closest = null;
    let closestDistSq = Infinity;
    const nx = nearby.node.x, ny = nearby.node.y;
    for (let i = 0; i < activeNodes.length; i++) {
      const dx = nx - _activeXs[i];
      const dy = ny - _activeYs[i];
      const distSq = dx * dx + dy * dy;
      if (distSq < closestDistSq) { closestDistSq = distSq; closest = activeNodes[i]; }
    }
    if (!closest) continue;

    const ax = closest.x * viewStretchX;
    const ay = closest.y * viewStretchY;

    ctx.strokeStyle = MERGE_CONNECTOR_NEARBY;
    ctx.lineWidth = 1 / viewScale;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ax, ay);
    ctx.stroke();
  }

  for (const issue of crossIssues) {
    const activeNode = activeNodeMap.get(String(issue.activeNodeId));
    if (!activeNode) continue;

    const ax = activeNode.x * viewStretchX;
    const ay = activeNode.y * viewStretchY;

    const nearby = nearbyNodes.find(
      n => n.sketchId === issue.nearbySketchId && String(n.node.id) === String(issue.nearbyNodeId)
    );
    if (!nearby) continue;

    const nx = nearby.node.x * viewStretchX;
    const ny = nearby.node.y * viewStretchY;

    ctx.strokeStyle = MERGE_CONNECTOR_COLOR;
    ctx.lineWidth = 2 / viewScale;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(nx, ny);
    ctx.stroke();
  }

  ctx.setLineDash([]);

  // ── 2. Draw nearby nodes ──────────────────────────────────────────────────
  for (const nearby of nearbyNodes) {
    const sx = nearby.node.x * viewStretchX;
    const sy = nearby.node.y * viewStretchY;

    if (sx + nodeRadius < visMinX || sx - nodeRadius > visMaxX ||
        sy + nodeRadius < visMinY || sy - nodeRadius > visMaxY) continue;

    const key = `${nearby.sketchId}:${nearby.node.id}`;
    const isDuplicate = dupKeys.has(key);

    const ringR = nodeRadius * 1.6;
    const ringAlpha = isDuplicate ? 0.5 : 0.3;
    const ringColor = isDuplicate ? MERGE_DUP_STROKE : MERGE_NODE_STROKE;
    ctx.beginPath();
    ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.globalAlpha = ringAlpha;
    ctx.lineWidth = 1.5 / viewScale;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(sx, sy, nodeRadius, 0, Math.PI * 2);
    ctx.fillStyle = isDuplicate ? MERGE_DUP_FILL : MERGE_NODE_FILL;
    ctx.fill();
    ctx.strokeStyle = isDuplicate ? MERGE_DUP_STROKE : MERGE_NODE_STROKE;
    ctx.lineWidth = MERGE_NODE_STROKE_WIDTH_FACTOR / viewScale;
    ctx.stroke();

    if (nearby.node.id != null) {
      const fontSize = Math.round(11 * sizeScale / viewScale);
      ctx.fillStyle = isDuplicate ? '#7f1d1d' : '#78350f';
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(nearby.node.id), sx, sy);
    }

    if (viewScale > 0.3) {
      const labelFontSize = Math.round(9 * sizeScale / viewScale);
      ctx.font = `${labelFontSize}px Arial`;
      ctx.fillStyle = isDuplicate ? MERGE_DUP_STROKE : MERGE_NODE_STROKE;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(nearby.sketchName.slice(0, 12), sx, sy + nodeRadius + 2 / viewScale);
    }
  }

  ctx.restore();
}
