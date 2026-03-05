# Map Tile Visibility Fix - Zoomed Out Views

## Issue
When zooming out, map tiles on the right side were disappearing or not appearing at all. This was caused by:

1. **Tile limit too restrictive**: Maximum of 25 tiles (5×5 grid) was insufficient for zoomed-out views
2. **Coordinate naming**: Documentation and logging improvements needed

## Fix Applied

### 1. Increased Tile Limit
**File: `src/map/tile-manager.js`**

Changed tile limit from 25 to 100 tiles:
```javascript
// Before
const maxTiles = 25; // 5x5 grid max

// After  
const maxTiles = 100; // 10x10 grid max
```

**Rationale:**
- When zoomed out, more tiles are visible in the viewport
- 25 tiles (5×5) only covers ~5-6km² at zoom level 15
- 100 tiles (10×10) provides adequate coverage for typical zoomed-out scenarios
- Still has reasonable performance (100 × 256×256px = ~6.5MB at most)

### 2. Improved Coordinate Variable Names
**File: `src/map/govmap-layer.js`**

Renamed variables for clarity to indicate they are in world coordinate space:
```javascript
// Before
const canvasX = ...
const canvasY = ...
const tileSizeCanvasX = ...
const tileSizeCanvasY = ...

// After
const worldX = ...
const worldY = ...
const worldWidth = ...
const worldHeight = ...
```

**Rationale:**
- These coordinates are in world space (before view transformation)
- Canvas context is already transformed with translate/scale
- Clear naming prevents confusion about coordinate systems

### 3. Enhanced Logging
Added more diagnostic information to console logs:
- `effectiveScale` (coordinateScale × viewScale)
- `viewScale` for debugging zoom issues

## Testing

### New Test Suite
**File: `tests/map-tile-visibility.test.ts`**

Created 9 comprehensive tests covering:
- ✅ Zoomed-out view bounds calculation
- ✅ Tile generation for large areas (5km × 5km)
- ✅ Tile limits for normal zoomed-out views
- ✅ Zoom level selection when zoomed out
- ✅ Panning while zoomed out
- ✅ Tile coverage across visible area
- ✅ Extreme zoom out scenarios
- ✅ World coordinate system conversions

**All 38 map tests passing:**
- 22 coordinate system tests
- 7 integration tests  
- 9 tile visibility tests

## Coordinate System Explanation

### Three Coordinate Spaces

1. **ITM (Israel TM Grid)**: Survey coordinates in meters
   - X: 100,000-300,000 (easting)
   - Y: 350,000-800,000 (northing)

2. **World Coordinates**: Canvas coordinates before transformation
   - Origin at canvas top-left
   - Scale: pixels per meter (typically 3)
   - Reference point maps ITM to world

3. **Screen Coordinates**: After view transformation
   - Includes viewTranslate (pan)
   - Includes viewScale (zoom)
   - Final rendering position

### Transformation Pipeline

```
ITM → World Coordinates → Screen Coordinates
      (via reference)     (via view transform)
```

When drawing tiles:
```javascript
// ITM → World (using reference point)
const worldX = referencePoint.canvas.x + 
               (tileItmX - referencePoint.itm.x) * coordinateScale;

// Context already has view transform applied
ctx.drawImage(tileImage, worldX, worldY, ...);
```

## Performance Impact

### Before
- Max 25 tiles loaded
- Zoomed-out views missing tiles on edges
- User sees gaps in map coverage

### After  
- Max 100 tiles loaded
- Full coverage at zoom levels 15-19
- Smooth panning and zooming experience

### Memory Usage
- 25 tiles: ~1.6MB (25 × 256×256px × 4 bytes)
- 100 tiles: ~6.5MB (acceptable for modern devices)
- Tile cache with LRU eviction prevents unlimited growth

## Zoom Level Reference

| View Scale | Effective Scale | Zoom Level | Tile Coverage |
|------------|----------------|------------|---------------|
| 2.0x | 6 px/m | 18-19 | ~2×2 tiles |
| 1.0x | 3 px/m | 17 | ~3×3 tiles |
| 0.5x | 1.5 px/m | 16-17 | ~5×5 tiles |
| 0.25x | 0.75 px/m | 15-16 | ~8×8 tiles |
| 0.1x | 0.3 px/m | 15 | ~10×10 tiles |

## Verification

### Manual Testing Steps

1. **Enable Map Layer**
   - Import ITM coordinates
   - Toggle map layer on

2. **Test Zoom Out**
   - Zoom out to 25% (viewScale = 0.25)
   - Pan left and right
   - Verify tiles appear on all edges

3. **Check Console**
   - Look for "Drawing map tiles" logs
   - Verify `tilesCount` increases when zoomed out
   - Check `effectiveScale` and `zoom` values

### Console Debugging

```javascript
// Check current state
console.log('View scale:', viewScale);
console.log('Effective scale:', coordinateScale * viewScale);
console.log('Tiles visible:', lastDrawnTiles.length);

// Force redraw
scheduleDraw();
```

## Known Limitations

1. **Tile Server Rate Limiting**: Loading 100 tiles rapidly may hit server limits
2. **Network Performance**: Initial load may be slower on slow connections
3. **Memory on Low-End Devices**: 100 tiles uses ~6.5MB memory

## Future Improvements

Potential enhancements:
1. **Progressive Loading**: Load center tiles first, then edges
2. **Adaptive Tile Limit**: Adjust based on device memory
3. **Tile Prefetching**: Preload tiles for expected pan direction
4. **Visible Tile Culling**: Only render tiles actually in viewport
5. **WebGL Rendering**: Hardware-accelerated tile rendering

## Related Documentation

- [MAP_COORDINATES.md](MAP_COORDINATES.md) - Coordinate system reference
- [MAP_DEBUGGING.md](MAP_DEBUGGING.md) - Debugging guide
- [MAP_LAYER_FIXES.md](MAP_LAYER_FIXES.md) - Previous improvements

## Test Results

```
✓ tests/map-coordinates.test.ts (22 tests)
✓ tests/map-layer-integration.test.ts (7 tests)
✓ tests/map-tile-visibility.test.ts (9 tests)

Total: 38 tests passing
```

All coordinate transformations maintain 0.000m error across Israel regions.
