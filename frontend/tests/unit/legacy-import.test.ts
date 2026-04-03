/**
 * Unit tests for src/utils/legacy-import.js
 *
 * Tests the browser-compatible legacy sketch + CSV import logic:
 * - CSV parsing
 * - Node matching (exact + case-insensitive)
 * - Coordinate placement (surveyToCanvas)
 * - Schematic position propagation (BFS)
 * - Full importLegacySketch() integration
 */

import { describe, it, expect } from 'vitest';
import {
  parseCoordsCSV,
  importLegacySketch,
  readFileAsText,
  readFileAsJson,
} from '../../src/utils/legacy-import.js';

// ── parseCoordsCSV ─────────────────────────────────────────────────────────

describe('parseCoordsCSV', () => {
  it('parses a standard CSV with X Y Z', () => {
    const csv = `1,178234.5,665890.3,52.1\n2,178256.1,665912.7,51.8`;
    const result = parseCoordsCSV(csv);
    expect(result.size).toBe(2);
    expect(result.get('1')).toEqual({ x: 178234.5, y: 665890.3, z: 52.1 });
    expect(result.get('2')).toEqual({ x: 178256.1, y: 665912.7, z: 51.8 });
  });

  it('parses CSV without elevation (z = null)', () => {
    const csv = `5,200000.0,700000.0`;
    const result = parseCoordsCSV(csv);
    expect(result.get('5')).toEqual({ x: 200000.0, y: 700000.0, z: null });
  });

  it('ignores lines with fewer than 3 columns', () => {
    const csv = `1,178234.5\n2,178256.1,665912.7`;
    const result = parseCoordsCSV(csv);
    expect(result.size).toBe(1);
    expect(result.has('1')).toBe(false);
    expect(result.has('2')).toBe(true);
  });

  it('ignores lines with non-numeric coordinates', () => {
    const csv = `a,bad,data\n1,178234.5,665890.3`;
    const result = parseCoordsCSV(csv);
    expect(result.size).toBe(1);
    expect(result.has('a')).toBe(false);
  });

  it('handles CRLF line endings', () => {
    const csv = `1,100.0,200.0\r\n2,300.0,400.0`;
    const result = parseCoordsCSV(csv);
    expect(result.size).toBe(2);
  });

  it('trims whitespace from IDs and values', () => {
    const csv = ` 7 , 178234.5 , 665890.3 `;
    const result = parseCoordsCSV(csv);
    expect(result.has('7')).toBe(true);
  });

  it('returns empty map for empty string', () => {
    const result = parseCoordsCSV('');
    expect(result.size).toBe(0);
  });
});

// ── importLegacySketch ─────────────────────────────────────────────────────

function makeSketchData(nodes: any[], edges: any[] = [], extras: any = {}) {
  return {
    sketch: {
      nodes,
      edges,
      nextNodeId: nodes.length + 1,
      creationDate: '2024-01-01',
      ...extras,
    },
  };
}

const SAMPLE_NODES = [
  { id: '1', x: 0, y: 0, type: 'type1', nodeType: 'Manhole' },
  { id: '2', x: 100, y: 0, type: 'type1', nodeType: 'Manhole' },
  { id: '3', x: 200, y: 0, type: 'type1', nodeType: 'Manhole' },
];

const SAMPLE_EDGES = [
  { tail: '1', head: '2', edge_type: 'קו ראשי', material: 'פי. וי. סי. לפי ת' },
  { tail: '2', head: '3', edge_type: 'קו ראשי', material: 'פי. וי. סי. לפי ת' },
];

const SAMPLE_CSV = [
  '1,178100.0,665000.0,50.0',
  '2,178200.0,665000.0,50.0',
].join('\n');

