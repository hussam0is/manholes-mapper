/**
 * Reference Layers Module
 * 
 * Renders GIS reference layers (sections, survey manholes/pipes, streets, addresses)
 * on the canvas as background overlays. Layers are stored as GeoJSON FeatureCollections
 * with ITM (EPSG:2039) coordinates and converted to canvas world coordinates using
 * the map reference point.
 * 
 * Coordinate pipeline:
 *   ITM (x,y) → world coords via referencePoint + coordinateScale → stretch → canvas
 */

import { getMapReferencePoint } from './govmap-layer.js';

// ============================================
// State
// ============================================

/** @type {Array<LayerData>} Loaded layers */
let layers = [];

/** @type {boolean} Whether reference layers are globally enabled */
let refLayersEnabled = true;

/** @type {Array<LayerData>|null} Cached sorted layers (invalidated on layer change) */
let _sortedLayersCache = null;

/** @type {Map<string, object>} Cached merged styles per layer id (invalidated on layer change) */
let _styleCache = new Map();

// Dark mode + surface color caches (avoid per-frame getComputedStyle / matchMedia)
let _isDarkCached = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)').matches
  : false;
let _surfaceColorCached = null;

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    _isDarkCached = e.matches;
    _surfaceColorCached = null; // invalidate so it re-reads next frame
  });
}

/** @type {Map<string, boolean>} Per-layer visibility overrides */
const layerVisibility = new Map();

/** @type {Map<string, boolean>} Per-section (feature-level) visibility within sections layer */
const sectionVisibility = new Map();

/** Virtual section representing data outside all defined section polygons */
export const OUTSIDE_SECTIONS = { id: 'outside_sections_data', number: -1 };

// Default styles per layer type — light/dark label color pairs for dark mode support
const DEFAULT_STYLES = {
  sections: {
    strokeColor: 'rgba(0, 100, 200, 0.6)',
    fillColor: 'rgba(0, 100, 200, 0.08)',
    lineWidth: 2,
    lineDash: [8, 4],
    labelField: 'name',
    labelColor: '#0064c8',
    labelColorDark: '#60a5fa',
    labelFontSize: 11
  },
  survey_manholes: {
    strokeColor: 'rgba(180, 60, 20, 0.7)',
    fillColor: 'rgba(180, 60, 20, 0.5)',
    pointRadius: 4,
    pointShape: 'square',
    labelField: 'OBJECTID',
    labelColor: '#b43c14',
    labelColorDark: '#f97066',
    labelFontSize: 9
  },
  survey_pipes: {
    strokeColor: 'rgba(60, 140, 60, 0.7)',
    fillColor: 'rgba(60, 140, 60, 0.2)',
    lineWidth: 2.5,
    lineDash: [],
    labelField: null,
    labelColor: '#3c8c3c',
    labelColorDark: '#4ade80',
    labelFontSize: 9,
    showArrows: true // Enable direction arrows
  },
  streets: {
    strokeColor: 'rgba(100, 100, 100, 0.5)',
    fillColor: 'rgba(100, 100, 100, 0.05)',
    lineWidth: 1.5,
    lineDash: [4, 2],
    labelField: 'ST_NAME',
    labelColor: '#555',
    labelColorDark: '#cbd5e1',
    labelFontSize: 10
  },
  addresses: {
    strokeColor: 'rgba(150, 80, 150, 0.6)',
    fillColor: 'rgba(150, 80, 150, 0.4)',
    pointRadius: 3,
    pointShape: 'circle',
    labelField: 'HOUSE_NUM',
    labelColor: '#965096',
    labelColorDark: '#d8b4fe',
    labelFontSize: 8
  },
  coordinates: {
    strokeColor: 'rgba(16, 185, 129, 0.8)',
    fillColor: 'rgba(16, 185, 129, 0.6)',
    pointRadius: 4,
    pointShape: 'diamond',
    labelField: 'name',
    labelColor: '#065f46',
    labelColorDark: '#6ee7b7',
    labelFontSize: 9
  },
  raw_points: {
    strokeColor: 'rgba(220, 38, 38, 0.9)',
    fillColor: 'rgba(220, 38, 38, 0.6)',
    pointRadius: 5,
    pointShape: 'circle',
    labelField: 'name',
    labelColor: '#991b1b',
    labelColorDark: '#fca5a5',
    labelFontSize: 9
  }
};

