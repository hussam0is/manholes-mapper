/**
 * Unit tests for Fix Suggestions
 *
 * Tests getFixSuggestions() — returns applicable fix actions for each issue type.
 */
import { describe, it, expect } from 'vitest';
import { getFixSuggestions } from '../../src/project/fix-suggestions.js';

function makeNode(id: string | number, overrides: Record<string, unknown> = {}) {
  return { id, x: 100, y: 100, nodeType: 'Manhole', ...overrides };
}

function makeEdge(id: string, tail: string | number, head: string | number, overrides: Record<string, unknown> = {}) {
  return { id, tail, head, ...overrides };
}

describe('getFixSuggestions', () => {
  describe('missing_pipe_data', () => {
    it('should suggest convert to home', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 1 })];
      const edges = [makeEdge('e1', '1', '2')];
      const issue = { type: 'missing_pipe_data', nodeId: '1', edgeId: 'e1', side: 'tail' };
      const fixes = getFixSuggestions(issue, nodes, edges);
      expect(fixes.some(f => f.id === 'convert_to_home')).toBe(true);
    });

    it('should suggest set locked house', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 1 })];
      const edges = [makeEdge('e1', '1', '2')];
      const issue = { type: 'missing_pipe_data', nodeId: '1', edgeId: 'e1', side: 'tail' };
      const fixes = getFixSuggestions(issue, nodes, edges);
      expect(fixes.some(f => f.id === 'set_locked_house')).toBe(true);
    });

    it('should suggest add measurement with navigation', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 1 })];
      const edges = [makeEdge('e1', '1', '2')];
      const issue = { type: 'missing_pipe_data', nodeId: '1', edgeId: 'e1', side: 'tail' };
      const fixes = getFixSuggestions(issue, nodes, edges);
      const addMeas = fixes.find(f => f.id === 'add_measurement');
      expect(addMeas).toBeDefined();
      expect(addMeas!.navigateTo).toBeDefined();
      expect(addMeas!.navigateTo!.focusField).toBe('tailInput');
    });

    it('should not suggest convert_to_home if already Home', () => {
      const nodes = [makeNode('1', { nodeType: 'Home', maintenanceStatus: 1 })];
      const edges = [makeEdge('e1', '1', '2')];
      const issue = { type: 'missing_pipe_data', nodeId: '1', edgeId: 'e1', side: 'tail' };
      const fixes = getFixSuggestions(issue, nodes, edges);
      expect(fixes.some(f => f.id === 'convert_to_home')).toBe(false);
    });

    it('convert_to_home apply should mutate node type', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 1 })];
      const edges = [makeEdge('e1', '1', '2')];
      const issue = { type: 'missing_pipe_data', nodeId: '1', edgeId: 'e1', side: 'tail' };
      const fixes = getFixSuggestions(issue, nodes, edges);
      const fix = fixes.find(f => f.id === 'convert_to_home')!;
      fix.apply!();
      expect(nodes[0].nodeType).toBe('Home');
    });
  });

  describe('negative_gradient', () => {
    it('should suggest swap measurements', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const edges = [makeEdge('e1', '1', '2', { tail_measurement: '1.0', head_measurement: '2.0' })];
      const issue = { type: 'negative_gradient', edgeId: 'e1' };
      const fixes = getFixSuggestions(issue, nodes, edges);
      expect(fixes.some(f => f.id === 'swap_measurements')).toBe(true);
    });

    it('swap apply should swap tail and head measurements', () => {
      const nodes = [makeNode('1'), makeNode('2')];
      const edges = [makeEdge('e1', '1', '2', { tail_measurement: '1.0', head_measurement: '2.0' })];
      const issue = { type: 'negative_gradient', edgeId: 'e1' };
      const fixes = getFixSuggestions(issue, nodes, edges);
      fixes.find(f => f.id === 'swap_measurements')!.apply!();
      expect(edges[0].tail_measurement).toBe('2.0');
      expect(edges[0].head_measurement).toBe('1.0');
    });
  });

  describe('obstructed_access', () => {
    it('should suggest schedule revisit', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 13 })];
      const issue = { type: 'obstructed_access', nodeId: '1', reason: 'בית נעול' };
      const fixes = getFixSuggestions(issue, nodes, []);
      expect(fixes.some(f => f.id === 'schedule_revisit')).toBe(true);
    });

    it('should suggest convert to home for locked house', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 13 })];
      const issue = { type: 'obstructed_access', nodeId: '1', reason: 'בית נעול' };
      const fixes = getFixSuggestions(issue, nodes, []);
      expect(fixes.some(f => f.id === 'convert_to_home')).toBe(true);
    });

    it('should NOT suggest convert to home for non-locked statuses', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 4 })]; // covered, not locked
      const issue = { type: 'obstructed_access', nodeId: '1', reason: 'שוחה מכוסה' };
      const fixes = getFixSuggestions(issue, nodes, []);
      expect(fixes.some(f => f.id === 'convert_to_home')).toBe(false);
    });

    it('schedule_revisit apply should add note', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 13, note: '' })];
      const issue = { type: 'obstructed_access', nodeId: '1' };
      const fixes = getFixSuggestions(issue, nodes, []);
      fixes.find(f => f.id === 'schedule_revisit')!.apply!();
      expect(nodes[0].note).toContain('לחזור למדוד');
    });

    it('schedule_revisit should append to existing note', () => {
      const nodes = [makeNode('1', { maintenanceStatus: 13, note: 'existing note' })];
      const issue = { type: 'obstructed_access', nodeId: '1' };
      const fixes = getFixSuggestions(issue, nodes, []);
      fixes.find(f => f.id === 'schedule_revisit')!.apply!();
      expect(nodes[0].note).toBe('existing note; לחזור למדוד');
    });
  });

  describe('schematic_location', () => {
    it('should suggest measure coordinates with navigation', () => {
      const nodes = [makeNode('1', { accuracyLevel: 1 })];
      const issue = { type: 'schematic_location', nodeId: '1' };
      const fixes = getFixSuggestions(issue, nodes, []);
      const fix = fixes.find(f => f.id === 'measure_coordinates');
      expect(fix).toBeDefined();
      expect(fix!.navigateTo).toBeDefined();
      expect(fix!.navigateTo!.focusField).toBe('coordinates');
    });
  });

  describe('missing_tl', () => {
    it('should suggest measure TL with navigation', () => {
      const nodes = [makeNode('1', { surveyX: 1, surveyY: 2 })];
      const issue = { type: 'missing_tl', nodeId: '1' };
      const fixes = getFixSuggestions(issue, nodes, []);
      const fix = fixes.find(f => f.id === 'measure_tl');
      expect(fix).toBeDefined();
      expect(fix!.navigateTo).toBeDefined();
      expect(fix!.navigateTo!.focusField).toBe('tl');
    });

    it('should suggest fill material when material is missing', () => {
      const nodes = [makeNode('1', { surveyX: 1, surveyY: 2, material: null })];
      const issue = { type: 'missing_tl', nodeId: '1' };
      const fixes = getFixSuggestions(issue, nodes, []);
      expect(fixes.some(f => f.id === 'fill_material')).toBe(true);
    });

    it('should NOT suggest fill material when material exists', () => {
      const nodes = [makeNode('1', { surveyX: 1, surveyY: 2, material: 7 })];
      const issue = { type: 'missing_tl', nodeId: '1' };
      const fixes = getFixSuggestions(issue, nodes, []);
      expect(fixes.some(f => f.id === 'fill_material')).toBe(false);
    });
  });

  describe('missing_coords', () => {
    it('should suggest mark as schematic', () => {
      const nodes = [makeNode('1', { accuracyLevel: 0 })];
      const issue = { type: 'missing_coords', nodeId: '1' };
      const fixes = getFixSuggestions(issue, nodes, []);
      expect(fixes.some(f => f.id === 'mark_schematic')).toBe(true);
    });

    it('should NOT suggest mark schematic if already schematic', () => {
      const nodes = [makeNode('1', { accuracyLevel: 1 })];
      const issue = { type: 'missing_coords', nodeId: '1' };
      const fixes = getFixSuggestions(issue, nodes, []);
      expect(fixes.some(f => f.id === 'mark_schematic')).toBe(false);
    });

    it('mark_schematic apply should set accuracyLevel to 1', () => {
      const nodes = [makeNode('1', { accuracyLevel: 0 })];
      const issue = { type: 'missing_coords', nodeId: '1' };
      const fixes = getFixSuggestions(issue, nodes, []);
      fixes.find(f => f.id === 'mark_schematic')!.apply!();
      expect(nodes[0].accuracyLevel).toBe(1);
    });
  });

  describe('unknown issue type', () => {
    it('should return empty suggestions for unrecognized type', () => {
      const fixes = getFixSuggestions({ type: 'unknown_type' } as any, [], []);
      expect(fixes).toHaveLength(0);
    });
  });
});
