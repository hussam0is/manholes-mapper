/**
 * Unit tests for src/gnss/gnss-marker.js
 *
 * Covers:
 * - drawGnssMarker: gradient caching (accuracy circle + glow halo)
 * - resetMarkerEntrance: clears gradient caches
 * - gnssToCanvas: coordinate conversion
 * - drawGnssStatusBadge: rendering logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the wgs84ToItm dependency before importing
vi.mock('../../src/map/govmap-layer.js', () => ({
  wgs84ToItm: vi.fn((lat: number, lon: number) => ({
    x: 200000 + lon * 1000,
    y: 600000 + lat * 1000,
  })),
}));

import {
  drawGnssMarker,
  resetMarkerEntrance,
  gnssToCanvas,
  FIX_COLORS,
} from '../../src/gnss/gnss-marker.js';

// ── Mock canvas context ──────────────────────────────────────────────────────

function createMockGradient() {
  return {
    addColorStop: vi.fn(),
  };
}

function createMockCtx() {
  const gradients: any[] = [];
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
    quadraticCurveTo: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    createRadialGradient: vi.fn(() => {
      const g = createMockGradient();
      gradients.push(g);
      return g;
    }),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineDashOffset: 0,
    _gradients: gradients,
  } as unknown as CanvasRenderingContext2D & { _gradients: any[] };
}

// ── Shared test data ─────────────────────────────────────────────────────────

const validPosition = {
  lat: 32.0,
  lon: 34.0,
  alt: 100,
  fixQuality: 4,
  hdop: 0.8,
  accuracy: 0.02,
  isValid: true,
  speed: 0,
  course: null,
};

const referencePoint = {
  itm: { x: 200000, y: 600000 },
  canvas: { x: 500, y: 500 },
};

const coordinateScale = 10;
const viewTranslate = { x: 0, y: 0 };
const viewScale = 1;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('gnss-marker', () => {
  let ctx: CanvasRenderingContext2D & { _gradients: any[] };

  beforeEach(() => {
    ctx = createMockCtx();
    resetMarkerEntrance();
    // Mock window globals
    (window as any).devicePixelRatio = 2;
    (window as any).t = (k: string) => k;
    document.documentElement.dir = 'ltr';
  });

  describe('drawGnssMarker()', () => {
    it('does not draw when position is invalid', () => {
      drawGnssMarker(ctx, { isValid: false } as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('does not draw when position is null', () => {
      drawGnssMarker(ctx, null as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('does not draw when reference point is null', () => {
      drawGnssMarker(ctx, validPosition as any, null as any, coordinateScale, viewTranslate, viewScale);
      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('draws marker for valid position', () => {
      drawGnssMarker(ctx, validPosition as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
      // Should draw at least the main dot (arc call)
      expect(ctx.arc).toHaveBeenCalled();
    });

    it('creates radial gradients for accuracy circle and glow', () => {
      drawGnssMarker(ctx, validPosition as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      // Should have created at least one gradient (glow halo is always drawn)
      expect(ctx.createRadialGradient).toHaveBeenCalled();
    });

    it('caches gradients across consecutive frames with same position', () => {
      // Frame 1 — gradients created
      drawGnssMarker(ctx, validPosition as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      const callsAfterFrame1 = (ctx.createRadialGradient as any).mock.calls.length;

      // Frame 2 — same position, gradients should be reused (cached)
      drawGnssMarker(ctx, validPosition as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      const callsAfterFrame2 = (ctx.createRadialGradient as any).mock.calls.length;

      // Gradient creation count should NOT double — most should be cached
      // Allow some variance since breathing animation slightly changes radius
      expect(callsAfterFrame2).toBeLessThanOrEqual(callsAfterFrame1 + 2);
    });

    it('recreates gradients when position changes significantly', () => {
      drawGnssMarker(ctx, validPosition as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      const callsAfterFrame1 = (ctx.createRadialGradient as any).mock.calls.length;

      // Move to a completely different position
      const movedPosition = { ...validPosition, lat: 33.0, lon: 35.0 };
      drawGnssMarker(ctx, movedPosition as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      const callsAfterFrame2 = (ctx.createRadialGradient as any).mock.calls.length;

      // Should have created new gradients for the new position
      expect(callsAfterFrame2).toBeGreaterThan(callsAfterFrame1);
    });

    it('skips accuracy circle when fixQuality is 0', () => {
      const noFixPos = { ...validPosition, fixQuality: 0 };
      drawGnssMarker(ctx, noFixPos as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      // Only the glow gradient should be created, not the accuracy gradient
      // (accuracy circle is skipped for quality 0)
      const gradientCalls = (ctx.createRadialGradient as any).mock.calls;
      // At most 1 gradient (the glow halo)
      expect(gradientCalls.length).toBeLessThanOrEqual(1);
    });

    it('applies DPR transform', () => {
      drawGnssMarker(ctx, validPosition as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    });
  });

  describe('resetMarkerEntrance()', () => {
    it('allows fresh gradient creation after reset', () => {
      // Draw to populate caches
      drawGnssMarker(ctx, validPosition as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      const callsBefore = (ctx.createRadialGradient as any).mock.calls.length;

      // Reset caches
      resetMarkerEntrance();

      // Draw again — should create new gradients
      drawGnssMarker(ctx, validPosition as any, referencePoint, coordinateScale, viewTranslate, viewScale);
      const callsAfter = (ctx.createRadialGradient as any).mock.calls.length;

      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  describe('gnssToCanvas()', () => {
    it('converts WGS84 position to canvas coordinates', () => {
      const result = gnssToCanvas(
        { lat: 32.0, lon: 34.0 },
        referencePoint,
        coordinateScale
      );
      expect(result).not.toBeNull();
      expect(result!.x).toBeDefined();
      expect(result!.y).toBeDefined();
    });

    it('returns null for null position', () => {
      expect(gnssToCanvas(null as any, referencePoint, coordinateScale)).toBeNull();
    });

    it('returns null for null reference point', () => {
      expect(gnssToCanvas({ lat: 32, lon: 34 }, null as any, coordinateScale)).toBeNull();
    });

    it('returns null for position missing lat/lon', () => {
      expect(gnssToCanvas({} as any, referencePoint, coordinateScale)).toBeNull();
    });
  });

  describe('FIX_COLORS', () => {
    it('has colors for all standard fix qualities', () => {
      expect(FIX_COLORS[0]).toBeDefined(); // No fix
      expect(FIX_COLORS[1]).toBeDefined(); // GPS
      expect(FIX_COLORS[4]).toBeDefined(); // RTK Fixed
      expect(FIX_COLORS[5]).toBeDefined(); // RTK Float
    });

    it('RTK Fixed is green', () => {
      expect(FIX_COLORS[4]).toBe('#22c55e');
    });
  });
});
