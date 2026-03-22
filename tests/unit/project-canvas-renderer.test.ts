/**
 * Unit tests for src/project/project-canvas-renderer.js
 *
 * The renderer uses an offscreen canvas cache: background sketches are
 * drawn once into an offscreen buffer and blitted to the main ctx via
 * drawImage(). The tests must mock OffscreenCanvas/getContext to verify
 * that rendering logic runs correctly.
 *
 * Covers:
 * - drawBackgroundSketches: empty/null input handling
 * - drawBackgroundSketches: offscreen canvas creation and cache invalidation
 * - drawBackgroundSketches: node drawing (circle, rectangle, house shape)
 * - drawBackgroundSketches: edge batching
 * - drawBackgroundSketches: alpha settings per sketch selection
 * - drawMergeModeOverlay: distance-squared optimization in closest-node search
 * - drawMergeModeOverlay: viewport culling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// ── Mock OffscreenCanvas to capture drawing calls ────────────────────────────

/** Create a mock 2D context that records all calls */
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
    strokeText: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    setLineDash: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
  } as unknown as CanvasRenderingContext2D;
}

// Track the offscreen context separately so we can inspect what was drawn to it
let _offscreenCtx: ReturnType<typeof createMockCtx>;

// Must set up OffscreenCanvas mock BEFORE importing the module under test
const _origOffscreen = (globalThis as any).OffscreenCanvas;
beforeEach(() => {
  _offscreenCtx = createMockCtx();
  (globalThis as any).OffscreenCanvas = class MockOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext() { return _offscreenCtx; }
  };
});

afterEach(() => {
  if (_origOffscreen) {
    (globalThis as any).OffscreenCanvas = _origOffscreen;
  } else {
    delete (globalThis as any).OffscreenCanvas;
  }
});

// We need a fresh module for each test to reset module-level cache vars
// Use dynamic import + vi.resetModules() pattern
async function freshImport() {
  vi.resetModules();
  const mod = await import('../../src/project/project-canvas-renderer.js');
  return mod;
}

