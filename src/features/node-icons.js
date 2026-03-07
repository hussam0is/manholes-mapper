/**
 * Custom node icon drawing functions
 * Each node type has a distinctive visual appearance
 */

/**
 * Draw a manhole icon - circle with inner crosshatch pattern
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawManholeIcon(ctx, x, y, radius, colors, isSelected, fillColor, viewScale = 1) {
  ctx.save();

  // Draw outer circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.stroke;
  ctx.lineWidth = 2 / viewScale;
  ctx.stroke();

  // Draw inner detail - smaller circle
  const innerRadius = radius * 0.6;
  ctx.beginPath();
  ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
  ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1.5 / viewScale;
  ctx.stroke();

  // Draw crosshatch pattern inside — batch both lines into one path
  ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1 / viewScale;

  ctx.beginPath();
  ctx.moveTo(x - innerRadius * 0.7, y);
  ctx.lineTo(x + innerRadius * 0.7, y);
  ctx.moveTo(x, y - innerRadius * 0.7);
  ctx.lineTo(x, y + innerRadius * 0.7);
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Draw a drainage icon - rectangle with water droplet symbol
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawDrainageIcon(ctx, x, y, radius, colors, isSelected, fillColor, viewScale = 1) {
  ctx.save();

  const rectWidth = radius * 1.8;
  const rectHeight = radius * 1.3;

  // Draw rectangle
  ctx.beginPath();
  ctx.rect(x - rectWidth / 2, y - rectHeight / 2, rectWidth, rectHeight);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.stroke;
  ctx.lineWidth = 2 / viewScale;
  ctx.stroke();
  
  // Draw water droplet inside
  const dropletSize = radius * 0.5;
  ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(0, 120, 200, 0.6)';
  
  // Droplet shape (teardrop)
  ctx.beginPath();
  ctx.moveTo(x, y - dropletSize * 0.8);
  // Left curve
  ctx.bezierCurveTo(
    x - dropletSize * 0.6, y - dropletSize * 0.4,
    x - dropletSize * 0.6, y + dropletSize * 0.2,
    x, y + dropletSize * 0.8
  );
  // Right curve
  ctx.bezierCurveTo(
    x + dropletSize * 0.6, y + dropletSize * 0.2,
    x + dropletSize * 0.6, y - dropletSize * 0.4,
    x, y - dropletSize * 0.8
  );
  ctx.closePath();
  ctx.fill();
  
  ctx.restore();
}

/**
 * Draw a covered manhole icon - circle with diagonal stripes
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawCoveredIcon(ctx, x, y, radius, colors, isSelected, fillColor, viewScale = 1) {
  ctx.save();

  // Draw outer circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.stroke;
  ctx.lineWidth = 2 / viewScale;
  ctx.stroke();

  // Clip to circle for stripes
  ctx.beginPath();
  ctx.arc(x, y, radius - 2 / viewScale, 0, Math.PI * 2);
  ctx.clip();

  // Draw diagonal stripes — batch into a single path to reduce draw calls
  ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2 / viewScale;

  const stripeCount = 6;
  const spacing = (radius * 2) / stripeCount;

  ctx.beginPath();
  for (let i = -stripeCount; i <= stripeCount; i++) {
    ctx.moveTo(x - radius + i * spacing, y - radius);
    ctx.lineTo(x + radius + i * spacing, y + radius);
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw a home icon - house shape with triangle roof and rectangle base
 * (This is a simple geometric version for consistency)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawHomeIcon(ctx, x, y, radius, colors, isSelected, fillColor, viewScale = 1) {
  ctx.save();

  // First draw the circle background
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.stroke;
  ctx.lineWidth = 2 / viewScale;
  ctx.stroke();

  // Now draw the house icon inside
  const houseSize = radius * 0.7;
  const houseWidth = houseSize * 1.2;
  const houseHeight = houseSize;
  const roofHeight = houseSize * 0.5;

  const baseY = y + houseHeight * 0.3;
  const roofTopY = baseY - houseHeight - roofHeight * 0.3;

  ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.6)';
  ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 1.5 / viewScale;
  
  // Draw roof (triangle)
  ctx.beginPath();
  ctx.moveTo(x, roofTopY);
  ctx.lineTo(x - houseWidth / 2, baseY - houseHeight);
  ctx.lineTo(x + houseWidth / 2, baseY - houseHeight);
  ctx.closePath();
  ctx.fill();
  
  // Draw base (rectangle)
  ctx.fillRect(
    x - houseWidth / 2,
    baseY - houseHeight,
    houseWidth,
    houseHeight
  );
  
  // Draw door
  const doorWidth = houseWidth * 0.3;
  const doorHeight = houseHeight * 0.5;
  ctx.fillStyle = fillColor;
  ctx.fillRect(
    x - doorWidth / 2,
    baseY - doorHeight,
    doorWidth,
    doorHeight
  );
  
  ctx.restore();
}

/**
 * Draw a "for later" icon - dashed circle with question mark
 * Indicates a node that needs to be measured/completed later
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawForLaterIcon(ctx, x, y, radius, colors, isSelected, fillColor, viewScale = 1) {
  ctx.save();

  // Draw outer dashed circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.forLaterStroke || colors.node.stroke;
  ctx.lineWidth = 2 / viewScale;
  ctx.setLineDash([4 / viewScale, 3 / viewScale]);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw question mark inside
  ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.7)';
  ctx.font = `bold ${radius * 1.2}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', x, y + 1);
  
  ctx.restore();
}

/**
 * Draw an issue icon - circle with exclamation mark (!)
 * Indicates a reported issue that needs attention from field workers
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawIssueIcon(ctx, x, y, radius, colors, isSelected, fillColor, viewScale = 1) {
  ctx.save();

  // Draw outer circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.issueStroke || '#dc2626';
  ctx.lineWidth = 2.5 / viewScale;
  ctx.stroke();

  // Draw exclamation mark (!) inside
  const iconColor = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.95)';
  const lineH = radius * 0.55;
  const lineW = radius * 0.18;
  const dotR = radius * 0.12;
  const topY = y - lineH * 0.55;

  // Exclamation line
  ctx.fillStyle = iconColor;
  ctx.beginPath();
  ctx.roundRect(x - lineW / 2, topY, lineW, lineH, lineW / 2);
  ctx.fill();

  // Exclamation dot
  ctx.beginPath();
  ctx.arc(x, topY + lineH + dotR * 2.2, dotR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a coordinate status indicator on a node
 * - Green square with white checkmark (✓) when Fixed (gnssFixQuality === 4)
 * - Yellow square with white checkmark (✓) when Device Float (gnssFixQuality === 5)
 * - Yellow circle with "!" when no survey coordinates
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Node center x
 * @param {number} y - Node center y
 * @param {number} radius - Node radius
 * @param {boolean} hasSurveyCoords - Whether the node has survey coordinates
 * @param {number} viewScale
 * @param {number} gnssFixQuality - 4=Fixed, 5=Device Float, 6=Manual Float
 */
