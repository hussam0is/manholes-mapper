/**
 * view-utils.js
 *
 * Extracted view/zoom utilities and reference-layer UI controls from
 * src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 */

import { S, F } from './shared-state.js';
import {
  getReferenceLayers,
  setLayerVisibility,
  setRefLayersEnabled,
  isRefLayersEnabled,
  saveRefLayerSettings,
} from '../map/reference-layers.js';
import { updateLayersPanel } from '../map/layers-config.js';
import { wgs84ToItm } from '../map/govmap-layer.js';

// ── Constants (mirrored from main.js) ────────────────────────
const MIN_SCALE = 0.005;
const MAX_SCALE = 5.0;

// ============================================
// Reference Layers UI Controls
// ============================================

/**
 * Render the per-layer toggles in both desktop and mobile menus
 */
export function renderRefLayerToggles() {
  const layers = getReferenceLayers();
  const desktopSection = document.getElementById('refLayersSection');
  const mobileSection = document.getElementById('mobileRefLayersSection');
  const desktopList = document.getElementById('refLayersList');
  const mobileList = document.getElementById('mobileRefLayersList');
  
  if (!layers || layers.length === 0) {
    if (desktopSection) desktopSection.style.display = 'none';
    if (mobileSection) mobileSection.style.display = 'none';
    return;
  }
  
  if (desktopSection) desktopSection.style.display = '';
  if (mobileSection) mobileSection.style.display = '';
  
  // Build layer toggle HTML — SECURITY FIX: escape server-sourced layer name/id
  const esc = typeof window.escapeHtml === 'function' ? window.escapeHtml : (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const buildToggleHtml = (prefix) => layers.map(l => `
    <label class="ref-layer-toggle" title="${esc(l.name)} (${l.featureCount} features)">
      <input type="checkbox" data-layer-id="${esc(l.id)}" ${l.visible ? 'checked' : ''} class="${prefix}-ref-layer-cb" />
      <span class="ref-layer-name">${esc(l.name)}</span>
      <span class="ref-layer-count">(${l.featureCount})</span>
    </label>
  `).join('');
  
  if (desktopList) desktopList.innerHTML = buildToggleHtml('desktop');
  if (mobileList) mobileList.innerHTML = buildToggleHtml('mobile');
  
  // Attach event listeners
  const attachListeners = (container, closeFn) => {
    if (!container) return;
    container.querySelectorAll('input[data-layer-id]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        setLayerVisibility(e.target.dataset.layerId, e.target.checked);
        saveRefLayerSettings();
        F.scheduleDraw();
        // Sync the other menu
        syncRefLayerCheckboxes();
      });
    });
  };
  
  attachListeners(desktopList);
  attachListeners(mobileList);
}

/**
 * Sync checkbox states between desktop and mobile menus
 */
export function syncRefLayerCheckboxes() {
  const layers = getReferenceLayers();
  for (const l of layers) {
    document.querySelectorAll(`input[data-layer-id="${l.id}"]`).forEach(cb => {
      cb.checked = l.visible;
    });
  }
}

/**
 * Wire up reference-layer global toggles and expose window globals.
 * Called once from main.js init phase (top-level).
 */
export function initRefLayerToggles() {
  // Reference layers global toggle (desktop)
  const refLayersToggle = document.getElementById('refLayersToggle');
  if (refLayersToggle) {
    refLayersToggle.checked = isRefLayersEnabled();
    refLayersToggle.addEventListener('change', (e) => {
      e.stopPropagation();
      setRefLayersEnabled(e.target.checked);
      saveRefLayerSettings();
      F.scheduleDraw();
      // Sync mobile
      const mobileToggle = document.getElementById('mobileRefLayersToggle');
      if (mobileToggle) mobileToggle.checked = e.target.checked;
    });
  }

  // Reference layers global toggle (mobile)
  const mobileRefLayersToggle = document.getElementById('mobileRefLayersToggle');
  if (mobileRefLayersToggle) {
    mobileRefLayersToggle.checked = isRefLayersEnabled();
    mobileRefLayersToggle.addEventListener('change', (e) => {
      e.stopPropagation();
      setRefLayersEnabled(e.target.checked);
      saveRefLayerSettings();
      F.scheduleDraw();
      // Sync desktop
      const desktopToggle = document.getElementById('refLayersToggle');
      if (desktopToggle) desktopToggle.checked = e.target.checked;
    });
  }

  // Expose render function for use after layers are loaded
  window.renderRefLayerToggles = renderRefLayerToggles;
  // Also expose layers panel refresh
  window.updateLayersPanel = updateLayersPanel;
}

