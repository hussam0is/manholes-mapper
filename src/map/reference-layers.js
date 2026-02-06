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

/** @type {Map<string, boolean>} Per-layer visibility overrides */
const layerVisibility = new Map();

// Default styles per layer type
const DEFAULT_STYLES = {
  sections: {
    strokeColor: 'rgba(0, 100, 200, 0.6)',
    fillColor: 'rgba(0, 100, 200, 0.08)',
    lineWidth: 2,
    lineDash: [8, 4],
    labelField: 'name',
    labelColor: '#0064c8',
    labelFontSize: 11
  },
  survey_manholes: {
    strokeColor: 'rgba(180, 60, 20, 0.7)',
    fillColor: 'rgba(180, 60, 20, 0.5)',
    pointRadius: 4,
    pointShape: 'square',
    labelField: 'OBJECTID',
    labelColor: '#b43c14',
    labelFontSize: 9
  },
  survey_pipes: {
    strokeColor: 'rgba(60, 140, 60, 0.7)',
    fillColor: 'rgba(60, 140, 60, 0.2)',
    lineWidth: 2.5,
    lineDash: [],
    labelField: null,
    labelColor: '#3c8c3c',
    labelFontSize: 9
  },
  streets: {
    strokeColor: 'rgba(100, 100, 100, 0.5)',
    fillColor: 'rgba(100, 100, 100, 0.05)',
    lineWidth: 1.5,
    lineDash: [4, 2],
    labelField: 'ST_NAME',
    labelColor: '#555',
    labelFontSize: 10
  },
  addresses: {
    strokeColor: 'rgba(150, 80, 150, 0.6)',
    fillColor: 'rgba(150, 80, 150, 0.4)',
    pointRadius: 3,
    pointShape: 'circle',
    labelField: 'HOUSE_NUM',
    labelColor: '#965096',
    labelFontSize: 8
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
 * Clear all loaded layers
 */
export function clearReferenceLayers() {
  layers = [];
  layerVisibility.clear();
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
    console.warn('Failed to save reference layer settings', e);
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
    console.warn('Failed to load reference layer settings', e);
  }
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

  // Calculate visible bounds in world coordinates for culling
  const visMinX = -viewTranslate.x / (viewScale * stretchX);
  const visMinY = -viewTranslate.y / (viewScale * stretchY);
  const visMaxX = (canvasWidth - viewTranslate.x) / (viewScale * stretchX);
  const visMaxY = (canvasHeight - viewTranslate.y) / (viewScale * stretchY);

  // Draw layers in display order
  const sortedLayers = [...layers].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  for (const layer of sortedLayers) {
    if (!isLayerVisible(layer.id)) continue;
    if (!layer.geojson || !layer.geojson.features) continue;

    const style = { ...(DEFAULT_STYLES[layer.layerType] || {}), ...(layer.style || {}) };
    
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

  for (const feature of features) {
    if (!feature.geometry) continue;

    const geomType = feature.geometry.type;
    const coords = feature.geometry.coordinates;

    switch (geomType) {
      case 'Point':
        drawPoint(ctx, coords, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw);
        break;

      case 'MultiPoint':
        for (const pt of coords) {
          drawPoint(ctx, pt, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw);
        }
        break;

      case 'LineString':
        drawLineString(ctx, coords, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw);
        break;

      case 'MultiLineString':
        for (const line of coords) {
          drawLineString(ctx, line, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw);
        }
        break;

      case 'Polygon':
        drawPolygon(ctx, coords, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw);
        break;

      case 'MultiPolygon':
        for (const poly of coords) {
          drawPolygon(ctx, poly, feature.properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw);
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
function drawPoint(ctx, coords, properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw) {
  const world = itmToWorld(coords[0], coords[1], refPoint, coordScale);
  const sx = world.x * stretchX;
  const sy = world.y * stretchY;

  // Cull if outside viewport
  const r = (style.pointRadius || 4) / viewScale;
  if (sx + r < visMinX || sx - r > visMaxX || sy + r < visMinY || sy - r > visMaxY) return;

  const radius = (style.pointRadius || 4) / viewScale;

  ctx.beginPath();
  if (style.pointShape === 'square') {
    ctx.rect(sx - radius, sy - radius, radius * 2, radius * 2);
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
function drawLineString(ctx, coords, properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw) {
  if (coords.length < 2) return;

  // Convert all coordinates
  const points = coords.map(c => {
    const w = itmToWorld(c[0], c[1], refPoint, coordScale);
    return { x: w.x * stretchX, y: w.y * stretchY };
  });

  // Quick bounding-box cull
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (maxX < visMinX || minX > visMaxX || maxY < visMinY || minY > visMaxY) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.strokeStyle = style.strokeColor || 'rgba(0,0,0,0.5)';
  ctx.lineWidth = (style.lineWidth || 2) / viewScale;
  if (style.lineDash && style.lineDash.length > 0) {
    ctx.setLineDash(style.lineDash.map(d => d / viewScale));
  } else {
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Label at midpoint
  if (style.labelField && properties && properties[style.labelField] != null) {
    const mid = points[Math.floor(points.length / 2)];
    labelsToDraw.push({ x: mid.x, y: mid.y, text: String(properties[style.labelField]) });
  }
}

/**
 * Draw a polygon feature (exterior ring + holes)
 */
function drawPolygon(ctx, rings, properties, style, refPoint, coordScale, stretchX, stretchY, viewScale, visMinX, visMinY, visMaxX, visMaxY, labelsToDraw) {
  if (!rings || rings.length === 0) return;

  // Convert exterior ring
  const exterior = rings[0].map(c => {
    const w = itmToWorld(c[0], c[1], refPoint, coordScale);
    return { x: w.x * stretchX, y: w.y * stretchY };
  });

  // Quick bounding-box cull
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of exterior) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (maxX < visMinX || minX > visMaxX || maxY < visMinY || minY > visMaxY) return;

  ctx.beginPath();
  // Exterior ring
  ctx.moveTo(exterior[0].x, exterior[0].y);
  for (let i = 1; i < exterior.length; i++) {
    ctx.lineTo(exterior[i].x, exterior[i].y);
  }
  ctx.closePath();

  // Holes (interior rings)
  for (let h = 1; h < rings.length; h++) {
    const hole = rings[h].map(c => {
      const w = itmToWorld(c[0], c[1], refPoint, coordScale);
      return { x: w.x * stretchX, y: w.y * stretchY };
    });
    ctx.moveTo(hole[0].x, hole[0].y);
    for (let i = 1; i < hole.length; i++) {
      ctx.lineTo(hole[i].x, hole[i].y);
    }
    ctx.closePath();
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
 * Draw labels collected from features
 */
function drawLabels(ctx, labels, style, viewScale, stretchX, stretchY) {
  if (labels.length === 0) return;

  const fontSize = (style.labelFontSize || 10) / viewScale;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = style.labelColor || '#333';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

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
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(
      label.x - metrics.width / 2 - pad,
      label.y - fontSize / 2 - pad,
      metrics.width + pad * 2,
      fontSize + pad * 2
    );

    // Draw label text
    ctx.fillStyle = style.labelColor || '#333';
    ctx.fillText(label.text, label.x, label.y);

    drawnPositions.push({ x: label.x, y: label.y });
  }
}

// Initialize settings on module load
loadRefLayerSettings();
