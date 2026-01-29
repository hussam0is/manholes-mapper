/**
 * Tile Manager Module
 * Handles tile loading, caching, and coordinate calculations for map background layers
 */

// Tile size in pixels (standard for most tile servers)
const TILE_SIZE = 256;

// Maximum number of tiles to cache in memory
const MAX_CACHE_SIZE = 100;

// Tile cache: Map<string, { image: HTMLImageElement, timestamp: number }>
const tileCache = new Map();

// Pending tile loads: Map<string, Promise<HTMLImageElement>>
const pendingLoads = new Map();

// GovMap uses Israeli TM Grid (EPSG:2039)
// Origin and resolution values for the tile pyramid
// These values are from the GovMap tile matrix set
const GOVMAP_ORIGIN = {
  x: -5765124.00000001,  // Top-left X in EPSG:2039
  y: 7492749.99999997    // Top-left Y in EPSG:2039
};

// Resolution (meters per pixel) for each zoom level
// GovMap typically uses zoom levels 0-20
const GOVMAP_RESOLUTIONS = [
  78271.51696402048,    // 0
  39135.75848201024,    // 1
  19567.87924100512,    // 2
  9783.93962050256,     // 3
  4891.96981025128,     // 4
  2445.98490512564,     // 5
  1222.99245256282,     // 6
  611.49622628141,      // 7
  305.748113140705,     // 8
  152.8740565703525,    // 9
  76.43702828517625,    // 10
  38.21851414258813,    // 11
  19.10925707129406,    // 12
  9.55462853564703,     // 13
  4.777314267823515,    // 14
  2.3886571339117577,   // 15
  1.1943285669558788,   // 16
  0.5971642834779394,   // 17
  0.2985821417389697,   // 18
  0.14929107086948486,  // 19
  0.07464553543474243   // 20
];

/**
 * Generate a cache key for a tile
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate  
 * @param {number} z - Zoom level
 * @param {string} type - Tile type (orthophoto, street, etc.)
 * @returns {string} Cache key
 */
function getCacheKey(x, y, z, type) {
  return `${type}/${z}/${x}/${y}`;
}

/**
 * Evict oldest tiles from cache if over limit
 */
function evictOldTiles() {
  if (tileCache.size <= MAX_CACHE_SIZE) return;
  
  // Sort by timestamp and remove oldest
  const entries = Array.from(tileCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  
  const toRemove = entries.slice(0, tileCache.size - MAX_CACHE_SIZE);
  toRemove.forEach(([key]) => tileCache.delete(key));
}

/**
 * Get a tile from cache
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @param {number} z - Zoom level
 * @param {string} type - Tile type
 * @returns {HTMLImageElement|null} Cached tile image or null
 */
export function getTileFromCache(x, y, z, type) {
  const key = getCacheKey(x, y, z, type);
  const cached = tileCache.get(key);
  if (cached) {
    cached.timestamp = Date.now(); // Update access time
    return cached.image;
  }
  return null;
}

/**
 * Store a tile in cache
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @param {number} z - Zoom level
 * @param {string} type - Tile type
 * @param {HTMLImageElement} image - Tile image
 */
export function storeTileInCache(x, y, z, type, image) {
  const key = getCacheKey(x, y, z, type);
  tileCache.set(key, {
    image,
    timestamp: Date.now()
  });
  evictOldTiles();
}

/**
 * Convert ITM coordinates to tile coordinates
 * @param {number} itmX - ITM X coordinate (easting)
 * @param {number} itmY - ITM Y coordinate (northing)
 * @param {number} zoom - Zoom level
 * @returns {{tileX: number, tileY: number, pixelX: number, pixelY: number}}
 */
export function itmToTile(itmX, itmY, zoom) {
  const resolution = GOVMAP_RESOLUTIONS[zoom];
  
  // Calculate pixel coordinates from origin
  const pixelX = (itmX - GOVMAP_ORIGIN.x) / resolution;
  const pixelY = (GOVMAP_ORIGIN.y - itmY) / resolution; // Y is inverted
  
  // Calculate tile coordinates
  const tileX = Math.floor(pixelX / TILE_SIZE);
  const tileY = Math.floor(pixelY / TILE_SIZE);
  
  // Calculate position within tile (0-255)
  const offsetX = Math.floor(pixelX % TILE_SIZE);
  const offsetY = Math.floor(pixelY % TILE_SIZE);
  
  return { tileX, tileY, pixelX: offsetX, pixelY: offsetY };
}

/**
 * Convert tile coordinates back to ITM
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {number} zoom - Zoom level
 * @returns {{itmX: number, itmY: number}} ITM coordinates of tile top-left corner
 */
export function tileToItm(tileX, tileY, zoom) {
  const resolution = GOVMAP_RESOLUTIONS[zoom];
  
  const pixelX = tileX * TILE_SIZE;
  const pixelY = tileY * TILE_SIZE;
  
  const itmX = GOVMAP_ORIGIN.x + (pixelX * resolution);
  const itmY = GOVMAP_ORIGIN.y - (pixelY * resolution);
  
  return { itmX, itmY };
}

/**
 * Calculate the appropriate zoom level based on canvas scale
 * @param {number} pixelsPerMeter - Current canvas scale (pixels per meter)
 * @returns {number} Appropriate tile zoom level
 */
export function calculateZoomLevel(pixelsPerMeter) {
  // Find the zoom level where resolution is closest to our scale
  // Resolution = meters per pixel, so we need 1/pixelsPerMeter
  const targetResolution = 1 / pixelsPerMeter;
  
  let bestZoom = 17; // Default to a reasonable zoom
  let bestDiff = Infinity;
  
  // Limit to zoom 15-19 for performance and quality
  for (let z = 15; z <= 19; z++) {
    const diff = Math.abs(GOVMAP_RESOLUTIONS[z] - targetResolution);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestZoom = z;
    }
  }
  
  return bestZoom;
}

