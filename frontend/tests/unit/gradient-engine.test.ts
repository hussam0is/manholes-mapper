/**
 * Unit tests for the gradient engine — live pipe-slope intelligence.
 *
 * computeEdgeGradient() is pure; the stateful layer (evaluateEdge /
 * onMeasurementApplied / getAlerts) operates on the S proxy, which is a plain
 * object under test so we can seed S.nodes/S.edges directly.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeEdgeGradient,
  edgeLengthM,
  evaluateEdge,
  onMeasurementApplied,
  getAlerts,
  resetGradientState,
  MIN_SLOPE_PCT,
} from '../../src/features/gradient-engine.js';
import { S } from '../../src/legacy/shared-state.js';
import { bus } from '../../src/state/event-bus.js';

type AnyNode = Record<string, unknown>;

function makeNode(id: string, overrides: AnyNode = {}) {
  return { id, x: 100, y: 100, nodeType: 'Manhole', ...overrides };
}
function makeEdge(id: string, tail: string, head: string, overrides: AnyNode = {}) {
  return { id, tail, head, tail_measurement: '', head_measurement: '', ...overrides };
}
function lookup(nodes: AnyNode[]) {
  const map = new Map(nodes.map((n) => [String(n.id), n]));
  return (id: unknown) => map.get(String(id));
}

// 20m apart on the ITM grid
const T = makeNode('T', { surveyX: 178000, surveyY: 650000, surveyZ: 104.1 });
const H = makeNode('H', { surveyX: 178020, surveyY: 650000, surveyZ: 104.55 });

describe('computeEdgeGradient (pure)', () => {
  it('flags invert-basis negative gradient (the MH-103→MH-104 field case)', () => {
    // inverts: 104.10-1.50=102.60 → 104.55-1.20=103.35 — rises 0.75m over 20m
    const edge = makeEdge('e1', 'T', 'H', { tail_measurement: '1.50', head_measurement: '1.20' });
    const g = computeEdgeGradient(edge, lookup([T, H]));
    expect(g.status).toBe('negative');
    expect(g.basis).toBe('invert');
    expect(g.drop).toBeCloseTo(-0.75, 2);
    expect(g.slopePct).toBeCloseTo(-3.75, 2);
    expect(g.lengthM).toBeCloseTo(20, 5);
  });

  it('passes a correctly falling pipe', () => {
    const tail = makeNode('T', { surveyX: 178000, surveyY: 650000, surveyZ: 105.0 });
    const head = makeNode('H', { surveyX: 178020, surveyY: 650000, surveyZ: 104.6 });
    const edge = makeEdge('e1', 'T', 'H', { tail_measurement: '1.20', head_measurement: '1.10' });
    const g = computeEdgeGradient(edge, lookup([tail, head]));
    expect(g.status).toBe('ok');
    expect(g.basis).toBe('invert');
    expect(g.slopePct).toBeCloseTo(1.5, 2);
  });

  it('warns on a positive but too-low slope (invert basis only)', () => {
    const tail = makeNode('T', { surveyX: 178000, surveyY: 650000, surveyZ: 100.0 });
    const head = makeNode('H', { surveyX: 178020, surveyY: 650000, surveyZ: 99.97 });
    const edge = makeEdge('e1', 'T', 'H', { tail_measurement: '1.00', head_measurement: '1.00' });
    const g = computeEdgeGradient(edge, lookup([tail, head]));
    expect(g.slopePct).toBeLessThan(MIN_SLOPE_PCT);
    expect(g.status).toBe('low');
  });

  it('uses terrain basis when depths are missing and flags rising ground', () => {
    const edge = makeEdge('e1', 'T', 'H');
    const g = computeEdgeGradient(edge, lookup([T, H]));
    expect(g.status).toBe('negative');
    expect(g.basis).toBe('terrain');
    expect(g.drop).toBeCloseTo(-0.45, 2);
  });

  it('tolerates terrain rise within measurement noise (5cm)', () => {
    const tail = makeNode('T', { surveyX: 178000, surveyY: 650000, surveyZ: 100.0 });
    const head = makeNode('H', { surveyX: 178020, surveyY: 650000, surveyZ: 100.03 });
    const g = computeEdgeGradient(makeEdge('e1', 'T', 'H'), lookup([tail, head]));
    expect(g.status).toBe('ok');
  });

  it('does not apply the low-slope warning on terrain basis', () => {
    const tail = makeNode('T', { surveyX: 178000, surveyY: 650000, surveyZ: 100.02 });
    const head = makeNode('H', { surveyX: 178020, surveyY: 650000, surveyZ: 100.0 });
    const g = computeEdgeGradient(makeEdge('e1', 'T', 'H'), lookup([tail, head]));
    expect(g.basis).toBe('terrain');
    expect(g.status).toBe('ok');
  });

  it('exempts edges touching Home / ForLater / Issue nodes', () => {
    for (const nodeType of ['Home', 'ForLater', 'Issue']) {
      const head = makeNode('H', { ...H, nodeType });
      const g = computeEdgeGradient(makeEdge('e1', 'T', 'H'), lookup([T, head]));
      expect(g.status).toBe('exempt');
    }
  });

  it('returns unknown when elevation is missing or zero (parser default)', () => {
    const noZ = makeNode('H', { surveyX: 178020, surveyY: 650000 });
    expect(computeEdgeGradient(makeEdge('e', 'T', 'H'), lookup([T, noZ])).status).toBe('unknown');
    const zeroZ = makeNode('H', { surveyX: 178020, surveyY: 650000, surveyZ: 0 });
    expect(computeEdgeGradient(makeEdge('e', 'T', 'H'), lookup([T, zeroZ])).status).toBe('unknown');
  });

  it('returns unknown for dangling/missing endpoints', () => {
    expect(computeEdgeGradient(makeEdge('e', 'T', 'H'), lookup([T])).status).toBe('unknown');
    expect(
      computeEdgeGradient({ id: 'e', tail: 'T', head: null } as never, lookup([T])).status,
    ).toBe('unknown');
  });

  it('ignores non-positive or empty depth strings (falls back to terrain)', () => {
    const edge = makeEdge('e1', 'T', 'H', { tail_measurement: '0', head_measurement: '1.2' });
    const g = computeEdgeGradient(edge, lookup([T, H]));
    expect(g.basis).toBe('terrain');
  });

  it('computes length from world coords / coordinateScale when ITM is absent', () => {
    const tail = makeNode('T', { x: 0, y: 0, surveyZ: 100.0 });
    const head = makeNode('H', { x: 1000, y: 0, surveyZ: 99.0 });
    expect(edgeLengthM(tail, head, 50)).toBeCloseTo(20, 5);
    const g = computeEdgeGradient(makeEdge('e1', 'T', 'H'), lookup([tail, head]), 50);
    expect(g.lengthM).toBeCloseTo(20, 5);
    expect(g.slopePct).toBeCloseTo(5, 2);
  });
});

describe('live layer (evaluateEdge / alerts)', () => {
  beforeEach(() => {
    resetGradientState();
    (S as AnyNode).nodes = [
      makeNode('A', { surveyX: 178000, surveyY: 650000, surveyZ: 104.1 }),
      makeNode('B', { surveyX: 178020, surveyY: 650000, surveyZ: 104.55 }),
    ];
    (S as AnyNode).edges = [makeEdge('bad', 'A', 'B')];
    (S as AnyNode).nodeMap = null;
    (S as AnyNode).coordinateScale = 50;
  });

  it('registers an active alert for a negative edge and clears it when fixed', () => {
    evaluateEdge('bad');
    expect(getAlerts()).toHaveLength(1);
    expect(getAlerts()[0]).toMatchObject({ edgeId: 'bad', status: 'negative', basis: 'terrain' });

    // Fix the elevation (re-shoot) and re-evaluate
    (S as AnyNode).nodes[1].surveyZ = 103.8;
    evaluateEdge('bad');
    expect(getAlerts()).toHaveLength(0);
  });

  it('emits gradient:status only on transitions (no spam on re-evaluation)', () => {
    const seen: unknown[] = [];
    const off = bus.on('gradient:status', (p: unknown) => seen.push(p));
    evaluateEdge('bad');
    evaluateEdge('bad');
    evaluateEdge('bad');
    expect(seen).toHaveLength(1);
    // basis change (depths arrive, still negative) is a new transition
    (S as AnyNode).edges[0].tail_measurement = '1.50';
    (S as AnyNode).edges[0].head_measurement = '1.20';
    evaluateEdge('bad');
    expect(seen).toHaveLength(2);
    if (typeof off === 'function') off();
  });

  it('onMeasurementApplied evaluates every edge touching the node', () => {
    (S as AnyNode).nodes.push(makeNode('C', { surveyX: 178040, surveyY: 650000, surveyZ: 103.9 }));
    (S as AnyNode).edges.push(makeEdge('good', 'B', 'C'));
    const results = onMeasurementApplied('B');
    expect(results).toHaveLength(2);
    expect(getAlerts().map((a) => a.edgeId)).toEqual(['bad']);
  });

  it('never alerts for exempt (Home) edges via the live layer', () => {
    (S as AnyNode).nodes[1].nodeType = 'Home';
    evaluateEdge('bad');
    expect(getAlerts()).toHaveLength(0);
  });
});

describe('window bridge', () => {
  it('exposes __gradientEngine with the full API', () => {
    const api = (window as never as Record<string, AnyNode>).__gradientEngine;
    expect(api).toBeTruthy();
    for (const fn of ['compute', 'evaluateEdge', 'onMeasurementApplied', 'onEdgeCreated', 'onDepthChanged', 'recheckAll', 'getAlerts']) {
      expect(typeof api[fn]).toBe('function');
    }
  });
});
