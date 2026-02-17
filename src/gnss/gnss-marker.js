/**
 * GNSS Marker Rendering Module
 * Draws live GNSS position marker on the canvas
 */

import { wgs84ToItm } from '../map/govmap-layer.js';

// Marker colors based on fix quality
const FIX_COLORS = {
  0: '#ef4444', // No fix - red
  1: '#f59e0b', // GPS - amber
  2: '#f59e0b', // DGPS - amber
  3: '#f59e0b', // PPS - amber
  4: '#22c55e', // RTK Fixed - green
  5: '#3b82f6', // RTK Float - blue
  6: '#9ca3af', // Estimated - gray
  7: '#9ca3af', // Manual - gray
  8: '#9ca3af'  // Simulation - gray
};

// Pulse animation state
let pulsePhase = 0;
let lastPulseTime = 0;

/**
 * Draw GNSS position marker on the canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} position - GNSS position {lat, lon, alt, fixQuality, hdop, isValid}
 * @param {object} referencePoint - Reference point for coordinate conversion {itm: {x, y}, canvas: {x, y}}
 * @param {number} coordinateScale - Pixels per meter
 * @param {object} viewTranslate - View translation {x, y}
 * @param {number} viewScale - View zoom scale
 * @param {object} options - Drawing options
 * @param {number} options.stretchX - Horizontal stretch factor (default 1)
 * @param {number} options.stretchY - Vertical stretch factor (default 1)
 */