/**
 * Calculate visible tiles for the current view
 * @param {object} viewBounds - View bounds in ITM coordinates {minX, minY, maxX, maxY}
 * @param {number} zoom - Tile zoom level
 * @returns {Array<{x: number, y: number, z: number}>} Array of tile coordinates
 */
export function calculateVisibleTiles(viewBounds, zoom) {
  const tiles = [];
  
  // Get tile coordinates for corners
  const topLeft = itmToTile(viewBounds.minX, viewBounds.maxY, zoom);
  const bottomRight = itmToTile(viewBounds.maxX, viewBounds.minY, zoom);
  
  // Add 1 tile buffer on each side
  const minTileX = Math.max(0, topLeft.tileX - 1);
  const maxTileX = bottomRight.tileX + 1;
  const minTileY = Math.max(0, topLeft.tileY - 1);
  const maxTileY = bottomRight.tileY + 1;
  
  // Limit total tiles to prevent overload
  const maxTiles = 25; // 5x5 grid max
  let tileCount = 0;
  
  for (let x = minTileX; x <= maxTileX && tileCount < maxTiles; x++) {
    for (let y = minTileY; y <= maxTileY && tileCount < maxTiles; y++) {
      tiles.push({ x, y, z: zoom });
      tileCount++;
    }
  }
  
  return tiles;
}

/**
 * Calculate view bounds in ITM coordinates from canvas state
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {object} viewTranslate - View translation {x, y}
 * @param {number} viewScale - View scale (zoom)
 * @param {number} coordinateScale - Pixels per meter
 * @param {object} referencePoint - Reference point {itm: {x, y}, canvas: {x, y}}
 * @returns {object} Bounds in ITM {minX, minY, maxX, maxY}
 */
export function calculateViewBoundsItm(canvasWidth, canvasHeight, viewTranslate, viewScale, coordinateScale, referencePoint) {
  if (!referencePoint || !referencePoint.itm || !referencePoint.canvas) {
    return null;
  }
  
  // Convert canvas corners to world coordinates
  const corners = [
    { x: 0, y: 0 },
    { x: canvasWidth, y: 0 },
    { x: 0, y: canvasHeight },
    { x: canvasWidth, y: canvasHeight }
  ];
  
  const worldCorners = corners.map(c => ({
    x: (c.x - viewTranslate.x) / viewScale,
    y: (c.y - viewTranslate.y) / viewScale
  }));
  
  // Convert world coordinates to ITM
  const itmCorners = worldCorners.map(wc => {
    const dx = (wc.x - referencePoint.canvas.x) / coordinateScale;
    const dy = -(wc.y - referencePoint.canvas.y) / coordinateScale; // Flip Y
    return {
      x: referencePoint.itm.x + dx,
      y: referencePoint.itm.y + dy
    };
  });
  
  // Calculate bounds
  const xs = itmCorners.map(c => c.x);
  const ys = itmCorners.map(c => c.y);
  
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

/**
 * Get tile size in meters at a given zoom level
 * @param {number} zoom - Zoom level
 * @returns {number} Tile size in meters
 */
export function getTileSizeMeters(zoom) {
  return TILE_SIZE * GOVMAP_RESOLUTIONS[zoom];
}

/**
 * Check if a tile load is already pending
 * @param {number} x - Tile X
 * @param {number} y - Tile Y
 * @param {number} z - Zoom level
 * @param {string} type - Tile type
 * @returns {boolean}
 */
export function isTileLoadPending(x, y, z, type) {
  return pendingLoads.has(getCacheKey(x, y, z, type));
}

/**
 * Mark a tile load as pending
 * @param {number} x - Tile X
 * @param {number} y - Tile Y
 * @param {number} z - Zoom level
 * @param {string} type - Tile type
 * @param {Promise} promise - Load promise
 */
export function markTileLoadPending(x, y, z, type, promise) {
  const key = getCacheKey(x, y, z, type);
  pendingLoads.set(key, promise);
  promise.finally(() => pendingLoads.delete(key));
}

/**
 * Clear all cached tiles
 */
export function clearTileCache() {
  tileCache.clear();
  pendingLoads.clear();
}

/**
 * Get cache statistics
 * @returns {{size: number, pending: number}}
 */
export function getCacheStats() {
  return {
    size: tileCache.size,
    pending: pendingLoads.size
  };
}

// Export constants for external use
export { TILE_SIZE, GOVMAP_RESOLUTIONS, GOVMAP_ORIGIN };