// ============================================
// View / Zoom Utilities
// ============================================

/**
 * Convert screen (pixel) coordinates to world coordinates.
 */
export function screenToWorld(x, y) {
  return {
    x: (x - S.viewTranslate.x) / (S.viewScale * S.viewStretchX),
    y: (y - S.viewTranslate.y) / (S.viewScale * S.viewStretchY),
  };
}

/**
 * Apply stretch factors to world coordinates for drawing.
 * This stretches positions without affecting shapes.
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {{x: number, y: number}} Stretched coordinates
 */
export function applyStretch(x, y) {
  return {
    x: x * S.viewStretchX,
    y: y * S.viewStretchY,
  };
}

/**
 * Create a stretched version of a node for drawing (position only, not the actual node).
 * Uses a reusable scratch object for the hot draw path to avoid GC pressure from
 * creating ~150+ spread copies per frame (nodes + edges * 2).
 * @param {object} node - The node object
 * @returns {object} A copy with stretched x and y coordinates
 */
// Reusable scratch object for stretchedNode in the draw loop.
// WARNING: only valid until the next stretchedNode() call -- do not cache.
const _stretchedScratch = {};
export function stretchedNodeFast(node) {
  if (!node) return null;
  // Copy all properties from node onto the scratch object
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    _stretchedScratch[keys[i]] = node[keys[i]];
  }
  _stretchedScratch.x = node.x * S.viewStretchX;
  _stretchedScratch.y = node.y * S.viewStretchY;
  return _stretchedScratch;
}

export function stretchedNode(node) {
  if (!node) return null;
  return {
    ...node,
    x: node.x * S.viewStretchX,
    y: node.y * S.viewStretchY,
  };
}

/**
 * Set zoom, clamped to min/max, and redraw.
 */
export function setZoom(newScale) {
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  if (Math.abs(clamped - S.viewScale) < 0.0001) return;
  // Zoom centered on canvas center
  const rect = S.canvas.getBoundingClientRect();
  const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
  const centerWorld = screenToWorld(centerScreen.x, centerScreen.y);
  S.viewScale = clamped;
  S.viewTranslate.x = centerScreen.x - S.viewScale * S.viewStretchX * centerWorld.x;
  S.viewTranslate.y = centerScreen.y - S.viewScale * S.viewStretchY * centerWorld.y;
  F.scheduleDraw();
  F.showToast(F.t('toasts.zoom', (S.viewScale * 100).toFixed(0)));
}

/**
 * Compute the current sketch center in world coordinates.
 * Uses the bounding box of all nodes; falls back to origin if empty.
 */
export function getSketchCenter() {
  const nodes = S.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return { x: 0, y: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    if (!node || node._hidden) continue;
    if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: 0, y: 0 };
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Recenters the view so the sketch center maps to the canvas center.
 * Keeps the current zoom level.
 */
export function recenterView() {
  const rect = S.canvas.getBoundingClientRect();
  const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
  const centerWorld = getSketchCenter();
  S.viewTranslate.x = centerScreen.x - S.viewScale * S.viewStretchX * centerWorld.x;
  S.viewTranslate.y = centerScreen.y - S.viewScale * S.viewStretchY * centerWorld.y;
  F.scheduleDraw();
}

/**
 * Zoom and pan so all visible nodes fit inside the canvas with padding.
 * Falls back to recenterView() when there are fewer than 2 visible nodes.
 */
export function zoomToFit() {
  const nodes = S.nodes;
  const visible = (nodes || []).filter(n => n && !n._hidden && typeof n.x === 'number' && typeof n.y === 'number');
  if (visible.length < 2) { recenterView(); return; }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of visible) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  const rangeX = (maxX - minX) || 1;
  const rangeY = (maxY - minY) || 1;
  const rect = S.canvas.getBoundingClientRect();
  const padding = 0.85; // 15% margin
  const scaleX = (rect.width * padding) / (rangeX * S.viewStretchX);
  const scaleY = (rect.height * padding) / (rangeY * S.viewStretchY);
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)));

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  S.viewScale = newScale;
  S.viewTranslate.x = rect.width / 2 - S.viewScale * S.viewStretchX * cx;
  S.viewTranslate.y = rect.height / 2 - S.viewScale * S.viewStretchY * cy;
  F.scheduleDraw();
}