// ============================================
// Public API
// ============================================

/**
 * Set the loaded layers data
 * @param {Array<LayerData>} layerDataArray - Array of { id, name, layerType, geojson, style, visible }
 */
export function setReferenceLayers(layerDataArray) {
  layers = layerDataArray || [];
  // Invalidate sorted/style caches
  _sortedLayersCache = null;
  _styleCache.clear();
  // Invalidate pre-transform cache (new layers need world coords recomputed)
  _preTransformRefX = null;
  // Initialize visibility from server-side visible flag
  layers.forEach(l => {
    if (!layerVisibility.has(l.id)) {
      layerVisibility.set(l.id, l.visible !== false);
    }
  });
}

/**
 * Get the current reference layers (for UI listing)
 * @returns {Array<{id: string, name: string, layerType: string, visible: boolean, featureCount: number}>}
 */
export function getReferenceLayers() {
  return layers.map(l => ({
    id: l.id,
    name: l.name,
    layerType: l.layerType,
    visible: isLayerVisible(l.id),
    featureCount: l.geojson?.features?.length || 0
  }));
}

/**
 * Check if a specific layer is visible
 * @param {string} layerId
 * @returns {boolean}
 */
export function isLayerVisible(layerId) {
  if (!refLayersEnabled) return false;
  return layerVisibility.get(layerId) !== false;
}

/**
 * Toggle visibility of a specific layer
 * @param {string} layerId
 * @param {boolean} [visible] - If undefined, toggles current state
 */
export function setLayerVisibility(layerId, visible) {
  if (visible === undefined) {
    layerVisibility.set(layerId, !layerVisibility.get(layerId));
  } else {
    layerVisibility.set(layerId, visible);
  }
}

/**
 * Enable or disable all reference layers
 * @param {boolean} enabled
 */
export function setRefLayersEnabled(enabled) {
  refLayersEnabled = enabled;
}

/**
 * Check if reference layers are globally enabled
 * @returns {boolean}
 */
export function isRefLayersEnabled() {
  return refLayersEnabled;
}

/**
 * Get the raw layers array (including full geojson data).
 * Used for merging custom layers into the existing set.
 * @returns {Array<LayerData>}
 */
export function getRawLayers() {
  return layers;
}

/**
 * Add or replace a single layer by ID, preserving other layers.
 * @param {LayerData} layerData - Full layer object including geojson
 */
export function upsertReferenceLayer(layerData) {
  const idx = layers.findIndex(l => l.id === layerData.id);
  if (idx >= 0) {
    layers[idx] = layerData;
  } else {
    layers.push(layerData);
  }
  // Initialize visibility
  if (!layerVisibility.has(layerData.id)) {
    layerVisibility.set(layerData.id, layerData.visible !== false);
  }
  // Invalidate caches
  _sortedLayersCache = null;
  _styleCache.clear();
  _preTransformRefX = null;
}

/**
 * Clear all loaded layers
 */
export function clearReferenceLayers() {
  layers = [];
  layerVisibility.clear();
  _sortedLayersCache = null;
  _styleCache.clear();
  _preTransformRefX = null;
}

// ============================================
// Per-Section (Feature-Level) Visibility
// ============================================

/**
 * Get the list of individual sections from the sections reference layer.
 * Returns each section feature as a toggleable entry, plus the virtual
 * "outside_sections_data" entry (number -1).
 * @returns {Array<{id: string, name: string, number: number|null, visible: boolean}>}
 */
