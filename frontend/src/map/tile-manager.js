/**
 * Tile Manager Module
 * Handles tile loading, caching, and coordinate calculations for map background layers
 * Uses standard Web Mercator (EPSG:3857) XYZ tile scheme for compatibility with OSM-style tile servers
 * Coordinate transformations use accurate proj4 for Israel TM Grid (EPSG:2039)
 */

import {
  wgs84ToItm as projectWgs84ToItm,
  itmToWgs84 as projectItmToWgs84,
  wgs84ToWebMercator,
  webMercatorToWgs84
} from './projections.js';

// Tile size in pixels (standard for most tile servers)
const TILE_SIZE = 256;

// Maximum cache size: 500MB (decoded bitmap: width * height * 4 bytes per tile)
const MAX_CACHE_BYTES = 500 * 1024 * 1024;

// Estimated bytes per tile (decoded RGBA in memory: 256*256*4)
const _BYTES_PER_TILE = TILE_SIZE * TILE_SIZE * 4;

// Tile cache: Map<string, { image: HTMLImageElement, timestamp: number, bytes: number }>
const tileCache = new Map();

// Total bytes currently in cache (for size-based eviction)
let totalCacheBytes = 0;

// Pending tile loads: Map<string, Promise<HTMLImageElement>>
const pendingLoads = new Map();

// Web Mercator constants
const EARTH_RADIUS = 6378137; // meters
const _MAX_LATITUDE = 85.051128779806604; // Web Mercator limit

// Resolution (meters per pixel) for each zoom level in Web Mercator
// Formula: (2 * PI * EARTH_RADIUS) / (TILE_SIZE * 2^zoom)
const WEB_MERCATOR_RESOLUTIONS = [];
for (let z = 0; z <= 23; z++) {
  WEB_MERCATOR_RESOLUTIONS[z] = (2 * Math.PI * EARTH_RADIUS) / (TILE_SIZE * Math.pow(2, z));
}

// Legacy GOVMAP constants kept for backward compatibility
const GOVMAP_ORIGIN = {
  x: -5765124.00000001,
  y: 7492749.99999997
};

// Use Web Mercator resolutions 
const GOVMAP_RESOLUTIONS = WEB_MERCATOR_RESOLUTIONS;

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
 * Evict oldest tiles from cache until under byte limit.
 * Uses a partial scan instead of full sort — O(n) vs O(n log n).
 */
function evictOldTiles() {
  if (totalCacheBytes <= MAX_CACHE_BYTES) return;

  // Target: evict ~25% of cache to avoid frequent re-evictions
  const target = MAX_CACHE_BYTES * 0.75;

  // Find oldest entries by iterating once (Map preserves insertion order,
  // but we update timestamps on access, so just grab the first ~25% of entries
  // which are the least-recently-inserted and likely least-recently-used)
  for (const [key, entry] of tileCache) {
    if (totalCacheBytes <= target) break;
    totalCacheBytes -= entry.bytes;
    tileCache.delete(key);
  }
}

/** Max cache size in bytes (500MB) for external use */
export const MAX_CACHE_BYTES_EXPORT = MAX_CACHE_BYTES;

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
  const bytes = (image.naturalWidth || image.width || TILE_SIZE) * (image.naturalHeight || image.height || TILE_SIZE) * 4;
  const entry = { image, timestamp: Date.now(), bytes };
  const existing = tileCache.get(key);
  if (existing) totalCacheBytes -= existing.bytes;
  tileCache.set(key, entry);
  totalCacheBytes += bytes;
  evictOldTiles();
}

/**
 * Convert lat/lon to tile coordinates (standard XYZ/slippy map) using proj4
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} zoom - Zoom level
 * @returns {{tileX: number, tileY: number}}
 */
export function latLonToTile(lat, lon, zoom) {
  const { x, y } = wgs84ToWebMercator(lat, lon);
  const n = Math.pow(2, zoom);
  const HALF_EARTH = Math.PI * EARTH_RADIUS;
  
  const tileX = Math.floor(((x + HALF_EARTH) / (HALF_EARTH * 2)) * n);
  const tileY = Math.floor(((HALF_EARTH - y) / (HALF_EARTH * 2)) * n);
  
  return { tileX, tileY };
}