/**
 * Compute the sketch density center in world coordinates.
 * Finds the area with the highest concentration of nodes.
 */
export function getSketchDensityCenter() {
  const nodes = S.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return { x: 0, y: 0 };
  if (nodes.length === 1) return { x: nodes[0].x, y: nodes[0].y };

  // Calculate a reasonable search radius based on the bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    if (!node || typeof node.x !== 'number' || typeof node.y !== 'number') continue;
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const radius = Math.min(width, height) / 5 || 50; // Use 1/5th of the smaller dimension or 50 units

  let maxNeighbors = -1;
  let bestPoint = { x: 0, y: 0 };

  // For each node, count neighbors within radius
  for (let i = 0; i < nodes.length; i++) {
    const n1 = nodes[i];
    if (!n1 || typeof n1.x !== 'number' || typeof n1.y !== 'number') continue;
    
    let neighbors = 0;
    let sumX = 0;
    let sumY = 0;
    
    for (let j = 0; j < nodes.length; j++) {
      const n2 = nodes[j];
      if (!n2 || typeof n2.x !== 'number' || typeof n2.y !== 'number') continue;
      
      const dx = n1.x - n2.x;
      const dy = n1.y - n2.y;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < radius * radius) {
        neighbors++;
        sumX += n2.x;
        sumY += n2.y;
      }
    }
    
    if (neighbors > maxNeighbors) {
      maxNeighbors = neighbors;
      bestPoint = { x: sumX / neighbors, y: sumY / neighbors };
    }
  }
  
  return bestPoint;
}

/**
 * Recenters the view so the sketch density center maps to the canvas center.
 */
export function recenterDensityView() {
  const rect = S.canvas.getBoundingClientRect();
  const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
  const centerWorld = getSketchDensityCenter();
  S.viewTranslate.x = centerScreen.x - S.viewScale * S.viewStretchX * centerWorld.x;
  S.viewTranslate.y = centerScreen.y - S.viewScale * S.viewStretchY * centerWorld.y;
  F.scheduleDraw();
}

/**
 * Search for a node by ID and center the view on it.
 * @param {string|number} searchId - The ID to search for
 */
export function searchAndCenterNode(searchId) {
  if (!searchId || searchId.toString().trim() === '') return;

  const searchIdStr = String(searchId).trim();

  // Find the node by ID (case-insensitive partial match)
  const foundNode = S.nodes.find((n) => String(n.id).toLowerCase().includes(searchIdStr.toLowerCase()));

  if (foundNode) {
    // Center the view on the found node
    const rect = S.canvas.getBoundingClientRect();
    const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
    S.viewTranslate.x = centerScreen.x - S.viewScale * S.viewStretchX * foundNode.x;
    S.viewTranslate.y = centerScreen.y - S.viewScale * S.viewStretchY * foundNode.y;

    // Select the node to highlight it
    S.selectedNode = foundNode;
    S.selectedEdge = null;

    // Render the details and redraw
    F.renderDetails();
    F.scheduleDraw();

    // Show success toast
    F.showToast(F.t('toasts.nodeFound', String(foundNode.id)));
  } else {
    // Show error toast
    F.showToast(F.t('toasts.nodeNotFound', searchIdStr), 'error');
  }
}

/**
 * Geocode an address/city/street query via Nominatim (OpenStreetMap).
 * @param {string} query - Address, city or street search text
 * @returns {Promise<{lat: number, lon: number, display_name: string}|null>}
 */
export async function geocodeAddress(query) {
  const q = encodeURIComponent(query.trim());
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Accept-Language': 'en,he', 'User-Agent': 'ManholesMapper/1.0' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  const lat = parseFloat(first.lat);
  const lon = parseFloat(first.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon, display_name: first.display_name || '' };
}

