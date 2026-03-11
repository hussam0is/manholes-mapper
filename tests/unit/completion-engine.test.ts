/**
 * Unit tests for Sketch Completion Engine
 *
 * Tests the computeSketchCompletion function which calculates
 * a weighted completion score across 4 dimensions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeSketchCompletion, invalidateCompletionCache } from '../../src/cockpit/completion-engine.js';

// Helper to create a mock node
function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    x: 100,
    y: 100,
    nodeType: 'Manhole',
    accuracyLevel: 0,
    ...overrides,
  };
}

// Helper to create a mock edge
function makeEdge(
  tail: string,
  head: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: Math.random().toString(36).slice(2),
    tail,
    head,
    ...overrides,
  };
}

function mockSketchData(nodes: unknown[], edges: unknown[]) {
  (window as any).__getActiveSketchData = vi.fn(() => ({ nodes, edges }));
}

describe('computeSketchCompletion', () => {
  beforeEach(() => {
    (window as any).__getActiveSketchData = undefined;
    (window as any).__getSketchStats = undefined;
    invalidateCompletionCache(); // Clear cached results between tests
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('empty/missing data', () => {
    it('should return zero when no sketch data is available', () => {
      const result = computeSketchCompletion();
      expect(result.percentage).toBe(0);
      expect(result.nodeCount).toBe(0);
      expect(result.edgeCount).toBe(0);
    });

    it('should return zero when sketch has no nodes', () => {
      mockSketchData([], []);
      const result = computeSketchCompletion();
      expect(result.percentage).toBe(0);
      expect(result.nodeCount).toBe(0);
    });

    it('should handle __getActiveSketchData throwing', () => {
      (window as any).__getActiveSketchData = () => {
        throw new Error('fail');
      };
      const result = computeSketchCompletion();
      expect(result.percentage).toBe(0);
    });
  });

  describe('coordinate scoring (40%)', () => {
    it('should give 100% coords when all non-schematic nodes have survey coords', () => {
      const nodes = [
        makeNode({ surveyX: 1, surveyY: 2 }),
        makeNode({ surveyX: 3, surveyY: 4 }),
      ];
      mockSketchData(nodes, []);
      const result = computeSketchCompletion();
      expect(result.coordsPct).toBe(100);
    });

    it('should give 0% coords when no nodes have survey coords', () => {
      const nodes = [makeNode(), makeNode()];
      mockSketchData(nodes, []);
      const result = computeSketchCompletion();
      expect(result.coordsPct).toBe(0);
    });

    it('should give 50% coords when half have coords', () => {
      const nodes = [
        makeNode({ surveyX: 1, surveyY: 2 }),
        makeNode(),
      ];
      mockSketchData(nodes, []);
      const result = computeSketchCompletion();
      expect(result.coordsPct).toBe(50);
    });

    it('should exclude Home and ForLater nodes from coord requirements', () => {
      const nodes = [
        makeNode({ nodeType: 'Home' }),
        makeNode({ nodeType: 'ForLater' }),
        makeNode({ surveyX: 1, surveyY: 2 }),
      ];
      mockSketchData(nodes, []);
      // Only 1 node needs coords and it has them
      expect(computeSketchCompletion().coordsPct).toBe(100);
    });

    it('should exclude schematic nodes (accuracyLevel=1)', () => {
      const nodes = [
        makeNode({ accuracyLevel: 1 }),
        makeNode({ surveyX: 1, surveyY: 2 }),
      ];
      mockSketchData(nodes, []);
      expect(computeSketchCompletion().coordsPct).toBe(100);
    });

    it('should return 100% when all nodes are excluded types', () => {
      const nodes = [
        makeNode({ nodeType: 'Home' }),
        makeNode({ accuracyLevel: 1 }),
      ];
      mockSketchData(nodes, []);
      expect(computeSketchCompletion().coordsPct).toBe(100);
    });
  });

  describe('measurement scoring (30%)', () => {
    it('should give 100% when all connected edges have both measurements', () => {
      const n1 = makeNode();
      const n2 = makeNode();
      const edges = [
        makeEdge(n1.id, n2.id, {
          tail_measurement: '1.5',
          head_measurement: '2.0',
        }),
      ];
      mockSketchData([n1, n2], edges);
      expect(computeSketchCompletion().measurePct).toBe(100);
    });

    it('should give 0% when edges are missing measurements', () => {
      const n1 = makeNode();
      const n2 = makeNode();
      const edges = [makeEdge(n1.id, n2.id)];
      mockSketchData([n1, n2], edges);
      expect(computeSketchCompletion().measurePct).toBe(0);
    });

    it('should exclude disconnected edges (null tail or head)', () => {
      const n1 = makeNode();
      const edges = [makeEdge(n1.id, null as any)];
      mockSketchData([n1], edges);
      // No connected edges → 100%
      expect(computeSketchCompletion().measurePct).toBe(100);
    });

    it('should give 100% when no edges exist', () => {
      mockSketchData([makeNode()], []);
      expect(computeSketchCompletion().measurePct).toBe(100);
    });

    it('should treat empty string as missing measurement', () => {
      const n1 = makeNode();
      const n2 = makeNode();
      const edges = [
        makeEdge(n1.id, n2.id, {
          tail_measurement: '',
          head_measurement: '2.0',
        }),
      ];
      mockSketchData([n1, n2], edges);
      expect(computeSketchCompletion().measurePct).toBe(0);
    });
  });

  describe('issue scoring (20%)', () => {
    it('should give 100% when there are no issues', () => {
      const nodes = [makeNode({ surveyX: 1, surveyY: 2 })];
      mockSketchData(nodes, []);
      const result = computeSketchCompletion();
      expect(result.issuesPct).toBe(100);
      expect(result.issueCount).toBe(0);
    });

    it('should penalize missing coords on non-schematic nodes', () => {
      const nodes = [makeNode(), makeNode()]; // 2 nodes without coords
      mockSketchData(nodes, []);
      const result = computeSketchCompletion();
      expect(result.issueCount).toBe(2);
      expect(result.issuesPct).toBe(70); // 100 - 2*15
    });

    it('should detect negative gradient edges', () => {
      const n1 = makeNode({ surveyX: 1, surveyY: 2 });
      const n2 = makeNode({ surveyX: 3, surveyY: 4 });
      // head > tail = negative gradient
      const edges = [
        makeEdge(n1.id, n2.id, {
          tail_measurement: '1.0',
          head_measurement: '2.0',
        }),
      ];
      mockSketchData([n1, n2], edges);
      const result = computeSketchCompletion();
      expect(result.issueCount).toBeGreaterThanOrEqual(1);
    });

    it('should detect missing measurements on functional manhole edges', () => {
      const n1 = makeNode({ id: 'a', maintenanceStatus: 1, surveyX: 1, surveyY: 2 });
      const n2 = makeNode({ id: 'b', surveyX: 3, surveyY: 4 });
      const edges = [makeEdge('a', 'b')]; // No measurements
      mockSketchData([n1, n2], edges);
      const result = computeSketchCompletion();
      expect(result.issueCount).toBeGreaterThanOrEqual(1);
    });

    it('should clamp issue penalty to 0% minimum', () => {
      // 7+ missing coords = 7*15 = 105 → clamped to 0
      const nodes = Array.from({ length: 7 }, () => makeNode());
      mockSketchData(nodes, []);
      expect(computeSketchCompletion().issuesPct).toBe(0);
    });
  });

  describe('optional fields scoring (10%)', () => {
    it('should give 100% when all manhole fields are filled', () => {
      const nodes = [
        makeNode({
          nodeType: 'Manhole',
          material: 'concrete',
          coverDiameter: '600',
          access: 'easy',
          surveyX: 1,
          surveyY: 2,
        }),
      ];
      mockSketchData(nodes, []);
      expect(computeSketchCompletion().fieldsPct).toBe(100);
    });

    it('should give 0% when no fields are filled', () => {
      mockSketchData([makeNode({ nodeType: 'Manhole', surveyX: 1, surveyY: 2 })], []);
      expect(computeSketchCompletion().fieldsPct).toBe(0);
    });

    it('should count Drainage nodes for field check', () => {
      const nodes = [
        makeNode({
          nodeType: 'Drainage',
          material: 'pvc',
          coverDiameter: '400',
          access: 'restricted',
          surveyX: 1,
          surveyY: 2,
        }),
      ];
      mockSketchData(nodes, []);
      expect(computeSketchCompletion().fieldsPct).toBe(100);
    });

    it('should count nodes without nodeType for field check', () => {
      const nodes = [
        makeNode({
          nodeType: undefined,
          material: 'concrete',
          surveyX: 1,
          surveyY: 2,
        }),
      ];
      mockSketchData(nodes, []);
      // 1 out of 3 fields filled = 33.33%
      expect(computeSketchCompletion().fieldsPct).toBeCloseTo(33.33, 0);
    });

    it('should treat material=0 as unfilled', () => {
      const nodes = [
        makeNode({
          material: 0,
          coverDiameter: '600',
          access: 'easy',
          surveyX: 1,
          surveyY: 2,
        }),
      ];
      mockSketchData(nodes, []);
      // 2 of 3 fields
      expect(computeSketchCompletion().fieldsPct).toBeCloseTo(66.67, 0);
    });

    it('should return 100% when only non-manhole node types exist', () => {
      const nodes = [makeNode({ nodeType: 'Valve', surveyX: 1, surveyY: 2 })];
      mockSketchData(nodes, []);
      expect(computeSketchCompletion().fieldsPct).toBe(100);
    });
  });

  describe('weighted total', () => {
    it('should calculate correct weighted percentage', () => {
      // Setup: 100% coords, 100% measure, 100% issues, 100% fields
      const nodes = [
        makeNode({
          surveyX: 1,
          surveyY: 2,
          nodeType: 'Valve', // Not checked for optional fields
        }),
      ];
      mockSketchData(nodes, []);
      const result = computeSketchCompletion();
      expect(result.percentage).toBe(100);
    });

    it('should weight coords at 40%, measure at 30%, issues at 20%, fields at 10%', () => {
      // Only coords completed (100%), rest 0%
      // Total = 100*0.4 + 0*0.3 + 0*0.2 + 0*0.1 = 40
      // But issues start at 100 and get penalized, so set up carefully:
      // 7+ nodes without coords → issuesPct = 0
      // No edges → measurePct = 100
      // No manholes → fieldsPct = 100
      // Actually this is complex due to interaction. Test a known scenario:
      const n1 = makeNode({ nodeType: 'Valve', surveyX: 1, surveyY: 2 });
      const n2 = makeNode({ nodeType: 'Valve' }); // no coords
      mockSketchData([n1, n2], []);
      const result = computeSketchCompletion();
      // coordsPct = 50%, measurePct = 100%, issuesPct = 85% (1 issue), fieldsPct = 100%
      expect(result.coordsPct).toBe(50);
      expect(result.measurePct).toBe(100);
      expect(result.issuesPct).toBe(85);
      expect(result.fieldsPct).toBe(100);
      // 50*0.4 + 100*0.3 + 85*0.2 + 100*0.1 = 20 + 30 + 17 + 10 = 77
      expect(result.percentage).toBe(77);
    });

    it('should clamp total to 0-100', () => {
      // Even with complex interactions, should never exceed bounds
      const nodes = [makeNode({ surveyX: 1, surveyY: 2 })];
      mockSketchData(nodes, []);
      const result = computeSketchCompletion();
      expect(result.percentage).toBeGreaterThanOrEqual(0);
      expect(result.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('nodeCount and edgeCount', () => {
    it('should report correct counts', () => {
      const n1 = makeNode();
      const n2 = makeNode();
      const n3 = makeNode();
      const edges = [makeEdge(n1.id, n2.id)];
      mockSketchData([n1, n2, n3], edges);
      const result = computeSketchCompletion();
      expect(result.nodeCount).toBe(3);
      expect(result.edgeCount).toBe(1);
    });
  });
});
