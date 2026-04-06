// GPS accuracy circle renderer (legacy canvas helper + Leaflet implementation)
import L from 'leaflet';

// Legacy canvas-based helper for backwards compatibility with unit tests
export const drawAccuracyCircle = (ctx, centerX, centerY, accuracyMeters, scale, viewScale) => {
  if (!ctx) return false;
  if (!accuracyMeters || accuracyMeters <= 0) return false;
  
  // Radius calculation: accuracy * scale * viewScale
  const pixelRadius = accuracyMeters * scale * viewScale;
  
  // Clamp radius: 4px minimum, 2000px maximum
  if (pixelRadius < 4) return false;
  if (pixelRadius > 2000) return false;
  
  // Calculate adjusted radius for canvas
  const radius = pixelRadius;
  
  // Save canvas state
  ctx.save();
  
  // Set CEO-spec fill color: rgba(74, 144, 217, 0.15)
  ctx.fillStyle = 'rgba(74, 144, 217, 0.15)';
  
  // Set stroke weight
  ctx.lineWidth = 1;
  
  // Draw arc (full circle)
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Restore canvas state
  ctx.restore();
  
  return true;
};

// Leaflet-based implementation for use with map instances
export const createAccuracyCircle = (map, latlng, accuracyMeters, options = {}) => {
  if (!map || !accuracyMeters || accuracyMeters <= 0) return null;

  const {
    color = 'blue',
    fillColor = 'rgba(74, 144, 217, 0.15)',
    fillOpacity = 0.15,
    weight = 2
  } = options;

  // Create Leaflet circle with accuracy radius (meters)
  const accuracyCircle = L.circle(latlng, {
    radius: accuracyMeters,
    color,
    fillColor,
    fillOpacity,
    weight
  }).addTo(map);

  // Bind popup to show accuracy info
  accuracyCircle.bindPopup(`<b>GPS Accuracy</b><br>${accuracyMeters} meters`).openPopup();

  return accuracyCircle;
};