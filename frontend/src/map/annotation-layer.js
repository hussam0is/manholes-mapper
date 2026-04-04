/**
 * Leaflet Geoman Annotation Layer
 *
 * Provides a transparent Leaflet map overlay OVER the custom canvas so that
 * field workers can draw zones, notes, and polygon annotations using the
 * @geoman-io/leaflet-geoman-free toolbar — without touching the infrastructure
 * graph (nodes/edges) which lives on the main canvas.
 *
 * Architecture:
 *  - A <div id="mmAnnotationMap"> is injected OVER #graphCanvas (pointer-events: none
 *    when Geoman is inactive so canvas interactions pass through).
 *  - When the user activates a Geoman tool, pointer-events are enabled on the
 *    overlay so Leaflet can capture mouse/touch events.
 *  - WGS-84 ↔ ITM conversion uses the same projections module used by the rest
 *    of the app.
 *  - All drawn features are emitted on the EventBus as `annotation:created`,
 *    `annotation:edited`, and `annotation:deleted` and autosaved to IndexedDB
 *    (`annotationsStore`).
 *
 * Integration:
 *   import { initAnnotationLayer, destroyAnnotationLayer } from '../map/annotation-layer.js';
 *   // Call once after the canvas is initialised:
 *   initAnnotationLayer();
 */

import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { bus } from '../state/event-bus.js';
import { saveAnnotations, loadAnnotations } from '../db.js';
import { wgs84ToItm, itmToWgs84 } from './govmap-layer.js';

// ─── Module state ─────────────────────────────────────────────────────────────
/** @type {L.Map|null} */
let _map = null;
/** @type {HTMLElement|null} */
let _mapDiv = null;
/** @type {boolean} */
let _geomanActive = false;

/** @type {L.Circle|null} — GPS accuracy circle rendered on the Leaflet overlay */
let _accuracyCircle = null;

// Debounce timer for batching rapid pm:edit events
let _saveTimer = null;
const SAVE_DEBOUNCE_MS = 800;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a canvas-world coordinate (ITM x,y) to WGS-84 LatLng.
 * Fallback: if projection fails, return a safe default (Tel Aviv centre).
 * @param {number} itmX
 * @param {number} itmY
 * @returns {L.LatLng}
 */
function itmToLatLng(itmX, itmY) {
  try {
    const wgs = itmToWgs84(itmX, itmY);
    return L.latLng(wgs.lat, wgs.lon);
  } catch {
    return L.latLng(32.0853, 34.7818); // Tel Aviv fallback
  }
}

/**
 * Derive the current map centre + zoom from canvas state.
 * Reads the shared govmap reference point (if available) to align the
 * Leaflet map with the canvas viewport.
 */
function deriveLeafletView() {
  // Try to get the canvas reference point set by govmap-layer
  const refFn = /** @type {any} */ (window).__mmGetReferencePoint;
  if (typeof refFn === 'function') {
    const ref = refFn();
    if (ref?.itm) {
      return { center: itmToLatLng(ref.itm.x, ref.itm.y), zoom: 17 };
    }
  }
  // Fallback: Israel bounding box centre
  return { center: L.latLng(31.5, 34.9), zoom: 8 };
}

/**
 * Collect all drawn layers as a GeoJSON FeatureCollection.
 * @returns {object} GeoJSON FeatureCollection
 */
function collectGeoJSON() {
  if (!_map) return { type: 'FeatureCollection', features: [] };
  const features = [];
  _map.eachLayer((layer) => {
    if (layer instanceof L.Path && layer.toGeoJSON) {
      const feature = layer.toGeoJSON();
      // Preserve any custom properties stored on the layer
      if (layer.feature?.properties) {
        feature.properties = { ...layer.feature.properties, ...feature.properties };
      }
      features.push(feature);
    }
  });
  return { type: 'FeatureCollection', features };
}

/**
 * Persist all annotations to IndexedDB (debounced).
 */
function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const geojson = collectGeoJSON();
    try {
      await saveAnnotations(geojson);
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        console.warn('[AnnotationLayer] IndexedDB quota exceeded — annotations not saved');
        window.showToast?.('Storage full — annotations may not save', 'warning', 4000);
      } else {
        console.error('[AnnotationLayer] Save error:', err);
      }
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Restore previously saved annotations from IndexedDB.
 */
async function restoreAnnotations() {
  if (!_map) return;
  try {
    const geojson = await loadAnnotations();
    if (!geojson?.features?.length) return;

    L.geoJSON(geojson, {
      style: _defaultStyle,
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 8, ..._defaultStyle }),
    }).addTo(_map);
  } catch (err) {
    console.warn('[AnnotationLayer] Could not restore annotations:', err);
  }
}

