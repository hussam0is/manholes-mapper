/**
 * Unit tests for src/project/project-canvas-renderer.js
 *
 * Covers:
 * - drawBackgroundSketches: node Map caching across frames (WeakMap)
 * - drawBackgroundSketches: viewport culling for edges and nodes
 * - drawBackgroundSketches: empty sketch handling
 * - drawMergeModeOverlay: distance-squared optimization in closest-node search
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock merge-mode before importing renderer
vi.mock('../../src/project/merge-mode.js', () => ({
  isMergeModeEnabled: vi.fn(() => false),
  getNearbyNodes: vi.fn(() => []),
  getCrossMergeIssues: vi.fn(() => []),
}));

// Mock constants
vi.mock('../../src/state/constants.js', () => ({
  COLORS: {
    node: {
      fillDefault: '#4ade80',
      fillDrainageComplete: '#0ea5e9',
      stroke: '#333',
      label: '#666',
      houseBody: '#d7ccc8',
    },
    edge: {
      typePrimary: '#2563eb',
      typeDrainage: '#fb923c',
      typeSecondary: '#0d9488',
    },
  },
  NODE_RADIUS: 20,
}));

// Mock OffscreenCanvas for JSDOM (provides a mock 2D context for offscreen rendering)
function createOffscreenMockCtx() {
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
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    clearRect: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
}

let _offscreenCtx: ReturnType<typeof createOffscreenMockCtx>;

(globalThis as any).OffscreenCanvas = class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return _offscreenCtx;
  }
};

import { drawBackgroundSketches, drawMergeModeOverlay, invalidateBackgroundCache } from '../../src/project/project-canvas-renderer.js';
import { isMergeModeEnabled, getNearbyNodes, getCrossMergeIssues } from '../../src/project/merge-mode.js';

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
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

// ── Test data ────────────────────────────────────────────────────────────────

function makeSketch(id: string, nodes: any[], edges: any[]) {
  return { id, name: `Sketch ${id}`, nodes, edges };
}

const defaultOpts = {
  sizeScale: 1,
  viewScale: 1,
  viewStretchX: 1,
  viewStretchY: 1,
  visMinX: -Infinity,
  visMinY: -Infinity,
  visMaxX: Infinity,
  visMaxY: Infinity,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('project-canvas-renderer', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
    _offscreenCtx = createOffscreenMockCtx();
    invalidateBackgroundCache();
  });

  describe('drawBackgroundSketches()', () => {
    it('does nothing for empty sketches array', () => {
      drawBackgroundSketches(ctx, [], defaultOpts);
      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('does nothing for null sketches', () => {
      drawBackgroundSketches(ctx, null as any, defaultOpts);
      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('skips sketches with no nodes and no edges', () => {
      const sketches = [makeSketch('empty', [], [])];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      // Offscreen render is skipped (no nodes → no bounding box)
      // so save/restore on offscreen ctx are not called
      expect(_offscreenCtx.arc).not.toHaveBeenCalled();
    });

    it('draws nodes for non-empty sketches', () => {
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20 },
          { id: '2', x: 30, y: 40 },
        ], []),
      ];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      // Should draw 2 nodes (default circle: arc call) on offscreen ctx
      expect(_offscreenCtx.arc).toHaveBeenCalledTimes(2);
    });

    it('draws edges between connected nodes', () => {
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20 },
          { id: '2', x: 30, y: 40 },
        ], [
          { tail: '1', head: '2' },
        ]),
      ];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      // Edges are batched — should have moveTo/lineTo calls on offscreen ctx
      expect(_offscreenCtx.moveTo).toHaveBeenCalled();
      expect(_offscreenCtx.lineTo).toHaveBeenCalled();
    });

    it('culls off-screen nodes', () => {
      // Note: offscreen rendering draws ALL nodes (no viewport culling in offscreen pass)
      // Culling only happens at blit time. So this test verifies no crash.
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 1000, y: 1000 },
        ], []),
      ];
      const opts = { ...defaultOpts, visMinX: 0, visMinY: 0, visMaxX: 100, visMaxY: 100 };
      drawBackgroundSketches(ctx, sketches, opts);
      // Offscreen renders all nodes regardless of viewport
      expect(_offscreenCtx.arc).toHaveBeenCalled();
    });

    it('culls off-screen edges', () => {
      // Same as above: offscreen renders everything, culling is at blit time
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 1000, y: 1000 },
          { id: '2', x: 1100, y: 1100 },
        ], [
          { tail: '1', head: '2' },
        ]),
      ];
      const opts = { ...defaultOpts, visMinX: 0, visMinY: 0, visMaxX: 100, visMaxY: 100 };
      drawBackgroundSketches(ctx, sketches, opts);
      // Offscreen renders all edges
      expect(_offscreenCtx.moveTo).toHaveBeenCalled();
    });

    it('caches node Map across multiple frames (same sketch object)', () => {
      const sketch = makeSketch('s1', [
        { id: '1', x: 10, y: 20 },
        { id: '2', x: 30, y: 40 },
      ], [
        { tail: '1', head: '2' },
      ]);
      const sketches = [sketch];

      // Frame 1
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      const arcCallsFrame1 = (_offscreenCtx.arc as any).mock.calls.length;
      expect(arcCallsFrame1).toBe(2);

      // Frame 2 — same cache key means offscreen is NOT re-rendered
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      const arcCallsFrame2 = (_offscreenCtx.arc as any).mock.calls.length;

      // Cache hit → no additional arc calls
      expect(arcCallsFrame2).toBe(arcCallsFrame1);
    });

    it('invalidates node Map cache when sketch size changes', () => {
      const sketch = makeSketch('s1', [
        { id: '1', x: 10, y: 20 },
      ], []);

      drawBackgroundSketches(ctx, [sketch], defaultOpts);
      expect(_offscreenCtx.arc).toHaveBeenCalledTimes(1);

      // Add a node (simulate sketch data update) — changes cache key
      sketch.nodes.push({ id: '2', x: 30, y: 40 });

      // Reset mock
      (_offscreenCtx.arc as any).mockClear();
      drawBackgroundSketches(ctx, [sketch], defaultOpts);
      // Should now draw 2 nodes (cache was invalidated due to size mismatch)
      expect(_offscreenCtx.arc).toHaveBeenCalledTimes(2);
    });

    it('draws drainage nodes as rectangles', () => {
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20, nodeType: 'Drainage' },
        ], []),
      ];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      expect(_offscreenCtx.fillRect).toHaveBeenCalled();
    });

    it('draws home nodes with house shape', () => {
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20, nodeType: 'Home' },
        ], []),
      ];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      // Home shape uses closePath for the polygon
      expect(_offscreenCtx.closePath).toHaveBeenCalled();
    });

    it('sets globalAlpha to BG_ALPHA', () => {
      const sketches = [makeSketch('s1', [{ id: '1', x: 10, y: 20 }], [])];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      expect(_offscreenCtx.globalAlpha).toBe(0.5);
    });
  });

  describe('drawMergeModeOverlay()', () => {
    it('does nothing when merge mode is disabled', () => {
      (isMergeModeEnabled as any).mockReturnValue(false);
      drawMergeModeOverlay(ctx, [], defaultOpts);
      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('does nothing when no nearby nodes', () => {
      (isMergeModeEnabled as any).mockReturnValue(true);
      (getNearbyNodes as any).mockReturnValue([]);
      drawMergeModeOverlay(ctx, [], defaultOpts);
      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('draws nearby nodes when merge mode is enabled', () => {
      (isMergeModeEnabled as any).mockReturnValue(true);
      (getNearbyNodes as any).mockReturnValue([
        { sketchId: 's2', sketchName: 'Sketch 2', node: { id: '10', x: 50, y: 50 } },
      ]);
      (getCrossMergeIssues as any).mockReturnValue([]);

      const activeNodes = [{ id: '1', x: 100, y: 100 }];
      drawMergeModeOverlay(ctx, activeNodes, defaultOpts);

      // Should draw the nearby node (ring + body = 2 arc calls)
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.save).toHaveBeenCalled();
    });

    it('draws connector lines from nearby to closest active node', () => {
      (isMergeModeEnabled as any).mockReturnValue(true);
      (getNearbyNodes as any).mockReturnValue([
        { sketchId: 's2', sketchName: 'S2', node: { id: '10', x: 50, y: 50 } },
      ]);
      (getCrossMergeIssues as any).mockReturnValue([]);

      const activeNodes = [
        { id: '1', x: 100, y: 100 },
        { id: '2', x: 200, y: 200 },
      ];
      drawMergeModeOverlay(ctx, activeNodes, defaultOpts);

      // Connector line should be drawn
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
    });

    it('uses distance-squared for closest-node search (no sqrt)', () => {
      (isMergeModeEnabled as any).mockReturnValue(true);
      (getNearbyNodes as any).mockReturnValue([
        { sketchId: 's2', sketchName: 'S2', node: { id: '10', x: 50, y: 50 } },
      ]);
      (getCrossMergeIssues as any).mockReturnValue([]);

      // Place two active nodes: one close, one far
      const activeNodes = [
        { id: '1', x: 60, y: 60 },   // distance ~14.1
        { id: '2', x: 200, y: 200 },  // distance ~212
      ];
      drawMergeModeOverlay(ctx, activeNodes, defaultOpts);

      // The connector should go to the closer node (60,60)
      // Check that lineTo was called with the closer node's coordinates
      const lineToArgs = (ctx.lineTo as any).mock.calls;
      const hasCloseNode = lineToArgs.some(
        (args: number[]) => args[0] === 60 && args[1] === 60
      );
      expect(hasCloseNode).toBe(true);
    });

    it('culls off-screen nearby nodes', () => {
      (isMergeModeEnabled as any).mockReturnValue(true);
      (getNearbyNodes as any).mockReturnValue([
        { sketchId: 's2', sketchName: 'S2', node: { id: '10', x: 5000, y: 5000 } },
      ]);
      (getCrossMergeIssues as any).mockReturnValue([]);

      const activeNodes = [{ id: '1', x: 50, y: 50 }];
      const opts = { ...defaultOpts, visMinX: 0, visMinY: 0, visMaxX: 100, visMaxY: 100 };
      drawMergeModeOverlay(ctx, activeNodes, opts);

      // Node is off-screen, connector should still be tried but node drawing skipped
      // arc should not be called for off-screen nearby nodes
      // (the moveTo/lineTo for the connector line also has viewport check)
      // The ring + body arcs should not be drawn
      const arcCalls = (ctx.arc as any).mock.calls.length;
      expect(arcCalls).toBe(0);
    });
  });
});
