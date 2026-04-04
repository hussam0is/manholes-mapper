/**
 * Unit tests for src/utils/coordinates.js
 *
 * Tests the pure coordinate utility functions:
 * - parseCoordinatesCsv
 * - calculateCoordinateBounds
 * - surveyToCanvas
 * - calculateOptimalScale
 * - approximateUncoordinatedNodePositions
 * - applyCoordinatesToNodes
 * - saveCoordinatesToStorage / loadCoordinatesFromStorage
 * - saveCoordinatesEnabled / loadCoordinatesEnabled
 * - extractNodeItmCoordinates
 * - classifySketchCoordinates
 * - getMeasurementBoundsItm
 * - computeHypotheticalSchematicPositions
 * - computeHypotheticalSurveyPositions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseCoordinatesCsv,
  calculateCoordinateBounds,
  surveyToCanvas,
  calculateOptimalScale,
  approximateUncoordinatedNodePositions,
  applyCoordinatesToNodes,
  saveCoordinatesToStorage,
  loadCoordinatesFromStorage,
  saveCoordinatesEnabled,
  loadCoordinatesEnabled,
  extractNodeItmCoordinates,
  classifySketchCoordinates,
  getMeasurementBoundsItm,
  computeHypotheticalSchematicPositions,
  computeHypotheticalSurveyPositions,
  repositionNodesFromEmbeddedCoordinates,
} from '../../src/utils/coordinates.js';

// ─── parseCoordinatesCsv ────────────────────────────────────────────────────

describe('parseCoordinatesCsv', () => {
  it('parses a standard 4-field CSV (id,x,y,z)', () => {
    const csv = '1,178234.5,665890.3,52.1\n2,178256.1,665912.7,51.8';
    const result = parseCoordinatesCsv(csv);
    expect(result.size).toBe(2);
    expect(result.get('1')).toEqual({ x: 178234.5, y: 665890.3, z: 52.1 });
    expect(result.get('2')).toEqual({ x: 178256.1, y: 665912.7, z: 51.8 });
  });

  it('parses a 3-field CSV (id,x,y) with z defaulting to 0', () => {
    const csv = 'A,100.0,200.0\nB,110.0,210.0';
    const result = parseCoordinatesCsv(csv);
    expect(result.size).toBe(2);
    expect(result.get('A')).toEqual({ x: 100.0, y: 200.0, z: 0 });
  });

  it('skips a header row when detected', () => {
    const csv = 'id,easting,northing,elevation\n1,178234.5,665890.3,52.1';
    const result = parseCoordinatesCsv(csv);
    expect(result.size).toBe(1);
    expect(result.get('1')).toBeDefined();
  });

  it('handles Windows CRLF line endings', () => {
    const csv = '1,100.0,200.0,10.0\r\n2,110.0,210.0,11.0\r\n';
    const result = parseCoordinatesCsv(csv);
    expect(result.size).toBe(2);
  });

  it('ignores empty lines', () => {
    const csv = '1,100.0,200.0,10.0\n\n2,110.0,210.0,11.0\n';
    const result = parseCoordinatesCsv(csv);
    expect(result.size).toBe(2);
  });

  it('returns empty map for empty input', () => {
    expect(parseCoordinatesCsv('').size).toBe(0);
    expect(parseCoordinatesCsv(null as any).size).toBe(0);
  });

  it('skips rows with non-numeric coordinates', () => {
    const csv = '1,abc,200.0,10.0\n2,110.0,210.0,11.0';
    const result = parseCoordinatesCsv(csv);
    expect(result.size).toBe(1);
    expect(result.get('2')).toBeDefined();
  });

  it('handles quoted fields', () => {
    const csv = '"pt1","178000.0","665000.0","50.0"';
    const result = parseCoordinatesCsv(csv);
    expect(result.size).toBe(1);
    expect(result.get('pt1')).toEqual({ x: 178000.0, y: 665000.0, z: 50.0 });
  });
});

// ─── calculateCoordinateBounds ──────────────────────────────────────────────

describe('calculateCoordinateBounds', () => {
  it('calculates correct min/max bounds', () => {
    const map = new Map([
      ['1', { x: 100, y: 200, z: 10 }],
      ['2', { x: 300, y: 400, z: 20 }],
      ['3', { x: 200, y: 100, z: 15 }],
    ]);
    const bounds = calculateCoordinateBounds(map);
    expect(bounds.minX).toBe(100);
    expect(bounds.maxX).toBe(300);
    expect(bounds.minY).toBe(100);
    expect(bounds.maxY).toBe(400);
    expect(bounds.minZ).toBe(10);
    expect(bounds.maxZ).toBe(20);
  });

  it('handles single-point map', () => {
    const map = new Map([['1', { x: 150, y: 250, z: 5 }]]);
    const bounds = calculateCoordinateBounds(map);
    expect(bounds.minX).toBe(150);
    expect(bounds.maxX).toBe(150);
  });
});

// ─── surveyToCanvas ─────────────────────────────────────────────────────────

describe('surveyToCanvas', () => {
  const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };

  it('places center survey point at canvas center', () => {
    const result = surveyToCanvas(50, 50, bounds, 800, 600, { pixelsPerMeter: 1 });
    expect(result.x).toBeCloseTo(400);
    expect(result.y).toBeCloseTo(300);
  });

  it('flips Y axis (north-up survey → canvas down-positive)', () => {
    // point north of center should appear above center (lower y)
    const center = surveyToCanvas(50, 50, bounds, 800, 600, { pixelsPerMeter: 1 });
    const north = surveyToCanvas(50, 70, bounds, 800, 600, { pixelsPerMeter: 1 });
    expect(north.y).toBeLessThan(center.y);
  });

  it('east is right (X increases with easting)', () => {
    const center = surveyToCanvas(50, 50, bounds, 800, 600, { pixelsPerMeter: 1 });
    const east = surveyToCanvas(70, 50, bounds, 800, 600, { pixelsPerMeter: 1 });
    expect(east.x).toBeGreaterThan(center.x);
  });

  it('respects pixelsPerMeter scaling', () => {
    const r1 = surveyToCanvas(60, 50, bounds, 800, 600, { pixelsPerMeter: 1 });
    const r2 = surveyToCanvas(60, 50, bounds, 800, 600, { pixelsPerMeter: 2 });
    // With 2x scale, the offset from center should be doubled
    const center1 = surveyToCanvas(50, 50, bounds, 800, 600, { pixelsPerMeter: 1 });
    const center2 = surveyToCanvas(50, 50, bounds, 800, 600, { pixelsPerMeter: 2 });
    expect(r2.x - center2.x).toBeCloseTo(2 * (r1.x - center1.x));
  });

  it('handles zero canvas dimensions gracefully', () => {
    const result = surveyToCanvas(50, 50, bounds, 0, 0, { pixelsPerMeter: 1 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

// ─── calculateOptimalScale ──────────────────────────────────────────────────

describe('calculateOptimalScale', () => {
  it('returns a positive scale', () => {
    const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 500 };
    const scale = calculateOptimalScale(bounds, 800, 600);
    expect(scale).toBeGreaterThan(0);
  });

  it('respects min clamp (>= 0.1)', () => {
    // Huge survey extent
    const bounds = { minX: 0, maxX: 1_000_000, minY: 0, maxY: 1_000_000 };
    const scale = calculateOptimalScale(bounds, 800, 600);
    expect(scale).toBeGreaterThanOrEqual(0.1);
  });

  it('respects max clamp (<= 100)', () => {
    // Tiny survey extent (< 1m)
    const bounds = { minX: 0, maxX: 0.001, minY: 0, maxY: 0.001 };
    const scale = calculateOptimalScale(bounds, 800, 600);
    expect(scale).toBeLessThanOrEqual(100);
  });

  it('uses fillRatio to scale result', () => {
    const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    const s50 = calculateOptimalScale(bounds, 800, 600, 0.5);
    const s80 = calculateOptimalScale(bounds, 800, 600, 0.8);
    // Higher fill ratio → larger scale
    expect(s80).toBeGreaterThan(s50);
  });
});

// ─── applyCoordinatesToNodes ────────────────────────────────────────────────

describe('applyCoordinatesToNodes', () => {
  const makeNode = (id: number, x = 0, y = 0) => ({ id, x, y });

  it('returns zero matches when coordinatesMap is empty', () => {
    const nodes = [makeNode(1), makeNode(2)];
    const result = applyCoordinatesToNodes(nodes, new Map(), 800, 600);
    expect(result.matchedCount).toBe(0);
    expect(result.unmatchedCount).toBe(2);
  });

  it('sets hasCoordinates and surveyX/Y on matched nodes', () => {
    const nodes = [makeNode(1), makeNode(2)];
    const coordsMap = new Map([
      ['1', { x: 178000, y: 665000, z: 50 }],
    ]);
    const result = applyCoordinatesToNodes(nodes, coordsMap, 800, 600);
    expect(result.matchedCount).toBe(1);
    expect(result.unmatchedCount).toBe(1);
    const n1 = result.updatedNodes.find(n => n.id === 1);
    expect(n1?.hasCoordinates).toBe(true);
    expect(n1?.surveyX).toBe(178000);
    expect(n1?.surveyZ).toBe(50);
  });

  it('produces finite canvas coords for matched nodes', () => {
    const nodes = [makeNode(1), makeNode(2)];
    const coordsMap = new Map([
      ['1', { x: 178000, y: 665000, z: 50 }],
      ['2', { x: 178200, y: 665200, z: 51 }],
    ]);
    const result = applyCoordinatesToNodes(nodes, coordsMap, 800, 600);
    for (const node of result.updatedNodes) {
      if (node.hasCoordinates) {
        expect(Number.isFinite(node.x)).toBe(true);
        expect(Number.isFinite(node.y)).toBe(true);
      }
    }
  });

  it('respects user-supplied scale (userScale)', () => {
    const nodes = [makeNode(1), makeNode(2)];
    const coordsMap = new Map([
      ['1', { x: 178000, y: 665000, z: 50 }],
      ['2', { x: 178010, y: 665000, z: 50 }],
    ]);
    const r1 = applyCoordinatesToNodes(nodes.map(n => ({ ...n })), coordsMap, 800, 600, 1);
    const r2 = applyCoordinatesToNodes(nodes.map(n => ({ ...n })), coordsMap, 800, 600, 2);
    const n1a = r1.updatedNodes.find(n => n.id === 1)!;
    const n1b = r2.updatedNodes.find(n => n.id === 1)!;
    const n2a = r1.updatedNodes.find(n => n.id === 2)!;
    const n2b = r2.updatedNodes.find(n => n.id === 2)!;
    // With 2x scale, the x-separation between node 1 and 2 should be doubled
    expect(Math.abs(n2b.x - n1b.x)).toBeCloseTo(2 * Math.abs(n2a.x - n1a.x));
  });
});

// ─── approximateUncoordinatedNodePositions ──────────────────────────────────

describe('approximateUncoordinatedNodePositions', () => {
  it('returns nodes unchanged when all have coordinates', () => {
    const nodes = [
      { id: 1, x: 10, y: 10, hasCoordinates: true },
      { id: 2, x: 20, y: 20, hasCoordinates: true },
    ];
    const result = approximateUncoordinatedNodePositions(nodes, [], new Map());
    expect(result.length).toBe(2);
    // All coordinated nodes should be position-locked
    result.filter(n => n.hasCoordinates).forEach(n => {
      expect(n.positionLocked).toBe(true);
    });
  });

  it('places uncoordinated node near its coordinated neighbor', () => {
    const nodes = [
      { id: 1, x: 100, y: 100, hasCoordinates: true },
      { id: 2, x: 0, y: 0, hasCoordinates: false },
    ];
    const edges = [{ tail: 1, head: 2 }];
    const originalPositions = new Map([
      [1, { x: 50, y: 50 }],
      [2, { x: 60, y: 50 }], // original offset: +10 x
    ]);
    const result = approximateUncoordinatedNodePositions(nodes, edges, originalPositions);
    const n2 = result.find(n => n.id === 2)!;
    // Node 2 should have been moved from (0,0) to somewhere near node 1
    expect(n2.x).not.toBe(0);
    expect(n2.y).not.toBe(0);
  });
});

// ─── getMeasurementBoundsItm ────────────────────────────────────────────────

describe('getMeasurementBoundsItm', () => {
  it('returns null when no nodes have survey coords and map is empty', () => {
    const nodes = [{ id: 1, x: 10, y: 10 }];
    expect(getMeasurementBoundsItm(nodes, new Map())).toBeNull();
  });

  it('returns bounds from embedded surveyX/Y', () => {
    const nodes = [
      { id: 1, x: 0, y: 0, surveyX: 178000, surveyY: 665000 },
      { id: 2, x: 0, y: 0, surveyX: 178500, surveyY: 665800 },
    ];
    const bounds = getMeasurementBoundsItm(nodes, new Map());
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBe(178000);
    expect(bounds!.maxX).toBe(178500);
    expect(bounds!.minY).toBe(665000);
    expect(bounds!.maxY).toBe(665800);
  });

  it('falls back to coordinatesMap when no embedded coords', () => {
    const nodes = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 0 }];
    const coordsMap = new Map([
      ['1', { x: 100, y: 200, z: 0 }],
      ['2', { x: 300, y: 400, z: 0 }],
    ]);
    const bounds = getMeasurementBoundsItm(nodes, coordsMap);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBe(100);
    expect(bounds!.maxX).toBe(300);
  });
});

// ─── extractNodeItmCoordinates ──────────────────────────────────────────────

describe('extractNodeItmCoordinates', () => {
  const noOp = () => null;

  it('returns surveyX/Y when present', () => {
    const node = { id: 1, surveyX: 178000, surveyY: 665000 };
    const result = extractNodeItmCoordinates(node, noOp);
    expect(result).toEqual({ surveyX: 178000, surveyY: 665000 });
  });

  it('returns itmEasting/itmNorthing when surveyX/Y absent', () => {
    const node = { id: 1, itmEasting: 179000, itmNorthing: 666000 };
    const result = extractNodeItmCoordinates(node, noOp);
    expect(result).toEqual({ surveyX: 179000, surveyY: 666000 });
  });

  it('converts lat/lon via wgs84ToItm when only lat/lon present', () => {
    const node = { id: 1, lat: 32.0, lon: 34.8 };
    const wgs84ToItm = (lat: number, lon: number) => ({ x: 180000 + lon * 100, y: 665000 + lat * 100 });
    const result = extractNodeItmCoordinates(node, wgs84ToItm);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.surveyX)).toBe(true);
  });

  it('returns null when no coords available', () => {
    const node = { id: 1, x: 10, y: 10 };
    expect(extractNodeItmCoordinates(node, noOp)).toBeNull();
  });

  it('returns null for zero lat/lon (invalid position)', () => {
    const node = { id: 1, lat: 0, lon: 0 };
    const wgs84ToItm = () => ({ x: 0, y: 0 });
    expect(extractNodeItmCoordinates(node, wgs84ToItm)).toBeNull();
  });
});

// ─── classifySketchCoordinates ──────────────────────────────────────────────

describe('classifySketchCoordinates', () => {
  const noOp = () => null;

  it('counts nodes with and without coords', () => {
    const nodes = [
      { id: 1, surveyX: 178000, surveyY: 665000 },
      { id: 2, x: 0, y: 0 },
      { id: 3, surveyX: 178100, surveyY: 665100 },
    ];
    const result = classifySketchCoordinates(nodes, noOp);
    expect(result.withCoords).toBe(2);
    expect(result.withoutCoords).toBe(1);
    expect(result.total).toBe(3);
  });

  it('returns all-zero for empty nodes array', () => {
    const result = classifySketchCoordinates([], noOp);
    expect(result.total).toBe(0);
    expect(result.withCoords).toBe(0);
    expect(result.withoutCoords).toBe(0);
  });
});

// ─── localStorage persistence ────────────────────────────────────────────────

describe('saveCoordinatesToStorage / loadCoordinatesFromStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a coordinates map through localStorage', () => {
    const original = new Map([
      ['1', { x: 178000, y: 665000, z: 52 }],
      ['2', { x: 178500, y: 665800, z: 51 }],
    ]);
    saveCoordinatesToStorage(original);
    const loaded = loadCoordinatesFromStorage();
    expect(loaded.size).toBe(2);
    expect(loaded.get('1')).toEqual({ x: 178000, y: 665000, z: 52 });
    expect(loaded.get('2')).toEqual({ x: 178500, y: 665800, z: 51 });
  });

  it('returns empty map when nothing stored', () => {
    expect(loadCoordinatesFromStorage().size).toBe(0);
  });

  it('returns empty map when stored data is corrupt', () => {
    localStorage.setItem('graphSketch.coordinates.v1', 'not-json');
    expect(loadCoordinatesFromStorage().size).toBe(0);
  });
});

describe('saveCoordinatesEnabled / loadCoordinatesEnabled', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists enabled=true', () => {
    saveCoordinatesEnabled(true);
    expect(loadCoordinatesEnabled()).toBe(true);
  });

  it('persists enabled=false', () => {
    saveCoordinatesEnabled(false);
    expect(loadCoordinatesEnabled()).toBe(false);
  });

  it('defaults to true when nothing stored', () => {
    expect(loadCoordinatesEnabled()).toBe(true);
  });
});

// ─── computeHypotheticalSurveyPositions ─────────────────────────────────────

describe('computeHypotheticalSurveyPositions', () => {
  it('returns 0 when no schematic-only nodes exist', () => {
    // All nodes have both schematic and survey — nothing to approximate
    const nodes = [
      { id: 1, schematicX: 10, schematicY: 10, surveyX: 178000, surveyY: 665000 },
      { id: 2, schematicX: 20, schematicY: 10, surveyX: 178100, surveyY: 665000 },
    ];
    const count = computeHypotheticalSurveyPositions(nodes, []);
    expect(count).toBe(0);
  });

  it('returns 0 when no anchor nodes exist', () => {
    // Nodes have schematic positions but none have survey — can't compute scale
    const nodes = [
      { id: 1, schematicX: 10, schematicY: 10, x: 10, y: 10 },
      { id: 2, schematicX: 20, schematicY: 10, x: 20, y: 10 },
    ];
    const count = computeHypotheticalSurveyPositions(nodes, []);
    expect(count).toBe(0);
  });

  it('computes hypothetical survey coords for schematic-only node', () => {
    const nodes = [
      { id: 1, schematicX: 0, schematicY: 0, x: 0, y: 0, surveyX: 178000, surveyY: 665000 },
      { id: 2, schematicX: 100, schematicY: 0, x: 100, y: 0, surveyX: 178100, surveyY: 665000 },
      { id: 3, schematicX: 200, schematicY: 0, x: 200, y: 0 }, // no survey
    ];
    const edges = [
      { tail: 1, head: 2 },
      { tail: 2, head: 3 },
    ];
    const count = computeHypotheticalSurveyPositions(nodes, edges);
    expect(count).toBeGreaterThan(0);
    const n3 = nodes.find(n => n.id === 3)!;
    expect((n3 as any).survey_x_hypothetical).toBeDefined();
    expect(Number.isFinite((n3 as any).survey_x_hypothetical)).toBe(true);
  });
});

// ─── repositionNodesFromEmbeddedCoordinates ──────────────────────────────────

describe('repositionNodesFromEmbeddedCoordinates', () => {
  const noOpWgs84ToItm = (lat: number, lon: number) => ({ x: lon * 10000, y: lat * 10000 });

  it('hides nodes without coordinates and positions those with them', () => {
    const nodes = [
      { id: 1, x: 0, y: 0, surveyX: 178000, surveyY: 665000 },
      { id: 2, x: 0, y: 0, surveyX: 178100, surveyY: 665100 },
      { id: 3, x: 50, y: 50 }, // no survey coords
    ];
    const result = repositionNodesFromEmbeddedCoordinates(
      nodes, 3, 800, 600, noOpWgs84ToItm
    );
    const n1 = nodes.find(n => n.id === 1)!;
    const n3 = nodes.find(n => n.id === 3)!;
    expect(n1.hasCoordinates).toBe(true);
    expect((n3 as any)._hidden).toBe(true);
    expect(result.referencePoint).not.toBeNull();
  });

  it('returns null reference point when all nodes lack coords', () => {
    const nodes = [{ id: 1, x: 0, y: 0 }];
    const result = repositionNodesFromEmbeddedCoordinates(nodes, 3, 800, 600, noOpWgs84ToItm);
    expect(result.referencePoint).toBeNull();
  });
});