/**
 * Convert tile coordinates to lat/lon (top-left corner of tile) using proj4
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {number} zoom - Zoom level
 * @returns {{lat: number, lon: number}}
 */
export function tileToLatLon(tileX, tileY, zoom) {
  const n = Math.pow(2, zoom);
  const HALF_EARTH = Math.PI * EARTH_RADIUS;
  
  const x = (tileX / n) * (HALF_EARTH * 2) - HALF_EARTH;
  const y = HALF_EARTH - (tileY / n) * (HALF_EARTH * 2);
  
  return webMercatorToWgs84(x, y);
}

/**
 * Convert ITM coordinates to tile coordinates via WGS84
 * Uses accurate proj4 conversion
 * @param {number} itmX - ITM X coordinate (easting)
 * @param {number} itmY - ITM Y coordinate (northing)
 * @param {number} zoom - Zoom level
 * @param {Function} itmToWgs84Fn - Optional conversion function (defaults to accurate proj4)
 * @returns {{tileX: number, tileY: number, pixelX: number, pixelY: number}}
 */
export function itmToTile(itmX, itmY, zoom, itmToWgs84Fn) {
  // Use accurate projection by default
  if (!itmToWgs84Fn) {
    itmToWgs84Fn = projectItmToWgs84;
  }
  
  const { lat, lon } = itmToWgs84Fn(itmX, itmY);
  const { tileX, tileY } = latLonToTile(lat, lon, zoom);
  
  // Calculate pixel offset within tile
  const n = Math.pow(2, zoom);
  const { x: wmx, y: wmy } = wgs84ToWebMercator(lat, lon);
  const HALF_EARTH = Math.PI * EARTH_RADIUS;
  
  const exactX = ((wmx + HALF_EARTH) / (HALF_EARTH * 2)) * n;
  const exactY = ((HALF_EARTH - wmy) / (HALF_EARTH * 2)) * n;
  
  const pixelX = Math.floor((exactX - tileX) * TILE_SIZE);
  const pixelY = Math.floor((exactY - tileY) * TILE_SIZE);
  
  return { tileX, tileY, pixelX, pixelY };
}

/**
 * Convert tile coordinates back to ITM via WGS84
 * Uses accurate proj4 conversion
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {number} zoom - Zoom level
 * @param {Function} wgs84ToItmFn - Optional conversion function (defaults to accurate proj4)
 * @returns {{itmX: number, itmY: number}} ITM coordinates of tile top-left corner
 */