export function drawCoordinateStatusIndicator(ctx, x, y, radius, hasSurveyCoords, viewScale = 1, gnssFixQuality) {
  ctx.save();

  // Position at top-left of node
  const indicatorSize = radius * 0.45;
  const offsetX = -radius * 0.85;
  const offsetY = -radius * 0.85;
  const indicatorX = x + offsetX;
  const indicatorY = y + offsetY;

  // Determine state: Fixed ✓ (green), Device Float ✓ (yellow), or no survey (yellow !)
  const isFixed = hasSurveyCoords && gnssFixQuality === 4;
  const isDeviceFloat = hasSurveyCoords && gnssFixQuality === 5;

  if (isFixed || isDeviceFloat) {
    // Square with white checkmark — green for Fixed, yellow for Device Float
    ctx.fillStyle = isFixed ? '#16a34a' : '#eab308'; // green-600 / yellow-500
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / viewScale;

    // Draw rounded square
    const halfSize = indicatorSize / 2;
    const cornerRadius = indicatorSize * 0.2;
    ctx.beginPath();
    ctx.roundRect(
      indicatorX - halfSize,
      indicatorY - halfSize,
      indicatorSize,
      indicatorSize,
      cornerRadius
    );
    ctx.fill();
    ctx.stroke();

    // Draw checkmark (✓)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8 / viewScale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const checkScale = indicatorSize * 0.25;
    ctx.moveTo(indicatorX - checkScale * 0.8, indicatorY);
    ctx.lineTo(indicatorX - checkScale * 0.1, indicatorY + checkScale * 0.6);
    ctx.lineTo(indicatorX + checkScale * 0.9, indicatorY - checkScale * 0.5);
    ctx.stroke();
  } else {
    // Yellow circle with "!" sign — no survey coordinates
    ctx.fillStyle = '#eab308'; // yellow-500
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / viewScale;

    // Draw circle
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, indicatorSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw "!" symbol
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${indicatorSize * 0.7}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', indicatorX, indicatorY + 1);
  }

  ctx.restore();
}

/**
 * Dispatch to the appropriate icon drawer based on node type
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} node - Node object with properties
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {Object} selectedNode - Currently selected node
 * @param {Object} options - Additional drawing options
 * @param {boolean} options.showCoordinateStatus - Whether to show coordinate indicators
 * @param {Map} options.coordinatesMap - Map of node ID to coordinates
 */
