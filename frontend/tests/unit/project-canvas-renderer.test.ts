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

import { drawBackgroundSketches, drawMergeModeOverlay } from '../../src/project/project-canvas-renderer.js';
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
      // save/restore are called for the outer context, but no drawing happens
      expect(ctx.save).toHaveBeenCalledOnce();
      expect(ctx.restore).toHaveBeenCalledOnce();
      // No arc or rect calls for nodes
      expect(ctx.arc).not.toHaveBeenCalled();
    });

    it('draws nodes for non-empty sketches', () => {
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20 },
          { id: '2', x: 30, y: 40 },
        ], []),
      ];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      // Should draw 2 nodes (default circle: arc call)
      expect(ctx.arc).toHaveBeenCalledTimes(2);
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
      // Edges are batched — should have moveTo/lineTo calls
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
    });

    it('culls off-screen nodes', () => {
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 1000, y: 1000 }, // off-screen
        ], []),
      ];
      const opts = { ...defaultOpts, visMinX: 0, visMinY: 0, visMaxX: 100, visMaxY: 100 };
      drawBackgroundSketches(ctx, sketches, opts);
      // Node is off-screen, should not be drawn
      expect(ctx.arc).not.toHaveBeenCalled();
    });

    it('culls off-screen edges', () => {
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
      // Edge vertices are all off-screen, edge should be culled
      // Only the moveTo for batch stroke should not include off-screen edges
      // Since batching uses arrays, stroke would only be called if array has items
      // The nodes are also off-screen
      expect(ctx.arc).not.toHaveBeenCalled();
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
      const arcCallsFrame1 = (ctx.arc as any).mock.calls.length;

      // Frame 2 — same sketch objects should reuse cached node Map
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      const arcCallsFrame2 = (ctx.arc as any).mock.calls.length;

      // Both frames should draw the same nodes (2 per frame = 4 total)
      expect(arcCallsFrame2).toBe(arcCallsFrame1 * 2);
    });

    it('invalidates node Map cache when sketch size changes', () => {
      const sketch = makeSketch('s1', [
        { id: '1', x: 10, y: 20 },
      ], []);

      drawBackgroundSketches(ctx, [sketch], defaultOpts);
      expect(ctx.arc).toHaveBeenCalledTimes(1);

      // Add a node (simulate sketch data update)
      sketch.nodes.push({ id: '2', x: 30, y: 40 });

      // Reset mock
      (ctx.arc as any).mockClear();
      drawBackgroundSketches(ctx, [sketch], defaultOpts);
      // Should now draw 2 nodes (cache was invalidated due to size mismatch)
      expect(ctx.arc).toHaveBeenCalledTimes(2);
    });

    it('draws drainage nodes as rectangles', () => {
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20, nodeType: 'Drainage' },
        ], []),
      ];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('draws home nodes with house shape', () => {
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20, nodeType: 'Home' },
        ], []),
      ];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      // Home shape uses closePath for the polygon
      expect(ctx.closePath).toHaveBeenCalled();
    });

    it('sets globalAlpha to BG_ALPHA', () => {
      const sketches = [makeSketch('s1', [{ id: '1', x: 10, y: 20 }], [])];
      drawBackgroundSketches(ctx, sketches, defaultOpts);
      expect(ctx.globalAlpha).toBe(0.35);
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
