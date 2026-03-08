/**
 * Unit tests for Sketch Issue Detection
 *
 * Tests computeSketchIssues() — a pure function that detects 6 issue types:
 * missing_coords, missing_pipe_data, long_edge, not_last_manhole,
 * merge_candidate, negative_gradient.
 */
import { describe, it, expect } from 'vitest';
import { computeSketchIssues, computeProjectTotals } from '../../src/project/sketch-issues.js';

function makeNode(id: string | number, overrides: Record<string, unknown> = {}) {
  return { id, x: 100, y: 100, ...overrides };
}

function makeEdge(id: string, tail: string | number, head: string | number, overrides: Record<string, unknown> = {}) {
  return { id, tail, head, ...overrides };
}

describe('computeSketchIssues', () => {
  describe('null/empty input', () => {
    it('should handle null nodes/edges', () => {
      const result = computeSketchIssues(null, null);
      expect(result.issues).toEqual([]);
      expect(result.stats.totalKm).toBe(0);
    });

    it('should handle empty arrays', () => {
      const result = computeSketchIssues([], []);
      expect(result.issues).toEqual([]);
      expect(result.stats.issueCount).toBe(0);
    });
  });

  describe('missing_coords', () => {
    it('should detect nodes without survey coordinates', () => {
      const nodes = [makeNode('1'), makeNode('2', { surveyX: 1, surveyY: 2 })];
      const result = computeSketchIssues(nodes, []);
      const missing = result.issues.filter(i => i.type === 'missing_coords');
      expect(missing).toHaveLength(1);
      expect(missing[0].nodeId).toBe('1');
    });

    it('should skip schematic nodes (accuracyLevel=1)', () => {
      const nodes = [makeNode('1', { accuracyLevel: 1 })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'missing_coords')).toHaveLength(0);
    });

    it('should skip Home nodes', () => {
      const nodes = [makeNode('1', { nodeType: 'Home' })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'missing_coords')).toHaveLength(0);
    });

    it('should include worldX/worldY from node canvas position', () => {
      const nodes = [makeNode('1', { x: 200, y: 300 })];
      const result = computeSketchIssues(nodes, []);
      const issue = result.issues[0];
      expect(issue.worldX).toBe(200);
      expect(issue.worldY).toBe(300);
    });
  });

  describe('missing_pipe_data', () => {
    it('should detect missing tail measurement on functional nodes', () => {
      const nodes = [
        makeNode('1', { maintenanceStatus: 1, surveyX: 1, surveyY: 2 }),
        makeNode('2', { surveyX: 3, surveyY: 4 }),
      ];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      const missing = result.issues.filter(i => i.type === 'missing_pipe_data');
      expect(missing.some(i => i.side === 'tail' && i.nodeId === '1')).toBe(true);
    });

    it('should detect missing head measurement on functional nodes', () => {
      const nodes = [
        makeNode('1', { surveyX: 1, surveyY: 2 }),
        makeNode('2', { maintenanceStatus: 1, surveyX: 3, surveyY: 4 }),
      ];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      const missing = result.issues.filter(i => i.type === 'missing_pipe_data');
      expect(missing.some(i => i.side === 'head' && i.nodeId === '2')).toBe(true);
    });

    it('should not flag non-functional nodes (maintenanceStatus !== 1)', () => {
      const nodes = [
        makeNode('1', { maintenanceStatus: 0, surveyX: 1, surveyY: 2 }),
        makeNode('2', { surveyX: 3, surveyY: 4 }),
      ];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'missing_pipe_data')).toHaveLength(0);
    });

    it('should accept measurement of 0 as valid', () => {
      const nodes = [
        makeNode('1', { maintenanceStatus: 1, surveyX: 1, surveyY: 2 }),
        makeNode('2', { surveyX: 3, surveyY: 4 }),
      ];
      const edges = [makeEdge('e1', '1', '2', { tail_measurement: 0, head_measurement: '1.5' })];
      const result = computeSketchIssues(nodes, edges);
      // tail_measurement is 0 which is valid, head node is not functional
      const missing = result.issues.filter(i => i.type === 'missing_pipe_data');
      expect(missing.filter(i => i.side === 'tail')).toHaveLength(0);
    });
  });

  describe('long_edge', () => {
    it('should detect edges longer than 70m', () => {
      const nodes = [
        makeNode('1', { surveyX: 0, surveyY: 0 }),
        makeNode('2', { surveyX: 100, surveyY: 0 }), // 100m away
      ];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      const long = result.issues.filter(i => i.type === 'long_edge');
      expect(long).toHaveLength(1);
      expect(long[0].lengthM).toBe(100);
    });

    it('should not flag edges under 70m', () => {
      const nodes = [
        makeNode('1', { surveyX: 0, surveyY: 0 }),
        makeNode('2', { surveyX: 50, surveyY: 0 }), // 50m
      ];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'long_edge')).toHaveLength(0);
    });

    it('should skip edges where nodes lack survey coords', () => {
      const nodes = [
        makeNode('1', { surveyX: 0, surveyY: 0 }),
        makeNode('2'), // no survey coords
      ];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'long_edge')).toHaveLength(0);
    });

    it('should place issue at edge midpoint', () => {
      const nodes = [
        makeNode('1', { x: 0, y: 0, surveyX: 0, surveyY: 0 }),
        makeNode('2', { x: 200, y: 0, surveyX: 100, surveyY: 0 }),
      ];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      const long = result.issues.find(i => i.type === 'long_edge');
      expect(long!.worldX).toBe(100); // midpoint
    });
  });

  describe('not_last_manhole', () => {
    it('should detect nodes with only inbound edges', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const edges = [makeEdge('e1', '1', '2')]; // 1→2, so 2 has only inbound
      const result = computeSketchIssues(nodes, edges);
      const nlm = result.issues.filter(i => i.type === 'not_last_manhole');
      expect(nlm.some(i => i.nodeId === '2')).toBe(true);
    });

    it('should not flag Home nodes', () => {
      const nodes = [makeNode('1'), makeNode('2', { nodeType: 'Home' })];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      const nlm = result.issues.filter(i => i.type === 'not_last_manhole');
      expect(nlm.some(i => i.nodeId === '2')).toBe(false);
    });

    it('should not flag nodes that are both tail and head', () => {
      const nodes = [makeNode('1'), makeNode('2'), makeNode('3')];
      const edges = [makeEdge('e1', '1', '2'), makeEdge('e2', '2', '3')];
      // Node 2 is both head (of e1) and tail (of e2) → not flagged
      const result = computeSketchIssues(nodes, edges);
      const nlm = result.issues.filter(i => i.type === 'not_last_manhole');
      expect(nlm.some(i => i.nodeId === '2')).toBe(false);
    });
  });

  describe('merge_candidate', () => {
    it('should detect nearby stubs in different components', () => {
      // Two separate pipe segments with stubs close together
      const nodes = [
        makeNode('1', { x: 0, y: 0, surveyX: 0, surveyY: 0 }),
        makeNode('2', { x: 100, y: 0, surveyX: 20, surveyY: 0 }),   // stub, near node 3
        makeNode('3', { x: 110, y: 0, surveyX: 25, surveyY: 0 }),   // stub, near node 2
        makeNode('4', { x: 200, y: 0, surveyX: 50, surveyY: 0 }),
      ];
      const edges = [
        makeEdge('e1', '1', '2'), // Component A: 1→2
        makeEdge('e2', '3', '4'), // Component B: 3→4
      ];
      const result = computeSketchIssues(nodes, edges);
      const merges = result.issues.filter(i => i.type === 'merge_candidate');
      expect(merges.length).toBeGreaterThanOrEqual(1);
    });

    it('should not merge stubs in the same component', () => {
      const nodes = [
        makeNode('1', { surveyX: 0, surveyY: 0 }),
        makeNode('2', { surveyX: 5, surveyY: 0 }),
        makeNode('3', { surveyX: 10, surveyY: 0 }),
      ];
      const edges = [
        makeEdge('e1', '1', '2'),
        makeEdge('e2', '2', '3'),
      ];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'merge_candidate')).toHaveLength(0);
    });

    it('should not merge stubs farther than 40m apart', () => {
      const nodes = [
        makeNode('1', { surveyX: 0, surveyY: 0 }),
        makeNode('2', { surveyX: 10, surveyY: 0 }),
        makeNode('3', { surveyX: 60, surveyY: 0 }),  // 50m from node 2 > 40m
        makeNode('4', { surveyX: 70, surveyY: 0 }),
      ];
      const edges = [
        makeEdge('e1', '1', '2'),
        makeEdge('e2', '3', '4'),
      ];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'merge_candidate')).toHaveLength(0);
    });
  });

  describe('negative_gradient', () => {
    it('should detect edges where head is deeper than tail', () => {
      const nodes = [
        makeNode('1', { surveyX: 1, surveyY: 2 }),
        makeNode('2', { surveyX: 3, surveyY: 4 }),
      ];
      const edges = [makeEdge('e1', '1', '2', {
        tail_measurement: '1.0',
        head_measurement: '2.0', // head deeper = uphill = bad
      })];
      const result = computeSketchIssues(nodes, edges);
      const neg = result.issues.filter(i => i.type === 'negative_gradient');
      expect(neg).toHaveLength(1);
      expect(neg[0].gradient).toBe(1);
    });

    it('should not flag normal downhill gradient', () => {
      const nodes = [
        makeNode('1', { surveyX: 1, surveyY: 2 }),
        makeNode('2', { surveyX: 3, surveyY: 4 }),
      ];
      const edges = [makeEdge('e1', '1', '2', {
        tail_measurement: '2.0',
        head_measurement: '1.5', // head shallower = downhill = good
      })];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'negative_gradient')).toHaveLength(0);
    });

    it('should skip edges with non-numeric measurements', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const edges = [makeEdge('e1', '1', '2', {
        tail_measurement: 'abc',
        head_measurement: '2.0',
      })];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'negative_gradient')).toHaveLength(0);
    });

    it('should skip edges with zero or negative measurements', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const edges = [makeEdge('e1', '1', '2', {
        tail_measurement: '0',
        head_measurement: '2.0',
      })];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'negative_gradient')).toHaveLength(0);
    });
  });

  describe('stats', () => {
    it('should compute totalKm from surveyed edges', () => {
      const nodes = [
        makeNode('1', { surveyX: 0, surveyY: 0 }),
        makeNode('2', { surveyX: 1000, surveyY: 0 }), // 1000m = 1km
      ];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      expect(result.stats.totalKm).toBeCloseTo(1, 1);
    });

    it('should not count edges without survey coords in totalKm', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      expect(result.stats.totalKm).toBe(0);
    });

    it('should count missing coords issues', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const result = computeSketchIssues(nodes, []);
      expect(result.stats.missingCoordsCount).toBe(2);
    });

    it('should count missing pipe data issues', () => {
      const nodes = [
        makeNode('1', { maintenanceStatus: 1 }),
        makeNode('2', { maintenanceStatus: 1 }),
      ];
      const edges = [makeEdge('e1', '1', '2')];
      const result = computeSketchIssues(nodes, edges);
      expect(result.stats.missingPipeDataCount).toBeGreaterThan(0);
    });
  });

  describe('issue sorting', () => {
    it('should sort missing_coords before negative_gradient', () => {
      const nodes = [
        makeNode('1', { surveyX: 1, surveyY: 2 }),
        makeNode('2', { surveyX: 3, surveyY: 4 }),
        makeNode('3'), // missing coords
      ];
      const edges = [makeEdge('e1', '1', '2', {
        tail_measurement: '1.0',
        head_measurement: '2.0',
      })];
      const result = computeSketchIssues(nodes, edges);
      const types = result.issues.map(i => i.type);
      const coordIdx = types.indexOf('missing_coords');
      const gradIdx = types.indexOf('negative_gradient');
      expect(coordIdx).toBeLessThan(gradIdx);
    });
  });
});

describe('computeProjectTotals', () => {
  it('should aggregate stats from multiple sketches', () => {
    const stats = [
      { totalKm: 1.5, issueCount: 3, missingCoordsCount: 2, missingPipeDataCount: 1 },
      { totalKm: 0.5, issueCount: 1, missingCoordsCount: 0, missingPipeDataCount: 1 },
    ];
    const totals = computeProjectTotals(stats);
    expect(totals.totalKm).toBe(2);
    expect(totals.issueCount).toBe(4);
    expect(totals.missingCoordsCount).toBe(2);
    expect(totals.missingPipeDataCount).toBe(2);
  });

  it('should handle empty array', () => {
    const totals = computeProjectTotals([]);
    expect(totals.totalKm).toBe(0);
    expect(totals.issueCount).toBe(0);
  });

  it('should handle missing optional counts', () => {
    const stats = [{ totalKm: 1, issueCount: 2 } as any];
    const totals = computeProjectTotals(stats);
    expect(totals.missingCoordsCount).toBe(0);
    expect(totals.missingPipeDataCount).toBe(0);
  });
});
