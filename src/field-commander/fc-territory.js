/**
 * FC Territory Overlay — Canvas completion visualization
 *
 * Draws subtle visual indicators on the canvas:
 *   - Green glow around GPS-captured nodes
 *   - Red ring around nodes missing coordinates
 *
 * Registered as a post-draw hook via window.__fcTerritoryOverlay
 */

import { isFCMode } from './fc-shell.js';

const CAPTURED_ALPHA = 0.07;
const MISSING_ALPHA = 0.12;
const GLOW_RADIUS = 35;

/**
 * Initialize the territory overlay hook
 */
export function initFCTerritory() {
  window.__fcTerritoryOverlay = drawTerritoryOverlay;
}

/**
 * Draw territory overlay — called from main.js draw loop
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} viewScale
 * @param {{ x: number, y: number }} viewTranslate
 * @param {number} stretchX
 * @param {number} stretchY
 */
function drawTerritoryOverlay(ctx, viewScale, viewTranslate, stretchX, stretchY) {
  if (!isFCMode()) return;

  let nodes;
  try {
    const stats = window.__getSketchStats?.();
    nodes = stats?.nodes;
    if (!nodes) {
      const data = window.__getActiveSketchData?.();
      nodes = data?.nodes;
    }
  } catch {
    return;
  }

  if (!nodes || !nodes.length) return;

  ctx.save();

  for (const node of nodes) {
    // Skip non-relevant nodes
    if (node.nodeType === 'Home' || node.nodeType === 'ForLater') continue;
    if (node.accuracyLevel === 1) continue; // schematic

    const screenX = node.x * stretchX * viewScale + viewTranslate.x;
    const screenY = node.y * stretchY * viewScale + viewTranslate.y;

    const hasSurvey = node.surveyX != null && node.surveyY != null;

    if (hasSurvey) {
      // Green glow — captured
      ctx.beginPath();
      const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, GLOW_RADIUS * viewScale);
      gradient.addColorStop(0, `rgba(34, 197, 94, ${CAPTURED_ALPHA})`);
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
      ctx.fillStyle = gradient;
      ctx.arc(screenX, screenY, GLOW_RADIUS * viewScale, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Red ring — missing coordinates
      ctx.beginPath();
      ctx.strokeStyle = `rgba(239, 68, 68, ${MISSING_ALPHA})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.arc(screenX, screenY, 22 * viewScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
}
