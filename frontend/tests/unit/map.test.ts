/**
 * Unit tests for createAccuracyCircle() in user-location.js — the
 * Leaflet-based GPS accuracy circle factory.
 *
 * Complements accuracy-circle.test.ts, which covers the canvas helper
 * (drawAccuracyCircle) and the annotation-layer circle updater.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Leaflet mock — must use inline vi.fn() (no outer refs; factory is hoisted) ──
vi.mock('leaflet', () => {
  const circleInstance = {
    addTo: vi.fn().mockReturnThis(),
    bindPopup: vi.fn().mockReturnThis(),
    openPopup: vi.fn().mockReturnThis(),
    setLatLng: vi.fn().mockReturnThis(),
    setRadius: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  };
  return {
    default: {
      circle: vi.fn(() => circleInstance),
      latLng: vi.fn((lat: number, lon: number) => ({ lat, lon })),
      map: vi.fn(),
    },
    circle: vi.fn(() => circleInstance),
    latLng: vi.fn((lat: number, lon: number) => ({ lat, lon })),
    map: vi.fn(),
  };
});

vi.mock('../../src/map/govmap-layer.js', () => ({
  wgs84ToItm: vi.fn((lat: number, lon: number) => ({ x: 200000 + lon * 1000, y: 600000 + lat * 1000 })),
  itmToWgs84: vi.fn((x: number, y: number) => ({ lat: (y - 600000) / 1000, lon: (x - 200000) / 1000 })),
}));

import L from 'leaflet';
import { createAccuracyCircle } from '../../src/map/user-location.js';

const mapStub = { fake: 'map' } as any;
const latlng = { lat: 32.0853, lng: 34.7818 };

describe('createAccuracyCircle()', () => {
  beforeEach(() => {
    // The mock factory returns a single shared circle instance — clear its
    // call history too, not just L.circle itself.
    vi.clearAllMocks();
  });

  it('returns null when map is missing', () => {
    expect(createAccuracyCircle(null, latlng, 5)).toBeNull();
    expect(L.circle).not.toHaveBeenCalled();
  });

  it('returns null for zero accuracy', () => {
    expect(createAccuracyCircle(mapStub, latlng, 0)).toBeNull();
  });

  it('returns null for negative accuracy', () => {
    expect(createAccuracyCircle(mapStub, latlng, -3)).toBeNull();
  });

  it('returns null for null accuracy', () => {
    expect(createAccuracyCircle(mapStub, latlng, null)).toBeNull();
  });

  it('creates a circle with radius equal to accuracy in meters', () => {
    const circle = createAccuracyCircle(mapStub, latlng, 5);
    expect(circle).not.toBeNull();
    expect(L.circle).toHaveBeenCalledTimes(1);
    const [passedLatlng, opts] = vi.mocked(L.circle).mock.calls[0] as any[];
    expect(passedLatlng).toEqual(latlng);
    expect(opts.radius).toBe(5);
  });

  it('applies default styling (blue, weight 2, 0.15 fill opacity)', () => {
    createAccuracyCircle(mapStub, latlng, 10);
    const opts = (vi.mocked(L.circle).mock.calls[0] as any[])[1];
    expect(opts.color).toBe('blue');
    expect(opts.weight).toBe(2);
    expect(opts.fillOpacity).toBe(0.15);
    expect(opts.fillColor).toBe('rgba(74, 144, 217, 0.15)');
  });

  it('honors option overrides', () => {
    createAccuracyCircle(mapStub, latlng, 10, { color: 'red', weight: 3 });
    const opts = (vi.mocked(L.circle).mock.calls[0] as any[])[1];
    expect(opts.color).toBe('red');
    expect(opts.weight).toBe(3);
  });

  it('adds the circle to the map', () => {
    const circle = createAccuracyCircle(mapStub, latlng, 7) as any;
    expect(circle.addTo).toHaveBeenCalledWith(mapStub);
  });

  it('binds and opens a popup showing the accuracy in meters', () => {
    const circle = createAccuracyCircle(mapStub, latlng, 7) as any;
    expect(circle.bindPopup).toHaveBeenCalledTimes(1);
    const popupHtml = circle.bindPopup.mock.calls[0][0] as string;
    expect(popupHtml).toContain('7');
    expect(popupHtml.toLowerCase()).toContain('accuracy');
    expect(circle.openPopup).toHaveBeenCalledTimes(1);
  });
});
