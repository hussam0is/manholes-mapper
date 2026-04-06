// GPS accuracy circle canvas renderer
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