export function getSectionFeatures() {
  const sectionsLayer = layers.find(l => l.layerType === 'sections');
  if (!sectionsLayer || !sectionsLayer.geojson || !sectionsLayer.geojson.features) {
    return [{ id: OUTSIDE_SECTIONS.id, name: OUTSIDE_SECTIONS.id, number: OUTSIDE_SECTIONS.number, visible: sectionVisibility.get(OUTSIDE_SECTIONS.id) !== false }];
  }

  const seen = new Set();
  const sections = [];
  for (const f of sectionsLayer.geojson.features) {
    const name = f.properties && f.properties.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    sections.push({
      id: name,
      name,
      number: f.properties.SECTION_NUM ?? f.properties.number ?? null,
      visible: sectionVisibility.get(name) !== false
    });
  }

  // Add virtual outside-sections entry
  sections.push({
    id: OUTSIDE_SECTIONS.id,
    name: OUTSIDE_SECTIONS.id,
    number: OUTSIDE_SECTIONS.number,
    visible: sectionVisibility.get(OUTSIDE_SECTIONS.id) !== false
  });

  return sections;
}

/**
 * Check if a specific section (feature) is visible
 * @param {string} sectionId - Section name or OUTSIDE_SECTIONS.id
 * @returns {boolean}
 */
export function isSectionVisible(sectionId) {
  return sectionVisibility.get(sectionId) !== false;
}

/**
 * Set visibility for a specific section (feature)
 * @param {string} sectionId
 * @param {boolean} visible
 */
export function setSectionVisibility(sectionId, visible) {
  sectionVisibility.set(sectionId, visible);
}

/**
 * Save section visibility settings to localStorage
 */
export function saveSectionSettings() {
  try {
    if (typeof localStorage === 'undefined') return;
    const settings = Object.fromEntries(sectionVisibility);
    localStorage.setItem('graphSketch.sectionVisibility.v1', JSON.stringify(settings));
  } catch (e) {
    console.warn('[Map] Failed to save section settings', e.message);
  }
}

/**
 * Load section visibility settings from localStorage
 */
export function loadSectionSettings() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem('graphSketch.sectionVisibility.v1');
    if (raw) {
      const settings = JSON.parse(raw);
      Object.entries(settings).forEach(([id, vis]) => {
        sectionVisibility.set(id, vis);
      });
    }
  } catch (e) {
    console.warn('[Map] Failed to load section settings', e.message);
  }
}

/**
 * Save reference layer visibility settings to localStorage
 */
export function saveRefLayerSettings() {
  try {
    if (typeof localStorage === 'undefined') return;
    const settings = {
      enabled: refLayersEnabled,
      visibility: Object.fromEntries(layerVisibility)
    };
    localStorage.setItem('graphSketch.refLayers.v1', JSON.stringify(settings));
  } catch (e) {
    console.warn('[Map] Failed to save reference layer settings', e.message);
  }
}

/**
 * Load reference layer visibility settings from localStorage
 */
export function loadRefLayerSettings() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem('graphSketch.refLayers.v1');
    if (raw) {
      const settings = JSON.parse(raw);
      refLayersEnabled = settings.enabled !== false;
      if (settings.visibility) {
        Object.entries(settings.visibility).forEach(([id, vis]) => {
          layerVisibility.set(id, vis);
        });
      }
    }
  } catch (e) {
    console.warn('[Map] Failed to load reference layer settings', e.message);
  }
}

// ============================================
// Pre-transformed World Coordinates Cache
// ============================================

/** Cached refPoint/coordScale used for pre-transform (detect changes) */
let _preTransformRefX = null;
let _preTransformRefY = null;
let _preTransformCanvasX = null;
let _preTransformCanvasY = null;
let _preTransformCoordScale = null;

/**
 * Check if pre-transform cache is valid for current params.
 * Returns true if features need re-transforming.
 */
function needsPreTransform(refPoint, coordScale) {
  return (
    _preTransformRefX !== refPoint.itm.x ||
    _preTransformRefY !== refPoint.itm.y ||
    _preTransformCanvasX !== refPoint.canvas.x ||
    _preTransformCanvasY !== refPoint.canvas.y ||
    _preTransformCoordScale !== coordScale
  );
}

/**
 * Pre-compute world coordinates and bounding boxes for all features across all layers.
 * Stored as _worldCoords, _worldRings, _worldPoint, _worldMultiCoords, _bbox on each feature.
 */
