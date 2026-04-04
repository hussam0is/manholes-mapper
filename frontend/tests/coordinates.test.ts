import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseCoordinatesCsv,
  calculateCoordinateBounds,
  surveyToCanvas,
  applyCoordinatesToNodes,
  createCoordinateLookup,
  approximateUncoordinatedNodePositions,
  getMeasurementBoundsItm,
  calculateOptimalScale,
  extractNodeItmCoordinates,
  classifySketchCoordinates,
  computeHypotheticalSchematicPositions,
  computeHypotheticalSurveyPositions,
  repositionNodesFromEmbeddedCoordinates,
} from '../src/utils/coordinates.js';

describe('Coordinates Module', () => {
  describe('parseCoordinatesCsv', () => {
    it('should parse CSV with header row', () => {
      const csv = `point_id,x,y,z
1,200000.123,600000.456,50.5
2,200100.789,600100.012,51.2
3,200050.000,600050.000,50.8`;

      const result = parseCoordinatesCsv(csv);

      expect(result.size).toBe(3);
      expect(result.get('1')).toEqual({ x: 200000.123, y: 600000.456, z: 50.5 });
      expect(result.get('2')).toEqual({ x: 200100.789, y: 600100.012, z: 51.2 });
      expect(result.get('3')).toEqual({ x: 200050.000, y: 600050.000, z: 50.8 });
    });

    it('should parse CSV without header row', () => {
      const csv = `1,200000.123,600000.456,50.5
2,200100.789,600100.012,51.2`;

      const result = parseCoordinatesCsv(csv);

      expect(result.size).toBe(2);
      expect(result.get('1')).toEqual({ x: 200000.123, y: 600000.456, z: 50.5 });
      expect(result.get('2')).toEqual({ x: 200100.789, y: 600100.012, z: 51.2 });
    });

    it('should handle ITM coordinates (large numbers)', () => {
      // Typical ITM coordinates for Israel
      const csv = `point_id,x,y,z
101,182456.789,654321.123,45.67
102,182556.890,654421.234,46.78
103,182356.123,654221.456,44.56`;

      const result = parseCoordinatesCsv(csv);

      expect(result.size).toBe(3);
      expect(result.get('101')).toEqual({ x: 182456.789, y: 654321.123, z: 45.67 });
      expect(result.get('102')).toEqual({ x: 182556.890, y: 654421.234, z: 46.78 });
      expect(result.get('103')).toEqual({ x: 182356.123, y: 654221.456, z: 44.56 });
    });

    it('should handle empty lines and whitespace', () => {
      const csv = `point_id,x,y,z

1,200000,600000,50

2,200100,600100,51
`;

      const result = parseCoordinatesCsv(csv);
      expect(result.size).toBe(2);
    });

    it('should handle quoted values in CSV', () => {
      const csv = `"point_id","x","y","z"
"1","200000.123","600000.456","50.5"`;

      const result = parseCoordinatesCsv(csv);
      expect(result.size).toBe(1);
      expect(result.get('1')).toEqual({ x: 200000.123, y: 600000.456, z: 50.5 });
    });

    it('should skip invalid rows', () => {
      const csv = `point_id,x,y,z
1,200000,600000,50
invalid,abc,def,ghi
2,200100,600100,51`;

      const result = parseCoordinatesCsv(csv);
      expect(result.size).toBe(2);
      expect(result.has('invalid')).toBe(false);
    });

    it('should return empty map for empty input', () => {
      expect(parseCoordinatesCsv('')).toEqual(new Map());
      expect(parseCoordinatesCsv(null as any)).toEqual(new Map());
      expect(parseCoordinatesCsv(undefined as any)).toEqual(new Map());
    });
  });

  describe('calculateCoordinateBounds', () => {
    it('should calculate correct bounds for ITM coordinates', () => {
      const coords = new Map([
        ['1', { x: 182000, y: 654000, z: 40 }],
        ['2', { x: 183000, y: 655000, z: 60 }],
        ['3', { x: 182500, y: 654500, z: 50 }],
      ]);

      const bounds = calculateCoordinateBounds(coords);

      expect(bounds.minX).toBe(182000);
      expect(bounds.maxX).toBe(183000);
      expect(bounds.minY).toBe(654000);
      expect(bounds.maxY).toBe(655000);
      expect(bounds.minZ).toBe(40);
      expect(bounds.maxZ).toBe(60);
    });

    it('should handle single coordinate', () => {
      const coords = new Map([
        ['1', { x: 182500, y: 654500, z: 50 }],
      ]);

      const bounds = calculateCoordinateBounds(coords);

      expect(bounds.minX).toBe(182500);
      expect(bounds.maxX).toBe(182500);
      expect(bounds.minY).toBe(654500);
      expect(bounds.maxY).toBe(654500);
    });
  });

  describe('surveyToCanvas', () => {
    const canvasWidth = 800;
    const canvasHeight = 600;

    it('should transform ITM coordinates to canvas coordinates', () => {
      const bounds = {
        minX: 182000,
        maxX: 183000,
        minY: 654000,
        maxY: 655000,
      };

      // Test corner points - use options object for pixelsPerMeter
      const bottomLeft = surveyToCanvas(182000, 654000, bounds, canvasWidth, canvasHeight, { pixelsPerMeter: 0.5 });
      const topRight = surveyToCanvas(183000, 655000, bounds, canvasWidth, canvasHeight, { pixelsPerMeter: 0.5 });
      const center = surveyToCanvas(182500, 654500, bounds, canvasWidth, canvasHeight, { pixelsPerMeter: 0.5 });

      // Canvas Y is flipped, so bottomLeft in survey becomes higher Y in canvas
      // And topRight in survey becomes lower Y in canvas
      expect(bottomLeft.y).toBeGreaterThan(topRight.y);
      
      // Center of survey should map to center of canvas
      expect(center.x).toBeCloseTo(canvasWidth / 2, 0);
      expect(center.y).toBeCloseTo(canvasHeight / 2, 0);
      
      // Points should maintain relative positions
      expect(topRight.x).toBeGreaterThan(bottomLeft.x); // East is right
      expect(bottomLeft.y).toBeGreaterThan(topRight.y); // North is up (flipped to down in canvas)
    });

    it('should maintain aspect ratio', () => {
      // Square survey area - 1000m x 1000m
      const squareBounds = {
        minX: 182000,
        maxX: 183000,
        minY: 654000,
        maxY: 655000,
      };

      const scale = { pixelsPerMeter: 1 };
      const p1 = surveyToCanvas(182000, 654000, squareBounds, canvasWidth, canvasHeight, scale);
      const p2 = surveyToCanvas(183000, 654000, squareBounds, canvasWidth, canvasHeight, scale);
      const p3 = surveyToCanvas(182000, 655000, squareBounds, canvasWidth, canvasHeight, scale);

      const canvasXDist = Math.abs(p2.x - p1.x);
      const canvasYDist = Math.abs(p3.y - p1.y);

      // With uniform scale, X and Y distances should be equal (1000m each = 1000px each)
      expect(canvasXDist).toBeCloseTo(1000, 0);
      expect(canvasYDist).toBeCloseTo(1000, 0);
    });

    it('should handle very small coordinate differences', () => {
      // Small area - 10 meters
      const smallBounds = {
        minX: 182500,
        maxX: 182510,
        minY: 654500,
        maxY: 654510,
      };

      // With default 3 pixels/meter, 10m = 30 pixels
      const p1 = surveyToCanvas(182500, 654500, smallBounds, canvasWidth, canvasHeight, { pixelsPerMeter: 3 });
      const p2 = surveyToCanvas(182510, 654510, smallBounds, canvasWidth, canvasHeight, { pixelsPerMeter: 3 });

      // 10 meters at 3 pixels/meter = 30 pixels difference
      expect(Math.abs(p2.x - p1.x)).toBeCloseTo(30, 0);
      expect(Math.abs(p2.y - p1.y)).toBeCloseTo(30, 0);
      
      // With higher scale (10 pixels/meter), should spread more
      const p3 = surveyToCanvas(182500, 654500, smallBounds, canvasWidth, canvasHeight, { pixelsPerMeter: 10 });
      const p4 = surveyToCanvas(182510, 654510, smallBounds, canvasWidth, canvasHeight, { pixelsPerMeter: 10 });
      
      expect(Math.abs(p4.x - p3.x)).toBeCloseTo(100, 0);
      expect(Math.abs(p4.y - p3.y)).toBeCloseTo(100, 0);
    });

    it('should handle identical coordinates (single point)', () => {
      const singlePointBounds = {
        minX: 182500,
        maxX: 182500,
        minY: 654500,
        maxY: 654500,
      };

      // Should not throw and return valid coordinates
      const result = surveyToCanvas(182500, 654500, singlePointBounds, canvasWidth, canvasHeight, { pixelsPerMeter: 3 });
      
      expect(Number.isFinite(result.x)).toBe(true);
      expect(Number.isFinite(result.y)).toBe(true);
      // Single point at center of bounds should be at center of canvas
      expect(result.x).toBeCloseTo(canvasWidth / 2, 0);
      expect(result.y).toBeCloseTo(canvasHeight / 2, 0);
    });
  });

  describe('applyCoordinatesToNodes', () => {
    const canvasWidth = 800;
    const canvasHeight = 600;

    it('should apply ITM coordinates to matching nodes', () => {
      const nodes = [
        { id: 1, x: 100, y: 100, nodeType: 'Manhole' },
        { id: 2, x: 200, y: 200, nodeType: 'Manhole' },
        { id: 3, x: 300, y: 300, nodeType: 'Manhole' },
      ];

      const coords = new Map([
        ['1', { x: 182000, y: 654000, z: 50 }],
        ['2', { x: 183000, y: 655000, z: 51 }],
        ['3', { x: 182500, y: 654500, z: 52 }],
      ]);

      const result = applyCoordinatesToNodes(nodes, coords, canvasWidth, canvasHeight);

      expect(result.matchedCount).toBe(3);
      expect(result.unmatchedCount).toBe(0);

      // All nodes should be marked with hasCoordinates
      result.updatedNodes.forEach(node => {
        expect(node.hasCoordinates).toBe(true);
        expect(node.surveyX).toBeDefined();
        expect(node.surveyY).toBeDefined();
        expect(node.surveyZ).toBeDefined();
      });

      // Node positions should be different from original
      expect(result.updatedNodes[0].x).not.toBe(100);
      expect(result.updatedNodes[0].y).not.toBe(100);

      // Nodes should be spread across canvas (not converging to single point)
      const positions = result.updatedNodes.map(n => ({ x: n.x, y: n.y }));
      const xSpread = Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x));
      const ySpread = Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y));
      
      expect(xSpread).toBeGreaterThan(100); // Should have significant spread
      expect(ySpread).toBeGreaterThan(100);
    });

    it('should handle partial coordinate matches', () => {
      const nodes = [
        { id: 1, x: 100, y: 100, nodeType: 'Manhole' },
        { id: 2, x: 200, y: 200, nodeType: 'Manhole' },
        { id: 3, x: 300, y: 300, nodeType: 'Manhole' },
      ];

      // Only coordinates for node 1 and 3
      const coords = new Map([
        ['1', { x: 182000, y: 654000, z: 50 }],
        ['3', { x: 183000, y: 655000, z: 52 }],
      ]);

      const result = applyCoordinatesToNodes(nodes, coords, canvasWidth, canvasHeight);

      expect(result.matchedCount).toBe(2);
      expect(result.unmatchedCount).toBe(1);

      // Node 2 should keep original position and be marked as missing coordinates
      const node2 = result.updatedNodes.find(n => n.id === 2);
      expect(node2?.hasCoordinates).toBe(false);
      expect(node2?.x).toBe(200);
      expect(node2?.y).toBe(200);
    });

    it('should handle nodes with string IDs', () => {
      const nodes = [
        { id: 'A1', x: 100, y: 100, nodeType: 'Manhole' },
        { id: 'B2', x: 200, y: 200, nodeType: 'Manhole' },
      ];

      const coords = new Map([
        ['A1', { x: 182000, y: 654000, z: 50 }],
        ['B2', { x: 183000, y: 655000, z: 51 }],
      ]);

      const result = applyCoordinatesToNodes(nodes, coords, canvasWidth, canvasHeight);

      expect(result.matchedCount).toBe(2);
      expect(result.unmatchedCount).toBe(0);
    });

    it('should handle empty coordinate map', () => {
      const nodes = [
        { id: 1, x: 100, y: 100, nodeType: 'Manhole' },
      ];

      const result = applyCoordinatesToNodes(nodes, new Map(), canvasWidth, canvasHeight);

      expect(result.matchedCount).toBe(0);
      expect(result.unmatchedCount).toBe(1);
      expect(result.updatedNodes[0].x).toBe(100);
      expect(result.updatedNodes[0].y).toBe(100);
    });

    it('should handle real-world ITM coordinate spread', () => {
      // Simulate a real network with typical ITM values
      const nodes = [];
      for (let i = 1; i <= 20; i++) {
        nodes.push({ id: i, x: i * 10, y: i * 10, nodeType: 'Manhole' });
      }

      // Create coordinates spread over ~200m x 200m area
      const coords = new Map();
      for (let i = 1; i <= 20; i++) {
        coords.set(String(i), {
          x: 182000 + (i % 5) * 50,  // X spread over 200m
          y: 654000 + Math.floor(i / 5) * 50,  // Y spread over 200m
          z: 50 + i * 0.5
        });
      }

      // Use a small scale to fit in canvas for testing
      const result = applyCoordinatesToNodes(nodes, coords, canvasWidth, canvasHeight, 2);

      expect(result.matchedCount).toBe(20);
      
      // Check that nodes are distributed, not converging to a single point
      const xs = result.updatedNodes.map(n => n.x);
      const ys = result.updatedNodes.map(n => n.y);
      
      const xRange = Math.max(...xs) - Math.min(...xs);
      const yRange = Math.max(...ys) - Math.min(...ys);
      
      // With 200m spread at 2 pixels/meter = 400 pixel spread
      expect(xRange).toBeGreaterThan(200);
      expect(yRange).toBeGreaterThan(200);
      
      // All positions should be valid numbers
      xs.forEach(x => {
        expect(Number.isFinite(x)).toBe(true);
      });
      ys.forEach(y => {
        expect(Number.isFinite(y)).toBe(true);
      });
    });
  });

  describe('createCoordinateLookup', () => {
    it('should provide lookup functions', () => {
      const coords = new Map([
        ['1', { x: 182000, y: 654000, z: 50 }],
        ['2', { x: 183000, y: 655000, z: 51 }],
      ]);

      const lookup = createCoordinateLookup(coords);

      expect(lookup.hasCoordinates(1)).toBe(true);
      expect(lookup.hasCoordinates('1')).toBe(true);
      expect(lookup.hasCoordinates(2)).toBe(true);
      expect(lookup.hasCoordinates(3)).toBe(false);

      expect(lookup.getCoordinates(1)).toEqual({ x: 182000, y: 654000, z: 50 });
      expect(lookup.getCoordinates(3)).toBeNull();

      expect(lookup.count()).toBe(2);
      expect(lookup.getAllEntries().length).toBe(2);
    });
  });

  describe('approximateUncoordinatedNodePositions', () => {
    it('should position uncoordinated nodes using distance ratio and angle', () => {
      // Node 1 and 3 have coordinates, node 2 doesn't
      // Original positions stored for calculating ratios
      const originalPositions = new Map([
        [1, { x: 0, y: 0 }],
        [2, { x: 100, y: 0 }],  // 100px right of node 1
        [3, { x: 200, y: 0 }],  // 200px right of node 1
      ]);
      
      const nodes = [
        { id: 1, x: 50, y: 50, hasCoordinates: true },   // Moved to new position
        { id: 2, x: 500, y: 500, hasCoordinates: false }, // Should be repositioned
        { id: 3, x: 150, y: 50, hasCoordinates: true },  // Moved to new position (100px from node 1)
      ];

      // Edge connects node 2 to nodes 1 and 3
      const edges = [
        { tail: 1, head: 2 },
        { tail: 2, head: 3 },
      ];

      const result = approximateUncoordinatedNodePositions(nodes, edges, originalPositions);
      const node2 = result.find(n => n.id === 2);

      // Scale factor: new dist 1-3 (100px) / old dist 1-3 (200px) = 0.5
      // Node 2 was 100px right of node 1 originally, so should be 50px right now
      // Node 2 should be positioned between nodes 1 and 3
      expect(node2!.x).toBeGreaterThan(40);
      expect(node2!.x).toBeLessThan(160);
    });

    it('should lock nodes with coordinates', () => {
      const nodes = [
        { id: 1, x: 100, y: 100, hasCoordinates: true },
        { id: 2, x: 200, y: 200, hasCoordinates: true },
      ];

      const edges = [{ tail: 1, head: 2 }];

      const result = approximateUncoordinatedNodePositions(nodes, edges, new Map());

      // Nodes with coordinates should be locked
      expect(result[0].positionLocked).toBe(true);
      expect(result[1].positionLocked).toBe(true);
    });

    it('should not lock uncoordinated nodes', () => {
      const originalPositions = new Map([
        [1, { x: 100, y: 100 }],
        [2, { x: 200, y: 100 }],
      ]);
      
      const nodes = [
        { id: 1, x: 100, y: 100, hasCoordinates: true },
        { id: 2, x: 500, y: 500, hasCoordinates: false },
      ];

      const edges = [{ tail: 1, head: 2 }];

      const result = approximateUncoordinatedNodePositions(nodes, edges, originalPositions);
      const node2 = result.find(n => n.id === 2);

      // Uncoordinated node should NOT be locked (can still be moved manually)
      expect(node2!.positionLocked).toBe(false);
    });

    it('should position isolated uncoordinated nodes at centroid', () => {
      const nodes = [
        { id: 1, x: 100, y: 100, hasCoordinates: true },
        { id: 2, x: 200, y: 200, hasCoordinates: true },
        { id: 3, x: 900, y: 900, hasCoordinates: false }, // No edges
      ];

      const edges = [
        { tail: 1, head: 2 },
      ];

      const result = approximateUncoordinatedNodePositions(nodes, edges, new Map());
      const node3 = result.find(n => n.id === 3);

      // Node 3 should be at centroid of positioned nodes (150, 150) with some variance
      expect(node3!.x).toBeGreaterThan(100);
      expect(node3!.x).toBeLessThan(200);
      expect(node3!.y).toBeGreaterThan(100);
      expect(node3!.y).toBeLessThan(200);
    });

    it('should preserve angle from original sketch', () => {
      // Original: node 2 is directly above node 1 (angle = -90 degrees / -π/2)
      const originalPositions = new Map([
        [1, { x: 100, y: 100 }],
        [2, { x: 100, y: 0 }],   // Directly above (y is smaller = up in canvas coords)
      ]);
      
      const nodes = [
        { id: 1, x: 200, y: 200, hasCoordinates: true },
        { id: 2, x: 500, y: 500, hasCoordinates: false },
      ];

      const edges = [{ tail: 1, head: 2 }];

      const result = approximateUncoordinatedNodePositions(nodes, edges, originalPositions);
      const node2 = result.find(n => n.id === 2);

      // Node 2 should be positioned above node 1 (same angle as original)
      expect(node2!.x).toBeCloseTo(200, 0);  // Same x as anchor
      expect(node2!.y).toBeLessThan(200);     // Above (smaller y)
    });
  });

  describe('getMeasurementBoundsItm', () => {
    it('should return bounds from node surveyX/Y', () => {
      const nodes = [
        { id: 1, surveyX: 182000, surveyY: 654000 },
        { id: 2, surveyX: 183000, surveyY: 655000 },
        { id: 3, surveyX: 182500, surveyY: 654500 },
      ];
      const result = getMeasurementBoundsItm(nodes, new Map());
      expect(result).not.toBeNull();
      expect(result!.minX).toBe(182000);
      expect(result!.maxX).toBe(183000);
      expect(result!.minY).toBe(654000);
      expect(result!.maxY).toBe(655000);
    });

    it('should fall back to coordinatesMap when nodes have no surveyX/Y', () => {
      const nodes = [
        { id: 1 },
        { id: 2 },
      ];
      const coordsMap = new Map([
        ['1', { x: 182100, y: 654100, z: 0 }],
        ['2', { x: 182900, y: 654900, z: 0 }],
      ]);
      const result = getMeasurementBoundsItm(nodes, coordsMap);
      expect(result).not.toBeNull();
      expect(result!.minX).toBe(182100);
      expect(result!.maxX).toBe(182900);
      expect(result!.minY).toBe(654100);
      expect(result!.maxY).toBe(654900);
    });

    it('should prefer surveyX/Y over coordinatesMap', () => {
      const nodes = [
        { id: 1, surveyX: 182000, surveyY: 654000 },
        { id: 2, surveyX: 182200, surveyY: 654200 },
      ];
      // coordinatesMap has different (wider) bounds — should be ignored
      const coordsMap = new Map([
        ['1', { x: 100000, y: 500000, z: 0 }],
        ['2', { x: 300000, y: 700000, z: 0 }],
      ]);
      const result = getMeasurementBoundsItm(nodes, coordsMap);
      expect(result!.minX).toBe(182000);
      expect(result!.maxX).toBe(182200);
    });

    it('should return null when no nodes have coordinates', () => {
      const nodes = [{ id: 1 }, { id: 2 }];
      const result = getMeasurementBoundsItm(nodes, new Map());
      expect(result).toBeNull();
    });

    it('should handle single-node case', () => {
      const nodes = [{ id: 5, surveyX: 182500, surveyY: 654500 }];
      const result = getMeasurementBoundsItm(nodes, new Map());
      expect(result).not.toBeNull();
      expect(result!.minX).toBe(182500);
      expect(result!.maxX).toBe(182500);
      expect(result!.minY).toBe(654500);
      expect(result!.maxY).toBe(654500);
    });

    it('should handle empty nodes array', () => {
      const result = getMeasurementBoundsItm([], new Map());
      expect(result).toBeNull();
    });
  });

  // ── calculateOptimalScale ────────────────────────────────────────────────

  describe('calculateOptimalScale', () => {
    it('should produce a scale that fills the canvas reasonably', () => {
      // 500m × 300m survey extent on 800×600 canvas
      const bounds = { minX: 180000, maxX: 180500, minY: 665000, maxY: 665300 };
      const scale = calculateOptimalScale(bounds, 800, 600, 0.7);
      // expected: min(800*0.7/500, 600*0.7/300) = min(1.12, 1.4) = 1.12
      expect(scale).toBeCloseTo(1.12, 1);
    });

    it('should clamp to minimum 0.1 px/m for very large surveys', () => {
      // 100 km survey extent
      const bounds = { minX: 0, maxX: 100000, minY: 0, maxY: 100000 };
      const scale = calculateOptimalScale(bounds, 800, 600, 0.7);
      expect(scale).toBeGreaterThanOrEqual(0.1);
    });

    it('should clamp to maximum 100 px/m for tiny surveys', () => {
      // 1 cm survey extent (degenerate)
      const bounds = { minX: 0, maxX: 0.01, minY: 0, maxY: 0.01 };
      const scale = calculateOptimalScale(bounds, 800, 600, 0.7);
      expect(scale).toBeLessThanOrEqual(100);
    });

    it('should prefer width-limited scale to preserve aspect ratio', () => {
      // Wide survey (1000m × 100m) on 800×600 canvas
      const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 100 };
      const scale = calculateOptimalScale(bounds, 800, 600, 0.7);
      const scaleX = (800 * 0.7) / 1000;
      const scaleY = (600 * 0.7) / 100;
      expect(scale).toBeCloseTo(Math.min(scaleX, scaleY), 3);
    });
  });

  // ── extractNodeItmCoordinates ────────────────────────────────────────────

  describe('extractNodeItmCoordinates', () => {
    const mockWgs84ToItm = (lat: number, lon: number) => ({
      x: 180000 + (lon - 35) * 90000,
      y: 660000 + (lat - 32) * 111000,
    });

    it('should extract surveyX/Y directly when present', () => {
      const node = { id: 1, surveyX: 185000, surveyY: 665000 };
      const result = extractNodeItmCoordinates(node, mockWgs84ToItm);
      expect(result).toEqual({ surveyX: 185000, surveyY: 665000 });
    });

    it('should fall back to itmEasting/itmNorthing', () => {
      const node = { id: 1, itmEasting: 185000, itmNorthing: 665000 };
      const result = extractNodeItmCoordinates(node, mockWgs84ToItm);
      expect(result).toEqual({ surveyX: 185000, surveyY: 665000 });
    });

    it('should convert lat/lon to ITM when no direct coords', () => {
      const node = { id: 1, lat: 32.0, lon: 35.0 };
      const result = extractNodeItmCoordinates(node, mockWgs84ToItm);
      expect(result).not.toBeNull();
      expect(result!.surveyX).toBeCloseTo(180000, -2);
      expect(result!.surveyY).toBeCloseTo(660000, -2);
    });

    it('should return null when no coordinate fields are present', () => {
      const node = { id: 1, x: 100, y: 200 };
      const result = extractNodeItmCoordinates(node, mockWgs84ToItm);
      expect(result).toBeNull();
    });

    it('should return null for zero lat/lon (invalid GPS default)', () => {
      const node = { id: 1, lat: 0, lon: 0 };
      const result = extractNodeItmCoordinates(node, mockWgs84ToItm);
      expect(result).toBeNull();
    });
  });

  // ── classifySketchCoordinates ────────────────────────────────────────────

  describe('classifySketchCoordinates', () => {
    const mockWgs84ToItm = (lat: number, lon: number) => ({
      x: 180000 + (lon - 35) * 90000,
      y: 660000 + (lat - 32) * 111000,
    });

    it('should count nodes with and without coordinates', () => {
      const nodes = [
        { id: 1, surveyX: 185000, surveyY: 665000 },
        { id: 2, x: 100, y: 200 },
        { id: 3, surveyX: 186000, surveyY: 666000 },
      ];
      const result = classifySketchCoordinates(nodes, mockWgs84ToItm);
      expect(result.withCoords).toBe(2);
      expect(result.withoutCoords).toBe(1);
      expect(result.total).toBe(3);
    });

    it('should return all zeros for empty nodes array', () => {
      const result = classifySketchCoordinates([], mockWgs84ToItm);
      expect(result).toEqual({ withCoords: 0, withoutCoords: 0, total: 0 });
    });
  });

  // ── computeHypotheticalSurveyPositions ───────────────────────────────────

  describe('computeHypotheticalSurveyPositions', () => {
    it('should assign hypothetical survey coords to schematic-only nodes', () => {
      // Anchor: both schematic and survey coords
      const anchor = { id: 1, schematicX: 100, schematicY: 100, surveyX: 185000, surveyY: 665000, x: 100, y: 100 };
      // Target: only schematic, no survey coords
      const target = { id: 2, schematicX: 200, schematicY: 100, x: 200, y: 100 } as any;
      const edges = [{ tail: 1, head: 2 }];

      const count = computeHypotheticalSurveyPositions([anchor, target], edges);
      expect(count).toBeGreaterThan(0);
      expect(target.survey_x_hypothetical).toBeDefined();
      expect(typeof target.survey_x_hypothetical).toBe('number');
    });

    it('should return 0 when no anchor nodes exist', () => {
      const nodes = [
        { id: 1, schematicX: 100, schematicY: 100, x: 100, y: 100 },
        { id: 2, schematicX: 200, schematicY: 100, x: 200, y: 100 },
      ];
      const edges = [{ tail: 1, head: 2 }];
      const count = computeHypotheticalSurveyPositions(nodes, edges);
      expect(count).toBe(0);
    });
  });

  // ── computeHypotheticalSchematicPositions ────────────────────────────────

  describe('computeHypotheticalSchematicPositions', () => {
    it('should assign hypothetical schematic coords to survey-only nodes', () => {
      // Anchor: both schematic and survey coords
      const anchor = { id: 1, schematicX: 100, schematicY: 100, surveyX: 185000, surveyY: 665000, x: 100, y: 100 };
      // Target: only survey coords, no schematic
      const target = { id: 2, surveyX: 185100, surveyY: 665000 } as any;
      const edges = [{ tail: 1, head: 2 }];

      const count = computeHypotheticalSchematicPositions([anchor, target], edges);
      expect(count).toBeGreaterThan(0);
      expect(target.x_hypothetical).toBeDefined();
      expect(typeof target.x_hypothetical).toBe('number');
    });

    it('should return 0 when no nodes need hypothetical positions', () => {
      const nodes = [
        { id: 1, schematicX: 100, schematicY: 100, surveyX: 185000, surveyY: 665000 },
        { id: 2, schematicX: 200, schematicY: 100, surveyX: 186000, surveyY: 665000 },
      ];
      const count = computeHypotheticalSchematicPositions(nodes, []);
      expect(count).toBe(0);
    });
  });

  // ── repositionNodesFromEmbeddedCoordinates ───────────────────────────────

  describe('repositionNodesFromEmbeddedCoordinates', () => {
    const mockWgs84ToItm = (lat: number, lon: number) => ({
      x: 180000 + (lon - 35) * 90000,
      y: 660000 + (lat - 32) * 111000,
    });

    it('should position nodes with embedded surveyX/Y', () => {
      const nodes: any[] = [
        { id: 1, x: 10, y: 10, surveyX: 185000, surveyY: 665000 },
        { id: 2, x: 20, y: 20, surveyX: 185100, surveyY: 665000 },
      ];
      const result = repositionNodesFromEmbeddedCoordinates(nodes, 3, 800, 600, mockWgs84ToItm);
      expect(result.referencePoint).not.toBeNull();
      expect(nodes[0].hasCoordinates).toBe(true);
      expect(nodes[1].hasCoordinates).toBe(true);
      // Nodes should be spatially separated (100m * 3px/m = 300px apart horizontally)
      const dx = nodes[1].x - nodes[0].x;
      expect(Math.abs(dx)).toBeCloseTo(300, 0);
    });

    it('should hide nodes without coords and return referencePoint null when all hidden', () => {
      const nodes: any[] = [
        { id: 1, x: 10, y: 10 },
        { id: 2, x: 20, y: 20 },
      ];
      const result = repositionNodesFromEmbeddedCoordinates(nodes, 3, 800, 600, mockWgs84ToItm);
      expect(result.referencePoint).toBeNull();
      expect(nodes[0]._hidden).toBe(true);
      expect(nodes[1]._hidden).toBe(true);
    });
  });
});
