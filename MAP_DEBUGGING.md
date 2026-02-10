# Map Layer Debugging Guide

Quick reference for troubleshooting map layer issues in Manholes Mapper.

## Quick Diagnostics

### Check Map Layer Status

Open browser console and run:

```javascript
// Check if map layer is enabled
console.log('Map enabled:', mapLayerEnabled);

// Check reference point
console.log('Reference:', getMapReferencePoint());

// Check coordinate scale
console.log('Scale:', coordinateScale, 'px/m');

// Check if coordinates are loaded
console.log('Coordinates:', coordinatesMap.size, 'points');
```

### Verify ITM Coordinates

```javascript
// Test a single coordinate conversion
const testItm = { x: 179523, y: 665000 }; // Tel Aviv
const wgs84 = itmToWgs84(testItm.x, testItm.y);
console.log('WGS84:', wgs84); // Should be ~32.08°N, 34.78°E

// Reverse check
const backToItm = wgs84ToItm(wgs84.lat, wgs84.lon);
console.log('Back to ITM:', backToItm); // Should match original
console.log('Error:', 
  Math.abs(backToItm.x - testItm.x), 
  Math.abs(backToItm.y - testItm.y), 'meters'
);
```

## Common Problems

### Problem: "No reference point" error

**What it means:** Map layer can't align tiles because no ITM coordinates are available.

**Fix:**
```javascript
// 1. Check if any nodes have survey coordinates
const nodesWithCoords = nodes.filter(n => n.surveyX != null && n.surveyY != null);
console.log('Nodes with coordinates:', nodesWithCoords.length);

// 2. If none, import coordinates
// - Click "Import Coordinates" in menu
// - Select CSV file with ITM coordinates
// - Format: point_id,x,y,z

// 3. Manually set reference point (if needed)
const firstNode = nodes[0];
if (firstNode.surveyX && firstNode.surveyY) {
  setMapReferencePoint({
    itm: { x: firstNode.surveyX, y: firstNode.surveyY },
    canvas: { x: firstNode.x, y: firstNode.y }
  });
}
```

### Problem: Map tiles are offset

**What it means:** Coordinate transformation is incorrect.

**Check:**
```javascript
// 1. Verify ITM coordinates are in valid range
const isValid = (x, y) => {
  return x >= 100000 && x <= 300000 && y >= 350000 && y <= 800000;
};

nodes.forEach(node => {
  if (node.surveyX && node.surveyY) {
    if (!isValid(node.surveyX, node.surveyY)) {
      console.warn('Invalid ITM:', node.id, node.surveyX, node.surveyY);
    }
  }
});

// 2. Check if coordinates are WGS84 instead of ITM
// WGS84 coords are much smaller (e.g., 32.08, 34.78)
// ITM coords are larger (e.g., 179523, 665000)
```

**Fix:**
```javascript
// If coordinates are WGS84, convert them to ITM
nodes.forEach(node => {
  if (node.surveyX < 1000) { // Likely WGS84 (degrees)
    const itm = wgs84ToItm(node.surveyY, node.surveyX); // Note: lat, lon order
    node.surveyX = itm.x;
    node.surveyY = itm.y;
    console.log('Converted', node.id, 'to ITM:', itm);
  }
});
```

### Problem: Tiles don't load

**Check network requests:**

```javascript
// Open Network tab in DevTools
// Look for requests to server.arcgisonline.com (Esri tiles)
// Status should be 200 (OK)

// If tiles fail to load:
// 1. Check internet connection
// 2. Verify tile server is accessible
// 3. Check browser console for CORS errors
```

**Test tile URL manually:**
```javascript
// Generate a test tile URL
const testLat = 32.0853; // Tel Aviv
const testLon = 34.7818;
const testZoom = 17;
const { tileX, tileY } = latLonToTile(testLat, testLon, testZoom);
const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${testZoom}/${tileY}/${tileX}`;
console.log('Test URL:', url);
// Open URL in browser - should show satellite tile
```

### Problem: Wrong zoom level

**Symptoms:** Tiles too blurry or too detailed

**Check:**
```javascript
// Current effective scale
const effectiveScale = coordinateScale * viewScale;
console.log('Effective scale:', effectiveScale, 'px/m');

