/**
 * Unit tests for computeEdgeLengthAngle helper in canvas-draw.js
 *
 * Covers:
 * - Correct metre conversion via coordinateScale
 * - Bearing from North (surveying convention)
 * - Cardinal directions (N, E, S, W)
 * - Diagonal bearings (NE, SE, SW, NW)
 * - Edge cases: zero length, zero coordinateScale
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ── Mock all heavy DOM and module dependencies before importing canvas-draw ──

// window.matchMedia (not available in jsdom)
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

vi.mock('../../src/legacy/shared-state.js', () => ({
  S: new Proxy({}, { get: () => undefined, set: () => true }),
  F: new Proxy({}, { get: () => () => {} }),
}));

vi.mock('../../src/state/constants.js', () => ({
  NODE_RADIUS: 16,
  COLORS: { edge: { preview: '#888', label: '#000', labelStroke: '#fff', selected: '#6d28d9', fallIconBg: '#fff', fallIconStroke: '#ccc', fallIconFallback: '#eee', fallIconText: '#333' }, node: { label: '#000' } },
  EDGE_TYPE_COLORS: {},
}));

vi.mock('../../src/gnss/index.js', () => ({
  drawGnssMarker: vi.fn(),
  gnssState: null,
}));

vi.mock('../../src/map/govmap-layer.js', () => ({
  wgs84ToItm: vi.fn((lat: number, lon: number) => ({ x: 200000 + lon * 1000, y: 600000 + lat * 1000 })),
  getMapReferencePoint: vi.fn(() => null),
  drawMapTiles: vi.fn(),
  drawMapAttribution: vi.fn(),
}));

vi.mock('../../src/features/drawing-primitives.js', () => ({
  drawHouse: vi.fn(),
  drawDirectConnectionBadge: vi.fn(),
}));

vi.mock('../../src/features/rendering.js', () => ({
  drawInfiniteGrid: vi.fn(),
  renderEdgeLegend: vi.fn(),
  drawEdge: vi.fn(),
}));

vi.mock('../../src/features/node-icons.js', () => ({
  drawNodeIcon: vi.fn(),
}));

vi.mock('../../src/utils/label-collision.js', () => ({
  processLabels: vi.fn(() => []),
}));

vi.mock('../../src/utils/spatial-grid.js', () => ({
  buildNodeGrid: vi.fn(() => null),
  buildEdgeGrid: vi.fn(() => null),
}));

vi.mock('../../src/utils/render-perf.js', () => ({
  renderPerf: { frameStart: vi.fn(), frameEnd: vi.fn(), record: vi.fn() },
}));

vi.mock('../../src/utils/progressive-renderer.js', () => ({
  progressiveRenderer: { begin: vi.fn(), hasMore: vi.fn(() => false), next: vi.fn(), overBudget: vi.fn(() => false), finish: vi.fn(), isComplete: true },
}));

vi.mock('../../src/map/reference-layers.js', () => ({
  drawReferenceLayers: vi.fn(),
}));

vi.mock('../../src/project/project-canvas-renderer.js', () => ({
  drawBackgroundSketches: vi.fn(),
  drawMergeModeOverlay: vi.fn(),
}));

vi.mock('../../src/project/issue-highlight.js', () => ({
  drawIssueHighlight: vi.fn(),
}));

vi.mock('../../src/utils/device-perf.js', () => ({
  getEffectiveDpr: vi.fn(() => 1),
  getFrameBudgetMs: vi.fn(() => 16),
}));

// canvas-draw.js has deep DOM/canvas dependencies; import only the pure helper
// via a targeted named import to keep the test fast and side-effect-free.
import { computeEdgeLengthAngle } from '../../src/legacy/canvas-draw.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Round to a given number of decimal places.
 */