function preTransformAllFeatures(refPoint, coordScale) {
  _preTransformRefX = refPoint.itm.x;
  _preTransformRefY = refPoint.itm.y;
  _preTransformCanvasX = refPoint.canvas.x;
  _preTransformCanvasY = refPoint.canvas.y;
  _preTransformCoordScale = coordScale;

  for (const layer of layers) {
    if (!layer.geojson || !layer.geojson.features) continue;
    for (const feature of layer.geojson.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const coords = geom.coordinates;

      switch (geom.type) {
        case 'Point':
          if (coords) {
            feature._worldPoint = itmToWorld(coords[0], coords[1], refPoint, coordScale);
          }
          break;
        case 'MultiPoint':
          if (coords) {
            feature._worldMultiPoints = coords.map(c => itmToWorld(c[0], c[1], refPoint, coordScale));
          }
          break;
        case 'LineString':
          if (coords) {
            feature._worldCoords = coords.map(c => itmToWorld(c[0], c[1], refPoint, coordScale));
            feature._bbox = computeBBox(feature._worldCoords);
          }
          break;
        case 'MultiLineString':
          if (coords) {
            feature._worldMultiCoords = coords.map(line =>
              line.map(c => itmToWorld(c[0], c[1], refPoint, coordScale))
            );
          }
          break;
        case 'Polygon':
          if (coords) {
            feature._worldRings = coords.map(ring =>
              ring.map(c => itmToWorld(c[0], c[1], refPoint, coordScale))
            );
            if (feature._worldRings[0]) {
              feature._bbox = computeBBox(feature._worldRings[0]);
            }
          }
          break;
        case 'MultiPolygon':
          if (coords) {
            feature._worldMultiPolygons = coords.map(poly =>
              poly.map(ring => ring.map(c => itmToWorld(c[0], c[1], refPoint, coordScale)))
            );
          }
          break;
      }
    }
  }
}

/**
 * Compute axis-aligned bounding box from an array of {x, y} points.
 */
function computeBBox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// ============================================
// Drawing Functions
// ============================================

/**
 * Convert an ITM coordinate to canvas world coordinates
 * @param {number} itmX - ITM X (easting)
 * @param {number} itmY - ITM Y (northing)
 * @param {object} refPoint - { itm: {x, y}, canvas: {x, y} }
 * @param {number} coordScale - Pixels per meter
 * @returns {{x: number, y: number}} World coordinates
 */
function itmToWorld(itmX, itmY, refPoint, coordScale) {
  return {
    x: refPoint.canvas.x + (itmX - refPoint.itm.x) * coordScale,
    y: refPoint.canvas.y - (itmY - refPoint.itm.y) * coordScale
  };
}

/**
 * Draw all visible reference layers on the canvas.
 * Call this inside the draw() function, after ctx.translate/ctx.scale, before edges/nodes.
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context (already translated & scaled)
 * @param {number} coordinateScale - Pixels per meter
 * @param {number} viewScale - Current zoom scale
 * @param {number} stretchX - Horizontal stretch factor
 * @param {number} stretchY - Vertical stretch factor
 * @param {object} viewTranslate - { x, y } view translation
 * @param {number} canvasWidth - Logical canvas width (CSS pixels)
 * @param {number} canvasHeight - Logical canvas height (CSS pixels)
 */
export function drawReferenceLayers(ctx, coordinateScale, viewScale, stretchX, stretchY, viewTranslate, canvasWidth, canvasHeight) {
  if (!refLayersEnabled || layers.length === 0) return;

  const refPoint = getMapReferencePoint();
  if (!refPoint) return;

  // Pre-transform ITM → world coords once (cached until refPoint/coordScale change)
  if (needsPreTransform(refPoint, coordinateScale)) {
    preTransformAllFeatures(refPoint, coordinateScale);
  }

  // Calculate visible bounds in world coordinates for culling
  const visMinX = -viewTranslate.x / viewScale;
  const visMinY = -viewTranslate.y / viewScale;
  const visMaxX = (canvasWidth - viewTranslate.x) / viewScale;
  const visMaxY = (canvasHeight - viewTranslate.y) / viewScale;

  // Build sorted layers + merged styles once, then reuse until layers change
  if (!_sortedLayersCache) {
    _sortedLayersCache = [...layers].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    _styleCache.clear();
    for (const layer of _sortedLayersCache) {
      _styleCache.set(layer.id, { ...(DEFAULT_STYLES[layer.layerType] || {}), ...(layer.style || {}) });
    }
  }

  for (const layer of _sortedLayersCache) {
    if (!isLayerVisible(layer.id)) continue;
    if (!layer.geojson || !layer.geojson.features) continue;

    const style = _styleCache.get(layer.id);
    
    ctx.save();
    drawLayerFeatures(ctx, layer, style, refPoint, coordinateScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY);
    ctx.restore();
  }
}

