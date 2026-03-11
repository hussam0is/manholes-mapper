/**
 * GovMap Layer Module
 * Handles tile URL construction, loading, and rendering for GovMap Israel tiles
 * Uses accurate proj4 coordinate transformations for Israel TM Grid (EPSG:2039)
 */

import {
  getTileFromCache,
  storeTileInCache,
  isTileLoadPending,
  markTileLoadPending,
  calculateVisibleTiles,
  calculateTilesInBounds,
  calculateViewBoundsItm,
  calculateZoomLevel,
  tileToLatLon,
  findParentTile
} from './tile-manager.js';
import {
  wgs84ToItm as projectWgs84ToItm,
  itmToWgs84 as projectItmToWgs84
} from './projections.js';

// Map layer types
export const MAP_TYPES = {
  ORTHOPHOTO: 'orthophoto',
  STREET: 'street'
};

// Tile server URLs
const TILE_URLS = {
  // Esri World Imagery – free satellite/aerial tiles (no API key required)
  orthophoto: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  // Esri World Street Map
  street: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
};

// Fallback tile URLs if primary fails
const FALLBACK_URLS = {
  orthophoto: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  street: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
};

// Layer state
let mapLayerEnabled = false;
let currentMapType = MAP_TYPES.ORTHOPHOTO;
let referencePoint = null; // {itm: {x, y}, canvas: {x, y}}

// Tile load error tracking
const MAX_RETRY_COUNT = 2;
const tileRetryCount = new Map();

// Tile projection cache: stores ITM corners to avoid per-frame proj4 trig calls
// Key: "z/x/y" → { topLeftItm, bottomRightItm, widthMeters, heightMeters }
const _tileItmCache = new Map();

/**
 * Get the tile URL for a specific tile
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @param {number} z - Zoom level
 * @param {string} type - Map type (orthophoto or street)
 * @param {boolean} useFallback - Whether to use fallback URL
 * @returns {string} Tile URL
 */
function getTileUrl(x, y, z, type, useFallback = false) {
  const urlTemplate = useFallback ? FALLBACK_URLS[type] : TILE_URLS[type];
  return urlTemplate
    .replace('{z}', z)
    .replace('{x}', x)
    .replace('{y}', y);
}

/**
 * Load a tile image
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @param {number} z - Zoom level
 * @param {string} type - Map type
 * @returns {Promise<HTMLImageElement>}
 */
async function loadTile(x, y, z, type) {
  const cacheKey = `${type}/${z}/${x}/${y}`;
  
  // Check if already failed too many times
  const retries = tileRetryCount.get(cacheKey) || 0;
  if (retries >= MAX_RETRY_COUNT) {
    return null;
  }
  
  // Check cache first
  const cached = getTileFromCache(x, y, z, type);
  if (cached) {
    return cached;
  }
  
  // Check if already loading
  if (isTileLoadPending(x, y, z, type)) {
    return null;
  }
  
  // Load the tile
  const loadPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      storeTileInCache(x, y, z, type, img);
      tileRetryCount.delete(cacheKey);
      resolve(img);
    };
    
    img.onerror = () => {
      // Try fallback URL
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = 'anonymous';
      
      fallbackImg.onload = () => {
        storeTileInCache(x, y, z, type, fallbackImg);
        tileRetryCount.delete(cacheKey);
        resolve(fallbackImg);
      };
      
      fallbackImg.onerror = () => {
        tileRetryCount.set(cacheKey, retries + 1);
        console.warn(`[Map] Failed to load tile ${cacheKey}`);
        resolve(null);
      };
      
      fallbackImg.src = getTileUrl(x, y, z, type, true);
    };
    
    img.src = getTileUrl(x, y, z, type, false);
  });
  
  markTileLoadPending(x, y, z, type, loadPromise);
  return loadPromise;
}

/**
 * Set the reference point for coordinate transformation
 * This links ITM coordinates to canvas coordinates
 * @param {object} point - {itm: {x, y}, canvas: {x, y}}
 */
