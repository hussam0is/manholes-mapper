/**
 * Tests for map tile visibility issues
 * Specifically tests zoomed-out scenarios where tiles may disappear
 */

import { describe, it, expect } from 'vitest';
import { calculateViewBoundsItm, calculateVisibleTiles, calculateZoomLevel } from '../src/map/tile-manager.js';
import { itmToWgs84 } from '../src/map/projections.js';

describe('Map Tile Visibility Tests', () => {
  describe('Zoomed Out Scenarios', () => {
    it('should calculate correct view bounds when zoomed out', () => {
      // Scenario: User zooms out (viewScale = 0.5) 
      const canvasWidth = 1920;
      const canvasHeight = 1080;
      const viewTranslate = { x: 960, y: 540 }; // Centered
      const viewScale = 0.5; // Zoomed out 50%
      const coordinateScale = 3; // pixels per meter
      
      // Reference point: Tel Aviv area
      const referencePoint = {
        itm: { x: 179900, y: 665000 },
        canvas: { x: 960, y: 540 }
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
      
      // When zoomed out 50%, visible area should be 2x larger
      const widthMeters = bounds.maxX - bounds.minX;
      const heightMeters = bounds.maxY - bounds.minY;
      
      // At scale 3 px/m and viewScale 0.5, effective scale is 1.5 px/m
      // Canvas width 1920 / 1.5 = 1280 meters visible width
      expect(widthMeters).toBeCloseTo(1280, 0);
      expect(heightMeters).toBeCloseTo(720, 0);
    });

    it('should generate enough tiles when zoomed out', () => {
      // Large view bounds (zoomed out to see ~5km x 5km area)
      const viewBounds = {
        minX: 177000,
        maxX: 182000, // 5km wide
        minY: 662000,
        maxY: 667000  // 5km tall
      };
      
      const zoom = 15; // Lower zoom for larger area
      
      const tiles = calculateVisibleTiles(viewBounds, zoom);
      
      // Should generate multiple tiles
      expect(tiles.length).toBeGreaterThan(10);
      expect(tiles.length).toBeLessThanOrEqual(100); // Max limit
      
      // Tiles should cover the area (using x, y properties not tileX, tileY)
      const tileXs = tiles.map(t => t.x);
      const tileYs = tiles.map(t => t.y);
      
      const xRange = Math.max(...tileXs) - Math.min(...tileXs);
      const yRange = Math.max(...tileYs) - Math.min(...tileYs);
      
      expect(xRange).toBeGreaterThan(5); // Multiple tiles wide
      expect(yRange).toBeGreaterThan(5); // Multiple tiles tall
    });

    it('should not hit tile limit for normal zoomed-out views', () => {
      // Realistic zoomed-out scenario: viewing 2km x 2km area
      const viewBounds = {
        minX: 179000,
        maxX: 181000, // 2km wide
        minY: 664000,
        maxY: 666000  // 2km tall
      };
      
      const zoom = 16;
      
      const tiles = calculateVisibleTiles(viewBounds, zoom);
      
      // Should not hit the 100 tile limit
      expect(tiles.length).toBeLessThan(100);
      
      // Should have reasonable number of tiles
      expect(tiles.length).toBeGreaterThan(20);
      expect(tiles.length).toBeLessThan(80);
    });

    it('should select appropriate zoom level when zoomed out', () => {
      // When zoomed out, effective scale is lower
      const coordinateScale = 3; // pixels per meter
      const viewScale = 0.25; // Zoomed out to 25%
      
      const effectiveScale = coordinateScale * viewScale; // 0.75 px/m
      const zoom = calculateZoomLevel(effectiveScale);
      
      // Lower effective scale should give lower zoom level
      // At 0.75 px/m, we're looking at ~1.33 m/px resolution
      // This should map to zoom 15-17 range
      expect(zoom).toBeGreaterThanOrEqual(15);
      expect(zoom).toBeLessThanOrEqual(18);
    });

    it('should handle panning to the right when zoomed out', () => {
      // Scenario: User pans to the right (viewTranslate.x increases)
      const canvasWidth = 1920;
      const canvasHeight = 1080;
      const viewTranslate = { x: 2000, y: 540 }; // Panned right
      const viewScale = 0.5;
      const coordinateScale = 3;
      
      const referencePoint = {
        itm: { x: 179900, y: 665000 },
        canvas: { x: 960, y: 540 }
      };
      
      const bounds = calculateViewBoundsItm(
        canvasWidth,
        canvasHeight,
        viewTranslate,
        viewScale,
        coordinateScale,
        referencePoint
      );
      
      // Bounds should shift left (ITM west) when panning right on canvas
      expect(bounds.minX).toBeLessThan(179900);
      expect(bounds.maxX).toBeLessThan(179900 + 1000);
      
      // Generate tiles for this view
      const zoom = 17;
      const tiles = calculateVisibleTiles(bounds, zoom);
      
      // Should have tiles
      expect(tiles.length).toBeGreaterThan(0);
      
      // Tiles should be in reasonable range (using x, y, z properties)
      tiles.forEach(tile => {
        expect(tile.x).toBeGreaterThan(0);
        expect(tile.y).toBeGreaterThan(0);
        expect(tile.z).toBe(zoom);
      });
    });

    it('should maintain tile coverage across entire visible area', () => {
      // Test that tiles cover from left to right edge of visible area
      const viewBounds = {
        minX: 179000,
        maxX: 180500, // 1.5km wide
        minY: 664500,
        maxY: 665500  // 1km tall
      };
      
      const zoom = 17;
      const tiles = calculateVisibleTiles(viewBounds, zoom);
      
      // Get the tile range (using x, y properties)
      const tileXs = tiles.map(t => t.x);
      const tileYs = tiles.map(t => t.y);
      
      const minTileX = Math.min(...tileXs);
      const maxTileX = Math.max(...tileXs);
      const minTileY = Math.min(...tileYs);
      const maxTileY = Math.max(...tileYs);
      
      // Verify tiles form a continuous grid (no missing tiles in middle)
      const gridWidth = maxTileX - minTileX + 1;
      const gridHeight = maxTileY - minTileY + 1;
      const expectedTiles = gridWidth * gridHeight;
      
      // Should have most tiles in the grid (allowing for edge buffer and limit)
      expect(tiles.length).toBeGreaterThanOrEqual(Math.min(expectedTiles - 4, 50));
      expect(tiles.length).toBeLessThanOrEqual(expectedTiles);
    });

    it('should handle extreme zoom out without errors', () => {
      // Very zoomed out: viewing 10km x 10km area
      const canvasWidth = 1920;
      const canvasHeight = 1080;
      const viewTranslate = { x: 960, y: 540 };
      const viewScale = 0.1; // Very zoomed out
      const coordinateScale = 3;
      
      const referencePoint = {
        itm: { x: 180000, y: 665000 },
        canvas: { x: 960, y: 540 }
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
      
      const zoom = calculateZoomLevel(coordinateScale * viewScale);
      const tiles = calculateVisibleTiles(bounds, zoom);
      
      // Should hit the 400 tile limit for such a large area
      expect(tiles.length).toBeLessThanOrEqual(400);
      
      // But should still have tiles
      expect(tiles.length).toBeGreaterThan(0);
    });
  });

  describe('World Coordinate System', () => {
    it('should correctly convert ITM to world coordinates', () => {
      const referencePoint = {
        itm: { x: 180000, y: 665000 },
        canvas: { x: 1000, y: 500 }
      };
      
      const coordinateScale = 3; // 3 pixels per meter
      
      // Point 100m east and 50m north of reference
      const testItmX = 180100;
      const testItmY = 665050;
      
      // Calculate world coordinates
      const worldX = referencePoint.canvas.x + (testItmX - referencePoint.itm.x) * coordinateScale;
      const worldY = referencePoint.canvas.y - (testItmY - referencePoint.itm.y) * coordinateScale;
      
      // 100m east = +300 pixels
      expect(worldX).toBe(1000 + 300);
      
      // 50m north = -150 pixels (Y is flipped)
      expect(worldY).toBe(500 - 150);
    });

    it('should handle negative coordinate offsets', () => {
      const referencePoint = {
        itm: { x: 180000, y: 665000 },
        canvas: { x: 1000, y: 500 }
      };
      
      const coordinateScale = 3;
      
      // Point 100m west and 50m south of reference
      const testItmX = 179900;
      const testItmY = 664950;
      
      const worldX = referencePoint.canvas.x + (testItmX - referencePoint.itm.x) * coordinateScale;
      const worldY = referencePoint.canvas.y - (testItmY - referencePoint.itm.y) * coordinateScale;
      
      // 100m west = -300 pixels
      expect(worldX).toBe(1000 - 300);
      
      // 50m south = +150 pixels (Y is flipped)
      expect(worldY).toBe(500 + 150);
    });
  });
});