/**
 * Draw all features for a single layer
 */
function drawLayerFeatures(ctx, layer, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY) {
  const features = layer.geojson.features;
  const labelsToDraw = [];
  const isSectionsLayer = layer.layerType === 'sections';

  for (const feature of features) {
    if (!feature.geometry) continue;

    // Per-section visibility: skip hidden individual sections
    if (isSectionsLayer && feature.properties && feature.properties.name) {
      if (!isSectionVisible(feature.properties.name)) continue;
    }

    const geomType = feature.geometry.type;
    const coords = feature.geometry.coordinates;

    switch (geomType) {
      case 'Point':
        drawPoint(ctx, coords, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw, feature._worldPoint);
        break;

      case 'MultiPoint':
        if (feature._worldMultiPoints) {
          for (const wp of feature._worldMultiPoints) {
            drawPoint(ctx, null, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw, wp);
          }
        } else {
          for (const pt of coords) {
            drawPoint(ctx, pt, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw);
          }
        }
        break;

      case 'LineString':
        drawLineString(ctx, coords, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw, feature._worldCoords, feature._bbox);
        break;

      case 'MultiLineString':
        if (feature._worldMultiCoords) {
          for (const worldLine of feature._worldMultiCoords) {
            drawLineString(ctx, null, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw, worldLine);
          }
        } else {
          for (const line of coords) {
            drawLineString(ctx, line, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw);
          }
        }
        break;

      case 'Polygon':
        drawPolygon(ctx, coords, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw, feature._worldRings, feature._bbox);
        break;

      case 'MultiPolygon':
        if (feature._worldMultiPolygons) {
          for (const worldPoly of feature._worldMultiPolygons) {
            drawPolygon(ctx, null, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw, worldPoly);
          }
        } else {
          for (const poly of coords) {
            drawPolygon(ctx, poly, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw);
          }
        }
        break;
    }
  }

  // Draw labels on top of geometry
  if (style.labelField && viewScale > 0.3) {
    drawLabels(ctx, labelsToDraw, style, viewScale, stretchX, stretchY);
  }
}

/**
 * Draw a point feature
 */
function drawPoint(ctx, coords, properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw, preWorld) {
  const world = preWorld || itmToWorld(coords[0], coords[1], refPoint, coordScale);
  const sx = world.x * stretchX;
  const sy = world.y * stretchY;

  // Cull if outside viewport
  const r = (style.pointRadius || 4) / viewScale;
  if (sx + r < visMinX || sx - r > visMaxX || sy + r < visMinY || sy - r > visMaxY) return;

  const radius = (style.pointRadius || 4) / viewScale;

  ctx.beginPath();
  if (style.pointShape === 'square') {
    ctx.rect(sx - radius, sy - radius, radius * 2, radius * 2);
  } else if (style.pointShape === 'diamond') {
    ctx.moveTo(sx, sy - radius);
    ctx.lineTo(sx + radius, sy);
    ctx.lineTo(sx, sy + radius);
    ctx.lineTo(sx - radius, sy);
    ctx.closePath();
  } else {
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
  }

  if (style.fillColor) {
    ctx.fillStyle = style.fillColor;
    ctx.fill();
  }
  if (style.strokeColor) {
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = (style.lineWidth || 1) / viewScale;
    ctx.stroke();
  }

  // Collect label
  if (style.labelField && properties && properties[style.labelField] != null) {
    labelsToDraw.push({ x: sx, y: sy, text: String(properties[style.labelField]) });
  }
}

/**
 * Draw a line string feature
 */