describe('importLegacySketch', () => {
  it('returns a versioned output sketch object', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    expect(result.version).toBe('1.1');
    expect(result.exportDate).toBeTruthy();
    expect(result.sketch).toBeTruthy();
  });

  it('preserves all nodes', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    expect(result.sketch.nodes).toHaveLength(3);
  });

  it('preserves all edges', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    expect(result.sketch.edges).toHaveLength(2);
  });

  it('marks matched nodes with hasCoordinates=true', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    const n1 = result.sketch.nodes.find((n: any) => n.id === '1');
    const n2 = result.sketch.nodes.find((n: any) => n.id === '2');
    expect(n1.hasCoordinates).toBe(true);
    expect(n2.hasCoordinates).toBe(true);
  });

  it('marks unmatched nodes with hasCoordinates=false and accuracyLevel=1', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    const n3 = result.sketch.nodes.find((n: any) => n.id === '3');
    expect(n3.hasCoordinates).toBe(false);
    expect(n3.accuracyLevel).toBe(1); // Schematic
  });

  it('assigns survey coordinates to matched nodes', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    const n1 = result.sketch.nodes.find((n: any) => n.id === '1');
    expect(n1.surveyX).toBe(178100.0);
    expect(n1.surveyY).toBe(665000.0);
    expect(n1.surveyZ).toBe(50.0);
  });

  it('assigns accuracyLevel=0 (Engineering) to matched nodes', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    const n1 = result.sketch.nodes.find((n: any) => n.id === '1');
    expect(n1.accuracyLevel).toBe(0);
  });

  it('gives unmatched nodes a valid position via BFS propagation', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    const n3 = result.sketch.nodes.find((n: any) => n.id === '3');
    expect(typeof n3.x).toBe('number');
    expect(typeof n3.y).toBe('number');
    expect(isNaN(n3.x)).toBe(false);
    expect(isNaN(n3.y)).toBe(false);
  });

  it('handles case-insensitive node ID matching', () => {
    const nodes = [{ id: 'N-01', x: 0, y: 0, type: 'type1', nodeType: 'Manhole' }];
    const csv = 'n-01,178100.0,665000.0,50.0';
    const result = importLegacySketch(makeSketchData(nodes), csv);
    const node = result.sketch.nodes[0];
    expect(node.hasCoordinates).toBe(true);
  });

  it('handles empty edges array gracefully', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, []), SAMPLE_CSV);
    expect(result.sketch.edges).toHaveLength(0);
  });

  it('handles sketch data without .sketch wrapper', () => {
    // Some old exports may not wrap in {sketch: ...}
    const rawSketch = {
      nodes: SAMPLE_NODES,
      edges: SAMPLE_EDGES,
      nextNodeId: 4,
      creationDate: '2024-01-01',
    };
    const result = importLegacySketch(rawSketch, SAMPLE_CSV);
    expect(result.sketch.nodes).toHaveLength(3);
  });

  it('produces a name starting with "Legacy Import"', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    expect(result.sketch.name).toMatch(/^Legacy Import/);
  });

  it('sets currentSketchId to null (gets new ID on import)', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    expect(result.sketch.id).toBeNull();
  });

  it('handles all nodes having coordinates (no schematic nodes)', () => {
    const csv = '1,178100.0,665000.0\n2,178200.0,665000.0\n3,178300.0,665000.0';
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), csv);
    const schematic = result.sketch.nodes.filter((n: any) => !n.hasCoordinates);
    expect(schematic).toHaveLength(0);
  });

  it('handles all nodes missing coordinates (all schematic)', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), '');
    const schematic = result.sketch.nodes.filter((n: any) => !n.hasCoordinates);
    expect(schematic).toHaveLength(3);
    // All nodes should still have numeric positions
    for (const n of result.sketch.nodes) {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
    }
  });

  it('preserves edge fields from old format', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    const e = result.sketch.edges[0];
    expect(e.tail).toBe('1');
    expect(e.head).toBe('2');
    expect(e.edge_type).toBe('קו ראשי');
  });

  it('assigns createdAt timestamps to nodes and edges', () => {
    const result = importLegacySketch(makeSketchData(SAMPLE_NODES, SAMPLE_EDGES), SAMPLE_CSV);
    for (const n of result.sketch.nodes) {
      expect(n.createdAt).toBeTruthy();
    }
    for (const e of result.sketch.edges) {
      expect(e.createdAt).toBeTruthy();
    }
  });
});

// ── readFileAsText / readFileAsJson ────────────────────────────────────────

describe('readFileAsText', () => {
  it('reads a Blob as text', async () => {
    const blob = new Blob(['hello world'], { type: 'text/plain' });
    const file = new File([blob], 'test.txt', { type: 'text/plain' });
    const text = await readFileAsText(file);
    expect(text).toBe('hello world');
  });
});

describe('readFileAsJson', () => {
  it('reads a Blob as parsed JSON', async () => {
    const data = { hello: 'world', num: 42 };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const file = new File([blob], 'test.json', { type: 'application/json' });
    const result = await readFileAsJson(file);
    expect(result).toEqual(data);
  });

  it('throws on invalid JSON', async () => {
    const blob = new Blob(['not json'], { type: 'application/json' });
    const file = new File([blob], 'bad.json', { type: 'application/json' });
    await expect(readFileAsJson(file)).rejects.toThrow();
  });
});
