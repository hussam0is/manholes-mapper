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
  calculateViewBoundsItm,
  calculateZoomLevel,
  tileToItm,
  tileToLatLon,
  latLonToTile,
  TILE_SIZE,
  GOVMAP_RESOLUTIONS
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

// Tile server URLs (these may need adjustment based on actual GovMap endpoints)
const TILE_URLS = {
  // GovMap orthophoto tiles
  orthophoto: 'https://israelhiking.osm.org.il/Tiles/{z}/{x}/{y}.png',
  // Alternative: use Israel Hiking Map for street view
  street: 'https://israelhiking.osm.org.il/Hebrew/{z}/{x}/{y}.png'
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
let lastDrawnTiles = []; // Track tiles currently on screen

// Tile load error tracking
const failedTiles = new Set();
const MAX_RETRY_COUNT = 2;
const tileRetryCount = new Map();

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
        console.warn(`Failed to load tile ${cacheKey}`);
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
 */
export async function drawMapTiles(ctx, canvasWidth, canvasHeight, viewTranslate, viewScale, coordinateScale, onTilesLoaded) {
  if (!mapLayerEnabled || !referencePoint) {
    console.log('Map layer disabled or no reference point', { mapLayerEnabled, referencePoint });
    return;
  }
  
  // Calculate view bounds in ITM
  const viewBounds = calculateViewBoundsItm(
    canvasWidth,
    canvasHeight,
    viewTranslate,
    viewScale,
    coordinateScale,
    referencePoint
  );
  
  if (!viewBounds) {
    console.log('No view bounds calculated');
    return;
  }
  
  // Calculate appropriate zoom level based on effective scale
  const effectiveScale = coordinateScale * viewScale;
  const zoom = calculateZoomLevel(effectiveScale);
  
  // Get visible tiles
  const tiles = calculateVisibleTiles(viewBounds, zoom);
  
  console.log('Drawing map tiles', { 
    viewBounds, 
    zoom, 
    tilesCount: tiles.length,
    referencePoint,
    coordinateScale 
  });
  
  // Track if we need to request a redraw after loading
  let newTilesLoading = false;
  
  // Draw each tile
  for (const tile of tiles) {
    const { x, y, z } = tile;
    
    // Get or load tile
    let tileImage = getTileFromCache(x, y, z, currentMapType);
    
    if (!tileImage) {
      // Start loading, will draw on next frame
      loadTile(x, y, z, currentMapType).then((img) => {
        if (img && onTilesLoaded) {
          onTilesLoaded();
        }
      });
      newTilesLoading = true;
      continue;
    }
    
    // Convert tile corners to lat/lon
    const topLeft = tileToLatLon(x, y, z);
    const bottomRight = tileToLatLon(x + 1, y + 1, z);
    
    // Convert tile corners to ITM using accurate projection
    const topLeftItm = projectWgs84ToItm(topLeft.lat, topLeft.lon);
    const bottomRightItm = projectWgs84ToItm(bottomRight.lat, bottomRight.lon);
    
    // Calculate tile dimensions in meters
    const tileWidthMeters = Math.abs(bottomRightItm.x - topLeftItm.x);
    const tileHeightMeters = Math.abs(topLeftItm.y - bottomRightItm.y);
    
    // Convert ITM to canvas coordinates using reference point
    const canvasX = referencePoint.canvas.x + (topLeftItm.x - referencePoint.itm.x) * coordinateScale;
    const canvasY = referencePoint.canvas.y - (topLeftItm.y - referencePoint.itm.y) * coordinateScale;
    
    // Calculate tile size on canvas
    const tileSizeCanvasX = tileWidthMeters * coordinateScale;
    const tileSizeCanvasY = tileHeightMeters * coordinateScale;
    
    // Draw the tile
    ctx.drawImage(
      tileImage,
      canvasX,
      canvasY,
      tileSizeCanvasX,
      tileSizeCanvasY
    );
  }
  
  lastDrawnTiles = tiles;
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
  
  const text = 'Map: Israel Hiking Map / OSM';
  const padding = 4;
  const fontSize = 10;
  
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  
  const x = canvasWidth - metrics.width - padding - 8;
  const y = canvasHeight - padding - 4;
  
  // Background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillRect(x - padding, y - fontSize, metrics.width + padding * 2, fontSize + padding);
  
  // Text
  ctx.fillStyle = '#333';
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
    console.warn('Failed to save map layer settings', e);
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
    console.warn('Failed to load map layer settings', e);
  }
}

// Initialize settings on module load
loadMapSettings();
