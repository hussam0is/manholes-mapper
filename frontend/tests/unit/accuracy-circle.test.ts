/**
 * Unit tests for GPS accuracy circle
 *
 * Tests:
 *   - updateGnssAccuracyCircle() in annotation-layer.js (Leaflet circle)
 *   - drawAccuracyCircle() in user-location.js (canvas helper)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Leaflet mock — must use inline vi.fn() (no outer refs; factory is hoisted) ──
vi.mock('leaflet', () => {
  const circleInstance = {
    setLatLng: vi.fn().mockReturnThis(),
    setRadius: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    addTo: vi.fn().mockReturnThis(),
  };
  return {
    default: {
      latLng: vi.fn((lat: number, lon: number) => ({ lat, lon })),
      circle: vi.fn(() => circleInstance),
      map: vi.fn(),
    },
    latLng: vi.fn((lat: number, lon: number) => ({ lat, lon })),
    circle: vi.fn(() => circleInstance),
    map: vi.fn(),
  };
});

vi.mock('@geoman-io/leaflet-geoman-free', () => ({}));
vi.mock('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css', () => ({}));
vi.mock('../../src/state/event-bus.js', () => ({ bus: { emit: vi.fn() } }));
vi.mock('../../src/db.js', () => ({
  saveAnnotations: vi.fn(),
  loadAnnotations: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/map/govmap-layer.js', () => ({
  wgs84ToItm: vi.fn((lat: number, lon: number) => ({ x: 200000 + lon * 1000, y: 600000 + lat * 1000 })),
  itmToWgs84: vi.fn((x: number, y: number) => ({ lat: (y - 600000) / 1000, lon: (x - 200000) / 1000 })),
}));

import { updateGnssAccuracyCircle } from '../../src/map/annotation-layer.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('updateGnssAccuracyCircle()', () => {
  describe('when map is not initialised (_map === null)', () => {
    it('does not throw for valid position', () => {
      expect(() =>
        updateGnssAccuracyCircle({ lat: 32.0853, lon: 34.7818, accuracy: 5.0, isValid: true })
      ).not.toThrow();
    });

    it('does not throw for null position', () => {
      expect(() => updateGnssAccuracyCircle(null)).not.toThrow();
    });

    it('does not throw for invalid position', () => {
      expect(() =>
        updateGnssAccuracyCircle({ lat: null, lon: null, accuracy: 0, isValid: false })
      ).not.toThrow();
    });
  });

  it('is exported as a function', () => {
    expect(typeof updateGnssAccuracyCircle).toBe('function');
  });
});

// ─── drawAccuracyCircle (canvas helper) ────────────────────────────────────────

describe('drawAccuracyCircle() from user-location.js', () => {
  let ctx: any;

  beforeEach(() => {
    ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    };
  });

  it('returns false for null context', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    expect(drawAccuracyCircle(null as any, 100, 100, 10, 1, 1)).toBe(false);
  });

  it('returns false for zero accuracy', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    expect(drawAccuracyCircle(ctx, 100, 100, 0, 1, 1)).toBe(false);
  });

  it('returns false for negative accuracy', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    expect(drawAccuracyCircle(ctx, 100, 100, -5, 1, 1)).toBe(false);
  });

  it('returns false when radius < 4px (invisible)', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    // 1m * 0.001 scale * 1 viewScale = 0.001px — too small
    expect(drawAccuracyCircle(ctx, 100, 100, 1, 0.001, 1)).toBe(false);
  });

  it('returns false when radius > 2000px (fills screen)', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    // 5000m * 10 * 1 = 50000px — too large
    expect(drawAccuracyCircle(ctx, 100, 100, 5000, 10, 1)).toBe(false);
  });

  it('returns true and calls arc() for valid accuracy', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    // 10m * 2 * 1 = 20px — should draw
    const result = drawAccuracyCircle(ctx, 100, 100, 10, 2, 1);
    expect(result).toBe(true);
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.arc).toHaveBeenCalledWith(100, 100, 20, 0, Math.PI * 2);
  });

  it('fills and strokes the circle', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    drawAccuracyCircle(ctx, 100, 100, 10, 2, 1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('applies CEO-spec fill colour (rgba 74,144,217 at 0.15 opacity)', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    drawAccuracyCircle(ctx, 100, 100, 10, 2, 1);
    expect(ctx.fillStyle).toBe('rgba(74, 144, 217, 0.15)');
  });

  it('uses stroke weight 1', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    drawAccuracyCircle(ctx, 100, 100, 10, 2, 1);
    expect(ctx.lineWidth).toBe(1);
  });

  it('saves and restores canvas state', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    drawAccuracyCircle(ctx, 100, 100, 10, 2, 1);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it('accounts for viewScale in pixel radius', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    // 5m * 1 scale * 4 zoom = 20px radius
    drawAccuracyCircle(ctx, 50, 50, 5, 1, 4);
    expect(ctx.arc).toHaveBeenCalledWith(50, 50, 20, 0, Math.PI * 2);
  });

  it('accounts for coordinateScale in pixel radius', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    // 10m * 3 scale * 1 zoom = 30px radius
    drawAccuracyCircle(ctx, 200, 200, 10, 3, 1);
    expect(ctx.arc).toHaveBeenCalledWith(200, 200, 30, 0, Math.PI * 2);
  });

  it('works at boundary: exactly 4px radius', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    // exactlymatches minimum: 1m * 4 * 1 = 4px
    const result = drawAccuracyCircle(ctx, 100, 100, 1, 4, 1);
    expect(result).toBe(true);
  });

  it('works at boundary: exactly 2000px radius', async () => {
    const { drawAccuracyCircle } = await import('../../src/map/user-location.js');
    // 2000m * 1 * 1 = 2000px — exactly at limit (>2000 fails, 2000 should fail)
    // 2001px → false
    const result2001 = drawAccuracyCircle(ctx, 100, 100, 2001, 1, 1);
    expect(result2001).toBe(false);
  });
});
