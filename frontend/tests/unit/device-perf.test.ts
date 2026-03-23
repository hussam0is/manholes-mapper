/**
 * Unit tests for src/utils/device-perf.js
 *
 * Tests DPR capping, haptic throttling, frame budget adaptation,
 * and device tier detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Need fresh module per test to reset cached tier
async function freshImport() {
  vi.resetModules();
  return await import('../../src/utils/device-perf.js');
}

describe('device-perf', () => {
  const origDpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  const origNavigator = Object.getOwnPropertyDescriptor(window, 'navigator');

  afterEach(() => {
    // Restore devicePixelRatio
    if (origDpr) {
      Object.defineProperty(window, 'devicePixelRatio', origDpr);
    } else {
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true, configurable: true });
    }
    vi.restoreAllMocks();
  });

  describe('getEffectiveDpr()', () => {
    it('returns raw DPR on desktop (high tier)', async () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2.0, writable: true, configurable: true });
      const { getEffectiveDpr, getDeviceTier } = await freshImport();
      // jsdom has no Android UA, so tier = 'high'
      expect(getDeviceTier()).toBe('high');
      expect(getEffectiveDpr()).toBe(2.0);
    });

    it('caps DPR when maxDpr override is provided', async () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 3.0, writable: true, configurable: true });
      const { getEffectiveDpr } = await freshImport();
      expect(getEffectiveDpr(2.0)).toBe(2.0);
    });

    it('does not increase DPR above raw value', async () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 1.5, writable: true, configurable: true });
      const { getEffectiveDpr } = await freshImport();
      expect(getEffectiveDpr(3.0)).toBe(1.5);
    });

    it('returns 1 when devicePixelRatio is not set', async () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: undefined, writable: true, configurable: true });
      const { getEffectiveDpr } = await freshImport();
      expect(getEffectiveDpr()).toBe(1);
    });
  });

  describe('throttledVibrate()', () => {
    it('calls navigator.vibrate on first call', async () => {
      const vibrateMock = vi.fn(() => true);
      Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, writable: true, configurable: true });
      const { throttledVibrate } = await freshImport();
      expect(throttledVibrate(15)).toBe(true);
      expect(vibrateMock).toHaveBeenCalledWith(15);
    });

    it('throttles rapid successive calls', async () => {
      const vibrateMock = vi.fn(() => true);
      Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, writable: true, configurable: true });
      const { throttledVibrate } = await freshImport();
      throttledVibrate(15);
      // Immediate second call should be suppressed
      const result = throttledVibrate(15);
      expect(result).toBe(false);
      expect(vibrateMock).toHaveBeenCalledTimes(1);
    });

    it('returns false when navigator.vibrate is unavailable', async () => {
      Object.defineProperty(navigator, 'vibrate', { value: undefined, writable: true, configurable: true });
      const { throttledVibrate } = await freshImport();
      expect(throttledVibrate(15)).toBe(false);
    });
  });

  describe('getFrameBudgetMs()', () => {
    it('returns a positive number', async () => {
      const { getFrameBudgetMs } = await freshImport();
      const budget = getFrameBudgetMs();
      expect(budget).toBeGreaterThan(0);
      expect(budget).toBeLessThanOrEqual(16);
    });
  });

  describe('getDeviceTier()', () => {
    it('returns high for desktop (no Android/iPhone in UA)', async () => {
      const { getDeviceTier } = await freshImport();
      expect(getDeviceTier()).toBe('high');
    });

    it('caches the result', async () => {
      const { getDeviceTier } = await freshImport();
      const t1 = getDeviceTier();
      const t2 = getDeviceTier();
      expect(t1).toBe(t2);
    });
  });

  describe('resizeCanvasForDevice()', () => {
    it('sets canvas dimensions based on effective DPR', async () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2.0, writable: true, configurable: true });
      const { resizeCanvasForDevice } = await freshImport();
      const canvas = document.createElement('canvas');
      const result = resizeCanvasForDevice(canvas, 400, 300);
      expect(result.dpr).toBe(2.0); // high tier → no cap
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
      expect(canvas.style.width).toBe('400px');
      expect(canvas.style.height).toBe('300px');
    });

    it('applies ctx scale when provided', async () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2.0, writable: true, configurable: true });
      const { resizeCanvasForDevice } = await freshImport();
      const canvas = document.createElement('canvas');
      const ctx = { setTransform: vi.fn() } as any;
      resizeCanvasForDevice(canvas, 400, 300, ctx);
      expect(ctx.setTransform).toHaveBeenCalledWith(2.0, 0, 0, 2.0, 0, 0);
    });
  });
});
