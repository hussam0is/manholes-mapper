/**
 * Renders background sketches on the canvas at reduced opacity.
 *
 * Called from draw() in main.js when in project-canvas mode.
 * Draws edges then nodes for each visible background sketch,
 * skipping labels to reduce visual clutter.
 */

import { COLORS, NODE_RADIUS } from '../state/constants.js';

const BG_ALPHA = 0.35;

/**
 * Draw all background sketches onto the canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<object>} sketches - array of sketch data objects
 * @param {object} opts
 * @param {number} opts.sizeScale
 * @param {number} opts.viewStretchX
 * @param {number} opts.viewStretchY
 * @param {number} opts.visMinX - culling bounds
 * @param {number} opts.visMinY
 * @param {number} opts.visMaxX
 * @param {number} opts.visMaxY
 */
export function drawBackgroundSketches(ctx, sketches, opts) {
  if (!sketches || sketches.length === 0) return;

  const {
    sizeScale = 1,
    viewStretchX = 1,
    viewStretchY = 1,
    visMinX = -Infinity,
    visMinY = -Infinity,
    visMaxX = Infinity,
    visMaxY = Infinity,
  } = opts;

  const nodeRadius = NODE_RADIUS * sizeScale;

  ctx.save();
  ctx.globalAlpha = BG_ALPHA;

  for (const sketch of sketches) {
    const nodes = sketch.nodes || [];
    const edges = sketch.edges || [];
    if (nodes.length === 0 && edges.length === 0) continue;

    // Build temporary node lookup
    const nMap = new Map();
    for (const n of nodes) nMap.set(String(n.id), n);

    // ── Draw edges ────────────────────────────────────────────────────
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

      // Cull off-screen edges
      const eMinX = Math.min(x1, x2), eMaxX = Math.max(x1, x2);
      const eMinY = Math.min(y1, y2), eMaxY = Math.max(y1, y2);
      if (eMaxX < visMinX || eMinX > visMaxX || eMaxY < visMinY || eMinY > visMaxY) continue;

      // Determine color
      const edgeType = edge.pipeType || edge.lineType || 'primary';
      let strokeColor;
      if (edgeType === 'secondary') strokeColor = COLORS.edge.typeSecondary;
      else if (edgeType === 'drainage') strokeColor = COLORS.edge.typeDrainage;
      else strokeColor = COLORS.edge.typePrimary;

      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2 * sizeScale;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const arrowLen = 8 * sizeScale;
      ctx.beginPath();
      ctx.fillStyle = strokeColor;
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - arrowLen * Math.cos(angle - Math.PI / 6), y2 - arrowLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - arrowLen * Math.cos(angle + Math.PI / 6), y2 - arrowLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    // ── Draw nodes ────────────────────────────────────────────────────
    for (const node of nodes) {
      const sx = node.x * viewStretchX;
      const sy = node.y * viewStretchY;

      // Cull off-screen nodes
      if (sx + nodeRadius < visMinX || sx - nodeRadius > visMaxX ||
          sy + nodeRadius < visMinY || sy - nodeRadius > visMaxY) continue;

      const isDrainage = node.nodeType === 'Drainage' || node.nodeType === 'קולטן';
      const isHome = node.nodeType === 'Home' || node.nodeType === 'בית';

      if (isDrainage) {
        // Draw drainage as rectangle
        const w = nodeRadius * 1.8;
        const h = nodeRadius * 1.3;
        ctx.fillStyle = COLORS.node.fillDrainageComplete || '#0ea5e9';
        ctx.strokeStyle = COLORS.node.stroke;
        ctx.lineWidth = 1.5;
        ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
        ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
      } else if (isHome) {
        // Draw home as simple triangle-topped house shape
        ctx.fillStyle = COLORS.node.houseBody || '#d7ccc8';
        ctx.strokeStyle = COLORS.node.stroke;
        ctx.lineWidth = 1.5;
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
        // Draw normal node as circle
        ctx.beginPath();
        ctx.arc(sx, sy, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.node.fillDefault;
        ctx.fill();
        ctx.strokeStyle = COLORS.node.stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw node ID label (small, no collision avoidance)
      if (node.id != null) {
        const fontSize = Math.round(11 * sizeScale);
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
