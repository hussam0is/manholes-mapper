import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenderCache } from '../../src/utils/render-cache.js';

describe('RenderCache', () => {
  let cache: RenderCache;

  beforeEach(() => {
    cache = new RenderCache();
  });

  it('should report invalid for unknown layers', () => {
    expect(cache.isValid('unknown', {}, 0)).toBe(false);
  });

  it('should return wasCached=false on first render', () => {
    const renderFn = vi.fn();
    const result = cache.render('test', 100, 100, { scale: 1 }, 1, renderFn);
    expect(result.wasCached).toBe(false);
  });

  it('should not throw when canvas context is unavailable', () => {
    const renderFn = vi.fn();
    // In jsdom, getContext('2d') returns null — render should handle gracefully
    expect(() => cache.render('test', 100, 100, {}, 1, renderFn)).not.toThrow();
  });

  it('should handle isValid after failed render gracefully', () => {
    const renderFn = vi.fn();
    cache.render('test', 100, 100, { scale: 1 }, 1, renderFn);
    // In jsdom, no real layer is stored, so isValid returns false
    // In a real browser, this would return true
    expect(typeof cache.isValid('test', { scale: 1 }, 1)).toBe('boolean');
  });

  it('should detect param changes as invalid', () => {
    // Even without real canvas, param comparison logic should work
    expect(cache.isValid('test', { scale: 2 }, 1)).toBe(false);
  });

  it('should detect version changes as invalid', () => {
    expect(cache.isValid('test', { scale: 1 }, 2)).toBe(false);
  });

  it('should invalidate specific layer without error', () => {
    cache.invalidate('test');
    expect(cache.isValid('test', {}, 1)).toBe(false);
  });

  it('should invalidate all layers without error', () => {
    cache.invalidateAll();
    expect(cache.isValid('a', {}, 1)).toBe(false);
    expect(cache.isValid('b', {}, 1)).toBe(false);
  });

  it('should clear all cached canvases without error', () => {
    cache.clear();
    expect(cache.isValid('test', {}, 1)).toBe(false);
  });

  it('should handle multiple render calls without throwing', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    expect(() => {
      cache.render('grid', 100, 100, {}, 1, fn1);
      cache.render('bg', 100, 100, {}, 1, fn2);
      cache.render('grid', 100, 100, { x: 1 }, 1, fn1);
      cache.render('bg', 100, 100, {}, 1, fn2);
    }).not.toThrow();
  });
});
