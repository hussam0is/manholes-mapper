# Map Coordinate System Documentation

## Overview

The Manholes Mapper application uses the **Israel TM Grid (ITM)** coordinate system (EPSG:2039) for survey data and map alignment. This document explains the coordinate system, transformations, and how to verify correct map layer alignment.

## Coordinate Systems

### Israel TM Grid (ITM) - EPSG:2039

**Primary coordinate system for survey data in Israel**

- **Datum**: WGS84
- **Projection**: Transverse Mercator
- **Central Meridian**: 35.2045° E
- **False Easting**: 219,529.584 m
- **False Northing**: 626,907.390 m
- **Scale Factor**: 1.0000067
- **Ellipsoid**: GRS80

**Coordinate Ranges for Israel:**
- X (Easting): ~100,000 - 300,000 meters
- Y (Northing): ~350,000 - 800,000 meters

**Example Locations:**
- Tel Aviv City Hall: X ≈ 179,900, Y ≈ 665,000
- Jerusalem: X ≈ 222,000, Y ≈ 631,000
- Haifa: X ≈ 180,000, Y ≈ 699,000

### WGS84 - EPSG:4326

**Standard GPS coordinate system**

- Used by GPS devices, smartphones, and most web mapping services
- Coordinates in decimal degrees (latitude, longitude)
- Latitude range: -90° to 90° (Israel: ~29° to 33°)
- Longitude range: -180° to 180° (Israel: ~34° to 36°)

### Web Mercator - EPSG:3857

**Tile coordinate system for web maps**

- Used by Esri, OpenStreetMap, Google Maps, and other tile servers
- Tiles organized in XYZ scheme at different zoom levels
- Zoom level 0: entire world in one 256×256 pixel tile
- Each zoom level doubles the number of tiles in each direction

## Coordinate Transformations

### ITM ↔ WGS84

The application uses the **proj4** library for accurate coordinate transformations:

```javascript
import { wgs84ToItm, itmToWgs84 } from './src/map/projections.js';

// Convert GPS coordinates to ITM
const itm = wgs84ToItm(32.0853, 34.7818); // Tel Aviv
// Result: { x: 179523, y: 665000 }

// Convert ITM to GPS coordinates
const wgs84 = itmToWgs84(179523, 665000);
// Result: { lat: 32.0853, lon: 34.7818 }
```

### ITM → Canvas Coordinates

Survey coordinates are transformed to canvas pixel coordinates:

```javascript
import { surveyToCanvas } from './src/utils/coordinates.js';

// Transform ITM to canvas position
const canvasPos = surveyToCanvas(
  itmX,           // ITM X coordinate
  itmY,           // ITM Y coordinate
  bounds,         // Coordinate bounds object
  canvasWidth,    // Canvas width in pixels
  canvasHeight,   // Canvas height in pixels
  { pixelsPerMeter: 3 }  // Scale factor
);
```

**Key considerations:**
- Canvas Y-axis is inverted: North (up) in ITM becomes smaller Y values in canvas
- Default scale: 3 pixels per meter
- Coordinates centered on canvas for better UX

### WGS84 → Tile Coordinates

Map tiles are fetched based on WGS84 coordinates:

```javascript
import { latLonToTile } from './src/map/tile-manager.js';

const { tileX, tileY } = latLonToTile(lat, lon, zoom);
// Returns tile coordinates for the given location at specified zoom
```

## Map Layer Architecture

### Reference Point System

The map layer uses a **reference point** to align tiles with canvas coordinates:

```javascript
{
  itm: { x: 179523, y: 665000 },    // ITM coordinates
  canvas: { x: 400, y: 300 }         // Canvas pixel position
}
```

This reference point:
1. Links ITM survey coordinates to canvas pixel positions
2. Enables accurate tile placement
3. Updates automatically when coordinates are imported

### Tile Loading Process

1. **Calculate View Bounds**: Determine visible ITM area based on canvas view
2. **Convert to Tiles**: Transform ITM bounds to tile coordinates using WGS84
3. **Load Tiles**: Fetch required tiles from tile servers
4. **Draw Tiles**: Render tiles at correct canvas positions using reference point

### Zoom Level Selection

Zoom level is automatically calculated based on current scale:

- Scale 1 px/m → Zoom 15-16 (overview)
- Scale 3 px/m → Zoom 17 (default)
- Scale 10 px/m → Zoom 18-19 (detailed)

## Verifying Map Alignment

### Test Suite

Run the coordinate system tests:

```bash
npm test -- tests/map-coordinates.test.ts
```

**Test coverage includes:**
- ✅ ITM ↔ WGS84 roundtrip conversions
- ✅ Tile coordinate calculations
- ✅ Spatial relationship preservation
- ✅ Canvas coordinate transformations
- ✅ Real-world coordinate handling

### Manual Verification

1. **Import Known Coordinates**
   - Use a CSV file with surveyed ITM coordinates
   - Format: `point_id,x,y,z`
   - Example: `MH1,179523.45,664832.12,5.23`

