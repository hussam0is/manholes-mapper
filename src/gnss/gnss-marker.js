/**
 * GNSS Marker Rendering Module
 * Draws live GNSS position marker on the canvas with animated precision indicators
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

// Entrance animation progress (0 → 1)
let entranceProgress = 0;
let markerVisible = false;

/**
 * Reset entrance animation (call when marker first appears)
 */
export function resetMarkerEntrance() {
  entranceProgress = 0;
  markerVisible = false;
}

/**
 * Ease-out cubic for smooth entrance
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

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
    markerVisible = false;
    entranceProgress = 0;
    return;
  }

  if (!referencePoint) {
    return;
  }

  // Advance entrance animation
  if (!markerVisible) {
    markerVisible = true;
    entranceProgress = 0;
  }
  if (entranceProgress < 1) {
    entranceProgress = Math.min(1, entranceProgress + 0.04); // ~0.6s at 60fps
  }
  const ease = easeOutCubic(entranceProgress);

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

  // Continuous time-based animation phases
  const now = Date.now();
  const pulsePhase = (now % 2000) / 2000 * Math.PI * 2;   // 2s breathing cycle
  const ripplePhase = (now % 2500) / 2500;                  // 2.5s ripple cycle
  const dashOffset = (now % 2000) / 2000 * 20;              // Animated dash rotation

  ctx.save();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Get color based on fix quality
  const fixQuality = position.fixQuality || 0;
  const markerColor = FIX_COLORS[fixQuality] || FIX_COLORS[0];

  // --- 1. Accuracy circle with gradient fill and animated border ---
  const accuracyMeters = position.accuracy || (position.hdop ? position.hdop * 3 : 0);
  if (accuracyMeters > 0) {
    const baseRadius = accuracyMeters * coordinateScale * viewScale;

    if (baseRadius > 5 && baseRadius < 500) {
      // Subtle breathing effect on the circle
      const breathFactor = 1 + Math.sin(pulsePhase) * 0.02;
      const radius = baseRadius * breathFactor * ease;

      // Radial gradient fill — fades from center to edge
      const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius);
      gradient.addColorStop(0, `${markerColor}18`);   // ~9% opacity center
      gradient.addColorStop(0.6, `${markerColor}10`);  // ~6% mid
      gradient.addColorStop(1, `${markerColor}28`);    // ~16% at edge

      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Animated dashed border
      ctx.strokeStyle = `${markerColor}50`; // ~31% opacity
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -dashOffset;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // --- 2. Expanding ripple ring ---
  const rippleRadius = (14 + ripplePhase * 28) * ease;
  const rippleOpacity = Math.max(0, 0.35 * (1 - ripplePhase));
  if (rippleOpacity > 0.01) {
    ctx.beginPath();
    ctx.arc(screenX, screenY, rippleRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `${markerColor}${Math.round(rippleOpacity * 255).toString(16).padStart(2, '0')}`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // --- 3. Soft glow halo ---
  const glowSize = (18 + Math.sin(pulsePhase) * 3) * ease;
  const glowGradient = ctx.createRadialGradient(screenX, screenY, 4, screenX, screenY, glowSize);
  glowGradient.addColorStop(0, `${markerColor}35`);  // ~21% center
  glowGradient.addColorStop(1, `${markerColor}00`);  // transparent edge
  ctx.beginPath();
  ctx.arc(screenX, screenY, glowSize, 0, Math.PI * 2);
  ctx.fillStyle = glowGradient;
  ctx.fill();

  // --- 4. Main marker dot ---
  const dotRadius = 10 * ease;
  ctx.beginPath();
  ctx.arc(screenX, screenY, dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = markerColor;
  ctx.fill();
  // White border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Inner white dot (Google Maps style)
  const innerRadius = 3.5 * ease;
  ctx.beginPath();
  ctx.arc(screenX, screenY, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // --- 5. Heading indicator (only when moving) ---
  if (position.course != null && !isNaN(position.course) && position.speed > 0.5) {
    const headingRad = (position.course - 90) * Math.PI / 180;
    const arrowLength = 20 * ease;

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

  // --- 6. Stale indicator ---
  if (options.isStale) {
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('STALE', screenX, screenY - 18);
  }

  // --- 7. Precision label below the marker ---
  const fixLabels = { 0: 'No Fix', 1: 'GPS', 2: 'DGPS', 4: 'RTK Fixed', 5: 'RTK Float' };
  const label = fixLabels[fixQuality] || 'GPS';
  ctx.font = `bold 11px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // White outline for readability over map tiles
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(label, screenX, screenY + 16);
  ctx.fillStyle = markerColor;
  ctx.fillText(label, screenX, screenY + 16);

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
