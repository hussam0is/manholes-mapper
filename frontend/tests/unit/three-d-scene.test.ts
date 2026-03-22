/**
 * Unit tests for src/three-d/three-d-scene.js
 *
 * Tests pure/exported functions: parseNum, getNodeXZ, getNodeDepth, computeBounds.
 * Also tests buildScene with a mocked Three.js to verify mesh creation logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  parseNum,
  getNodeXZ,
  getNodeDepth,
  computeBounds,
  buildScene,
  DEFAULT_DEPTH,
  DEFAULT_PIPE_DEPTH,
  DEFAULT_PIPE_DIAMETER_MM,
  DEFAULT_COVER_DIAMETER_CM,
  SHAFT_WALL_THICKNESS,
  COVER_HEIGHT,
  MANHOLE_SEGMENTS,
  PIPE_RADIAL_SEGMENTS,
  PIPE_TUBULAR_SEGMENTS,
} from '../../src/three-d/three-d-scene.js';

// ─── parseNum ──────────────────────────────────────────────────────────────

describe('parseNum', () => {
  it('parses valid positive numbers', () => {
    expect(parseNum('3.5', 1)).toBe(3.5);
    expect(parseNum(7, 1)).toBe(7);
    expect(parseNum('200', 0)).toBe(200);
  });

  it('returns fallback for null/undefined/empty', () => {
    expect(parseNum(null, 42)).toBe(42);
    expect(parseNum(undefined, 42)).toBe(42);
    expect(parseNum('', 10)).toBe(10);
  });

  it('returns fallback for non-numeric strings', () => {
    expect(parseNum('abc', 5)).toBe(5);
  });

  it('returns fallback for zero and negative values', () => {
    expect(parseNum(0, 99)).toBe(99);
    expect(parseNum(-5, 99)).toBe(99);
    expect(parseNum('0', 99)).toBe(99);
  });
});

// ─── getNodeXZ ─────────────────────────────────────────────────────────────

describe('getNodeXZ', () => {
  it('prefers surveyX/Y when available', () => {
    const node = { surveyX: 100, surveyY: 200, manual_x: 50, manual_y: 60, x: 10, y: 20 };
    const result = getNodeXZ(node, null, 50);
    expect(result.itmX).toBe(100);
    expect(result.itmY).toBe(200);
  });

  it('falls back to manual_x/y when no survey', () => {
    const node = { manual_x: 50, manual_y: 60, x: 10, y: 20 };
    const result = getNodeXZ(node, null, 50);
    expect(result.itmX).toBe(50);
    expect(result.itmY).toBe(60);
  });

  it('computes from canvas + reference point', () => {
    const node = { x: 110, y: 120 };
    const ref = { itm: { x: 1000, y: 2000 }, canvas: { x: 100, y: 100 } };
    const result = getNodeXZ(node, ref, 50);
    expect(result.itmX).toBeCloseTo(1000 + 10 / 50);
    expect(result.itmY).toBeCloseTo(2000 - 20 / 50);
  });

  it('uses raw canvas / coordScale when no ref', () => {
    const node = { x: 500, y: 1000 };
    const result = getNodeXZ(node, null, 50);
    expect(result.itmX).toBe(10);
    expect(result.itmY).toBe(20);
  });
});

// ─── getNodeDepth ──────────────────────────────────────────────────────────

describe('getNodeDepth', () => {
  it('returns default depth when no edges', () => {
    const result = getNodeDepth('1', []);
    expect(result.depth).toBe(DEFAULT_DEPTH);
    expect(result.isEstimated).toBe(true);
  });

  it('returns max measurement + 0.3 when edges have measurements', () => {
    const edges = [
      { tail: '1', head: '2', tail_measurement: '2.5', head_measurement: '' },
      { tail: '3', head: '1', tail_measurement: '', head_measurement: '3.0' },
    ];
    const result = getNodeDepth('1', edges);
    expect(result.depth).toBeCloseTo(3.3); // 3.0 + 0.3
    expect(result.isEstimated).toBe(false);
  });

  it('ignores edges not connected to the node', () => {
    const edges = [
      { tail: '2', head: '3', tail_measurement: '5.0', head_measurement: '6.0' },
    ];
    const result = getNodeDepth('1', edges);
    expect(result.depth).toBe(DEFAULT_DEPTH);
    expect(result.isEstimated).toBe(true);
  });

  it('handles edges with empty/invalid measurements', () => {
    const edges = [
      { tail: '1', head: '2', tail_measurement: '', head_measurement: 'abc' },
    ];
    const result = getNodeDepth('1', edges);
    expect(result.depth).toBe(DEFAULT_DEPTH);
    expect(result.isEstimated).toBe(true);
  });
});

// ─── computeBounds ─────────────────────────────────────────────────────────

describe('computeBounds', () => {
  it('computes bounding box and center from positions', () => {
    const positions = new Map();
    positions.set('1', { x: 0, y: 0, z: 0 });
    positions.set('2', { x: 10, y: -2, z: 10 });
    positions.set('3', { x: -5, y: -1, z: 5 });

    const result = computeBounds(positions);
    expect(result.minX).toBe(-5);
    expect(result.maxX).toBe(10);
    expect(result.minZ).toBe(0);
    expect(result.maxZ).toBe(10);
    expect(result.centerX).toBe(2.5);
    expect(result.centerZ).toBe(5);
    expect(result.sizeX).toBe(15);
    expect(result.sizeZ).toBe(10);
  });

  it('handles single position', () => {
    const positions = new Map();
    positions.set('1', { x: 5, y: 0, z: 3 });
    const result = computeBounds(positions);
    expect(result.centerX).toBe(5);
    expect(result.centerZ).toBe(3);
  });

  it('handles empty positions map with defaults', () => {
    const positions = new Map();
    const result = computeBounds(positions);
    expect(result.centerX).toBe(0);
    expect(result.centerZ).toBe(0);
    // Defaults to -10..10 range
    expect(result.minX).toBe(-10);
    expect(result.maxX).toBe(10);
  });
});

// ─── Constants ─────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('has sensible default values', () => {
    expect(DEFAULT_DEPTH).toBeGreaterThan(0);
    expect(DEFAULT_PIPE_DEPTH).toBeGreaterThan(0);
    expect(DEFAULT_PIPE_DIAMETER_MM).toBeGreaterThan(0);
    expect(DEFAULT_COVER_DIAMETER_CM).toBeGreaterThan(0);
    expect(SHAFT_WALL_THICKNESS).toBeGreaterThan(0);
    expect(COVER_HEIGHT).toBeGreaterThan(0);
    expect(MANHOLE_SEGMENTS).toBeGreaterThan(3);
    expect(PIPE_RADIAL_SEGMENTS).toBeGreaterThan(3);
    expect(PIPE_TUBULAR_SEGMENTS).toBeGreaterThan(1);
  });
});

// ─── buildScene (with mocked THREE) ────────────────────────────────────────

// Note: buildScene requires an extensive Three.js mock (constructors, Color, Fog,
// CSS2DObject, etc.) and is tested in three-d-comprehensive.test.ts instead.
// We keep pure function tests here for parseNum, getNodeXZ, getNodeDepth, computeBounds.