/**
 * Search by address/city/street, geocode and center the map on the result.
 * @param {string} query - Address, city or street search text
 */
export async function searchAddressAndCenter(query) {
  if (!query || query.toString().trim() === '') return;
  const q = String(query).trim();
  try {
    const result = await geocodeAddress(q);
    if (!result) {
      F.showToast(F.t('toasts.addressNotFound'), 'error');
      return;
    }
    const { x, y } = wgs84ToItm(result.lat, result.lon);
    const rect = S.canvas.getBoundingClientRect();
    const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
    S.viewTranslate.x = centerScreen.x - S.viewScale * S.viewStretchX * x;
    S.viewTranslate.y = centerScreen.y - S.viewScale * S.viewStretchY * y;
    F.scheduleDraw();
    F.showToast(result.display_name || F.t('toasts.addressFound'));
  } catch (err) {
    console.warn('[App] Geocode error:', err.message);
    F.showToast(F.t('toasts.geocodeError'), 'error');
  }
}

/**
 * Trigger address search from an input element.
 * @param {HTMLInputElement} inputEl - The input element containing the search query
 */
export function runAddressSearch(inputEl) {
  if (!inputEl || !inputEl.value.trim()) return;
  searchAddressAndCenter(inputEl.value);
  inputEl.blur();
}

// ============================================
// View/Search Event Wiring
// ============================================

/**
 * Wire up recenter, zoom-to-fit, and search-input event handlers.
 * Called once from main.js init phase (top-level).
 */
export function initViewHandlers() {
  // Recenter button handler
  const recenterBtn = document.getElementById('recenterBtn');
  if (recenterBtn) {
    recenterBtn.addEventListener('click', () => {
      try { recenterView(); } catch (_) { }
    });
  }

  // Recenter by density button handler
  const recenterDensityBtn = document.getElementById('recenterDensityBtn');
  if (recenterDensityBtn) {
    recenterDensityBtn.addEventListener('click', () => {
      try { recenterDensityView(); } catch (_) { }
    });
  }

  // Zoom-to-fit button handler
  const zoomToFitBtn = document.getElementById('zoomToFitBtn');
  if (zoomToFitBtn) {
    zoomToFitBtn.addEventListener('click', () => {
      try { zoomToFit(); } catch (_) { }
    });
  }

  // Search input handlers
  const searchNodeInput = document.getElementById('searchNodeInput');
  const mobileSearchNodeInput = document.getElementById('mobileSearchNodeInput');

  if (searchNodeInput) {
    searchNodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchAndCenterNode(searchNodeInput.value);
        searchNodeInput.blur(); // Close mobile keyboard
      }
    });

    // Also trigger search on input change (debounced)
    let searchTimeout;
    searchNodeInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (searchNodeInput.value.trim()) {
          searchAndCenterNode(searchNodeInput.value);
        }
      }, 500); // Wait 500ms after user stops typing
    });
  }

  if (mobileSearchNodeInput) {
    mobileSearchNodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchAndCenterNode(mobileSearchNodeInput.value);
        mobileSearchNodeInput.blur(); // Close mobile keyboard
      }
    });

    // Also trigger search on input change (debounced)
    let mobileSearchTimeout;
    mobileSearchNodeInput.addEventListener('input', (e) => {
      clearTimeout(mobileSearchTimeout);
      mobileSearchTimeout = setTimeout(() => {
        if (mobileSearchNodeInput.value.trim()) {
          searchAndCenterNode(mobileSearchNodeInput.value);
        }
      }, 500); // Wait 500ms after user stops typing
    });
  }

  // Address search input handlers
  const searchAddressInput = document.getElementById('searchAddressInput');
  const mobileSearchAddressInput = document.getElementById('mobileSearchAddressInput');

  if (searchAddressInput) {
    searchAddressInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runAddressSearch(searchAddressInput);
      }
    });
  }
  if (mobileSearchAddressInput) {
    mobileSearchAddressInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runAddressSearch(mobileSearchAddressInput);
      }
    });
  }
}
