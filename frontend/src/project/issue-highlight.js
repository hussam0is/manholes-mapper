/**
 * Canvas pulsing animation for issue highlights.
 *
 * When navigating to an issue, a red expanding/fading ring is drawn
 * at the issue's world coordinates for a short duration.
 */

let _active = false;
let _worldX = 0;
let _worldY = 0;
let _startTime = 0;
let _duration = 2000;
let _rafId = null;

/**
 * Start a pulsing highlight at the given world coordinates.
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} [durationMs=2000]
 */
export function startIssueHighlight(worldX, worldY, durationMs = 2000) {
  _worldX = worldX;
  _worldY = worldY;
  _startTime = performance.now();
  _duration = durationMs;
  _active = true;

  // Schedule redraws for the animation duration
  if (_rafId) cancelAnimationFrame(_rafId);
  const tick = () => {
    if (!_active) return;
    window.__scheduleDraw?.();
    if (performance.now() - _startTime < _duration) {
      _rafId = requestAnimationFrame(tick);
    } else {
      _active = false;
      _rafId = null;
      window.__scheduleDraw?.();
    }
  };
  _rafId = requestAnimationFrame(tick);
}

/**
 * Draw the pulsing highlight ring. Call from the main draw() loop.
 * Draws in screen space using the provided transform parameters.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} viewScale
 * @param {number} stretchX
 * @param {number} stretchY
 * @param {{ x: number, y: number }} viewTranslate
 */
export function drawIssueHighlight(ctx, viewScale, stretchX, stretchY, viewTranslate) {
  if (!_active) return;

  const elapsed = performance.now() - _startTime;
  if (elapsed >= _duration) {
    _active = false;
    return;
  }

  // Progress 0→1 over the duration
  const progress = elapsed / _duration;

  // Two expanding rings staggered
  const rings = [progress, Math.max(0, progress - 0.3)];

  // Convert world to screen
  const screenX = _worldX * stretchX * viewScale + viewTranslate.x;
  const screenY = _worldY * stretchY * viewScale + viewTranslate.y;

  ctx.save();
  // Reset transform to draw in screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Account for DPR
  const dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);

  for (const p of rings) {
    if (p <= 0) continue;
    const radius = 10 + p * 40;
    const alpha = Math.max(0, 1 - p) * 0.7;

    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
    ctx.lineWidth = 3 - p * 2;
    ctx.stroke();
  }

  // Center dot
  const dotAlpha = Math.max(0, 1 - progress * 0.5);
  ctx.beginPath();
  ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(239, 68, 68, ${dotAlpha})`;
  ctx.fill();

  ctx.restore();
}

// Expose on window for cross-module access
window.__issueHighlight = { start: startIssueHighlight, draw: drawIssueHighlight };