import { isMergeModeEnabled, getNearbyNodes, getCrossMergeIssues } from '../../src/project/merge-mode.js';

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
  let mainCtx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    mainCtx = createMockCtx();
  });

  describe('drawBackgroundSketches()', () => {
    it('does nothing for empty sketches array', async () => {
      const { drawBackgroundSketches } = await freshImport();
      drawBackgroundSketches(mainCtx, [], defaultOpts);
      // No drawImage call — nothing to blit
      expect(mainCtx.drawImage).not.toHaveBeenCalled();
    });

    it('does nothing for null sketches', async () => {
      const { drawBackgroundSketches } = await freshImport();
      drawBackgroundSketches(mainCtx, null as any, defaultOpts);
      expect(mainCtx.drawImage).not.toHaveBeenCalled();
    });

    it('skips sketches with no nodes and no edges', async () => {
      const { drawBackgroundSketches } = await freshImport();
      const sketches = [makeSketch('empty', [], [])];
      drawBackgroundSketches(mainCtx, sketches, defaultOpts);
      // No nodes → bounding box is empty → no offscreen render → no drawImage
      expect(mainCtx.drawImage).not.toHaveBeenCalled();
    });

    it('draws nodes for non-empty sketches to offscreen canvas', async () => {
      const { drawBackgroundSketches } = await freshImport();
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20 },
          { id: '2', x: 30, y: 40 },
        ], []),
      ];
      drawBackgroundSketches(mainCtx, sketches, defaultOpts);
      // Should blit the offscreen canvas to main ctx
      expect(mainCtx.drawImage).toHaveBeenCalled();
      // Offscreen ctx should have arc calls for 2 nodes
      expect(_offscreenCtx.arc).toHaveBeenCalledTimes(2);
    });

    it('draws edges between connected nodes', async () => {
      const { drawBackgroundSketches } = await freshImport();
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20 },
          { id: '2', x: 30, y: 40 },
        ], [
          { tail: '1', head: '2' },
        ]),
      ];
      drawBackgroundSketches(mainCtx, sketches, defaultOpts);
      // Edges are drawn to offscreen ctx — should have moveTo/lineTo
      expect(_offscreenCtx.moveTo).toHaveBeenCalled();
      expect(_offscreenCtx.lineTo).toHaveBeenCalled();
    });

    it('caches offscreen canvas across frames with same parameters', async () => {
      const { drawBackgroundSketches } = await freshImport();
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20 },
          { id: '2', x: 30, y: 40 },
        ], [{ tail: '1', head: '2' }]),
      ];

      // Frame 1 — cache miss, renders to offscreen
      drawBackgroundSketches(mainCtx, sketches, defaultOpts);
      const arcCallsF1 = (_offscreenCtx.arc as any).mock.calls.length;
      expect(arcCallsF1).toBe(2);

      // Frame 2 — cache hit, should NOT re-render to offscreen
      drawBackgroundSketches(mainCtx, sketches, defaultOpts);
      const arcCallsF2 = (_offscreenCtx.arc as any).mock.calls.length;
      // Same count — no additional offscreen rendering
      expect(arcCallsF2).toBe(arcCallsF1);
      // But drawImage should be called again (blit cached)
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(2);
    });

    it('invalidates cache when sketch data changes', async () => {
      const { drawBackgroundSketches } = await freshImport();
      const sketch = makeSketch('s1', [{ id: '1', x: 10, y: 20 }], []);

      drawBackgroundSketches(mainCtx, [sketch], defaultOpts);
      const arcCallsF1 = (_offscreenCtx.arc as any).mock.calls.length;
      expect(arcCallsF1).toBe(1);

      // Add a node — changes totalNodes in cache key → invalidation
      sketch.nodes.push({ id: '2', x: 30, y: 40 });
      drawBackgroundSketches(mainCtx, [sketch], defaultOpts);
      const arcCallsF2 = (_offscreenCtx.arc as any).mock.calls.length;
      // Should have drawn 2 more nodes (1 original + 1 new)
      expect(arcCallsF2).toBe(arcCallsF1 + 2);
    });

    it('draws drainage nodes as rectangles', async () => {
      const { drawBackgroundSketches } = await freshImport();
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20, nodeType: 'Drainage' },
        ], []),
      ];
      drawBackgroundSketches(mainCtx, sketches, defaultOpts);
      expect(_offscreenCtx.fillRect).toHaveBeenCalled();
    });

    it('draws home nodes with house shape', async () => {
      const { drawBackgroundSketches } = await freshImport();
      const sketches = [
        makeSketch('s1', [
          { id: '1', x: 10, y: 20, nodeType: 'Home' },
        ], []),
      ];
      drawBackgroundSketches(mainCtx, sketches, defaultOpts);
      // Home shape uses closePath for the polygon
      expect(_offscreenCtx.closePath).toHaveBeenCalled();
    });

    it('sets globalAlpha per sketch', async () => {
      const { drawBackgroundSketches } = await freshImport();
      const sketches = [makeSketch('s1', [{ id: '1', x: 10, y: 20 }], [])];
      drawBackgroundSketches(mainCtx, sketches, defaultOpts);
      // BG_ALPHA = 0.5 (unselected)
      expect(_offscreenCtx.globalAlpha).toBe(0.5);
    });
  });

  describe('drawMergeModeOverlay()', () => {
    it('does nothing when merge mode is disabled', async () => {
      const { drawMergeModeOverlay } = await freshImport();
      (isMergeModeEnabled as any).mockReturnValue(false);
      drawMergeModeOverlay(mainCtx, [], defaultOpts);
      expect(mainCtx.save).not.toHaveBeenCalled();
    });

    it('does nothing when no nearby nodes', async () => {
      const { drawMergeModeOverlay } = await freshImport();
      (isMergeModeEnabled as any).mockReturnValue(true);
      (getNearbyNodes as any).mockReturnValue([]);
      drawMergeModeOverlay(mainCtx, [], defaultOpts);
      expect(mainCtx.save).not.toHaveBeenCalled();
    });

    it('draws nearby nodes when merge mode is enabled', async () => {
      const { drawMergeModeOverlay } = await freshImport();
      (isMergeModeEnabled as any).mockReturnValue(true);
      (getNearbyNodes as any).mockReturnValue([
        { sketchId: 's2', sketchName: 'Sketch 2', node: { id: '10', x: 50, y: 50 } },
      ]);
      (getCrossMergeIssues as any).mockReturnValue([]);

      const activeNodes = [{ id: '1', x: 100, y: 100 }];
      drawMergeModeOverlay(mainCtx, activeNodes, defaultOpts);

      // Should draw the nearby node (ring + body = 2 arc calls)
      expect(mainCtx.arc).toHaveBeenCalled();
      expect(mainCtx.save).toHaveBeenCalled();
    });

    it('draws connector lines from nearby to closest active node', async () => {
      const { drawMergeModeOverlay } = await freshImport();
      (isMergeModeEnabled as any).mockReturnValue(true);
      (getNearbyNodes as any).mockReturnValue([
        { sketchId: 's2', sketchName: 'S2', node: { id: '10', x: 50, y: 50 } },
      ]);
      (getCrossMergeIssues as any).mockReturnValue([]);

      const activeNodes = [
        { id: '1', x: 100, y: 100 },
        { id: '2', x: 200, y: 200 },
      ];
      drawMergeModeOverlay(mainCtx, activeNodes, defaultOpts);

      // Connector line should be drawn
      expect(mainCtx.moveTo).toHaveBeenCalled();
      expect(mainCtx.lineTo).toHaveBeenCalled();
    });

    it('uses distance-squared for closest-node search (no sqrt)', async () => {
      const { drawMergeModeOverlay } = await freshImport();
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
      drawMergeModeOverlay(mainCtx, activeNodes, defaultOpts);

      // The connector should go to the closer node (60,60)
      const lineToArgs = (mainCtx.lineTo as any).mock.calls;
      const hasCloseNode = lineToArgs.some(
        (args: number[]) => args[0] === 60 && args[1] === 60
      );
      expect(hasCloseNode).toBe(true);
    });

    it('culls off-screen nearby nodes', async () => {
      const { drawMergeModeOverlay } = await freshImport();
      (isMergeModeEnabled as any).mockReturnValue(true);
      (getNearbyNodes as any).mockReturnValue([
        { sketchId: 's2', sketchName: 'S2', node: { id: '10', x: 5000, y: 5000 } },
      ]);
      (getCrossMergeIssues as any).mockReturnValue([]);

      const activeNodes = [{ id: '1', x: 50, y: 50 }];
      const opts = { ...defaultOpts, visMinX: 0, visMinY: 0, visMaxX: 100, visMaxY: 100 };
      drawMergeModeOverlay(mainCtx, activeNodes, opts);

      // Node is off-screen — ring + body arcs should not be drawn
      const arcCalls = (mainCtx.arc as any).mock.calls.length;
      expect(arcCalls).toBe(0);
    });
  });
});
