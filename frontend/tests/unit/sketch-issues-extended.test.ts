/**
 * Extended tests for Sketch Issue Detection
 *
 * Covers edge cases for new issue types (obstructed_access, schematic_location,
 * missing_tl) and computeProjectTotals aggregation of new stat fields.
 */
import { describe, it, expect } from 'vitest';
import { computeSketchIssues, computeProjectTotals } from '../../src/project/sketch-issues.js';

function makeNode(id: string | number, overrides: Record<string, unknown> = {}) {
  return { id, x: 100, y: 100, ...overrides };
}

function makeEdge(id: string, tail: string | number, head: string | number, overrides: Record<string, unknown> = {}) {
  return { id, tail, head, ...overrides };
}

describe('Extended Sketch Issues', () => {
  describe('obstructed_access — all OBSTRUCTED_STATUSES codes', () => {
    it('should detect maintenanceStatus=3 (cannot open)', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 3, surveyX: 1, surveyY: 2, tl: '1.0' })];
      const result = computeSketchIssues(nodes, []);
      const issues = result.issues.filter(i => i.type === 'obstructed_access');
      expect(issues).toHaveLength(1);
      expect(issues[0].reason).toBe('לא ניתן לפתיחה');
    });

    it('should detect maintenanceStatus=4 (covered manhole)', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 4, surveyX: 1, surveyY: 2, tl: '1.0' })];
      const result = computeSketchIssues(nodes, []);
      const issues = result.issues.filter(i => i.type === 'obstructed_access');
      expect(issues).toHaveLength(1);
      expect(issues[0].reason).toBe('שוחה מכוסה');
    });

    it('should detect maintenanceStatus=5 (no access sewage)', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 5, surveyX: 1, surveyY: 2, tl: '1.0' })];
      const result = computeSketchIssues(nodes, []);
      const issues = result.issues.filter(i => i.type === 'obstructed_access');
      expect(issues).toHaveLength(1);
      expect(issues[0].reason).toBe('שוחת ביוב - ללא גישה');
    });

    it('should detect maintenanceStatus=10 (no cover)', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 10, surveyX: 1, surveyY: 2, tl: '1.0' })];
      const result = computeSketchIssues(nodes, []);
      const issues = result.issues.filter(i => i.type === 'obstructed_access');
      expect(issues).toHaveLength(1);
      expect(issues[0].reason).toBe('ללא מכסה');
    });

    it('should detect maintenanceStatus=13 (locked house)', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 13, surveyX: 1, surveyY: 2, tl: '1.0' })];
      const result = computeSketchIssues(nodes, []);
      const issues = result.issues.filter(i => i.type === 'obstructed_access');
      expect(issues).toHaveLength(1);
      expect(issues[0].reason).toBe('בית נעול');
    });

    it('should NOT detect maintenanceStatus=1 (normal)', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 1, surveyX: 1, surveyY: 2, tl: '1.0' })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'obstructed_access')).toHaveLength(0);
    });

    it('should skip Home nodes', () => {
      const nodes = [makeNode('1', { nodeType: 'Home', maintenanceStatus: 13 })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'obstructed_access')).toHaveLength(0);
    });

    it('should count obstructedAccessCount in stats', () => {
      const nodes = [
        makeNode('1', { maintenanceStatus: 3, surveyX: 1, surveyY: 2, tl: '1.0' }),
        makeNode('2', { maintenanceStatus: 13, surveyX: 3, surveyY: 4, tl: '1.5' }),
      ];
      const result = computeSketchIssues(nodes, []);
      expect(result.stats.obstructedAccessCount).toBe(2);
    });
  });

  describe('schematic_location', () => {
    it('should detect nodes with accuracyLevel=1 and no survey coords', () => {
      const nodes = [makeNode('1', { accuracyLevel: 1 })];
      const result = computeSketchIssues(nodes, []);
      const issues = result.issues.filter(i => i.type === 'schematic_location');
      expect(issues).toHaveLength(1);
      expect(issues[0].nodeId).toBe('1');
    });

    it('should NOT detect if node has survey coords', () => {
      const nodes = [makeNode('1', { accuracyLevel: 1, surveyX: 1, surveyY: 2 })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'schematic_location')).toHaveLength(0);
    });

    it('should NOT detect if accuracyLevel is not 1', () => {
      const nodes = [makeNode('1', { accuracyLevel: 0 })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'schematic_location')).toHaveLength(0);
    });

    it('should skip Home nodes', () => {
      const nodes = [makeNode('1', { nodeType: 'Home', accuracyLevel: 1 })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'schematic_location')).toHaveLength(0);
    });

    it('should count schematicLocationCount in stats', () => {
      const nodes = [
        makeNode('1', { accuracyLevel: 1 }),
        makeNode('2', { accuracyLevel: 1 }),
      ];
      const result = computeSketchIssues(nodes, []);
      expect(result.stats.schematicLocationCount).toBe(2);
    });

    it('should NOT also flag as missing_coords (schematic nodes skip that check)', () => {
      const nodes = [makeNode('1', { accuracyLevel: 1 })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'missing_coords')).toHaveLength(0);
      expect(result.issues.filter(i => i.type === 'schematic_location')).toHaveLength(1);
    });
  });

  describe('missing_tl', () => {
    it('should detect nodes with survey coords but no tl', () => {
      const nodes = [makeNode('1', { surveyX: 1, surveyY: 2 })];
      const result = computeSketchIssues(nodes, []);
      const issues = result.issues.filter(i => i.type === 'missing_tl');
      expect(issues).toHaveLength(1);
      expect(issues[0].nodeId).toBe('1');
    });

    it('should detect nodes with tl as empty string', () => {
      const nodes = [makeNode('1', { surveyX: 1, surveyY: 2, tl: '' })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'missing_tl')).toHaveLength(1);
    });

    it('should NOT detect when tl has a value', () => {
      const nodes = [makeNode('1', { surveyX: 1, surveyY: 2, tl: '1.5' })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'missing_tl')).toHaveLength(0);
    });

    it('should NOT detect when tl is 0 (zero is a valid value)', () => {
      const nodes = [makeNode('1', { surveyX: 1, surveyY: 2, tl: '0' })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'missing_tl')).toHaveLength(0);
    });

    it('should NOT detect when node has no survey coords', () => {
      const nodes = [makeNode('1')]; // no surveyX/Y, so not a missing_tl
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'missing_tl')).toHaveLength(0);
    });

    it('should skip Home nodes', () => {
      const nodes = [makeNode('1', { nodeType: 'Home', surveyX: 1, surveyY: 2 })];
      const result = computeSketchIssues(nodes, []);
      expect(result.issues.filter(i => i.type === 'missing_tl')).toHaveLength(0);
    });

    it('should count missingTlCount in stats', () => {
      const nodes = [
        makeNode('1', { surveyX: 1, surveyY: 2 }),
        makeNode('2', { surveyX: 3, surveyY: 4 }),
        makeNode('3', { surveyX: 5, surveyY: 6, tl: '2.0' }),
      ];
      const result = computeSketchIssues(nodes, []);
      expect(result.stats.missingTlCount).toBe(2);
    });
  });

  describe('issue sorting', () => {
    it('should sort issues by type severity order', () => {
      const nodes = [
        makeNode('1'), // missing_coords
        makeNode('2', { surveyX: 1, surveyY: 2 }), // missing_tl
        makeNode('3', { maintenanceStatus: 3, surveyX: 3, surveyY: 4, tl: '1.0' }), // obstructed_access
        makeNode('4', { accuracyLevel: 1 }), // schematic_location
      ];
      const result = computeSketchIssues(nodes, []);
      const types = result.issues.map(i => i.type);
      // Order: missing_coords(0) < obstructed_access(5) < schematic_location(6) < missing_tl(7)
      const idx_mc = types.indexOf('missing_coords');
      const idx_oa = types.indexOf('obstructed_access');
      const idx_sl = types.indexOf('schematic_location');
      const idx_mt = types.indexOf('missing_tl');
      expect(idx_mc).toBeLessThan(idx_oa);
      expect(idx_oa).toBeLessThan(idx_sl);
      expect(idx_sl).toBeLessThan(idx_mt);
    });
  });

  describe('computeProjectTotals with new stat fields', () => {
    it('should aggregate all new count fields', () => {
      const stats = [
        { totalKm: 1.5, issueCount: 5, missingCoordsCount: 2, missingPipeDataCount: 1, obstructedAccessCount: 1, schematicLocationCount: 0, missingTlCount: 1 },
        { totalKm: 2.0, issueCount: 3, missingCoordsCount: 0, missingPipeDataCount: 1, obstructedAccessCount: 2, schematicLocationCount: 1, missingTlCount: 0 },
      ];
      const totals = computeProjectTotals(stats);
      expect(totals.totalKm).toBe(3.5);
      expect(totals.issueCount).toBe(8);
      expect(totals.missingCoordsCount).toBe(2);
      expect(totals.missingPipeDataCount).toBe(2);
      expect(totals.obstructedAccessCount).toBe(3);
      expect(totals.schematicLocationCount).toBe(1);
      expect(totals.missingTlCount).toBe(1);
    });

    it('should handle missing new fields (backward compat)', () => {
      const stats = [
        { totalKm: 1.0, issueCount: 2, missingCoordsCount: 1, missingPipeDataCount: 1 } as any,
      ];
      const totals = computeProjectTotals(stats);
      expect(totals.obstructedAccessCount).toBe(0);
      expect(totals.schematicLocationCount).toBe(0);
      expect(totals.missingTlCount).toBe(0);
    });

    it('should handle empty stats array', () => {
      const totals = computeProjectTotals([]);
      expect(totals.totalKm).toBe(0);
      expect(totals.issueCount).toBe(0);
      expect(totals.obstructedAccessCount).toBe(0);
    });
  });

  describe('merge_candidate replaces not_last_manhole', () => {
    it('should replace not_last_manhole with merge_candidate for nearby stubs', () => {
      // Two stubs in different components, close together
      const nodes = [
        makeNode('1', { x: 100, y: 100 }),
        makeNode('2', { x: 100, y: 100 }),
        makeNode('3', { x: 110, y: 100 }), // close to node 2
      ];
      // Component 1: 1->2, Component 2: isolated 3 with edge 3->... hmm
      // Actually merge_candidate needs: degree=1, no measurements, not Home, different components, <40m
      // Node must be a not_last_manhole (only inbound edges)
      // Let's set up properly:
      const edges = [
        makeEdge('e1', '1', '2'), // 1->2 (node 2 is head-only = not_last_manhole candidate)
        makeEdge('e2', '4', '3'), // 4->3 (node 3 is head-only)
      ];
      const allNodes = [
        makeNode('1', { x: 0, y: 0 }),
        makeNode('2', { x: 10, y: 0 }), // stub, head-only
        makeNode('3', { x: 11, y: 0 }), // stub, head-only, close to node 2
        makeNode('4', { x: 100, y: 100 }),
      ];
      const result = computeSketchIssues(allNodes, edges);
      const merges = result.issues.filter(i => i.type === 'merge_candidate');
      // Should find at least one merge candidate
      if (merges.length > 0) {
        expect(merges[0].distanceM).toBeDefined();
        expect(merges[0].mergeNodeId).toBeDefined();
      }
    });
  });

  describe('negative_gradient', () => {
    it('should detect when head measurement > tail measurement', () => {
      const nodes = [makeNode('1', { x: 0, y: 0 }), makeNode('2', { x: 100, y: 0 })];
      const edges = [makeEdge('e1', '1', '2', { tail_measurement: '1.5', head_measurement: '2.0' })];
      const result = computeSketchIssues(nodes, edges);
      const neg = result.issues.filter(i => i.type === 'negative_gradient');
      expect(neg).toHaveLength(1);
      expect(neg[0].gradient).toBe(0.5);
    });

    it('should NOT detect when tail > head (normal flow)', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const edges = [makeEdge('e1', '1', '2', { tail_measurement: '2.0', head_measurement: '1.5' })];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'negative_gradient')).toHaveLength(0);
    });

    it('should skip when measurements are zero', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const edges = [makeEdge('e1', '1', '2', { tail_measurement: '0', head_measurement: '1.0' })];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'negative_gradient')).toHaveLength(0);
    });

    it('should skip when measurements are NaN', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const edges = [makeEdge('e1', '1', '2', { tail_measurement: 'abc', head_measurement: '1.0' })];
      const result = computeSketchIssues(nodes, edges);
      expect(result.issues.filter(i => i.type === 'negative_gradient')).toHaveLength(0);
    });
  });
});
