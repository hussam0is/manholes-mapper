/**
 * Tile Manager Module
 * Handles tile loading, caching, and coordinate calculations for map background layers
 * Uses standard Web Mercator (EPSG:3857) XYZ tile scheme for compatibility with OSM-style tile servers
 * Coordinate transformations use accurate proj4 for Israel TM Grid (EPSG:2039)
 */

import {
  wgs84ToItm as projectWgs84ToItm,
  itmToWgs84 as projectItmToWgs84
} from './projections.js';

// Tile size in pixels (standard for most tile servers)
const TILE_SIZE = 256;

// Maximum number of tiles to cache in memory
const MAX_CACHE_SIZE = 300;

// Tile cache: Map<string, { image: HTMLImageElement, timestamp: number }>
const tileCache = new Map();

// Pending tile loads: Map<string, Promise<HTMLImageElement>>
const pendingLoads = new Map();

// Web Mercator constants
const EARTH_RADIUS = 6378137; // meters
const MAX_LATITUDE = 85.051128779806604; // Web Mercator limit

// Resolution (meters per pixel) for each zoom level in Web Mercator
// Formula: (2 * PI * EARTH_RADIUS) / (TILE_SIZE * 2^zoom)
const WEB_MERCATOR_RESOLUTIONS = [];
for (let z = 0; z <= 20; z++) {
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
 * Convert latitude to Web Mercator Y
 * @param {number} lat - Latitude in degrees
 * @returns {number} Y in meters
 */
function latToMercatorY(lat) {
  const latRad = lat * Math.PI / 180;
  return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
}

/**
 * Convert longitude to Web Mercator X
 * @param {number} lon - Longitude in degrees
 * @returns {number} X in meters
 */
function lonToMercatorX(lon) {
  return lon * Math.PI / 180 * EARTH_RADIUS;
}

/**
 * Convert Web Mercator Y to latitude
 * @param {number} y - Y in meters
 * @returns {number} Latitude in degrees
 */
function mercatorYToLat(y) {
  return (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180 / Math.PI;
}

/**
 * Convert Web Mercator X to longitude
 * @param {number} x - X in meters
 * @returns {number} Longitude in degrees
 */
function mercatorXToLon(x) {
  return x / EARTH_RADIUS * 180 / Math.PI;
}

/**
 * Convert lat/lon to tile coordinates (standard XYZ/slippy map)
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} zoom - Zoom level
 * @returns {{tileX: number, tileY: number}}
 */
export function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const latRad = lat * Math.PI / 180;
  
  const tileX = Math.floor((lon + 180) / 360 * n);
  const tileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  
  return { tileX, tileY };
}

/**
 * Convert tile coordinates to lat/lon (top-left corner of tile)
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {number} zoom - Zoom level
 * @returns {{lat: number, lon: number}}
 */
export function tileToLatLon(tileX, tileY, zoom) {
  const n = Math.pow(2, zoom);
  const lon = tileX / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / n)));
  const lat = latRad * 180 / Math.PI;
  
  return { lat, lon };
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
  const latRad = lat * Math.PI / 180;
  
  const exactX = (lon + 180) / 360 * n;
  const exactY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  
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
  // Increased from 25 to 100 to support zoomed-out views
  const maxTiles = 100; // 10x10 grid max
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

// Export constants for external use (latLonToTile and tileToLatLon are already exported above)
export { TILE_SIZE, GOVMAP_RESOLUTIONS, GOVMAP_ORIGIN };