function drawLineString(ctx, coords, properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw, preWorldCoords, preBBox) {
  // Use pre-computed world coords if available, otherwise compute on the fly.
  // When preWorldCoords is available, apply stretch inline during drawing to
  // avoid allocating a new array every frame (hot path optimization).
  const srcCoords = preWorldCoords; // may be null
  let points = null; // only allocated for the non-preWorldCoords path or when arrows needed
  if (!srcCoords) {
    if (coords.length < 2) return;
    points = coords.map(c => {
      const w = itmToWorld(c[0], c[1], refPoint, coordScale);
      return { x: w.x * stretchX, y: w.y * stretchY };
    });
  }
  const src = srcCoords || points;
  if (src.length < 2) return;

  // Quick bounding-box cull (use pre-computed bbox with stretch if available)
  let minX, minY, maxX, maxY;
  if (preBBox) {
    minX = preBBox.minX * stretchX;
    minY = preBBox.minY * stretchY;
    maxX = preBBox.maxX * stretchX;
    maxY = preBBox.maxY * stretchY;
  } else {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    if (srcCoords) {
      for (let i = 0; i < srcCoords.length; i++) {
        const sx = srcCoords[i].x * stretchX, sy = srcCoords[i].y * stretchY;
        if (sx < minX) minX = sx; if (sy < minY) minY = sy;
        if (sx > maxX) maxX = sx; if (sy > maxY) maxY = sy;
      }
    } else {
      for (const p of points) {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
    }
  }
  if (maxX < visMinX || minX > visMaxX || maxY < visMinY || minY > visMaxY) return;

  // Draw path — apply stretch inline for preWorldCoords to avoid array allocation
  ctx.beginPath();
  if (srcCoords) {
    ctx.moveTo(srcCoords[0].x * stretchX, srcCoords[0].y * stretchY);
    for (let i = 1; i < srcCoords.length; i++) {
      ctx.lineTo(srcCoords[i].x * stretchX, srcCoords[i].y * stretchY);
    }
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
  }

  ctx.strokeStyle = style.strokeColor || 'rgba(0,0,0,0.5)';
  ctx.lineWidth = (style.lineWidth || 2) / viewScale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style.lineDash && style.lineDash.length > 0) {
    ctx.setLineDash(style.lineDash.map(d => d / viewScale));
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // Draw direction arrows if requested — lazy-build points array only when needed
  if (style.showArrows && src.length >= 2) {
    if (srcCoords && !points) {
      points = srcCoords.map(w => ({ x: w.x * stretchX, y: w.y * stretchY }));
    }
    drawDirectionArrows(ctx, points, style, viewScale);
  }

  // Label at midpoint
  if (style.labelField && properties && properties[style.labelField] != null) {
    const midIdx = Math.floor(src.length / 2);
    const w = src[midIdx];
    const mx = srcCoords ? w.x * stretchX : w.x;
    const my = srcCoords ? w.y * stretchY : w.y;
    labelsToDraw.push({ x: mx, y: my, text: String(properties[style.labelField]) });
  }
}

/**
 * Draw direction arrows along a line
 */
function drawDirectionArrows(ctx, points, style, viewScale) {
  const arrowSize = (style.arrowSize || 8) / viewScale;
  const arrowColor = style.strokeColor || 'rgba(60, 140, 60, 0.7)';
  
  ctx.save();
  ctx.fillStyle = arrowColor;
  ctx.strokeStyle = arrowColor;
  ctx.lineWidth = (style.lineWidth || 2) / viewScale;

  // Draw arrow at the end of each segment (or just the last one?)
  // For pipes, usually one arrow in the middle or at the end is enough.
  // Let's draw one in the middle of each segment if it's long enough.
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i+1];
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    
    if (len < arrowSize * 2) continue;

    // Draw arrow at the midpoint of the segment
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    
    ctx.beginPath();
    ctx.moveTo(-arrowSize, -arrowSize / 1.5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-arrowSize, arrowSize / 1.5);
    ctx.stroke();
    
    ctx.restore();
  }
  
  ctx.restore();
}

/**
 * Draw a polygon feature (exterior ring + holes)
 */