// Calculated zoom level
const zoom = calculateZoomLevel(effectiveScale);
console.log('Zoom level:', zoom);

// Resolution at this zoom
const resolution = GOVMAP_RESOLUTIONS[zoom];
console.log('Resolution:', resolution, 'm/px');
```

**Fix:**
```javascript
// Adjust coordinate scale
coordinateScale = 5; // Increase for more detail
// or
coordinateScale = 1; // Decrease for overview

// Force redraw
scheduleDraw();
```

## Coordinate Validation

### Test Known Locations

```javascript
// Test conversions with known locations
const knownLocations = [
  { name: 'Tel Aviv City Hall', itm: { x: 179900, y: 665000 }, wgs84: { lat: 32.0853, lon: 34.7818 } },
  { name: 'Jerusalem', itm: { x: 222000, y: 631000 }, wgs84: { lat: 31.7683, lon: 35.2137 } },
  { name: 'Haifa', itm: { x: 180000, y: 699000 }, wgs84: { lat: 32.8191, lon: 34.9983 } }
];

knownLocations.forEach(loc => {
  // Test ITM -> WGS84
  const converted = itmToWgs84(loc.itm.x, loc.itm.y);
  const errorLat = Math.abs(converted.lat - loc.wgs84.lat);
  const errorLon = Math.abs(converted.lon - loc.wgs84.lon);
  
  console.log(`${loc.name}:
    Converted: ${converted.lat.toFixed(4)}, ${converted.lon.toFixed(4)}
    Expected:  ${loc.wgs84.lat.toFixed(4)}, ${loc.wgs84.lon.toFixed(4)}
    Error:     ${(errorLat * 111000).toFixed(0)}m, ${(errorLon * 111000).toFixed(0)}m
  `);
});
```

### Validate Spatial Relationships

```javascript
// Check if distances are preserved
function testDistancePreservation() {
  const point1 = { x: 179523, y: 665000 };
  const point2 = { x: 179623, y: 665000 }; // 100m east
  
  // Distance in ITM (should be 100m)
  const itmDist = Math.sqrt(
    Math.pow(point2.x - point1.x, 2) + 
    Math.pow(point2.y - point1.y, 2)
  );
  
  // Convert to WGS84 and calculate distance
  const wgs1 = itmToWgs84(point1.x, point1.y);
  const wgs2 = itmToWgs84(point2.x, point2.y);
  
  // Haversine formula for distance
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(wgs2.lat - wgs1.lat);
  const dLon = toRad(wgs2.lon - wgs1.lon);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(wgs1.lat)) * Math.cos(toRad(wgs2.lat)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const wgsDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  console.log('ITM distance:', itmDist.toFixed(2), 'm');
  console.log('WGS84 distance:', wgsDist.toFixed(2), 'm');
  console.log('Difference:', Math.abs(itmDist - wgsDist).toFixed(2), 'm');
  
  if (Math.abs(itmDist - wgsDist) < 1) {
    console.log('✅ Distance preserved (error < 1m)');
  } else {
    console.warn('⚠️ Distance not preserved');
  }
}

testDistancePreservation();
```

## View Bounds Debugging

```javascript
// Check current view bounds
function debugViewBounds() {
  const ref = getMapReferencePoint();
  if (!ref) {
    console.error('No reference point');
    return;
  }
  
  const bounds = calculateViewBoundsItm(
    canvas.width,
    canvas.height,
    viewTranslate,
    viewScale,
    coordinateScale,
    ref
  );
  
  console.log('View Bounds (ITM):');
  console.log('  Min:', bounds.minX.toFixed(1), bounds.minY.toFixed(1));
  console.log('  Max:', bounds.maxX.toFixed(1), bounds.maxY.toFixed(1));
  console.log('  Size:', 
    (bounds.maxX - bounds.minX).toFixed(1), '×',
    (bounds.maxY - bounds.minY).toFixed(1), 'm'
  );
  
  // Convert corners to WGS84 for reference
  const sw = itmToWgs84(bounds.minX, bounds.minY);
  const ne = itmToWgs84(bounds.maxX, bounds.maxY);
  console.log('  SW corner:', sw.lat.toFixed(5), sw.lon.toFixed(5));
  console.log('  NE corner:', ne.lat.toFixed(5), ne.lon.toFixed(5));
  
  return bounds;
}

