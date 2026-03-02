// Rendering helpers that can be called from legacy code
import { COLORS } from '../state/constants.js';

/**
 * Render the edge type legend into the provided container element.
 * @param {HTMLElement|null} legendEl
 * @param {Record<string, string>} edgeTypeColors
 */
export function renderEdgeLegend(legendEl, edgeTypeColors) {
  if (!legendEl) return;

  // window.t may not be available yet during early module initialization
  // (main-entry.js sets it after all static imports run). Schedule a deferred
  // re-render so the legend always shows translated text once i18n is ready.
  if (typeof window.t !== 'function') {
    setTimeout(() => renderEdgeLegend(legendEl, edgeTypeColors), 50);
    return;
  }

  const t = window.t;
  const items = [
    { label: t('labels.edgeTypePrimary'), color: edgeTypeColors['קו ראשי'] || '#2563eb' },
    { label: t('labels.edgeTypeDrainage'), color: edgeTypeColors['קו סניקה'] || '#fb923c' },
    { label: t('labels.edgeTypeSecondary'), color: edgeTypeColors['קו משני'] || '#0d9488' },
  ];
  legendEl.innerHTML = items
    .map((i) => `<span class="item"><span class="swatch" style="background:${i.color}"></span>${window.escapeHtml ? window.escapeHtml(i.label) : i.label}</span>`)
    .join('');
  // RTL-aware positioning: use logical CSS property via inline style attribute
  const isRtl = typeof window.isRTL === 'function' ? window.isRTL() : document.documentElement.dir === 'rtl';
  if (isRtl) {
    legendEl.style.right = '12px';
    legendEl.style.left = 'auto';
  } else {
    legendEl.style.left = '12px';
    legendEl.style.right = 'auto';
  }
}

/**
 * Draw an infinite-looking grid aligned to world coordinates.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}} viewTranslate
 * @param {number} viewScale
 * @param {HTMLCanvasElement} canvas
 * @param {number} [viewStretchX=1] - Horizontal stretch factor
 * @param {number} [viewStretchY=1] - Vertical stretch factor
 */
