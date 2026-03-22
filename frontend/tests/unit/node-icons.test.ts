/**
 * Unit tests for src/features/node-icons.js
 *
 * Covers:
 * - drawNodeIcon LOD: simplified rendering at high viewScale (no save/restore)
 * - drawNodeIcon dispatch: correct icon function called per nodeType
 * - drawManholeIcon: batched crosshatch path (single beginPath for both lines)
 * - drawCoveredIcon: batched stripe path (single beginPath for all stripes)
 * - drawCoordinateStatusIndicator: skip at high viewScale
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  drawNodeIcon,
  drawManholeIcon,
  drawCoveredIcon,
  drawDrainageIcon,
  drawHomeIcon,
  drawForLaterIcon,
  drawCoordinateStatusIndicator,
} from '../../src/features/node-icons.js';

// ── Mock canvas context ──────────────────────────────────────────────────────

function createMockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    rect: vi.fn(),
    bezierCurveTo: vi.fn(),
    clip: vi.fn(),
    roundRect: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 30 })),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
  } as unknown as CanvasRenderingContext2D;
}

const defaultColors = {
  node: {
    stroke: '#333',
    fillDefault: '#4ade80',
    fillSelected: '#7c3aed',
    fillSelectedMissing: '#f59e0b',
    fillMissing: '#fb923c',
    fillBlocked: '#a8a29e',
    fillDrainageComplete: '#0ea5e9',
    fillForLater: '#a855f7',
    fillForLaterSelected: '#c084fc',
    forLaterStroke: '#9333ea',
  },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('node-icons', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  describe('drawNodeIcon() LOD fast path', () => {
    it('draws simplified circle at viewScale > 3 (no save/restore)', () => {
      const node = { x: 100, y: 100, nodeType: 'Manhole', type: 'type1', id: '1' };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, { viewScale: 4 });

      // LOD path should NOT call save/restore
      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.restore).not.toHaveBeenCalled();

      // Should draw a simple circle (arc call)
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('draws simplified rectangle for drainage at viewScale > 3', () => {
      const node = { x: 100, y: 100, nodeType: 'Drainage', type: 'type1', id: '2' };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, { viewScale: 4 });

      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.strokeRect).toHaveBeenCalled();
    });

    it('draws detailed icon at viewScale <= 3', () => {
      const node = { x: 100, y: 100, nodeType: 'Manhole', type: 'type1', id: '3' };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, { viewScale: 2 });

      // Detailed path uses save/restore
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });
  });

  describe('drawNodeIcon() dispatch', () => {
    it('dispatches to drainage icon for Drainage nodeType', () => {
      const node = { x: 50, y: 50, nodeType: 'Drainage', type: 'type1', id: '4' };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, { viewScale: 1 });
      // Drainage draws a rectangle
      expect(ctx.rect).toHaveBeenCalled();
    });

    it('dispatches to drainage icon for Hebrew nodeType', () => {
      const node = { x: 50, y: 50, nodeType: 'קולטן', type: 'type1', id: '5' };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, { viewScale: 1 });
      expect(ctx.rect).toHaveBeenCalled();
    });

    it('dispatches to covered icon for Covered nodeType', () => {
      const node = { x: 50, y: 50, nodeType: 'Covered', type: 'type1', id: '6' };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, { viewScale: 1 });
      // Covered uses clip
      expect(ctx.clip).toHaveBeenCalled();
    });

    it('dispatches to home icon for Home nodeType', () => {
      const node = { x: 50, y: 50, nodeType: 'Home', type: 'type1', id: '7' };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, { viewScale: 1 });
      // Home draws triangle roof via moveTo/lineTo/closePath
      expect(ctx.closePath).toHaveBeenCalled();
    });

    it('dispatches to ForLater icon for ForLater nodeType', () => {
      const node = { x: 50, y: 50, nodeType: 'ForLater', type: 'type1', id: '8' };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, { viewScale: 1 });
      // ForLater uses setLineDash for dashed circle
      expect(ctx.setLineDash).toHaveBeenCalled();
    });
  });

  describe('drawNodeIcon() coordinate status indicator', () => {
    it('draws coordinate indicator when showCoordinateStatus is true and viewScale < 2.5', () => {
      const node = { x: 50, y: 50, nodeType: 'Manhole', type: 'type1', id: '9', gnssFixQuality: 4, surveyX: 1, surveyY: 2 };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, {
        viewScale: 1,
        showCoordinateStatus: true,
      });
      // Should have additional save/restore for the coordinate indicator
      const saveCalls = (ctx.save as any).mock.calls.length;
      expect(saveCalls).toBeGreaterThanOrEqual(2); // icon + indicator
    });

    it('skips coordinate indicator when viewScale >= 2.5', () => {
      const node = { x: 50, y: 50, nodeType: 'Manhole', type: 'type1', id: '10', gnssFixQuality: 4, surveyX: 1, surveyY: 2 };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, {
        viewScale: 3,
        showCoordinateStatus: true,
      });
      // At viewScale 3, LOD kicks in AND indicator is skipped (viewScale >= 2.5).
      // roundRect is only used by the coordinate status indicator, so it should not be called.
      expect(ctx.roundRect).not.toHaveBeenCalled();
    });
  });

  describe('drawManholeIcon() batched crosshatch', () => {
    it('uses a single beginPath for crosshatch lines', () => {
      drawManholeIcon(ctx, 100, 100, 20, defaultColors as any, false, '#4ade80', 1);
      // Count beginPath calls: outer circle + inner circle + crosshatch = 3
      // Previously crosshatch was 2 separate paths (4 total), now it's 1 (3 total)
      const beginPathCalls = (ctx.beginPath as any).mock.calls.length;
      expect(beginPathCalls).toBe(3);
    });

    it('draws both horizontal and vertical crosshatch lines', () => {
      drawManholeIcon(ctx, 100, 100, 20, defaultColors as any, false, '#4ade80', 1);
      // Should have moveTo for horizontal and vertical lines in the same path
      const moveToCalls = (ctx.moveTo as any).mock.calls.length;
      expect(moveToCalls).toBe(2); // 2 moves: one per line
    });
  });

  describe('drawCoveredIcon() batched stripes', () => {
    it('uses a single beginPath for all diagonal stripes', () => {
      drawCoveredIcon(ctx, 100, 100, 20, defaultColors as any, false, '#a8a29e', 1);
      // beginPath calls: outer circle + clip circle + stripes = 3
      // Previously stripes had 13 separate beginPath calls (one per stripe iteration)
      const beginPathCalls = (ctx.beginPath as any).mock.calls.length;
      expect(beginPathCalls).toBe(3);
    });

    it('calls stroke once for all stripes (not per stripe)', () => {
      drawCoveredIcon(ctx, 100, 100, 20, defaultColors as any, false, '#a8a29e', 1);
      // stroke calls: outer circle + stripes = 2
      // (clip circle uses clip(), not stroke())
      const strokeCalls = (ctx.stroke as any).mock.calls.length;
      expect(strokeCalls).toBe(2);
    });

    it('draws 13 stripe lines (from -6 to +6)', () => {
      drawCoveredIcon(ctx, 100, 100, 20, defaultColors as any, false, '#a8a29e', 1);
      // moveTo is called once per stripe line = 13
      const moveToCalls = (ctx.moveTo as any).mock.calls.length;
      expect(moveToCalls).toBe(13);
    });
  });

  describe('drawCoordinateStatusIndicator()', () => {
    it('draws green indicator for Fixed quality', () => {
      drawCoordinateStatusIndicator(ctx, 100, 100, 20, true, 1, 4);
      // Should draw a rounded square (roundRect)
      expect(ctx.roundRect).toHaveBeenCalled();
      // Fill with green
      expect(ctx.fillStyle).toBeDefined();
    });

    it('draws yellow indicator for Float quality', () => {
      drawCoordinateStatusIndicator(ctx, 100, 100, 20, true, 1, 5);
      expect(ctx.roundRect).toHaveBeenCalled();
    });

    it('draws yellow circle with ! for no survey coords', () => {
      drawCoordinateStatusIndicator(ctx, 100, 100, 20, false, 1, undefined as any);
      // Should draw a circle (arc) not roundRect
      expect(ctx.arc).toHaveBeenCalled();
      // Should draw "!" text
      expect(ctx.fillText).toHaveBeenCalledWith('!', expect.any(Number), expect.any(Number));
    });
  });

  describe('heatmap color override', () => {
    it('uses heatmapColor when provided', () => {
      const node = { x: 50, y: 50, nodeType: 'Manhole', type: 'type1', id: '11' };
      drawNodeIcon(ctx, node as any, 20, defaultColors as any, null, {
        viewScale: 4,
        heatmapColor: '#ff0000',
      });
      // At LOD path, fillStyle should be the heatmap color
      expect(ctx.fillStyle).toBe('#ff0000');
    });
  });
});