function drawPolygon(ctx, rings, properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw, preWorldRings, preBBox) {
  // When preWorldRings is available, apply stretch inline during drawing to avoid
  // allocating new arrays every frame (hot path optimization).
  const usePre = !!preWorldRings;
  let exterior = null;
  let holeRings = null;
  if (!usePre) {
    if (!rings || rings.length === 0) return;
    exterior = rings[0].map(c => {
      const w = itmToWorld(c[0], c[1], refPoint, coordScale);
      return { x: w.x * stretchX, y: w.y * stretchY };
    });
    holeRings = [];
    for (let h = 1; h < rings.length; h++) {
      holeRings.push(rings[h].map(c => {
        const w = itmToWorld(c[0], c[1], refPoint, coordScale);
        return { x: w.x * stretchX, y: w.y * stretchY };
      }));
    }
  }

  // Quick bounding-box cull
  let minX, minY, maxX, maxY;
  if (preBBox) {
    minX = preBBox.minX * stretchX;
    minY = preBBox.minY * stretchY;
    maxX = preBBox.maxX * stretchX;
    maxY = preBBox.maxY * stretchY;
  } else if (usePre) {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    const ring0 = preWorldRings[0];
    for (let i = 0; i < ring0.length; i++) {
      const sx = ring0[i].x * stretchX, sy = ring0[i].y * stretchY;
      if (sx < minX) minX = sx; if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx; if (sy > maxY) maxY = sy;
    }
  } else {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    for (const p of exterior) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
  }
  if (maxX < visMinX || minX > visMaxX || maxY < visMinY || minY > visMaxY) return;

  ctx.beginPath();
  // Exterior ring — apply stretch inline for preWorldRings path
  if (usePre) {
    const ring0 = preWorldRings[0];
    ctx.moveTo(ring0[0].x * stretchX, ring0[0].y * stretchY);
    for (let i = 1; i < ring0.length; i++) {
      ctx.lineTo(ring0[i].x * stretchX, ring0[i].y * stretchY);
    }
  } else {
    ctx.moveTo(exterior[0].x, exterior[0].y);
    for (let i = 1; i < exterior.length; i++) {
      ctx.lineTo(exterior[i].x, exterior[i].y);
    }
  }
  ctx.closePath();

  // Holes (interior rings)
  if (usePre) {
    for (let h = 1; h < preWorldRings.length; h++) {
      const hole = preWorldRings[h];
      ctx.moveTo(hole[0].x * stretchX, hole[0].y * stretchY);
      for (let i = 1; i < hole.length; i++) {
        ctx.lineTo(hole[i].x * stretchX, hole[i].y * stretchY);
      }
      ctx.closePath();
    }
  } else {
    for (const hole of holeRings) {
      ctx.moveTo(hole[0].x, hole[0].y);
      for (let i = 1; i < hole.length; i++) {
        ctx.lineTo(hole[i].x, hole[i].y);
      }
      ctx.closePath();
    }
  }

  // Fill
  if (style.fillColor) {
    ctx.fillStyle = style.fillColor;
    ctx.fill('evenodd');
  }

  // Stroke
  if (style.strokeColor) {
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = (style.lineWidth || 1.5) / viewScale;
    if (style.lineDash && style.lineDash.length > 0) {
      ctx.setLineDash(style.lineDash.map(d => d / viewScale));
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Label at centroid
  if (style.labelField && properties && properties[style.labelField] != null) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    labelsToDraw.push({ x: cx, y: cy, text: String(properties[style.labelField]) });
  }
}

/**
 * Draw labels collected from features.
 * Reads CSS custom properties to determine dark mode and adapts label colors
 * and background accordingly.
 */
function drawLabels(ctx, labels, style, viewScale, _stretchX, _stretchY) {
  if (labels.length === 0) return;

  const fontSize = (style.labelFontSize || 10) / viewScale;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Use cached dark mode flag (updated via matchMedia listener, not per-frame)
  const isDark = _isDarkCached;

  // Use cached surface color (invalidated on dark mode change, re-read lazily)
  if (!_surfaceColorCached && typeof document !== 'undefined') {
    _surfaceColorCached = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || '#ffffff';
  }
  const labelBg = isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.7)';

  // Use dark mode label color variant when available
  const labelColor = isDark
    ? (style.labelColorDark || style.labelColor || '#cbd5e1')
    : (style.labelColor || '#333');

  ctx.fillStyle = labelColor;

  // Simple deduplication: skip labels that would overlap
  const drawnPositions = [];
  const minGap = fontSize * 3;

  for (const label of labels) {
    // Check if too close to an already-drawn label
    let tooClose = false;
    for (const pos of drawnPositions) {
      const dx = label.x - pos.x;
      const dy = label.y - pos.y;
      if (Math.abs(dx) < minGap && Math.abs(dy) < minGap) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Draw label background for readability
    const metrics = ctx.measureText(label.text);
    const pad = 2 / viewScale;
    ctx.fillStyle = labelBg;
    ctx.fillRect(
      label.x - metrics.width / 2 - pad,
      label.y - fontSize / 2 - pad,
      metrics.width + pad * 2,
      fontSize + pad * 2
    );

    // Draw label text
    ctx.fillStyle = labelColor;
    ctx.fillText(label.text, label.x, label.y);

    drawnPositions.push({ x: label.x, y: label.y });
  }
}

/**
 * Hit-test reference layer points at a world coordinate.
 * Returns the closest feature's properties + layer info within hitRadius, or null.
 * @param {number} worldX - World X coordinate
 * @param {number} worldY - World Y coordinate
 * @param {number} hitRadius - Hit radius in world coordinates
 * @param {number} coordinateScale - Pixels per meter
 * @returns {{properties: object, layerName: string, layerType: string}|null}
 */
export function hitTestReferenceLayers(worldX, worldY, hitRadius, coordinateScale) {
  if (!refLayersEnabled || layers.length === 0) return null;
  const refPoint = getMapReferencePoint();
  if (!refPoint) return null;

  let closest = null;
  let closestDist = hitRadius;

  for (const layer of layers) {
    if (!isLayerVisible(layer.id)) continue;
    const features = layer.geojson?.features;
    if (!features) continue;

    for (const feature of features) {
      if (!feature.geometry || feature.geometry.type !== 'Point') continue;
      const [itmX, itmY] = feature.geometry.coordinates;
      // Use pre-transformed world coords if available
      const wx = feature._worldPoint != null ? feature._worldPoint.x : refPoint.canvas.x + (itmX - refPoint.itm.x) * coordinateScale;
      const wy = feature._worldPoint != null ? feature._worldPoint.y : refPoint.canvas.y - (itmY - refPoint.itm.y) * coordinateScale;
      const dx = wx - worldX;
      const dy = wy - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = {
          properties: feature.properties || {},
          layerName: layer.name,
          layerType: layer.layerType,
          worldX: wx,
          worldY: wy,
        };
      }
    }
  }
  return closest;
}

/**
 * Add a "raw points" layer from a parsed coordinates CSV.
 * Each call creates a separate named layer so multiple files can coexist.
 * @param {string} fileName - Original file name (shown in tooltips)
 * @param {Map<string, {x: number, y: number, z: number}>} coordsMap - Parsed coordinates
 * @returns {string} - The generated layer ID
 */
export function addRawPointsLayer(fileName, coordsMap) {
  const features = [];
  for (const [pointId, coords] of coordsMap) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [coords.x, coords.y] },
      properties: {
        name: pointId,
        x: coords.x,
        y: coords.y,
        z: coords.z || 0,
        sourceFile: fileName,
      },
    });
  }

  const layerId = `__raw_points_${Date.now()}_${Math.random().toString(36).slice(2, 6)}__`;
  const displayName = fileName.replace(/\.[^.]+$/, ''); // strip extension

  upsertReferenceLayer({
    id: layerId,
    name: displayName,
    layerType: 'raw_points',
    visible: true,
    geojson: { type: 'FeatureCollection', features },
    style: { ...DEFAULT_STYLES.raw_points },
  });

  return layerId;
}

// Initialize settings on module load
loadRefLayerSettings();
loadSectionSettings();
