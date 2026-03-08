import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderPerf } from '../../src/utils/render-perf.js';

describe('RenderPerf', () => {
  beforeEach(() => {
    renderPerf.reset();
    renderPerf.enable();
  });

  afterEach(() => {
    renderPerf.disable();
    renderPerf.hideOverlay();
  });

  it('should track frame times', () => {
    renderPerf.frameStart();
    // Simulate some work
    const start = performance.now();
    while (performance.now() - start < 2) { /* spin */ }
    renderPerf.frameEnd();

    expect(renderPerf.avgFrameTime).toBeGreaterThan(0);
    expect(renderPerf.fps).toBeGreaterThan(0);
  });

  it('should record named stats', () => {
    renderPerf.record('visibleNodes', 42);
    renderPerf.record('visibleEdges', 100);

    const snapshot = renderPerf.getSnapshot();
    expect(snapshot.visibleNodes).toBe(42);
    expect(snapshot.visibleEdges).toBe(100);
  });

  it('should track cache hit rates', () => {
    renderPerf.cacheHit();
    renderPerf.cacheHit();
    renderPerf.cacheMiss();

    expect(renderPerf.cacheHitRate).toBeCloseTo(2 / 3, 2);
    const snapshot = renderPerf.getSnapshot();
    expect(snapshot.cacheHitRate).toBe(67);
  });

  it('should handle no frames gracefully', () => {
    expect(renderPerf.avgFrameTime).toBe(0);
    expect(renderPerf.maxFrameTime).toBe(0);
    expect(renderPerf.fps).toBe(0);
  });

  it('should handle no cache ops gracefully', () => {
    expect(renderPerf.cacheHitRate).toBe(0);
  });

  it('should reset all data', () => {
    renderPerf.frameStart();
    renderPerf.frameEnd();
    renderPerf.record('test', 1);
    renderPerf.cacheHit();

    renderPerf.reset();
    expect(renderPerf.avgFrameTime).toBe(0);
    expect(renderPerf.cacheHitRate).toBe(0);
    const snapshot = renderPerf.getSnapshot();
    expect(snapshot.test).toBeUndefined();
  });

  it('should not record when disabled', () => {
    renderPerf.disable();
    renderPerf.frameStart();
    renderPerf.frameEnd();
    renderPerf.record('x', 5);

    expect(renderPerf.avgFrameTime).toBe(0);
  });

  it('should track max frame time', () => {
    // Record multiple frames with varying durations
    for (let i = 0; i < 3; i++) {
      renderPerf.frameStart();
      const start = performance.now();
      const wait = i === 1 ? 3 : 1; // Middle frame takes longer
      while (performance.now() - start < wait) { /* spin */ }
      renderPerf.frameEnd();
    }

    expect(renderPerf.maxFrameTime).toBeGreaterThanOrEqual(renderPerf.avgFrameTime);
  });
});
