/**
 * Map Layer Integration Test
 * End-to-end test of map layer functionality with ITM coordinates
 */

import { describe, it, expect } from 'vitest';
import { wgs84ToItm, itmToWgs84 } from '../src/map/projections.js';
import { latLonToTile, tileToLatLon } from '../src/map/tile-manager.js';

describe('Map Layer Integration', () => {
  describe('End-to-End Coordinate Flow', () => {
    it('should correctly transform Tel Aviv coordinates through full pipeline', () => {
      // Start with known Tel Aviv City Hall ITM coordinates
      const telAvivItmX = 179900;
      const telAvivItmY = 665000;
      
      // Step 1: ITM → WGS84
      const wgs84 = itmToWgs84(telAvivItmX, telAvivItmY);
      
      // Should be approximately Tel Aviv's GPS coordinates
      expect(wgs84.lat).toBeCloseTo(32.0853, 0); // Within 0.5 degrees
      expect(wgs84.lon).toBeCloseTo(34.7818, 0);
      
      // Step 2: WGS84 → Tile coordinates at zoom 17
      const zoom = 17;
      const { tileX, tileY } = latLonToTile(wgs84.lat, wgs84.lon, zoom);
      
      // Tiles should be valid
      expect(tileX).toBeGreaterThan(0);
      expect(tileY).toBeGreaterThan(0);
      expect(tileX).toBeLessThan(Math.pow(2, zoom));
      expect(tileY).toBeLessThan(Math.pow(2, zoom));
      
      // Step 3: Tile → WGS84 (reverse)
      const tileWgs84 = tileToLatLon(tileX, tileY, zoom);
      
      // Should be close to original (within tile size ~1.2km at zoom 17)
      const latDiff = Math.abs(tileWgs84.lat - wgs84.lat);
      const lonDiff = Math.abs(tileWgs84.lon - wgs84.lon);
      expect(latDiff).toBeLessThan(0.02); // ~2km
      expect(lonDiff).toBeLessThan(0.02);
      
      // Step 4: WGS84 → ITM (reverse)
      const backToItm = wgs84ToItm(tileWgs84.lat, tileWgs84.lon);
      
      // Should be close to original (within tile size)
      const xDiff = Math.abs(backToItm.x - telAvivItmX);
      const yDiff = Math.abs(backToItm.y - telAvivItmY);
      expect(xDiff).toBeLessThan(2000); // Within 2km (tile size at zoom 17)
      expect(yDiff).toBeLessThan(2000);
    });

    it('should handle complete manhole survey workflow', () => {
      // Scenario: Survey crew collects ITM coordinates for 3 manholes
      const surveyData = [
        { id: 'MH1', itmX: 179523.45, itmY: 664832.12, elevation: 5.23 },
        { id: 'MH2', itmX: 179545.23, itmY: 664819.87, elevation: 5.41 },
        { id: 'MH3', itmX: 179561.78, itmY: 664845.34, elevation: 5.19 }
      ];
      
      // Calculate distances between manholes in ITM
      const dist12Itm = Math.sqrt(
        Math.pow(surveyData[1].itmX - surveyData[0].itmX, 2) +
        Math.pow(surveyData[1].itmY - surveyData[0].itmY, 2)
      );
      
      const dist23Itm = Math.sqrt(
        Math.pow(surveyData[2].itmX - surveyData[1].itmX, 2) +
        Math.pow(surveyData[2].itmY - surveyData[1].itmY, 2)
      );
      
      // Convert to WGS84 for map display
      const wgs84Points = surveyData.map(mh => ({
        id: mh.id,
        ...itmToWgs84(mh.itmX, mh.itmY)
      }));
      
      // Calculate distances in WGS84 (using Haversine formula)
      function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth radius in meters
        const toRad = deg => deg * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      }
      
      const dist12Wgs = haversineDistance(
        wgs84Points[0].lat, wgs84Points[0].lon,
        wgs84Points[1].lat, wgs84Points[1].lon
      );
      
      const dist23Wgs = haversineDistance(
        wgs84Points[1].lat, wgs84Points[1].lon,
        wgs84Points[2].lat, wgs84Points[2].lon
      );
      
      // Distances should match (within 1 meter)
      expect(Math.abs(dist12Itm - dist12Wgs)).toBeLessThan(1);
      expect(Math.abs(dist23Itm - dist23Wgs)).toBeLessThan(1);
      
      // Get tile coordinates for map display at zoom 18
      const tiles = wgs84Points.map(point => ({
        id: point.id,
        ...latLonToTile(point.lat, point.lon, 18)
      }));
      
      // All tiles should be valid and close together (within ~10 tiles)
      const tileXs = tiles.map(t => t.tileX);
      const tileYs = tiles.map(t => t.tileY);
      const xRange = Math.max(...tileXs) - Math.min(...tileXs);
      const yRange = Math.max(...tileYs) - Math.min(...tileYs);
      
      expect(xRange).toBeLessThan(10); // Manholes are close together
      expect(yRange).toBeLessThan(10);
    });

    it('should maintain accuracy across different regions of Israel', () => {
      // Test locations from north to south Israel
      const testLocations = [
        { name: 'Metula (North)', itm: { x: 234000, y: 776000 } },
        { name: 'Haifa', itm: { x: 180000, y: 699000 } },
        { name: 'Tel Aviv', itm: { x: 179900, y: 665000 } },
        { name: 'Jerusalem', itm: { x: 222000, y: 631000 } },
        { name: 'Be\'er Sheva', itm: { x: 192000, y: 568000 } },
        { name: 'Eilat (South)', itm: { x: 184000, y: 344000 } }
      ];
      
      testLocations.forEach(location => {
        // Convert ITM → WGS84 → ITM
        const wgs84 = itmToWgs84(location.itm.x, location.itm.y);
        const backToItm = wgs84ToItm(wgs84.lat, wgs84.lon);
        
        // Calculate error
        const errorX = Math.abs(backToItm.x - location.itm.x);
        const errorY = Math.abs(backToItm.y - location.itm.y);
        const errorTotal = Math.sqrt(errorX * errorX + errorY * errorY);
        
        // Error should be less than 1 meter for accurate proj4
        expect(errorTotal).toBeLessThan(1);
        
        console.log(`${location.name}: Error ${errorTotal.toFixed(3)}m`);
      });
    });
  });

  describe('Map Layer Alignment Verification', () => {
    it('should calculate correct reference point for canvas positioning', () => {
      // Given: A node with both ITM and canvas coordinates
      const node = {
        id: 'MH1',
        itmX: 179523.45,
        itmY: 664832.12,
        canvasX: 400,
        canvasY: 300
      };
      
      // Reference point links ITM to canvas
      const referencePoint = {
        itm: { x: node.itmX, y: node.itmY },
        canvas: { x: node.canvasX, y: node.canvasY }
      };
      
      // Convert ITM to WGS84 for tile lookup
      const wgs84 = itmToWgs84(referencePoint.itm.x, referencePoint.itm.y);
      
      // Get tile at zoom 17
      const { tileX, tileY } = latLonToTile(wgs84.lat, wgs84.lon, 17);
      
      // Tile should be valid
      expect(tileX).toBeGreaterThan(0);
      expect(tileY).toBeGreaterThan(0);
      
      // This tile should be displayed centered around the reference canvas position
      // (Actual rendering logic would use this for positioning)
    });

    it('should handle coordinate scale correctly', () => {
      // Two points 100 meters apart in ITM
      const point1 = { x: 179500, y: 665000 };
      const point2 = { x: 179600, y: 665000 }; // 100m east
      
      // Distance in ITM
      const itmDistance = Math.sqrt(
        Math.pow(point2.x - point1.x, 2) +
        Math.pow(point2.y - point1.y, 2)
      );
      expect(itmDistance).toBe(100);
      
      // At scale of 3 pixels/meter, this should be 300 pixels apart on canvas
      const pixelsPerMeter = 3;
      const canvasDistance = itmDistance * pixelsPerMeter;
      expect(canvasDistance).toBe(300);
      
      // Convert to WGS84 and verify distance is preserved
      const wgs1 = itmToWgs84(point1.x, point1.y);
      const wgs2 = itmToWgs84(point2.x, point2.y);
      
      // Calculate geodetic distance
      const R = 6371000;
      const toRad = deg => deg * Math.PI / 180;
      const dLat = toRad(wgs2.lat - wgs1.lat);
      const dLon = toRad(wgs2.lon - wgs1.lon);
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(wgs1.lat)) * Math.cos(toRad(wgs2.lat)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const wgsDistance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      
      // WGS84 distance should match ITM distance (within 1m)
      expect(Math.abs(wgsDistance - itmDistance)).toBeLessThan(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle coordinates at edges of ITM valid range', () => {
      const edgeCases = [
        { x: 100000, y: 350000 }, // Southwest corner
        { x: 300000, y: 800000 }, // Northeast corner
        { x: 100000, y: 800000 }, // Northwest corner
        { x: 300000, y: 350000 }  // Southeast corner
      ];
      
      edgeCases.forEach(coord => {
        const wgs84 = itmToWgs84(coord.x, coord.y);
        const backToItm = wgs84ToItm(wgs84.lat, wgs84.lon);
        
        // Should complete without errors
        expect(wgs84.lat).toBeDefined();
        expect(wgs84.lon).toBeDefined();
        expect(backToItm.x).toBeDefined();
        expect(backToItm.y).toBeDefined();
        
        // Accuracy should be maintained even at edges
        const error = Math.sqrt(
          Math.pow(backToItm.x - coord.x, 2) +
          Math.pow(backToItm.y - coord.y, 2)
        );
        expect(error).toBeLessThan(10); // Within 10 meters at edges
      });
    });

    it('should handle very close coordinates (sub-meter precision)', () => {
      const base = { x: 179523.456, y: 664832.123 };
      const nearby = { x: 179523.457, y: 664832.124 }; // 0.14mm apart
      
      const wgs1 = itmToWgs84(base.x, base.y);
      const wgs2 = itmToWgs84(nearby.x, nearby.y);
      
      // Should be very close but distinguishable
      expect(wgs1.lat).not.toBe(wgs2.lat);
      expect(wgs1.lon).not.toBe(wgs2.lon);
      
      // Difference should be proportional
      const latDiff = Math.abs(wgs2.lat - wgs1.lat);
      const lonDiff = Math.abs(wgs2.lon - wgs1.lon);
      
      // Should be less than 0.001 degrees (~100m) apart
      expect(latDiff).toBeLessThan(0.001);
      expect(lonDiff).toBeLessThan(0.001);
    });
  });
});
