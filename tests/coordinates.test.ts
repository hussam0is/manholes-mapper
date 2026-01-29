import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseCoordinatesCsv,
  calculateCoordinateBounds,
  surveyToCanvas,
  applyCoordinatesToNodes,
  createCoordinateLookup,
  approximateUncoordinatedNodePositions
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

      const result = applyCoordinatesToNodes(nodes, coords, canvasWidth, canvasHeight);

      expect(result.matchedCount).toBe(20);
      
      // Check that nodes are distributed across canvas, not converging
      const xs = result.updatedNodes.map(n => n.x);
      const ys = result.updatedNodes.map(n => n.y);
      
      const xRange = Math.max(...xs) - Math.min(...xs);
      const yRange = Math.max(...ys) - Math.min(...ys);
      
      // Should use most of the available canvas space
      expect(xRange).toBeGreaterThan(200);
      expect(yRange).toBeGreaterThan(200);
      
      // All positions should be within canvas bounds
      xs.forEach(x => {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(canvasWidth);
      });
      ys.forEach(y => {
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(canvasHeight);
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
    it('should position uncoordinated nodes near their neighbors', () => {
      // Node 1 and 3 have coordinates, node 2 doesn't
      const nodes = [
        { id: 1, x: 100, y: 100, hasCoordinates: true },
        { id: 2, x: 500, y: 500, hasCoordinates: false }, // Far away, should be moved
        { id: 3, x: 200, y: 100, hasCoordinates: true },
      ];

      // Edge connects node 2 to nodes 1 and 3
      const edges = [
        { tail: 1, head: 2 },
        { tail: 2, head: 3 },
      ];

      const result = approximateUncoordinatedNodePositions(nodes, edges);
      const node2 = result.find(n => n.id === 2);

      // Node 2 should now be positioned near nodes 1 and 3 (around x=150, y=100)
      // Allow some variance due to random offset
      expect(node2!.x).toBeGreaterThan(50);
      expect(node2!.x).toBeLessThan(250);
      expect(node2!.y).toBeGreaterThan(50);
      expect(node2!.y).toBeLessThan(150);
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

      const result = approximateUncoordinatedNodePositions(nodes, edges);
      const node3 = result.find(n => n.id === 3);

      // Node 3 should be at centroid of positioned nodes (150, 150) with some variance
      expect(node3!.x).toBeGreaterThan(100);
      expect(node3!.x).toBeLessThan(200);
      expect(node3!.y).toBeGreaterThan(100);
      expect(node3!.y).toBeLessThan(200);
    });

    it('should not modify nodes with coordinates', () => {
      const nodes = [
        { id: 1, x: 100, y: 100, hasCoordinates: true },
        { id: 2, x: 200, y: 200, hasCoordinates: true },
      ];

      const edges = [{ tail: 1, head: 2 }];

      const result = approximateUncoordinatedNodePositions(nodes, edges);

      expect(result[0].x).toBe(100);
      expect(result[0].y).toBe(100);
      expect(result[1].x).toBe(200);
      expect(result[1].y).toBe(200);
    });

    it('should handle chain of uncoordinated nodes', () => {
      // Chain: 1 (coord) -> 2 (no coord) -> 3 (no coord) -> 4 (coord)
      const nodes = [
        { id: 1, x: 100, y: 100, hasCoordinates: true },
        { id: 2, x: 800, y: 800, hasCoordinates: false },
        { id: 3, x: 900, y: 900, hasCoordinates: false },
        { id: 4, x: 300, y: 100, hasCoordinates: true },
      ];

      const edges = [
        { tail: 1, head: 2 },
        { tail: 2, head: 3 },
        { tail: 3, head: 4 },
      ];

      const result = approximateUncoordinatedNodePositions(nodes, edges);
      const node2 = result.find(n => n.id === 2);
      const node3 = result.find(n => n.id === 3);

      // Both should be positioned much closer to the coordinate nodes
      expect(node2!.x).toBeLessThan(400);
      expect(node3!.x).toBeLessThan(400);
    });
  });
});
