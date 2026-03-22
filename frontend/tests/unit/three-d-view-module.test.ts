/**
 * Unit tests for src/three-d/three-d-view.js
 *
 * Tests the computeLabelVisibility export (pure function).
 * The open3DView function requires full browser + Three.js and is covered
 * by integration/E2E tests.
 */
import { describe, it, expect } from 'vitest';

import { computeLabelVisibility } from '../../src/three-d/three-d-view.js';

describe('computeLabelVisibility', () => {
  it('hides labels beyond 120 units', () => {
    const result = computeLabelVisibility(121);
    expect(result.display).toBe('none');
    expect(result.opacity).toBe('0');
  });

  it('hides labels at exactly 120 units', () => {
    // > 120 check means 120 itself is NOT hidden — it falls through to the next range
    const result = computeLabelVisibility(120);
    expect(result.display).not.toBe('none');
  });

  it('fades labels between 60 and 120 units', () => {
    const result = computeLabelVisibility(90);
    expect(result.display).toBe('');
    const opacity = parseFloat(result.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    expect(result.fontSize).toBe('9px');
  });

  it('opacity at 60 is 1 (boundary)', () => {
    const result = computeLabelVisibility(60);
    // dist > 60 is false, so this goes to the else branch
    expect(result.opacity).toBe('1');
  });

  it('shows labels fully at close distance', () => {
    const result = computeLabelVisibility(20);
    expect(result.display).toBe('');
    expect(result.opacity).toBe('1');
    expect(result.fontSize).toBe('13px');
  });

  it('uses smaller font at medium distance (30-60)', () => {
    const result = computeLabelVisibility(45);
    expect(result.fontSize).toBe('11px');
  });

  it('uses larger font at close distance (<30)', () => {
    const result = computeLabelVisibility(10);
    expect(result.fontSize).toBe('13px');
  });

  it('handles zero distance', () => {
    const result = computeLabelVisibility(0);
    expect(result.display).toBe('');
    expect(result.opacity).toBe('1');
    expect(result.fontSize).toBe('13px');
  });

  it('handles very large distance', () => {
    const result = computeLabelVisibility(1000);
    expect(result.display).toBe('none');
  });

  it('fade is linear between 60 and 120', () => {
    // At dist=90 (midpoint), opacity should be 0.5
    const mid = computeLabelVisibility(90);
    expect(parseFloat(mid.opacity)).toBeCloseTo(0.5, 1);
  });
});