export function drawGnssMarker(ctx, position, referencePoint, coordinateScale, viewTranslate, viewScale, options = {}) {
  if (!position || !position.isValid || position.lat == null || position.lon == null) {
    return;
  }

  if (!referencePoint) {
    // No reference point - can't draw marker in world coordinates
    return;
  }

  const { stretchX = 1, stretchY = 1 } = options;

  // Convert GNSS position (WGS84) to ITM
  const posItm = wgs84ToItm(position.lat, position.lon);

  // Convert to canvas world coordinates
  const dx = posItm.x - referencePoint.itm.x;
  const dy = posItm.y - referencePoint.itm.y;

  const worldX = referencePoint.canvas.x + (dx * coordinateScale);
  const worldY = referencePoint.canvas.y - (dy * coordinateScale); // Flip Y axis

  // Compute screen coordinates from world coordinates
  const screenX = (worldX * stretchX) * viewScale + viewTranslate.x;
  const screenY = (worldY * stretchY) * viewScale + viewTranslate.y;

  // Update pulse animation
  const now = Date.now();
  if (now - lastPulseTime > 16) { // ~60fps
    pulsePhase = (pulsePhase + 0.05) % (Math.PI * 2);
    lastPulseTime = now;
  }

  ctx.save();
  // Reset context transform to draw in screen space — the caller's context may
  // already have translate + scale applied, so we use a DPR-only matrix and
  // position everything using the screenX/screenY we computed above.
  // We must keep the DPR scale because the canvas backing store is sized at
  // CSS dimensions × devicePixelRatio.
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Get color based on fix quality
  const fixQuality = position.fixQuality || 0;
  const markerColor = FIX_COLORS[fixQuality] || FIX_COLORS[0];

  // Draw accuracy circle if HDOP is available
  const accuracyMeters = position.accuracy || (position.hdop ? position.hdop * 3 : 0);
  if (accuracyMeters > 0) {
    const accuracyRadius = accuracyMeters * coordinateScale * viewScale;

    if (accuracyRadius > 5 && accuracyRadius < 500) {
      ctx.beginPath();
      ctx.arc(screenX, screenY, accuracyRadius, 0, Math.PI * 2);
      ctx.fillStyle = `${markerColor}20`; // 12% opacity
      ctx.fill();
      ctx.strokeStyle = `${markerColor}40`; // 25% opacity
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Draw pulsing outer ring
  const pulseRadius = 16 + Math.sin(pulsePhase) * 4;
  const pulseOpacity = 0.3 + Math.sin(pulsePhase) * 0.1;

  ctx.beginPath();
  ctx.arc(screenX, screenY, pulseRadius, 0, Math.PI * 2);
  ctx.fillStyle = `${markerColor}${Math.round(pulseOpacity * 255).toString(16).padStart(2, '0')}`;
  ctx.fill();

  // Draw main marker circle
  ctx.beginPath();
  ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
  ctx.fillStyle = markerColor;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw crosshairs
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(screenX - 5, screenY);
  ctx.lineTo(screenX + 5, screenY);
  ctx.moveTo(screenX, screenY - 5);
  ctx.lineTo(screenX, screenY + 5);
  ctx.stroke();

  // Draw heading indicator if available
  if (position.course != null && !isNaN(position.course) && position.speed > 0.5) {
    const headingRad = (position.course - 90) * Math.PI / 180;
    const arrowLength = 20;

    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(
      screenX + Math.cos(headingRad) * arrowLength,
      screenY + Math.sin(headingRad) * arrowLength
    );
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Arrow head
    const arrowHeadLength = 6;
    const arrowX = screenX + Math.cos(headingRad) * arrowLength;
    const arrowY = screenY + Math.sin(headingRad) * arrowLength;

    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(
      arrowX - arrowHeadLength * Math.cos(headingRad - Math.PI / 6),
      arrowY - arrowHeadLength * Math.sin(headingRad - Math.PI / 6)
    );
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(
      arrowX - arrowHeadLength * Math.cos(headingRad + Math.PI / 6),
      arrowY - arrowHeadLength * Math.sin(headingRad + Math.PI / 6)
    );
    ctx.stroke();
  }

  // Draw stale indicator if position is old
  if (options.isStale) {
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('STALE', screenX, screenY - 18);
  }

  ctx.restore();
}

/**
 * Draw GNSS status badge on the canvas (fixed position, not in world coordinates)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} status - GNSS status {connected, fixLabel, satellites, hdop, isStale}
 * @param {number} x - X position on canvas
 * @param {number} y - Y position on canvas
 */
export function drawGnssStatusBadge(ctx, status, x, y) {
  ctx.save();

  const padding = 8;
  const lineHeight = 16;
  let lines = [];

  if (!status.connected) {
    lines.push({ text: 'GNSS Disconnected', color: '#ef4444' });
  } else {
    // Connection status
    lines.push({ text: `GNSS: ${status.fixLabel || 'Connected'}`, color: getFixColor(status.fixQuality) });

    // Satellites
    if (status.satellites != null) {
      lines.push({ text: `${status.satellites} satellites`, color: '#6b7280' });
    }

    // HDOP
    if (status.hdop != null) {
      const hdopLabel = status.hdop < 1 ? 'Excellent' : status.hdop < 2 ? 'Good' : status.hdop < 5 ? 'Moderate' : 'Poor';
      lines.push({ text: `HDOP: ${status.hdop.toFixed(1)} (${hdopLabel})`, color: '#6b7280' });
    }

    // Stale warning
    if (status.isStale) {
      lines.push({ text: 'Signal stale!', color: '#ef4444' });
    }
  }

  // Calculate badge dimensions
  ctx.font = '12px Arial';
  const maxWidth = Math.max(...lines.map(l => ctx.measureText(l.text).width));
  const width = maxWidth + padding * 2;
  const height = lines.length * lineHeight + padding * 2;

  // Draw background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  
  // Rounded rectangle
  const radius = 6;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, x + padding, y + padding + i * lineHeight);
  });

  ctx.restore();
}

/**
 * Get color for fix quality
 * @param {number} fixQuality
 * @returns {string} Color hex code
 */
function getFixColor(fixQuality) {
  return FIX_COLORS[fixQuality] || FIX_COLORS[0];
}

/**
 * Convert GNSS position to canvas world coordinates
 * @param {object} position - GNSS position {lat, lon}
 * @param {object} referencePoint - Reference point {itm: {x, y}, canvas: {x, y}}
 * @param {number} coordinateScale - Pixels per meter
 * @returns {object|null} Canvas coordinates {x, y} or null
 */
export function gnssToCanvas(position, referencePoint, coordinateScale) {
  if (!position || !referencePoint || position.lat == null || position.lon == null) {
    return null;
  }

  const posItm = wgs84ToItm(position.lat, position.lon);
  const dx = posItm.x - referencePoint.itm.x;
  const dy = posItm.y - referencePoint.itm.y;

  return {
    x: referencePoint.canvas.x + (dx * coordinateScale),
    y: referencePoint.canvas.y - (dy * coordinateScale)
  };
}

export { FIX_COLORS };
