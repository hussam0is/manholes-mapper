/**
 * Map Coordinate System Tests
 * Tests for Israel TM Grid (ITM) coordinate alignment with map tiles
 * 
 * Israel TM Grid (EPSG:2039):
 * - Datum: WGS84
 * - Projection: Transverse Mercator
 * - Central Meridian: 35.2045° E
 * - False Easting: 219,529.584 m
 * - False Northing: 626,907.390 m
 * - Scale Factor: 1.0000067
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import coordinate utilities
import { 
  parseCoordinatesCsv, 
  surveyToCanvas,
  calculateCoordinateBounds,
  applyCoordinatesToNodes
} from '../src/utils/coordinates.js';

// Import projection utilities
import {
  wgs84ToItm,
  itmToWgs84
} from '../src/map/projections.js';

// Import tile manager utilities
import {
  latLonToTile,
  tileToLatLon,
  calculateZoomLevel,
  calculateViewBoundsItm
} from '../src/map/tile-manager.js';

describe('ITM Coordinate System', () => {
  describe('ITM to WGS84 Conversion', () => {
    it('should convert central Israel ITM coordinates to WGS84 correctly', () => {
      // Tel Aviv City Hall approximate coordinates
      const telAvivItmX = 180000;
      const telAvivItmY = 665000;
      
      const { lat, lon } = itmToWgs84(telAvivItmX, telAvivItmY);
      
      // Tel Aviv is approximately at 32.0853° N, 34.7818° E
      // Allow some tolerance for simplified conversion
      expect(lat).toBeGreaterThan(32.0);
      expect(lat).toBeLessThan(32.2);
      expect(lon).toBeGreaterThan(34.7);
      expect(lon).toBeLessThan(34.9);
    });

    it('should convert Jerusalem ITM coordinates to WGS84 correctly', () => {
      // Jerusalem approximate coordinates
      const jerusalemItmX = 222000;
      const jerusalemItmY = 631000;
      
      const { lat, lon } = itmToWgs84(jerusalemItmX, jerusalemItmY);
      
      // Jerusalem is approximately at 31.7683° N, 35.2137° E
      expect(lat).toBeGreaterThan(31.7);
      expect(lat).toBeLessThan(31.9);
      expect(lon).toBeGreaterThan(35.1);
      expect(lon).toBeLessThan(35.3);
    });

    it('should handle roundtrip conversion with minimal error', () => {
      const originalItmX = 200000;
      const originalItmY = 650000;
      
      // Convert to WGS84 and back
      const wgs84 = itmToWgs84(originalItmX, originalItmY);
      const backToItm = wgs84ToItm(wgs84.lat, wgs84.lon);
      
      // Allow up to 10 meters error for simplified conversion
      expect(Math.abs(backToItm.x - originalItmX)).toBeLessThan(10);
      expect(Math.abs(backToItm.y - originalItmY)).toBeLessThan(10);
    });

    it('should convert reference point correctly', () => {
      // Use the reference point from the simplified conversion
      // Center of Israel: ITM (200000, 600000) should map to WGS84 (31.5°, 35.0°)
      const refItmX = 200000;
      const refItmY = 600000;
      
      const { lat, lon } = itmToWgs84(refItmX, refItmY);
      
      expect(lat).toBeCloseTo(31.5, 1);
      expect(lon).toBeCloseTo(35.0, 1);
    });
  });

  describe('WGS84 to ITM Conversion', () => {
    it('should convert Tel Aviv WGS84 to ITM correctly', () => {
      // Tel Aviv City Hall
      const lat = 32.0853;
      const lon = 34.7818;
      
      const { x, y } = wgs84ToItm(lat, lon);
      
      // Expected approximate ITM coordinates for Tel Aviv
      expect(x).toBeGreaterThan(175000);
      expect(x).toBeLessThan(185000);
      expect(y).toBeGreaterThan(660000);
      expect(y).toBeLessThan(670000);
    });

    it('should handle edge cases near Israel borders', () => {
      // Eilat (southern Israel)
      const eilatLat = 29.5577;
      const eilatLon = 34.9519;
      
      const { x, y } = wgs84ToItm(eilatLat, eilatLon);
      
      // Should still produce valid ITM coordinates
      expect(x).toBeGreaterThan(150000);
      expect(x).toBeLessThan(250000);
      expect(y).toBeGreaterThan(300000);
      expect(y).toBeLessThan(700000);
    });
  });
});

describe('Tile Coordinate System', () => {
  describe('WGS84 to Tile Conversion', () => {
    it('should convert Tel Aviv coordinates to correct tiles at zoom 17', () => {
      const lat = 32.0853;
      const lon = 34.7818;
      const zoom = 17;
      
      const { tileX, tileY } = latLonToTile(lat, lon, zoom);
      
      // Verify tiles are in valid range
      expect(tileX).toBeGreaterThan(0);
      expect(tileX).toBeLessThan(Math.pow(2, zoom));
      expect(tileY).toBeGreaterThan(0);
      expect(tileY).toBeLessThan(Math.pow(2, zoom));
      
      // Tel Aviv at zoom 17 should be around tile (78000, 53000)
      expect(tileX).toBeGreaterThan(77000);
      expect(tileX).toBeLessThan(79000);
      expect(tileY).toBeGreaterThan(52000);
      expect(tileY).toBeLessThan(54000);
    });

    it('should convert tiles back to WGS84 correctly', () => {
      const originalLat = 32.0853;
      const originalLon = 34.7818;
      const zoom = 17;
      
      const { tileX, tileY } = latLonToTile(originalLat, originalLon, zoom);
      const { lat, lon } = tileToLatLon(tileX, tileY, zoom);
      
      // Tile to lat/lon gives top-left corner, so we expect some difference
      // but it should be within the tile size (at zoom 17, ~1.2km per tile)
      expect(Math.abs(lat - originalLat)).toBeLessThan(0.02);
      expect(Math.abs(lon - originalLon)).toBeLessThan(0.02);
    });
  });

  describe('Zoom Level Calculation', () => {
    it('should select appropriate zoom for 3 pixels/meter scale', () => {
      const pixelsPerMeter = 3;
      const zoom = calculateZoomLevel(pixelsPerMeter);
      
      // At 3 px/m, we want tiles with resolution close to 0.33 m/px
      // This should be around zoom 17-18
      expect(zoom).toBeGreaterThanOrEqual(15);
      expect(zoom).toBeLessThanOrEqual(19);
    });

    it('should select higher zoom for detailed view', () => {
      const pixelsPerMeter = 10; // More detailed
      const zoom = calculateZoomLevel(pixelsPerMeter);
      
      // Higher scale should give higher zoom
      expect(zoom).toBeGreaterThanOrEqual(17);
      expect(zoom).toBeLessThanOrEqual(19);
    });

    it('should select lower zoom for overview', () => {
      const pixelsPerMeter = 1; // Less detailed
      const zoom = calculateZoomLevel(pixelsPerMeter);
      
      // Lower scale should give lower zoom
      expect(zoom).toBeGreaterThanOrEqual(15);
      expect(zoom).toBeLessThanOrEqual(17);
    });
  });
});

describe('ITM to Tile Coordinate Alignment', () => {
  it('should correctly align ITM coordinates with map tiles', () => {
    // Test point in Tel Aviv
    const itmX = 180000;
    const itmY = 665000;
    const zoom = 17;
    
    // Convert ITM -> WGS84 -> Tile
    const { lat, lon } = itmToWgs84(itmX, itmY);
    const { tileX, tileY } = latLonToTile(lat, lon, zoom);
    
    // Convert Tile -> WGS84 -> ITM to verify roundtrip
    const { lat: tileLat, lon: tileLon } = tileToLatLon(tileX, tileY, zoom);
    const { x: backItmX, y: backItmY } = wgs84ToItm(tileLat, tileLon);
    
    // At zoom 17, tiles are ~1.2km wide, so error should be less than that
    expect(Math.abs(backItmX - itmX)).toBeLessThan(1500);
    expect(Math.abs(backItmY - itmY)).toBeLessThan(1500);
  });

  it('should maintain spatial relationships when converting multiple points', () => {
    // Two points 100 meters apart in ITM
    const point1 = { x: 200000, y: 650000 };
    const point2 = { x: 200100, y: 650000 }; // 100m east
    
    // Convert both to WGS84
    const wgs1 = itmToWgs84(point1.x, point1.y);
    const wgs2 = itmToWgs84(point2.x, point2.y);
    
    // Calculate distance in degrees
    const lonDiff = Math.abs(wgs2.lon - wgs1.lon);
    
    // At Israel's latitude (~31.5°), 1 degree longitude ≈ 95500 meters
    // So 100 meters ≈ 0.00105 degrees
    expect(lonDiff).toBeGreaterThan(0.0008);
    expect(lonDiff).toBeLessThan(0.0015);
    
    // Latitude should be approximately the same
    expect(Math.abs(wgs2.lat - wgs1.lat)).toBeLessThan(0.0001);
  });
});

describe('Canvas Coordinate Transformation', () => {
  describe('Survey to Canvas Conversion', () => {
    it('should place points correctly relative to canvas center', () => {
      const canvasWidth = 800;
      const canvasHeight = 600;
      
      // Simple bounds: 10m x 10m area
      const bounds = {
        minX: 200000,
        maxX: 200010,
        minY: 650000,
        maxY: 650010
      };
      
      // Center point should map to canvas center
      const centerItmX = 200005;
      const centerItmY = 650005;
      
      const canvasPos = surveyToCanvas(
        centerItmX, 
        centerItmY, 
        bounds, 
        canvasWidth, 
        canvasHeight,
        { pixelsPerMeter: 3 }
      );
      
      // Should be at canvas center
      expect(canvasPos.x).toBeCloseTo(canvasWidth / 2, 0);
      expect(canvasPos.y).toBeCloseTo(canvasHeight / 2, 0);
    });

    it('should maintain correct scale with pixels per meter', () => {
      const canvasWidth = 800;
      const canvasHeight = 600;
      const pixelsPerMeter = 5;
      
      const bounds = {
        minX: 200000,
        maxX: 200100,
        minY: 650000,
        maxY: 650100
      };
      
      // Two points 20 meters apart horizontally
      const point1 = surveyToCanvas(200040, 650050, bounds, canvasWidth, canvasHeight, { pixelsPerMeter });
      const point2 = surveyToCanvas(200060, 650050, bounds, canvasWidth, canvasHeight, { pixelsPerMeter });
      
      const distance = Math.abs(point2.x - point1.x);
      
      // Distance should be 20m * 5 px/m = 100 pixels
      expect(distance).toBeCloseTo(100, 0);
    });

    it('should flip Y axis correctly (north = up in ITM, down in canvas)', () => {
      const canvasWidth = 800;
      const canvasHeight = 600;
      
      const bounds = {
        minX: 200000,
        maxX: 200100,
        minY: 650000,
        maxY: 650100
      };
      
      // Point north of center
      const northPoint = surveyToCanvas(200050, 650060, bounds, canvasWidth, canvasHeight, { pixelsPerMeter: 3 });
      // Point south of center
      const southPoint = surveyToCanvas(200050, 650040, bounds, canvasWidth, canvasHeight, { pixelsPerMeter: 3 });
      
      // North point should have SMALLER Y (higher on canvas)
      expect(northPoint.y).toBeLessThan(southPoint.y);
    });
  });

  describe('View Bounds Calculation', () => {
    it('should calculate ITM bounds from canvas view correctly', () => {
      const canvasWidth = 800;
      const canvasHeight = 600;
      const viewTranslate = { x: 0, y: 0 };
      const viewScale = 1;
      const coordinateScale = 3; // pixels per meter
      
      // Reference point: canvas center maps to ITM (200000, 650000)
      const referencePoint = {
        itm: { x: 200000, y: 650000 },
        canvas: { x: 400, y: 300 }
      };
      
      const bounds = calculateViewBoundsItm(
        canvasWidth,
        canvasHeight,
        viewTranslate,
        viewScale,
        coordinateScale,
        referencePoint
      );
      
      expect(bounds).toBeDefined();
      expect(bounds.minX).toBeLessThan(bounds.maxX);
      expect(bounds.minY).toBeLessThan(bounds.maxY);
      
      // At 3 px/m, canvas is ~267m wide and 200m tall
      const widthMeters = bounds.maxX - bounds.minX;
      const heightMeters = bounds.maxY - bounds.minY;
      
      expect(widthMeters).toBeCloseTo(267, 0);
      expect(heightMeters).toBeCloseTo(200, 0);
    });

    it('should account for view scale (zoom)', () => {
      const canvasWidth = 800;
      const canvasHeight = 600;
      const viewTranslate = { x: 0, y: 0 };
      const coordinateScale = 3;
      
      const referencePoint = {
        itm: { x: 200000, y: 650000 },
        canvas: { x: 400, y: 300 }
      };
      
      // Calculate bounds at scale 1 and scale 2
      const bounds1 = calculateViewBoundsItm(
        canvasWidth, canvasHeight, viewTranslate, 1, coordinateScale, referencePoint
      );
      const bounds2 = calculateViewBoundsItm(
        canvasWidth, canvasHeight, viewTranslate, 2, coordinateScale, referencePoint
      );
      
      // At 2x zoom, visible area should be half as wide/tall
      const width1 = bounds1.maxX - bounds1.minX;
      const width2 = bounds2.maxX - bounds2.minX;
      
      expect(width2).toBeCloseTo(width1 / 2, 0);
    });
  });
});

describe('Integration: ITM Nodes to Map Tiles', () => {
  it('should correctly position nodes with ITM coordinates on map', () => {
    // Create test nodes with ITM coordinates
    const nodes = [
      { id: '1', x: 400, y: 300 }, // Will be updated
      { id: '2', x: 500, y: 300 },
      { id: '3', x: 450, y: 400 }
    ];
    
    // Create coordinate map with ITM coordinates
    const coordinatesMap = new Map([
      ['1', { x: 200000, y: 650000, z: 100 }],
      ['2', { x: 200010, y: 650000, z: 100 }],
      ['3', { x: 200005, y: 649990, z: 100 }]
    ]);
    
    const result = applyCoordinatesToNodes(nodes, coordinatesMap, 800, 600);
    
    // All nodes should have coordinates
    expect(result.matchedCount).toBe(3);
    expect(result.updatedNodes[0].hasCoordinates).toBe(true);
    expect(result.updatedNodes[1].hasCoordinates).toBe(true);
    expect(result.updatedNodes[2].hasCoordinates).toBe(true);
    
    // Check that survey coordinates are preserved
    expect(result.updatedNodes[0].surveyX).toBe(200000);
    expect(result.updatedNodes[0].surveyY).toBe(650000);
    
    // Check spatial relationship: node 2 is 10m east of node 1
    const node1 = result.updatedNodes[0];
    const node2 = result.updatedNodes[1];
    
    // Node 2 should be to the right of node 1
    expect(node2.x).toBeGreaterThan(node1.x);
    
    // Node 3 is south of nodes 1 & 2
    const node3 = result.updatedNodes[2];
    expect(node3.y).toBeGreaterThan(node1.y); // Lower on canvas (south)
  });

  it('should handle real-world ITM coordinate ranges', () => {
    // Typical manhole survey in Tel Aviv area
    const nodes = [
      { id: 'MH1', x: 0, y: 0 },
      { id: 'MH2', x: 0, y: 0 },
      { id: 'MH3', x: 0, y: 0 }
    ];
    
    const coordinatesMap = new Map([
      ['MH1', { x: 179523.45, y: 664832.12, z: 5.23 }],
      ['MH2', { x: 179545.23, y: 664819.87, z: 5.41 }],
      ['MH3', { x: 179561.78, y: 664845.34, z: 5.19 }]
    ]);
    
    const result = applyCoordinatesToNodes(nodes, coordinatesMap, 1920, 1080);
    
    expect(result.matchedCount).toBe(3);
    
    // All canvas positions should be finite and reasonable
    result.updatedNodes.forEach(node => {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThan(-10000);
      expect(node.x).toBeLessThan(20000);
      expect(node.y).toBeGreaterThan(-10000);
      expect(node.y).toBeLessThan(20000);
    });
  });
});

describe('CSV Coordinate Import', () => {
  it('should parse ITM coordinates from CSV correctly', () => {
    const csvContent = `point_id,x,y,z
MH1,179523.45,664832.12,5.23
MH2,179545.23,664819.87,5.41
MH3,179561.78,664845.34,5.19`;
    
    const coords = parseCoordinatesCsv(csvContent);
    
    expect(coords.size).toBe(3);
    expect(coords.get('MH1')).toEqual({ x: 179523.45, y: 664832.12, z: 5.23 });
    expect(coords.get('MH2')).toEqual({ x: 179545.23, y: 664819.87, z: 5.41 });
  });

  it('should validate ITM coordinate ranges for Israel', () => {
    // Valid ITM coordinates for Israel should be:
    // X (Easting): ~100,000 - 300,000
    // Y (Northing): ~350,000 - 750,000
    
    const csvContent = `point_id,x,y,z
VALID1,179523.45,664832.12,5.23
INVALID1,50000,664832.12,5.23
INVALID2,179523.45,50000,5.23`;
    
    const coords = parseCoordinatesCsv(csvContent);
    
    // All coordinates are parsed, but we should validate them separately
    expect(coords.size).toBe(3);
    
    // Validation helper
    const isValidItmX = (x: number) => x >= 100000 && x <= 300000;
    const isValidItmY = (y: number) => y >= 350000 && y <= 750000;
    
    const valid1 = coords.get('VALID1');
    expect(isValidItmX(valid1.x)).toBe(true);
    expect(isValidItmY(valid1.y)).toBe(true);
    
    const invalid1 = coords.get('INVALID1');
    expect(isValidItmX(invalid1.x)).toBe(false);
    
    const invalid2 = coords.get('INVALID2');
    expect(isValidItmY(invalid2.y)).toBe(false);
  });
});