2. **Enable Map Layer**
   - Click the map layer toggle in the menu
   - Map tiles should load in the background
   - Verify attribution appears at bottom-right

3. **Check Alignment**
   - Nodes with coordinates should appear on correct locations
   - Compare with known landmarks (roads, buildings)
   - Use Google Maps or GovMap for reference

4. **Verify Scale**
   - Measure distance between two nodes
   - Compare with actual surveyed distance
   - Should match within a few meters

### Common Issues and Solutions

#### Issue: Map tiles don't load

**Symptoms:**
- Map layer toggle is on but no tiles visible
- Console shows "No reference point" or "No view bounds"

**Solutions:**
1. Verify at least one node has ITM coordinates
2. Check that coordinates are in valid ITM range
3. Import coordinates from CSV file
4. Reload the page after importing

#### Issue: Map is offset from actual positions

**Symptoms:**
- Tiles load but don't align with node positions
- Landmarks appear shifted

**Solutions:**
1. Verify ITM coordinates are correct (not WGS84)
2. Check coordinate system in survey data
3. Ensure coordinates are in meters, not centimeters
4. Re-import coordinates with correct format

#### Issue: Map tiles are at wrong zoom level

**Symptoms:**
- Tiles are too blurry or too detailed
- Performance issues

**Solutions:**
1. Adjust coordinate scale (pixels per meter)
2. Use scale controls in the menu
3. Check zoom level calculation in console logs

## Coordinate Data Format

### CSV Import Format

```csv
point_id,x,y,z
MH1,179523.45,664832.12,5.23
MH2,179545.23,664819.87,5.41
MH3,179561.78,664845.34,5.19
```

**Requirements:**
- Header row is optional
- X, Y must be ITM coordinates in meters
- Z is elevation in meters (optional but recommended)
- Point IDs must match node IDs in the sketch

### Validation

```javascript
import { isValidItmCoordinate } from './src/map/projections.js';

// Check if coordinates are within Israel
if (isValidItmCoordinate(x, y)) {
  // Coordinates are valid
} else {
  console.warn('Coordinates outside Israel ITM range');
}
```

## Best Practices

1. **Always use ITM coordinates** from official surveys
2. **Validate coordinate ranges** before importing
3. **Test with known locations** (city halls, landmarks)
4. **Use appropriate scale** (3-5 px/m for typical surveys)
5. **Enable map layer** only when coordinates are available
6. **Monitor console logs** for transformation issues
7. **Run tests** after making coordinate system changes

## Technical References

- [Israel TM Grid (ITM) Specification](https://www.mapi.gov.il/)
- [EPSG:2039 Definition](https://epsg.io/2039)
- [proj4 Documentation](http://proj4.org/)
- [Web Mercator Tile Scheme](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)

## API Reference

### Projection Functions

```javascript
// Convert WGS84 to ITM
wgs84ToItm(lat: number, lon: number): { x: number, y: number }

// Convert ITM to WGS84
itmToWgs84(x: number, y: number): { lat: number, lon: number }

// Validate ITM coordinates
isValidItmCoordinate(x: number, y: number): boolean

// Calculate distance between ITM points
distanceItm(x1: number, y1: number, x2: number, y2: number): number

// Calculate bearing between ITM points
bearingItm(x1: number, y1: number, x2: number, y2: number): number
```

### Map Layer Functions

```javascript
// Enable/disable map layer
setMapLayerEnabled(enabled: boolean): void

// Set reference point
setMapReferencePoint(point: { itm: {x, y}, canvas: {x, y} }): void

// Get current reference point
getMapReferencePoint(): object | null

// Set map type (orthophoto or street)
setMapType(type: string): void
```

### Coordinate Transform Functions

```javascript
// Apply ITM coordinates to nodes
applyCoordinatesToNodes(
  nodes: Array,
  coordinatesMap: Map,
  canvasWidth: number,
  canvasHeight: number,
  userScale?: number
): { updatedNodes: Array, matchedCount: number, unmatchedCount: number }

// Convert survey to canvas coordinates
surveyToCanvas(
  surveyX: number,
  surveyY: number,
  bounds: object,
  canvasWidth: number,
  canvasHeight: number,
  options?: { pixelsPerMeter: number }
): { x: number, y: number }
```

## Troubleshooting Checklist

- [ ] ITM coordinates are in valid range (100k-300k, 350k-800k)
- [ ] At least one node has survey coordinates
- [ ] Reference point is set (check console logs)
- [ ] Map layer is enabled in UI
- [ ] Tile server URLs are accessible
- [ ] proj4 library is loaded correctly
- [ ] Browser console shows no errors
- [ ] Tests pass: `npm test -- tests/map-coordinates.test.ts`

## Support

For issues related to coordinate systems or map alignment:

1. Check console logs for transformation errors
2. Run the test suite to verify accuracy
3. Validate your coordinate data format
4. Review this documentation for best practices
5. Check EPSG.io for coordinate system details