function r(v: number, dp = 2): number {
  return Math.round(v * 10 ** dp) / 10 ** dp;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeEdgeLengthAngle', () => {
  const SCALE = 10; // 10 pixels per metre → 1 pixel = 0.1 m

  // ── null / guard cases ─────────────────────────────────────────────────────

  it('returns null when coordinateScale is 0', () => {
    expect(computeEdgeLengthAngle(0, 0, 100, 100, 0)).toBeNull();
  });

  it('returns null when coordinateScale is negative', () => {
    expect(computeEdgeLengthAngle(0, 0, 100, 100, -5)).toBeNull();
  });

  it('returns null when segment has zero length', () => {
    expect(computeEdgeLengthAngle(50, 50, 50, 50, SCALE)).toBeNull();
  });

  // ── Length conversion ──────────────────────────────────────────────────────

  it('converts pixel length to metres correctly (horizontal)', () => {
    // 50px / 10px-per-m = 5 m
    const result = computeEdgeLengthAngle(0, 0, 50, 0, SCALE);
    expect(result).not.toBeNull();
    expect(r(result!.lengthMeters)).toBe(5.00);
  });

  it('converts pixel length to metres correctly (vertical)', () => {
    // 30px / 10px-per-m = 3 m
    const result = computeEdgeLengthAngle(0, 0, 0, 30, SCALE);
    expect(result).not.toBeNull();
    expect(r(result!.lengthMeters)).toBe(3.00);
  });

  it('converts pixel length to metres correctly (diagonal 3-4-5)', () => {
    // 30px east, 40px south → hypotenuse = 50px → 5 m
    const result = computeEdgeLengthAngle(0, 0, 30, 40, SCALE);
    expect(result).not.toBeNull();
    expect(r(result!.lengthMeters)).toBe(5.00);
  });

  // ── Cardinal bearing directions ────────────────────────────────────────────
  //
  // Canvas Y increases downward, so:
  //   North  = dy < 0 (moving up)   → bearing 0°
  //   East   = dx > 0               → bearing 90°
  //   South  = dy > 0 (moving down) → bearing 180°
  //   West   = dx < 0               → bearing 270°

  it('bearing is 0° (North) when moving straight up', () => {
    const result = computeEdgeLengthAngle(0, 100, 0, 0, SCALE); // dy = -100
    expect(result).not.toBeNull();
    expect(r(result!.bearingDeg, 1)).toBe(0.0);
  });

  it('bearing is 90° (East) when moving straight right', () => {
    const result = computeEdgeLengthAngle(0, 0, 100, 0, SCALE); // dx = +100
    expect(result).not.toBeNull();
    expect(r(result!.bearingDeg, 1)).toBe(90.0);
  });

  it('bearing is 180° (South) when moving straight down', () => {
    const result = computeEdgeLengthAngle(0, 0, 0, 100, SCALE); // dy = +100
    expect(result).not.toBeNull();
    expect(r(result!.bearingDeg, 1)).toBe(180.0);
  });

  it('bearing is 270° (West) when moving straight left', () => {
    const result = computeEdgeLengthAngle(100, 0, 0, 0, SCALE); // dx = -100
    expect(result).not.toBeNull();
    expect(r(result!.bearingDeg, 1)).toBe(270.0);
  });

  // ── Diagonal bearings ──────────────────────────────────────────────────────

  it('bearing is 45° (NE) for equal dx and -dy', () => {
    // dx = +1, dy = -1 → NE diagonal
    const result = computeEdgeLengthAngle(0, 100, 100, 0, SCALE);
    expect(result).not.toBeNull();
    expect(r(result!.bearingDeg, 1)).toBe(45.0);
  });

  it('bearing is 135° (SE) for equal dx and dy', () => {
    // dx = +1, dy = +1
    const result = computeEdgeLengthAngle(0, 0, 100, 100, SCALE);
    expect(result).not.toBeNull();
    expect(r(result!.bearingDeg, 1)).toBe(135.0);
  });

  it('bearing is 225° (SW) for equal -dx and dy', () => {
    // dx = -1, dy = +1
    const result = computeEdgeLengthAngle(100, 0, 0, 100, SCALE);
    expect(result).not.toBeNull();
    expect(r(result!.bearingDeg, 1)).toBe(225.0);
  });

  it('bearing is 315° (NW) for equal -dx and -dy', () => {
    // dx = -1, dy = -1
    const result = computeEdgeLengthAngle(100, 100, 0, 0, SCALE);
    expect(result).not.toBeNull();
    expect(r(result!.bearingDeg, 1)).toBe(315.0);
  });

  // ── Bearing is always in [0, 360) ──────────────────────────────────────────

  it('bearing is never negative', () => {
    for (let angle = 0; angle < 360; angle += 15) {
      const rad = angle * Math.PI / 180;
      const result = computeEdgeLengthAngle(0, 0, Math.cos(rad) * 50, Math.sin(rad) * 50, SCALE);
      if (result !== null) {
        expect(result.bearingDeg).toBeGreaterThanOrEqual(0);
        expect(result.bearingDeg).toBeLessThan(360);
      }
    }
  });

  // ── Different coordinateScales ─────────────────────────────────────────────

  it('respects a high coordinateScale (cm precision)', () => {
    // 100px / 100 = 1 m
    const result = computeEdgeLengthAngle(0, 0, 100, 0, 100);
    expect(result).not.toBeNull();
    expect(r(result!.lengthMeters, 4)).toBe(1.0);
  });

  it('respects a low coordinateScale (large-scale view)', () => {
    // 100px / 1 = 100 m
    const result = computeEdgeLengthAngle(0, 0, 100, 0, 1);
    expect(result).not.toBeNull();
    expect(r(result!.lengthMeters)).toBe(100.0);
  });

  // ── Return object structure ────────────────────────────────────────────────

  it('returns an object with lengthMeters and bearingDeg', () => {
    const result = computeEdgeLengthAngle(0, 0, 30, 40, SCALE);
    expect(result).toHaveProperty('lengthMeters');
    expect(result).toHaveProperty('bearingDeg');
    expect(typeof result!.lengthMeters).toBe('number');
    expect(typeof result!.bearingDeg).toBe('number');
  });
});