export function tileToItm(tileX, tileY, zoom, wgs84ToItmFn) {
  // Use accurate projection by default
  if (!wgs84ToItmFn) {
    wgs84ToItmFn = projectWgs84ToItm;
  }
  
  const { lat, lon } = tileToLatLon(tileX, tileY, zoom);
  const { x: itmX, y: itmY } = wgs84ToItmFn(lat, lon);
  
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

  // Allow zoom 5-21 for higher quality aerial imagery.
  // Esri World Imagery supports zoom 20-21 in Israel and most urban areas.
  for (let z = 5; z <= 21; z++) {
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
 * Uses accurate ITM to tile conversion
 * @param {object} viewBounds - View bounds in ITM coordinates {minX, minY, maxX, maxY}
 * @param {number} zoom - Tile zoom level
 * @returns {Array<{x: number, y: number, z: number}>} Array of tile coordinates
 */
export function calculateVisibleTiles(viewBounds, zoom) {
  const tiles = [];
  
  // Get tile coordinates for corners using accurate conversion
  const topLeft = itmToTile(viewBounds.minX, viewBounds.maxY, zoom);
  const bottomRight = itmToTile(viewBounds.maxX, viewBounds.minY, zoom);
  
  // Add 1 tile buffer on each side
  const minTileX = Math.max(0, topLeft.tileX - 1);
  const maxTileX = bottomRight.tileX + 1;
  const minTileY = Math.max(0, topLeft.tileY - 1);
  const maxTileY = bottomRight.tileY + 1;
  
  // Limit total tiles to prevent overload
  const maxTiles = 400; // 20x20 grid max — supports zoomed-out views
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
 * Calculate all tile coordinates that overlap an ITM bounds (for precaching).
 * Same as calculateVisibleTiles but with configurable max count and optional buffer.
 * @param {object} viewBounds - View bounds in ITM {minX, minY, maxX, maxY}
 * @param {number} zoom - Tile zoom level
 * @param {number} [maxTiles=10000] - Maximum number of tiles to return
 * @param {number} [bufferTiles=1] - Extra tiles on each side
 * @returns {Array<{x: number, y: number, z: number}>} Array of tile coordinates
 */
export function calculateTilesInBounds(viewBounds, zoom, maxTiles = 10000, bufferTiles = 1) {
  const topLeft = itmToTile(viewBounds.minX, viewBounds.maxY, zoom);
  const bottomRight = itmToTile(viewBounds.maxX, viewBounds.minY, zoom);
  const minTileX = Math.max(0, topLeft.tileX - bufferTiles);
  const maxTileX = bottomRight.tileX + bufferTiles;
  const minTileY = Math.max(0, topLeft.tileY - bufferTiles);
  const maxTileY = bottomRight.tileY + bufferTiles;
  const tiles = [];
  let count = 0;
  for (let x = minTileX; x <= maxTileX && count < maxTiles; x++) {
    for (let y = minTileY; y <= maxTileY && count < maxTiles; y++) {
      tiles.push({ x, y, z: zoom });
      count++;
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
export function calculateViewBoundsItm(canvasWidth, canvasHeight, viewTranslate, viewScale, coordinateScale, referencePoint, stretchX = 1, stretchY = 1) {
  if (!referencePoint || !referencePoint.itm || !referencePoint.canvas) {
    return null;
  }
  
  // Convert canvas corners to world coordinates
  // Account for stretch factors when converting screen to world
  const corners = [
    { x: 0, y: 0 },
    { x: canvasWidth, y: 0 },
    { x: 0, y: canvasHeight },
    { x: canvasWidth, y: canvasHeight }
  ];
  
  const worldCorners = corners.map(c => ({
    x: (c.x - viewTranslate.x) / (viewScale * stretchX),
    y: (c.y - viewTranslate.y) / (viewScale * stretchY)
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
 * Find a cached parent tile that covers the given tile coordinates.
 * Walks up the zoom pyramid (up to maxLevelsUp) and returns the sub-region
 * of the parent tile that corresponds to the requested child tile.
 * @param {number} x - Child tile X
 * @param {number} y - Child tile Y
 * @param {number} z - Child tile zoom level
 * @param {string} type - Tile type
 * @param {number} [maxLevelsUp=10] - How many zoom levels to search upward
 * @returns {{image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number}|null}
 */
export function findParentTile(x, y, z, type, maxLevelsUp = 10) {
  for (let dz = 1; dz <= maxLevelsUp && (z - dz) >= 0; dz++) {
    const pz = z - dz;
    const scale = 1 << dz; // 2^dz
    const px = x >> dz;
    const py = y >> dz;
    const img = getTileFromCache(px, py, pz, type);
    if (img) {
      const relX = x - px * scale;
      const relY = y - py * scale;
      return {
        image: img,
        sx: (relX / scale) * TILE_SIZE,
        sy: (relY / scale) * TILE_SIZE,
        sw: TILE_SIZE / scale,
        sh: TILE_SIZE / scale
      };
    }
  }
  return null;
}

/**
 * Clear all cached tiles
 */
export function clearTileCache() {
  tileCache.clear();
  totalCacheBytes = 0;
  pendingLoads.clear();
}

/**
 * Get cache statistics
 * @returns {{size: number, pending: number, bytesUsed: number, maxBytes: number}}
 */
export function getCacheStats() {
  return {
    size: tileCache.size,
    pending: pendingLoads.size,
    bytesUsed: totalCacheBytes,
    maxBytes: MAX_CACHE_BYTES
  };
}

// Export constants for external use (latLonToTile, tileToLatLon, findParentTile are already exported above)
export { TILE_SIZE, GOVMAP_RESOLUTIONS, GOVMAP_ORIGIN };