debugViewBounds();
```

## Tile Loading Status

```javascript
// Check tile cache status
function debugTileCache() {
  const stats = getCacheStats();
  console.log('Tile Cache:');
  console.log('  Cached:', stats.size, 'tiles');
  console.log('  Pending:', stats.pending, 'tiles');
  
  // Force clear cache if needed
  // clearTileCache();
}

debugTileCache();

// Monitor tile loading
let tileLoadCount = 0;
const originalLoadTile = loadTile;
loadTile = function(...args) {
  tileLoadCount++;
  console.log('Loading tile', tileLoadCount, ':', args);
  return originalLoadTile(...args);
};
```

## Performance Monitoring

```javascript
// Measure draw performance
let drawCount = 0;
let totalDrawTime = 0;

const originalDraw = draw;
draw = function() {
  const start = performance.now();
  originalDraw();
  const elapsed = performance.now() - start;
  
  drawCount++;
  totalDrawTime += elapsed;
  
  if (drawCount % 60 === 0) { // Log every 60 frames
    console.log('Draw performance:');
    console.log('  Average:', (totalDrawTime / drawCount).toFixed(2), 'ms');
    console.log('  FPS:', (1000 / (totalDrawTime / drawCount)).toFixed(1));
  }
};
```

## Reset Map Layer

```javascript
// Complete reset if things go wrong
function resetMapLayer() {
  console.log('Resetting map layer...');
  
  // Clear cache
  clearTileCache();
  
  // Reset reference point
  setMapReferencePoint(null);
  
  // Disable and re-enable
  setMapLayerEnabled(false);
  setTimeout(() => {
    setMapLayerEnabled(true);
    scheduleDraw();
    console.log('Map layer reset complete');
  }, 100);
}

// Usage
resetMapLayer();
```

## Export Diagnostic Report

```javascript
function exportDiagnostics() {
  const ref = getMapReferencePoint();
  const bounds = ref ? calculateViewBoundsItm(
    canvas.width, canvas.height,
    viewTranslate, viewScale,
    coordinateScale, ref
  ) : null;
  
  const report = {
    timestamp: new Date().toISOString(),
    mapEnabled: mapLayerEnabled,
    referencePoint: ref,
    coordinateScale: coordinateScale,
    viewScale: viewScale,
    viewTranslate: viewTranslate,
    canvasSize: { width: canvas.width, height: canvas.height },
    viewBounds: bounds,
    coordinatesLoaded: coordinatesMap.size,
    nodesWithCoords: nodes.filter(n => n.surveyX != null).length,
    tileCache: getCacheStats()
  };
  
  console.log('Diagnostic Report:', JSON.stringify(report, null, 2));
  return report;
}

// Usage
const report = exportDiagnostics();
// Copy report to clipboard
copy(JSON.stringify(report, null, 2));
```

## Test Suite

Always run tests after making changes:

```bash
# Run all coordinate tests
npm test -- tests/map-coordinates.test.ts

# Run in watch mode
npm test -- tests/map-coordinates.test.ts --watch

# Run with coverage
npm test -- tests/map-coordinates.test.ts --coverage
```

## Quick Fixes

### Fix 1: Re-import coordinates

```javascript
// If coordinates seem wrong, re-import
// 1. Export current sketch
// 2. Prepare CSV with correct ITM coordinates
// 3. Re-import via menu
```

### Fix 2: Adjust scale

```javascript
// If map is too zoomed in/out
coordinateScale = 3; // Default
// or use scale controls in menu
scheduleDraw();
```

### Fix 3: Force reference point update

```javascript
updateMapReferencePoint();
scheduleDraw();
```

### Fix 4: Clear localStorage

```javascript
// If settings are corrupted
localStorage.removeItem('graphSketch.mapLayer.v1');
location.reload();
```

## Getting Help

If issues persist:

1. Run `exportDiagnostics()` and save the output
2. Run the test suite and note any failures
3. Check browser console for errors
4. Review MAP_COORDINATES.md for detailed information
5. Include diagnostic report when reporting issues