export function setMapReferencePoint(point) {
  referencePoint = point;
}

/**
 * Get the current reference point
 * @returns {object|null}
 */
export function getMapReferencePoint() {
  return referencePoint;
}

/**
 * Enable or disable the map layer
 * @param {boolean} enabled
 */
export function setMapLayerEnabled(enabled) {
  mapLayerEnabled = enabled;
}

/**
 * Check if map layer is enabled
 * @returns {boolean}
 */
export function isMapLayerEnabled() {
  return mapLayerEnabled;
}

/**
 * Set the current map type
 * @param {string} type - MAP_TYPES.ORTHOPHOTO or MAP_TYPES.STREET
 */
export function setMapType(type) {
  if (Object.values(MAP_TYPES).includes(type)) {
    currentMapType = type;
  }
}

/**
 * Get the current map type
 * @returns {string}
 */
export function getMapType() {
  return currentMapType;
}

/**
 * Draw map tiles on the canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {object} viewTranslate - View translation {x, y}
 * @param {number} viewScale - View zoom scale
 * @param {number} coordinateScale - Pixels per meter
 * @param {Function} onTilesLoaded - Callback when new tiles are loaded
 * @param {number} stretchX - Horizontal stretch factor (default 1)
 * @param {number} stretchY - Vertical stretch factor (default 1)
 */
export async function drawMapTiles(ctx, canvasWidth, canvasHeight, viewTranslate, viewScale, coordinateScale, onTilesLoaded, stretchX = 1, stretchY = 1) {
  if (!mapLayerEnabled || !referencePoint) {
    return;
  }
  
  // Calculate view bounds in ITM (account for stretch to determine visible area)
  const viewBounds = calculateViewBoundsItm(
    canvasWidth,
    canvasHeight,
    viewTranslate,
    viewScale,
    coordinateScale,
    referencePoint,
    stretchX,
    stretchY
  );
  
  if (!viewBounds) {
    return;
  }
  
  // Calculate appropriate zoom level based on effective scale.
  // Account for stretch: use the minimum stretch axis so the zoom level
  // matches the coarsest on-screen resolution, reducing tile count.
  const minStretch = Math.min(stretchX, stretchY);
  const effectiveScale = coordinateScale * viewScale * minStretch;
  const zoom = calculateZoomLevel(effectiveScale);
  
  // Get visible tiles
  const tiles = calculateVisibleTiles(viewBounds, zoom);

  // Use high quality image smoothing for better aerial photo rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw each tile
  for (const tile of tiles) {
    const { x, y, z } = tile;

    // Get or load tile — fall back to parent tile as placeholder
    let tileImage = getTileFromCache(x, y, z, currentMapType);
    let parentInfo = null;

    if (!tileImage) {
      // Try to find a cached parent tile to draw as placeholder
      parentInfo = findParentTile(x, y, z, currentMapType);

      // Start loading the actual tile
      loadTile(x, y, z, currentMapType).then((img) => {
        if (img && onTilesLoaded) {
          onTilesLoaded();
        }
      });

      // Skip if no parent fallback either
      if (!parentInfo) continue;
    }

    // Look up or compute ITM corners for this tile (cached to avoid per-frame proj4)
    const tileCacheKey = `${z}/${x}/${y}`;
    let tileItm = _tileItmCache.get(tileCacheKey);
    if (!tileItm) {
      const topLeft = tileToLatLon(x, y, z);
      const bottomRight = tileToLatLon(x + 1, y + 1, z);
      const topLeftItm = projectWgs84ToItm(topLeft.lat, topLeft.lon);
      const bottomRightItm = projectWgs84ToItm(bottomRight.lat, bottomRight.lon);
      tileItm = {
        tlX: topLeftItm.x,
        tlY: topLeftItm.y,
        widthMeters: Math.abs(bottomRightItm.x - topLeftItm.x),
        heightMeters: Math.abs(topLeftItm.y - bottomRightItm.y)
      };
      _tileItmCache.set(tileCacheKey, tileItm);
    }

    const tileWidthMeters = tileItm.widthMeters;
    const tileHeightMeters = tileItm.heightMeters;

    // Convert ITM to canvas coordinates using reference point
    // These are in WORLD coordinates (before view transform)
    const worldX = referencePoint.canvas.x + (tileItm.tlX - referencePoint.itm.x) * coordinateScale;
    const worldY = referencePoint.canvas.y - (tileItm.tlY - referencePoint.itm.y) * coordinateScale;

    // Calculate tile size in world coordinates
    const worldWidth = tileWidthMeters * coordinateScale;
    const worldHeight = tileHeightMeters * coordinateScale;

    if (tileImage) {
      // Draw the full tile (context is already transformed, so use world coordinates)
      ctx.drawImage(
        tileImage,
        worldX,
        worldY,
        worldWidth,
        worldHeight
      );
    } else {
      // Draw the parent tile sub-region as placeholder (blurry but visible)
      ctx.drawImage(
        parentInfo.image,
        parentInfo.sx, parentInfo.sy, parentInfo.sw, parentInfo.sh,
        worldX, worldY, worldWidth, worldHeight
      );
    }
  }
}

