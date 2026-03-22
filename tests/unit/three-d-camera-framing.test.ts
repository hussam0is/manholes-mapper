/**
 * Unit tests for src/three-d/three-d-camera-framing.js
 *
 * Tests camera framing functions: computeInitialCamera, frameNode, frameEdge, frameOverview.
 * These are pure functions that return { position, lookAt } objects — no Three.js dependency.
 */
import { describe, it, expect } from 'vitest';

import {
  computeInitialCamera,
  frameNode,
  frameEdge,
  frameOverview,
} from '../../src/three-d/three-d-camera-framing.js';

// ─── frameOverview ─────────────────────────────────────────────────────────

describe('frameOverview', () => {
  it('returns camera above and to the side of center', () => {
    const result = frameOverview({ x: 0, y: 0, z: 0 }, null);
    expect(result.position.y).toBeGreaterThan(0); // above ground
    expect(result.lookAt.y).toBeLessThan(0); // looks slightly below ground
  });

  it('centers on provided center point', () => {
    const result = frameOverview({ x: 50, y: 0, z: 30 }, null);
    expect(result.lookAt.x).toBe(50);
    expect(result.lookAt.z).toBe(30);
  });

  it('adjusts distance for large bounding box', () => {
    const smallBB = { min: { x: 0, z: 0 }, max: { x: 10, z: 10 } };
    const largeBB = { min: { x: 0, z: 0 }, max: { x: 200, z: 200 } };
    const small = frameOverview({ x: 5, y: 0, z: 5 }, smallBB);
    const large = frameOverview({ x: 100, y: 0, z: 100 }, largeBB);
    // Camera should be further away for larger bounds
    const distSmall = Math.sqrt(small.position.x ** 2 + small.position.y ** 2 + small.position.z ** 2);
    const distLarge = Math.sqrt(
      (large.position.x - 100) ** 2 + large.position.y ** 2 + (large.position.z - 100) ** 2
    );
    expect(distLarge).toBeGreaterThan(distSmall);
  });

  it('enforces minimum distance', () => {
    const tinyBB = { min: { x: 0, z: 0 }, max: { x: 0.1, z: 0.1 } };
    const result = frameOverview({ x: 0, y: 0, z: 0 }, tinyBB);
    const dist = Math.sqrt(result.position.x ** 2 + result.position.y ** 2 + result.position.z ** 2);
    expect(dist).toBeGreaterThanOrEqual(10); // minimum distance
  });
});

// ─── frameNode ─────────────────────────────────────────────────────────────

describe('frameNode', () => {
  it('returns fallback when node has no 3D position', () => {
    const node = { id: '1' };
    const positions3D = new Map();
    const result = frameNode(node, positions3D, []);
    // Should fall back to frameOverview
    expect(result.position).toBeDefined();
    expect(result.lookAt).toBeDefined();
  });

  it('positions camera perpendicular to connected edge direction', () => {
    const node = { id: '1' };
    const positions3D = new Map();
    positions3D.set('1', { x: 0, y: 0, z: 0, depth: 3 });
    positions3D.set('2', { x: 10, y: 0, z: 0 });
    const edges = [{ tail: '1', head: '2' }];

    const result = frameNode(node, positions3D, edges);
    // Camera should be offset perpendicular to the edge (which goes along X)
    // So camera Z should be non-zero
    expect(Math.abs(result.position.z)).toBeGreaterThan(0);
    expect(result.lookAt.x).toBe(0);
    expect(result.lookAt.z).toBe(0);
  });

  it('uses arbitrary direction when node has no connected edges', () => {
    const node = { id: '1' };
    const positions3D = new Map();
    positions3D.set('1', { x: 5, y: 0, z: 5, depth: 2 });
    const result = frameNode(node, positions3D, []);
    expect(result.position).toBeDefined();
    expect(result.lookAt.x).toBe(5);
    expect(result.lookAt.z).toBe(5);
  });

  it('camera looks at shaft mid-depth', () => {
    const node = { id: '1' };
    const positions3D = new Map();
    positions3D.set('1', { x: 0, y: 0, z: 0, depth: 4 });
    const result = frameNode(node, positions3D, []);
    // lookAt.y should be around -depth/2 = -2
    expect(result.lookAt.y).toBeCloseTo(-2, 0);
  });
});

// ─── frameEdge ─────────────────────────────────────────────────────────────

describe('frameEdge', () => {
  it('returns fallback when edge nodes have no 3D positions', () => {
    const edge = { tail: '1', head: '2', tail_measurement: '1.5', head_measurement: '2.0' };
    const positions3D = new Map();
    const result = frameEdge(edge, positions3D);
    expect(result.position).toBeDefined();
    expect(result.lookAt).toBeDefined();
  });

  it('looks at pipe midpoint', () => {
    const edge = { tail: '1', head: '2', tail_measurement: '2.0', head_measurement: '3.0' };
    const positions3D = new Map();
    positions3D.set('1', { x: 0, y: 0, z: 0 });
    positions3D.set('2', { x: 20, y: 0, z: 0 });

    const result = frameEdge(edge, positions3D);
    expect(result.lookAt.x).toBeCloseTo(10, 0); // midpoint X
    expect(result.lookAt.z).toBe(0);
  });

  it('positions camera perpendicular to pipe direction', () => {
    const edge = { tail: '1', head: '2', tail_measurement: '1.5', head_measurement: '1.5' };
    const positions3D = new Map();
    positions3D.set('1', { x: 0, y: 0, z: 0 });
    positions3D.set('2', { x: 0, y: 0, z: 20 });

    const result = frameEdge(edge, positions3D);
    // Pipe goes along Z, so camera should be offset along X
    expect(Math.abs(result.position.x)).toBeGreaterThan(0);
  });
});

// ─── computeInitialCamera ──────────────────────────────────────────────────

describe('computeInitialCamera', () => {
  it('delegates to frameOverview when no selection', () => {
    const center = { x: 5, y: 0, z: 5 };
    const bb = { min: { x: 0, z: 0 }, max: { x: 10, z: 10 } };
    const result = computeInitialCamera({
      selection: null,
      positions3D: new Map(),
      edges: [],
      center,
      boundingBox: bb,
    });
    // Should match frameOverview output
    const expected = frameOverview(center, bb);
    expect(result.position.x).toBeCloseTo(expected.position.x);
    expect(result.position.y).toBeCloseTo(expected.position.y);
    expect(result.lookAt.x).toBe(expected.lookAt.x);
  });

  it('delegates to frameNode for node selection', () => {
    const node = { id: '1' };
    const positions3D = new Map();
    positions3D.set('1', { x: 0, y: 0, z: 0, depth: 2 });
    const result = computeInitialCamera({
      selection: { type: 'node', node },
      positions3D,
      edges: [],
      center: { x: 0, y: 0, z: 0 },
      boundingBox: null,
    });
    const expected = frameNode(node, positions3D, []);
    expect(result.position.x).toBeCloseTo(expected.position.x);
  });

  it('delegates to frameEdge for edge selection', () => {
    const edge = { tail: '1', head: '2', tail_measurement: '1', head_measurement: '2' };
    const positions3D = new Map();
    positions3D.set('1', { x: 0, y: 0, z: 0 });
    positions3D.set('2', { x: 10, y: 0, z: 0 });
    const result = computeInitialCamera({
      selection: { type: 'edge', edge },
      positions3D,
      edges: [edge],
      center: { x: 5, y: 0, z: 0 },
      boundingBox: null,
    });
    expect(result.lookAt.x).toBeCloseTo(5, 0);
  });
});