export function drawNodeIcon(ctx, node, radius, colors, selectedNode, options = {}) {
  const isSelected = node === selectedNode;
  const { showCoordinateStatus = false, coordinatesMap = null, viewScale = 1, heatmapColor = null } = options;

  // Determine fill color based on node state
  let fillColor;
  if (isSelected) {
    if (node.nodeType === 'Issue') {
      fillColor = colors.node.fillIssueSelected || colors.node.fillSelected;
    } else if (node.nodeType === 'ForLater' || node.nodeType === 'למדידה מאוחרת') {
      fillColor = colors.node.fillForLaterSelected || colors.node.fillSelected;
    } else if (node.nodeType !== 'Home' && node.type === 'type2') {
      fillColor = colors.node.fillSelectedMissing;
    } else {
      fillColor = colors.node.fillSelected;
    }
  } else if (node.nodeType === 'Issue') {
    fillColor = colors.node.fillIssue || '#ef4444';
  } else if (node.nodeType === 'ForLater' || node.nodeType === 'למדידה מאוחרת') {
    fillColor = colors.node.fillForLater || '#a855f7';
  } else if (node.nodeType === 'Home') {
    fillColor = colors.node.fillDefault;
  } else if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
    fillColor = node.type === 'type2' ? colors.node.fillMissing : '#0ea5e9';
  } else if (node.nodeType === 'Covered' || node.nodeType === 'שוחה מכוסה') {
    fillColor = colors.node.fillBlocked;
  } else {
    fillColor = node.type === 'type2' ? colors.node.fillMissing : colors.node.fillDefault;
  }

  // Heatmap override: use data-completeness color when active
  if (heatmapColor) {
    fillColor = heatmapColor;
  }

  // LOD: when zoomed out very far (node would be < ~6px on screen), draw a simple filled circle
  // instead of detailed icons with multiple paths, bezier curves, and clipping.
  // viewScale here is sizeVS (the auto-size divisor), so larger = more zoomed out.
  // No save/restore needed — we only set fillStyle/strokeStyle/lineWidth which the caller
  // doesn't rely on being preserved (draw() sets them fresh per element).
  if (viewScale > 3) {
    const isDrainage = node.nodeType === 'Drainage' || node.nodeType === 'קולטן';
    if (isDrainage) {
      const w = radius * 1.8, h = radius * 1.3;
      ctx.fillStyle = fillColor;
      ctx.fillRect(node.x - w / 2, node.y - h / 2, w, h);
      ctx.strokeStyle = colors.node.stroke;
      ctx.lineWidth = 2 / viewScale;
      ctx.strokeRect(node.x - w / 2, node.y - h / 2, w, h);
    } else {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = colors.node.stroke;
      ctx.lineWidth = 2 / viewScale;
      ctx.stroke();
    }
  } else {
    // Dispatch to appropriate icon drawer (detailed)
    if (node.nodeType === 'Issue') {
      drawIssueIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor, viewScale);
    } else if (node.nodeType === 'ForLater' || node.nodeType === 'למדידה מאוחרת') {
      drawForLaterIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor, viewScale);
    } else if (node.nodeType === 'Home') {
      drawHomeIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor, viewScale);
    } else if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
      drawDrainageIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor, viewScale);
    } else if (node.nodeType === 'Covered' || node.nodeType === 'שוחה מכוסה') {
      drawCoveredIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor, viewScale);
    } else {
      // Default manhole icon
      drawManholeIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor, viewScale);
    }
  }

  // Draw coordinate status indicator if enabled.
  // LOD: skip when zoomed out far (viewScale > 2.5 means indicator would be < ~3px on screen)
  if (showCoordinateStatus && viewScale < 2.5) {
    const fixQuality = node.gnssFixQuality;
    // Nodes in coordinatesMap come from the cords file (RTK Fixed survey).
    // Treat them as Fixed (4) even if gnssFixQuality wasn't persisted yet.
    const inCordsMap = coordinatesMap && coordinatesMap.has(String(node.id));
    const effectiveFixQuality = (fixQuality === 4 || fixQuality === 5)
      ? fixQuality
      : inCordsMap ? 4 : fixQuality;

    const hasSurveyCoords =
      (node.surveyX != null && node.surveyY != null && (effectiveFixQuality === 4 || effectiveFixQuality === 5)) ||
      (inCordsMap && (effectiveFixQuality === 4 || effectiveFixQuality === 5));

    drawCoordinateStatusIndicator(ctx, node.x, node.y, radius, hasSurveyCoords, viewScale, effectiveFixQuality);
  }
}