/**
 * Draw attribution text for the map layer
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 */
export function drawMapAttribution(ctx, canvasWidth, canvasHeight) {
  if (!mapLayerEnabled) return;

  ctx.save();

  const text = 'Map: Esri World Imagery';
  const padding = 4;
  const fontSize = 10;

  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);

  const x = canvasWidth - metrics.width - padding - 8;
  const y = canvasHeight - padding - 4;

  // Read theme colors from CSS custom properties for dark mode support
  const rootStyle = typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement)
    : null;
  const bgColor = rootStyle
    ? rootStyle.getPropertyValue('--color-surface').trim() || 'rgba(255, 255, 255, 0.7)'
    : 'rgba(255, 255, 255, 0.7)';
  const textColor = rootStyle
    ? rootStyle.getPropertyValue('--color-text-secondary').trim() || '#333'
    : '#333';

  // Background
  ctx.fillStyle = bgColor.startsWith('#') || bgColor.startsWith('rgb')
    ? bgColor.replace(')', ', 0.7)').replace('rgb(', 'rgba(')
    : bgColor;
  // Simpler approach: use semi-transparent surface color
  ctx.globalAlpha = 0.8;
  ctx.fillRect(x - padding, y - fontSize, metrics.width + padding * 2, fontSize + padding);
  ctx.globalAlpha = 1.0;

  // Text
  ctx.fillStyle = textColor;
  ctx.fillText(text, x, y);

  ctx.restore();
}

/**
 * Create a reference point from a node with known coordinates
 * @param {object} node - Node with surveyX, surveyY (ITM) and x, y (canvas)
 * @returns {object|null} Reference point or null if node lacks coordinates
 */
export function createReferenceFromNode(node) {
  if (!node || node.surveyX == null || node.surveyY == null) {
    return null;
  }
  
  return {
    itm: {
      x: node.surveyX,
      y: node.surveyY
    },
    canvas: {
      x: node.x,
      y: node.y
    }
  };
}

/**
 * Create a reference point from WGS84 coordinates
 * Requires conversion to ITM using accurate projection
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {object} canvasPos - Canvas position {x, y}
 * @returns {object} Reference point
 */
export function createReferenceFromWgs84(lat, lon, canvasPos) {
  // Convert WGS84 to ITM using accurate proj4 projection
  const itm = projectWgs84ToItm(lat, lon);
  
  return {
    itm: itm,
    canvas: canvasPos
  };
}

/**
 * Export the accurate projection functions
 */
export const wgs84ToItm = projectWgs84ToItm;
export const itmToWgs84 = projectItmToWgs84;

/**
 * Save map layer settings to localStorage
 */