const _defaultStyle = {
  color: '#e55c00',
  weight: 2,
  opacity: 0.8,
  fillOpacity: 0.15,
};

// ─── Overlay visibility ───────────────────────────────────────────────────────

/**
 * Enable pointer events on the annotation overlay.
 * Called when a Geoman draw mode becomes active.
 */
function _enableOverlay() {
  if (_mapDiv) {
    _mapDiv.style.pointerEvents = 'all';
    _mapDiv.style.zIndex = '50';
  }
  _geomanActive = true;
}

/**
 * Disable pointer events so canvas receives normal interactions.
 * Called when no Geoman draw mode is active.
 */
function _disableOverlay() {
  if (_mapDiv) {
    _mapDiv.style.pointerEvents = 'none';
    _mapDiv.style.zIndex = '20';
  }
  _geomanActive = false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the annotation layer.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initAnnotationLayer() {
  if (_map) return; // already initialised
  if (typeof window === 'undefined') return;

  const container = document.getElementById('canvasContainer');
  const canvas = document.getElementById('graphCanvas');
  if (!container || !canvas) {
    console.warn('[AnnotationLayer] canvasContainer / graphCanvas not found — deferring init');
    // Retry once the DOM is ready
    window.addEventListener('DOMContentLoaded', initAnnotationLayer, { once: true });
    return;
  }

  // ── 1. Create overlay div ───────────────────────────────────────────────────
  _mapDiv = document.createElement('div');
  _mapDiv.id = 'mmAnnotationMap';
  _mapDiv.style.cssText = [
    'position: absolute',
    'inset: 0',
    'width: 100%',
    'height: 100%',
    'pointer-events: none', // transparent by default
    'z-index: 20',
    'background: transparent',
  ].join('; ');
  // Insert before the canvas so it overlays on top
  container.style.position = 'relative';
  container.appendChild(_mapDiv);

  // ── 2. Init Leaflet (transparent: no tiles) ─────────────────────────────────
  const { center, zoom } = deriveLeafletView();
  _map = L.map(_mapDiv, {
    center,
    zoom,
    zoomControl: false,
    attributionControl: false,
    // Disable all default interaction handlers — we re-enable only when a
    // Geoman tool is active so the canvas stays responsive otherwise.
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
  });

  // Transparent background (no tile layer) so the canvas shows through
  _mapDiv.querySelectorAll('.leaflet-tile-pane').forEach(el => {
    /** @type {HTMLElement} */ (el).style.display = 'none';
  });

  // ── 3. Add Geoman controls ──────────────────────────────────────────────────
  _map.pm.addControls({
    position: 'topleft',
    drawMarker: true,
    drawPolyline: true,
    drawPolygon: true,
    drawCircle: false,       // keep toolbar concise for field use
    drawRectangle: true,
    drawCircleMarker: false,
    editMode: true,
    dragMode: true,
    cutPolygon: false,
    removalMode: true,
  });

  // Style Geoman toolbar to visually distinguish it from canvas toolbar
  _map.pm.setGlobalOptions({
    templineStyle: { color: '#e55c00', weight: 2 },
    hintlineStyle: { color: '#e55c00', weight: 1, dashArray: '5 5' },
    pathOptions: _defaultStyle,
  });

  // ── 4. Overlay management on mode change ────────────────────────────────────
  _map.on('pm:globaldrawmodetoggled', ({ enabled }) => {
    if (enabled) {
      _enableOverlay();
      // Re-enable map dragging only within draw sessions
      _map.dragging.enable();
    } else if (!_map.pm.globalEditModeEnabled() && !_map.pm.globalDragModeEnabled()) {
      _disableOverlay();
      _map.dragging.disable();
    }
  });

  _map.on('pm:globaleditmodetoggled', ({ enabled }) => {
    if (enabled) {
      _enableOverlay();
      _map.dragging.enable();
    } else if (!_map.pm.globalDrawModeEnabled() && !_map.pm.globalDragModeEnabled()) {
      _disableOverlay();
      _map.dragging.disable();
    }
  });

  _map.on('pm:globaldragmodetoggled', ({ enabled }) => {
    if (enabled) {
      _enableOverlay();
      _map.dragging.enable();
    } else if (!_map.pm.globalDrawModeEnabled() && !_map.pm.globalEditModeEnabled()) {
      _disableOverlay();
      _map.dragging.disable();
    }
  });

  // ── 5. Wire pm:create → EventBus + autosave ─────────────────────────────────
  _map.on('pm:create', ({ shape, layer }) => {
    const feature = layer.toGeoJSON?.();
    if (!feature) return;

    bus.emit('annotation:created', { shape, feature });
    scheduleSave();
  });

  // ── 6. Wire pm:edit (fires per-layer on shape edit) ─────────────────────────
  _map.on('pm:edit', ({ layer }) => {
    const feature = layer.toGeoJSON?.();
    bus.emit('annotation:edited', { feature });
    scheduleSave();
  });

  // ── 7. Wire pm:remove ───────────────────────────────────────────────────────
  _map.on('pm:remove', ({ layer }) => {
    const feature = layer.toGeoJSON?.();
    bus.emit('annotation:deleted', { feature });
    scheduleSave();
  });

  // ── 8. Restore previously saved annotations ─────────────────────────────────
  restoreAnnotations();

  // ── 9. GPS accuracy circle ────────────────────────────────────────────────
  // Subscribe to GNSS position events so the blue accuracy ring tracks the
  // live position in real-time on the Leaflet overlay.
  const gnss = /** @type {any} */ (window).__gnssState;
  if (gnss && typeof gnss.on === 'function') {
    gnss.on('position', _onGnssPosition);
  }

  // ── 10. Expose toggle for external callers (e.g. toolbar button) ─────────────
  /** @type {any} */ (window).__mmAnnotationLayer = {
    toggle: toggleAnnotationPanel,
    isActive: () => _geomanActive,
    getGeoJSON: collectGeoJSON,
  };
}

// ─── GNSS accuracy circle helpers ─────────────────────────────────────────────

/**
 * Handler for gnssState 'position' events.
 * Creates or updates the Leaflet accuracy circle on the annotation overlay.
 * @param {object} position - {lat, lon, accuracy, isValid}
 */
function _onGnssPosition(position) {
  if (!_map) return;
  updateGnssAccuracyCircle(position);
}

/**
 * Create or update the GPS accuracy circle on the Leaflet annotation map.
 * Pass null / invalid position to remove the circle.
 *
 * @param {{lat: number, lon: number, accuracy: number, isValid: boolean}|null} position
 */
export function updateGnssAccuracyCircle(position) {
  if (!_map) return;

  if (!position || !position.isValid || !position.lat || !position.lon || !position.accuracy) {
    // Remove the circle when there is no valid fix
    if (_accuracyCircle) {
      _accuracyCircle.remove();
      _accuracyCircle = null;
    }
    return;
  }

  const latlng = L.latLng(position.lat, position.lon);

  if (_accuracyCircle) {
    // Update existing circle position + radius
    _accuracyCircle.setLatLng(latlng).setRadius(position.accuracy);
  } else {
    // Create new circle
    _accuracyCircle = L.circle(latlng, {
      radius: position.accuracy,
      color: '#4A90D9',
      fillColor: '#4A90D9',
      fillOpacity: 0.15,
      weight: 1,
      interactive: false,
    }).addTo(_map);
  }
}

/**
 * Toggle visibility of the annotation toolbar panel.
 * Useful for wiring a dedicated "Annotations" button in the app toolbar.
 */
export function toggleAnnotationPanel() {
  if (!_map) return;

  if (_mapDiv?.style.display === 'none') {
    _mapDiv.style.display = '';
    _mapDiv.style.pointerEvents = 'none'; // start inactive
  } else if (_geomanActive) {
    // Deactivate any active draw mode
    _map.pm.disableDraw();
    _map.pm.disableGlobalEditMode();
    _map.pm.disableGlobalDragMode();
    _map.pm.disableGlobalRemovalMode();
    _disableOverlay();
  } else {
    // Panel is visible but no mode active — show/hide the toolbar panel
    const pmPanel = _mapDiv?.querySelector('.leaflet-pm-toolbar');
    if (pmPanel) {
      /** @type {HTMLElement} */ (pmPanel).style.display =
        /** @type {HTMLElement} */ (pmPanel).style.display === 'none' ? '' : 'none';
    }
  }
}

/**
 * Destroy the annotation layer and clean up all resources.
 */
export function destroyAnnotationLayer() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }

  // Unsubscribe GNSS position listener
  const gnss = /** @type {any} */ (window).__gnssState;
  if (gnss && typeof gnss.off === 'function') {
    gnss.off('position', _onGnssPosition);
  }

  // Remove accuracy circle before destroying the map
  if (_accuracyCircle) {
    _accuracyCircle.remove();
    _accuracyCircle = null;
  }

  if (_map) {
    _map.remove();
    _map = null;
  }
  _mapDiv?.remove();
  _mapDiv = null;
  _geomanActive = false;

  if (/** @type {any} */ (window).__mmAnnotationLayer) {
    delete (/** @type {any} */ (window)).__mmAnnotationLayer;
  }
}