export function drawInfiniteGrid(ctx, viewTranslate, viewScale, canvas, viewStretchX = 1, viewStretchY = 1, screenW, screenH) {
  // Use pre-computed dimensions when available to avoid getBoundingClientRect() reflow per frame
  const screenWidth = screenW || canvas.getBoundingClientRect().width;
  const screenHeight = screenH || canvas.getBoundingClientRect().height;
  const worldStep = 20;
  const screenStepX = worldStep * viewScale * viewStretchX;
  const screenStepY = worldStep * viewScale * viewStretchY;
  // Skip drawing if steps are too small
  if (screenStepX < 8 || screenStepY < 8) return;
  const startXWorld = Math.floor(-viewTranslate.x / screenStepX) * worldStep;
  const startYWorld = Math.floor(-viewTranslate.y / screenStepY) * worldStep;
  const startXScreen = startXWorld * viewScale * viewStretchX + viewTranslate.x;
  const startYScreen = startYWorld * viewScale * viewStretchY + viewTranslate.y;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = COLORS.grid.stroke;
  ctx.lineWidth = 1;
  for (let x = startXScreen; x <= screenWidth; x += screenStepX) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, screenHeight);
  }
  for (let y = startYScreen; y <= screenHeight; y += screenStepY) {
    ctx.moveTo(0, y);
    ctx.lineTo(screenWidth, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a dangling edge (edge with only one connected node).
 * Shows a dashed line from the tail node to a floating endpoint.
 */
export function drawDanglingEdge(ctx, edge, tailNode, options) {
  if (!tailNode) return;

  const { colors, selectedEdge, danglingEndpoint, viewScale = 1 } = options;
  const isSelected = edge === selectedEdge;

  // Default dangling endpoint position (offset from tail)
  const endX = danglingEndpoint?.x ?? (tailNode.x + 80);
  const endY = danglingEndpoint?.y ?? (tailNode.y - 40);

  ctx.save();

  // Use a purple/violet color for dangling edges to make them stand out
  const danglingColor = isSelected
    ? (colors?.edge?.selected || '#a855f7')
    : '#a855f7'; // purple-500

  ctx.strokeStyle = danglingColor;
  ctx.lineWidth = 2 / viewScale;
  ctx.setLineDash([6 / viewScale, 4 / viewScale]); // Dashed line for dangling edges

  // Draw the line from tail to floating endpoint
  ctx.beginPath();
  ctx.moveTo(tailNode.x, tailNode.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.setLineDash([]);

  // Draw a question mark circle at the dangling end
  const circleRadius = 12 / viewScale;
  ctx.beginPath();
  ctx.arc(endX, endY, circleRadius, 0, Math.PI * 2);
  ctx.fillStyle = isSelected ? '#c084fc' : '#e9d5ff'; // purple-400 / purple-200
  ctx.fill();
  ctx.strokeStyle = danglingColor;
  ctx.lineWidth = 2 / viewScale;
  ctx.stroke();

  // Draw question mark inside
  ctx.fillStyle = '#6b21a8'; // purple-800
  ctx.font = `bold ${14 / viewScale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', endX, endY + 1 / viewScale);

  ctx.restore();
}

/**
 * Draw a directed edge with arrowheads and optional labels.
 * Keeps color logic external (pass in resolved colors and selection state).
 */
export function drawEdge(ctx, edge, tailNode, headNode, options) {
  if (!tailNode || !headNode) return;
  const { color, selectedColor, edgeTypeColors, highlightedHalfEdge, colors, viewScale = 1 } = options;
  const x1 = tailNode.x, y1 = tailNode.y, x2 = headNode.x, y2 = headNode.y;
  ctx.save();
  const resolvedColor = color || (edge === options.selectedEdge
    ? (selectedColor || (colors?.edge?.selected || '#7c3aed'))
    : (edgeTypeColors?.[edge.edge_type] || '#555'));
  ctx.strokeStyle = resolvedColor;
  ctx.lineWidth = 2 / viewScale;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLength = 10 / viewScale;
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
  ctx.fillStyle = resolvedColor;
  ctx.fill();
  if (highlightedHalfEdge && highlightedHalfEdge.edgeId === edge.id) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const ratioStart = highlightedHalfEdge.half === 'tail' ? 0.0 : 0.5;
    const ratioEnd = highlightedHalfEdge.half === 'tail' ? 0.5 : 1.0;
    const sx = x1 + dx * ratioStart;
    const sy = y1 + dy * ratioStart;
    const ex = x1 + dx * ratioEnd;
    const ey = y1 + dy * ratioEnd;
    ctx.save();
    ctx.strokeStyle = (colors?.edge?.selected || '#7c3aed');
    ctx.lineWidth = 5 / viewScale;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draw a node circle and label. Color selection is passed via options.
 */
export function drawNode(ctx, node, options) {
  const { radius, colors, selectedNode, viewScale = 1 } = options;
  ctx.save();
  let fillColor;
  if (node === selectedNode) {
    if (node.nodeType !== 'Home' && node.type === 'type2') {
      fillColor = colors.node.fillSelectedMissing;
    } else {
      fillColor = colors.node.fillSelected;
    }
  } else if (node.nodeType === 'Home') {
    fillColor = colors.node.fillDefault;
  } else if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
    // Drainage: orange if missing measurements, sky-blue if complete
    fillColor = node.type === 'type2' ? colors.node.fillMissing : colors.node.fillDrainageComplete;
  } else if (node.nodeType === 'Covered' || node.nodeType === 'שוחה מכוסה') {
    fillColor = colors.node.fillBlocked;
  } else {
    fillColor = node.type === 'type2' ? colors.node.fillMissing : colors.node.fillDefault;
  }
  
  // Draw drainage nodes as rectangles
  if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
    const rectWidth = radius * 1.8;
    const rectHeight = radius * 1.3;
    ctx.beginPath();
    ctx.rect(node.x - rectWidth / 2, node.y - rectHeight / 2, rectWidth, rectHeight);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = colors.node.stroke;
    ctx.lineWidth = 2 / viewScale;
    ctx.stroke();
  } else {
    // Draw other nodes as circles
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = colors.node.stroke;
    ctx.lineWidth = 2 / viewScale;
    ctx.stroke();
  }
  ctx.restore();
}