export function saveMapSettings() {
  try {
    // Check if localStorage is available (not in Node.js/test environment)
    if (typeof localStorage === 'undefined') {
      return;
    }
    const settings = {
      enabled: mapLayerEnabled,
      type: currentMapType
    };
    localStorage.setItem('graphSketch.mapLayer.v1', JSON.stringify(settings));
  } catch (e) {
    console.warn('[Map] Failed to save map layer settings', e.message);
  }
}

/**
 * Load map layer settings from localStorage
 */
export function loadMapSettings() {
  try {
    // Check if localStorage is available (not in Node.js/test environment)
    if (typeof localStorage === 'undefined') {
      return;
    }
    const raw = localStorage.getItem('graphSketch.mapLayer.v1');
    if (raw) {
      const settings = JSON.parse(raw);
      mapLayerEnabled = !!settings.enabled;
      if (settings.type && Object.values(MAP_TYPES).includes(settings.type)) {
        currentMapType = settings.type;
      }
    }
  } catch (e) {
    console.warn('[Map] Failed to load map layer settings', e.message);
  }
}

// ── Precache state for cancellation ────────────────────────────
let _precacheAbortController = null;
let _precacheInProgress = false;

/**
 * Cancel any in-flight tile precache batch.
 */
export function cancelTilePrecache() {
  if (_precacheAbortController) {
    _precacheAbortController.abort();
    _precacheAbortController = null;
  }
  _precacheInProgress = false;
}

/**
 * Precache map tiles for the polygon/extent that surrounds measurements (ITM bounds).
 * Loads tiles in the background so they are already in cache when the user views the area.
 * Cancels any previous in-flight batch before starting a new one.
 * @param {object} itmBounds - Bounds in ITM {minX, maxX, minY, maxY}
 * @param {number} [paddingMeters=50] - Extra margin in meters around the bounds
 * @param {Function} [onProgress] - Optional callback (loaded, total, zoom) for progress
 */
export function precacheTilesForMeasurementBounds(itmBounds, paddingMeters = 50, onProgress) {
  if (!itmBounds || typeof itmBounds.minX !== 'number' || typeof itmBounds.maxX !== 'number' ||
      typeof itmBounds.minY !== 'number' || typeof itmBounds.maxY !== 'number') {
    return;
  }

  // Cancel previous batch if still running
  cancelTilePrecache();

  _precacheInProgress = true;
  _precacheAbortController = new AbortController();
  const signal = _precacheAbortController.signal;

  const pad = paddingMeters;
  const bounds = {
    minX: itmBounds.minX - pad,
    maxX: itmBounds.maxX + pad,
    minY: itmBounds.minY - pad,
    maxY: itmBounds.maxY + pad
  };
  // Precache at zoom levels 17-18 (most useful for surveying, reduced from 4 to 2 levels)
  const zooms = [17, 18];
  const type = currentMapType;
  const maxTilesPerZoom = 500;
  const scheduled = [];
  for (const z of zooms) {
    const tiles = calculateTilesInBounds(bounds, z, maxTilesPerZoom, 1);
    for (const t of tiles) {
      if (getTileFromCache(t.x, t.y, t.z, type)) continue;
      if (isTileLoadPending(t.x, t.y, t.z, type)) continue;
      scheduled.push({ x: t.x, y: t.y, z: t.z });
    }
  }
  let loaded = 0;
  const concurrency = 8;
  let running = 0;
  let index = 0;
  function runNext() {
    while (running < concurrency && index < scheduled.length) {
      if (signal.aborted) {
        _precacheInProgress = false;
        return;
      }
      const t = scheduled[index++];
      running++;
      loadTile(t.x, t.y, t.z, type).then(() => {
        loaded++;
        if (onProgress && !signal.aborted) onProgress(loaded, scheduled.length, t.z);
      }).finally(() => {
        running--;
        if (!signal.aborted) runNext();
      });
    }
    if (running === 0) {
      _precacheInProgress = false;
    }
  }
  runNext();
}

// Initialize settings on module load
loadMapSettings();
