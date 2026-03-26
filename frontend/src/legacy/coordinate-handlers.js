/**
 * coordinate-handlers.js
 *
 * Extracted coordinate system handlers from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * Exported init function `initCoordinateHandlers()` wires up event listeners that
 * require DOM elements to already be available.
 */

import {
  importCoordinatesFromFile,
  applyCoordinatesToNodes,
  saveCoordinatesToStorage,
  loadCoordinatesFromStorage,
  saveCoordinatesEnabled,
  loadCoordinatesEnabled,
  approximateUncoordinatedNodePositions,
  classifySketchCoordinates,
  repositionNodesFromEmbeddedCoordinates,
} from '../utils/coordinates.js';
import {
  getMapReferencePoint,
  setMapReferencePoint,
  setMapLayerEnabled,
  isMapLayerEnabled,
  setMapType,
  getMapType,
  createReferenceFromNode,
  saveMapSettings,
  wgs84ToItm,
  precacheTilesForMeasurementBounds,
  cancelTilePrecache,
} from '../map/govmap-layer.js';
import {
  initStreetView,
  setStreetViewVisible,
} from '../map/street-view.js';
import {
  initLayersConfig,
} from '../map/layers-config.js';
import {
  isProjectCanvasMode,
} from '../project/project-canvas-state.js';
import { STORAGE_KEYS } from '../state/persistence.js';
import { S, F } from './shared-state.js';

// ── Constants (mirrored from main.js module scope) ──────────────────────
const MIN_STRETCH = 0.2;
const MAX_STRETCH = 3.0;
const STRETCH_STEP = 0.1;
const VIEW_STRETCH_KEY = STORAGE_KEYS.viewStretch;
const SCALE_PRESETS = [5, 10, 25, 50, 75, 100, 150, 200, 300];
const COORDINATE_SCALE_KEY = STORAGE_KEYS.coordinateScale;

// Convenience wrapper so calls inside this module look like plain t() calls
const t = (...args) => F.t(...args);

// ============================================
// Coordinate System Handlers
// ============================================

/**
 * Handle importing coordinates from CSV file
 * @param {File} file - The CSV file to import
 */
async function handleCoordinatesImport(file) {
  try {
    const newCoordinates = await importCoordinatesFromFile(file);

    if (newCoordinates.size === 0) {
      F.showToast(t('coordinates.noCoordinatesFound'));
      return;
    }

    // Geographic compatibility check: if existing coordinatesMap has data,
    // compare centroids. If new file is from a different project area (>1500m away),
    // ask the user whether to replace or merge to avoid coordinate pollution.
    const doImport = async (shouldMerge) => {
      const prevSize = S.coordinatesMap.size;
      if (shouldMerge && prevSize > 0) {
        // Merge: new values win, existing coords for absent nodes preserved
        for (const [id, val] of newCoordinates) {
          S.coordinatesMap.set(id, val);
        }
      } else {
        // Replace
        S.coordinatesMap = newCoordinates;
      }
      saveCoordinatesToStorage(S.coordinatesMap);

      const matchingIds = S.nodes.filter(n => S.coordinatesMap.has(String(n.id)));
      const matchCount = matchingIds.length;
      const totalNodes = S.nodes.length;
      const addedNew = S.coordinatesMap.size - prevSize;
      const toastMsg = (shouldMerge && prevSize > 0)
        ? t('coordinates.importResultMerge', newCoordinates.size, matchCount, totalNodes, addedNew, S.coordinatesMap.size)
        : t('coordinates.importResult', newCoordinates.size, matchCount, totalNodes);
      F.showToast(toastMsg);

      if (!S.coordinatesEnabled) {
        S.coordinatesEnabled = true;
        saveCoordinatesEnabled(true);
        syncCoordinatesToggleUI();
        applyCoordinatesIfEnabled();
      } else {
        applyCoordinatesIfEnabled();
      }
      F.scheduleDraw();
    };

    if (S.coordinatesMap.size > 0) {
      // Compute centroid of existing map
      let ex = 0, ey = 0;
      for (const v of S.coordinatesMap.values()) { ex += v.x; ey += v.y; }
      ex /= S.coordinatesMap.size; ey /= S.coordinatesMap.size;

      // Compute centroid of new file
      let nx = 0, ny = 0;
      for (const v of newCoordinates.values()) { nx += v.x; ny += v.y; }
      nx /= newCoordinates.size; ny /= newCoordinates.size;

      const dist = Math.sqrt((nx - ex) ** 2 + (ny - ey) ** 2);
      console.debug(`[Coordinates] Centroid distance between existing and new cords: ${dist.toFixed(0)}m`);

      if (dist > 1500) {
        // Different project area detected — ask user
        const msg = t('coordinates.differentAreaConfirm', Math.round(dist));
        if (window.confirm(msg)) {
          await doImport(false); // replace
        } else {
          await doImport(true);  // merge anyway (user's choice)
        }
        return;
      }
    }

    // Same area or first import — merge safely
    await doImport(S.coordinatesMap.size > 0);

  } catch (error) {
    console.error('[Coordinates] Failed to import coordinates:', error.message);
    F.showToast(t('coordinates.importError'));
  }
}

/**
 * Apply coordinates to nodes if enabled
 * @param {Object} options - Options for applying coordinates
 * @param {boolean} options.recenter - Whether to recenter the view (default: true)
 * @param {number} options.oldScale - Previous scale value (for maintaining focus during scale change)
 */
function applyCoordinatesIfEnabled(options = {}) {
  const { recenter = true, oldScale = null } = options;

  if (!S.coordinatesEnabled || S.coordinatesMap.size === 0) {
    return;
  }

  // Store original schematic positions before applying coordinates (if not already stored)
  S.nodes.forEach(node => {
    if (!S.originalNodePositions.has(node.id)) {
      S.originalNodePositions.set(node.id, { x: node.x, y: node.y });
    }
    // Persist schematic positions on the node itself so they survive export/import
    if (node.schematicX == null) {
      node.schematicX = node.x;
      node.schematicY = node.y;
    }
  });

  // Get canvas dimensions - use actual canvas size, not bounding rect
  let canvasWidth = S.canvas.width;
  let canvasHeight = S.canvas.height;

  if (!canvasWidth || canvasWidth <= 0) {
    const rect = S.canvas.getBoundingClientRect();
    canvasWidth = rect.width || 800;
  }
  if (!canvasHeight || canvasHeight <= 0) {
    const rect = S.canvas.getBoundingClientRect();
    canvasHeight = rect.height || 600;
  }

  const dpr = window.devicePixelRatio || 1;
  const logicalWidth = canvasWidth / dpr;
  const logicalHeight = canvasHeight / dpr;

  const canvasCenterX = logicalWidth / 2;
  const canvasCenterY = logicalHeight / 2;

  // If we're changing scale (not recentering), capture current view center for focus preservation
  let worldCenterBeforeChange = null;
  if (!recenter && oldScale !== null && oldScale !== S.coordinateScale) {
    const rect = S.canvas.getBoundingClientRect();
    const screenCenterX = rect.width / 2;
    const screenCenterY = rect.height / 2;
    worldCenterBeforeChange = F.screenToWorld(screenCenterX, screenCenterY);
  }

  console.debug('[Coordinates] Canvas dimensions for coordinate transform:', {
    canvasWidth, canvasHeight, logicalWidth, logicalHeight, dpr
  });

  // Apply coordinates to matching nodes using logical (CSS) dimensions and current scale
  const result = applyCoordinatesToNodes(S.nodes, S.coordinatesMap, logicalWidth, logicalHeight, S.coordinateScale);
  S.nodes = result.updatedNodes;
  S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;

  console.debug(`[Coordinates] Applied: ${result.matchedCount} matched, ${result.unmatchedCount} unmatched`);

  // Approximate positions for nodes without coordinates based on their neighbors
  if (result.unmatchedCount > 0 && result.matchedCount > 0) {
    S.nodes = approximateUncoordinatedNodePositions(S.nodes, S.edges, S.originalNodePositions);
    S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
  }

  // Handle view adjustment based on options
  if (recenter) {
    F.recenterView();
  } else if (worldCenterBeforeChange !== null && oldScale !== null) {
    const scaleRatio = S.coordinateScale / oldScale;
    const newWorldCenterX = canvasCenterX + (worldCenterBeforeChange.x - canvasCenterX) * scaleRatio;
    const newWorldCenterY = canvasCenterY + (worldCenterBeforeChange.y - canvasCenterY) * scaleRatio;

    const rect = S.canvas.getBoundingClientRect();
    const screenCenterX = rect.width / 2;
    const screenCenterY = rect.height / 2;

    S.viewTranslate.x = screenCenterX - S.viewScale * S.viewStretchX * newWorldCenterX;
    S.viewTranslate.y = screenCenterY - S.viewScale * S.viewStretchY * newWorldCenterY;
  }

  // Update map reference point and precache tiles for measurement area when map is on
  if (S.mapLayerEnabled) {
    updateMapReferencePoint();
    startMeasurementTilesPrecache();
  } else {
    // Even without map layer, update reference point for Street View pegman
    updateMapReferencePoint();
  }

  F.saveToStorage();
  F.scheduleDraw();
}

/**
 * Restore original node positions (when coordinates are disabled)
 */
function restoreOriginalPositions() {
  S.nodes.forEach(node => {
    const original = S.originalNodePositions.get(node.id);
    if (original) {
      node.x = original.x;
      node.y = original.y;
    }
  });

  F.zoomToFit();
  F.saveToStorage();
}

/**
 * Toggle coordinates enabled/disabled
 */
function toggleCoordinates(enabled) {
  S.coordinatesEnabled = enabled;
  saveCoordinatesEnabled(enabled);
  syncCoordinatesToggleUI();

  if (enabled) {
    // If we have saved geographic positions from a previous reposition, use those
    if (S.geoNodePositions.size > 0) {
      S.nodes.forEach(node => {
        const geo = S.geoNodePositions.get(String(node.id));
        if (geo) {
          node.x = geo.x;
          node.y = geo.y;
        }
      });
      F.zoomToFit();
      F.saveToStorage();
    } else {
      // First time: run full repositioning pipeline
      const hasEmbeddedCoords = S.nodes && S.nodes.some(n => n.surveyX != null && n.surveyY != null);
      if (hasEmbeddedCoords) {
        autoRepositionFromEmbeddedCoords();
      } else {
        applyCoordinatesIfEnabled();
      }
    }
  } else {
    restoreOriginalPositions();
  }

  const msg = enabled
    ? t('coordinates.enabled')
    : t('coordinates.disabled');
  F.showToast(msg);
}

/**
 * Sync the coordinates toggle UI elements
 */
function syncCoordinatesToggleUI() {
  const coordinatesToggle = document.getElementById('coordinatesToggle');
  const mobileCoordinatesToggle = document.getElementById('mobileCoordinatesToggle');
  if (coordinatesToggle) {
    coordinatesToggle.checked = S.coordinatesEnabled;
  }
  if (mobileCoordinatesToggle) {
    mobileCoordinatesToggle.checked = S.coordinatesEnabled;
  }
}

/**
 * Toggle map layer enabled/disabled
 */
function toggleMapLayer(enabled) {
  S.mapLayerEnabled = enabled;
  setMapLayerEnabled(enabled);
  saveMapSettings();
  syncMapLayerToggleUI();

  if (enabled) {
    updateMapReferencePoint();
  }

  const msg = enabled
    ? (t('mapLayer.enabled') || 'Map layer enabled')
    : (t('mapLayer.disabled') || 'Map layer disabled');
  F.showToast(msg);
  F.scheduleDraw();
}

/**
 * Sync the map layer toggle UI elements
 */
function syncMapLayerToggleUI() {
  const mapLayerToggle = document.getElementById('mapLayerToggle');
  const mobileMapLayerToggle = document.getElementById('mobileMapLayerToggle');
  const mapTypeSelect = document.getElementById('mapTypeSelect');
  const mobileMapTypeSelect = document.getElementById('mobileMapTypeSelect');

  if (mapLayerToggle) {
    mapLayerToggle.checked = S.mapLayerEnabled;
  }
  if (mobileMapLayerToggle) {
    mobileMapLayerToggle.checked = S.mapLayerEnabled;
  }

  const currentType = getMapType();
  if (mapTypeSelect) {
    mapTypeSelect.value = currentType;
  }
  if (mobileMapTypeSelect) {
    mobileMapTypeSelect.value = currentType;
  }
}

/**
 * Get ITM bounds of all nodes that have survey coordinates (measurement polygon extent).
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number } | null}
 */
function getMeasurementBoundsItm() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasAny = false;
  for (const node of S.nodes) {
    if (node.surveyX != null && node.surveyY != null) {
      if (node.surveyX < minX) minX = node.surveyX;
      if (node.surveyY < minY) minY = node.surveyY;
      if (node.surveyX > maxX) maxX = node.surveyX;
      if (node.surveyY > maxY) maxY = node.surveyY;
      hasAny = true;
    }
  }
  if (!hasAny && S.coordinatesMap.size > 0) {
    for (const node of S.nodes) {
      const coords = S.coordinatesMap.get(String(node.id));
      if (coords) {
        if (coords.x < minX) minX = coords.x;
        if (coords.y < minY) minY = coords.y;
        if (coords.x > maxX) maxX = coords.x;
        if (coords.y > maxY) maxY = coords.y;
        hasAny = true;
      }
    }
  }
  if (!hasAny || !Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

/**
 * Start precaching map tiles for the measurement extent.
 * Cancels any previous in-flight batch before starting a new one.
 */
function startMeasurementTilesPrecache() {
  cancelTilePrecache();
  const bounds = getMeasurementBoundsItm();
  if (bounds) precacheTilesForMeasurementBounds(bounds);
}

/**
 * Update the map reference point from available survey coordinates
 */
function updateMapReferencePoint() {
  // Find a node with survey coordinates to use as reference
  for (const node of S.nodes) {
    if (node.surveyX != null && node.surveyY != null) {
      const refPoint = createReferenceFromNode(node);
      if (refPoint) {
        console.debug('[Map] Reference point set from node surveyX/surveyY:', refPoint);
        setMapReferencePoint(refPoint);
        startMeasurementTilesPrecache();
        setStreetViewVisible(true);
        return true;
      }
    }
  }

  // No reference point available - check if coordinates are loaded
  if (S.coordinatesMap.size > 0) {
    for (const node of S.nodes) {
      const coords = S.coordinatesMap.get(String(node.id));
      if (coords) {
        const refPoint = {
          itm: { x: coords.x, y: coords.y },
          canvas: { x: node.x, y: node.y }
        };
        console.debug('[Map] Reference point set from coordinatesMap:', refPoint);
        setMapReferencePoint(refPoint);
        startMeasurementTilesPrecache();
        setStreetViewVisible(true);
        return true;
      }
    }
  }

  // Fallback: use a default location in central Israel (Tel Aviv area)
  const rect = S.canvas.getBoundingClientRect();
  const canvasCenterX = rect.width / 2;
  const canvasCenterY = rect.height / 2;

  const defaultItm = {
    x: 180000,  // ITM Easting
    y: 665000   // ITM Northing
  };

  const refPoint = {
    itm: defaultItm,
    canvas: { x: canvasCenterX, y: canvasCenterY }
  };

  console.debug('[Map] Reference point set to default (Tel Aviv area):', refPoint);
  setMapReferencePoint(refPoint);
  setStreetViewVisible(true);
  return true;
}

/**
 * Auto-reposition nodes from embedded geographic coordinates on sketch load.
 */
function autoRepositionFromEmbeddedCoords() {
  if (!S.nodes || S.nodes.length === 0) return;
  if (isProjectCanvasMode()) return;

  const classification = classifySketchCoordinates(S.nodes, wgs84ToItm);
  console.debug('[Coordinates] Sketch classification:', classification);

  if (classification.withCoords > 0) {
    // Save original schematic positions before repositioning
    for (const node of S.nodes) {
      if (!S.originalNodePositions.has(node.id)) {
        S.originalNodePositions.set(node.id, { x: node.x, y: node.y });
      }
      if (node.schematicX == null) {
        node.schematicX = node.x;
        node.schematicY = node.y;
      }
    }

    const dpr = window.devicePixelRatio || 1;
    const logicalW = (S.canvas.width / dpr) || 800;
    const logicalH = (S.canvas.height / dpr) || 600;

    const { referencePoint } = repositionNodesFromEmbeddedCoordinates(
      S.nodes, S.coordinateScale, logicalW, logicalH, wgs84ToItm
    );

    // Reposition uncoordinated nodes relative to coordinated neighbors
    const hiddenNodes = S.nodes.filter(n => n._hidden);
    if (hiddenNodes.length > 0) {
      const nodeMap = new Map();
      for (const n of S.nodes) nodeMap.set(String(n.id), n);

      for (const node of hiddenNodes) {
        let placed = false;
        for (const edge of S.edges) {
          const tailId = String(edge.tail);
          const headId = String(edge.head);
          const nodeId = String(node.id);
          let neighborId = null;
          if (tailId === nodeId) neighborId = headId;
          else if (headId === nodeId) neighborId = tailId;
          if (!neighborId) continue;

          const neighbor = nodeMap.get(neighborId);
          if (!neighbor || neighbor._hidden) continue;

          const origNode = S.originalNodePositions.get(node.id) || S.originalNodePositions.get(String(node.id));
          const origNeighbor = S.originalNodePositions.get(neighbor.id) || S.originalNodePositions.get(String(neighbor.id));
          if (origNode && origNeighbor) {
            const dx = origNode.x - origNeighbor.x;
            const dy = origNode.y - origNeighbor.y;
            node.x = neighbor.x + dx;
            node.y = neighbor.y + dy;
          } else {
            node.x = neighbor.x + 20;
            node.y = neighbor.y + 20;
          }
          node._hidden = false;
          placed = true;
          break;
        }
        if (!placed) {
          const coordNodes = S.nodes.filter(n => !n._hidden && n !== node);
          if (coordNodes.length > 0) {
            const cx = coordNodes.reduce((s, n) => s + n.x, 0) / coordNodes.length;
            const cy = coordNodes.reduce((s, n) => s + n.y, 0) / coordNodes.length;
            node.x = cx + (Math.random() - 0.5) * 40;
            node.y = cy + (Math.random() - 0.5) * 40;
          }
          node._hidden = false;
        }
      }
    }

    // Save geographic positions after repositioning and sync coordinatesMap
    for (const node of S.nodes) {
      S.geoNodePositions.set(String(node.id), { x: node.x, y: node.y });
      if (node.hasCoordinates && node.surveyX != null && node.surveyY != null) {
        S.coordinatesMap.set(String(node.id), {
          x: node.surveyX,
          y: node.surveyY,
          z: node.surveyZ || 0
        });
      }
    }
    saveCoordinatesToStorage(S.coordinatesMap);

    // Enable coordinates mode
    if (!S.coordinatesEnabled) {
      S.coordinatesEnabled = true;
      saveCoordinatesEnabled(true);
      syncCoordinatesToggleUI();
    }

    // Set the map reference point
    if (referencePoint) {
      setMapReferencePoint(referencePoint);
      setStreetViewVisible(true);
    }

    // Zoom to fit all repositioned nodes in view
    requestAnimationFrame(() => F.zoomToFit());
  } else if (classification.total > 0) {
    showCoordinatesRequiredPrompt();
  }
}

/**
 * Show a prompt dialog when a sketch has no geographic coordinates.
 */
function showCoordinatesRequiredPrompt() {
  const overlay = document.createElement('div');
  overlay.className = 'projects-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'projects-modal';

  modal.innerHTML = `
    <div class="projects-modal-header">
      <h3>${t('coordinates.noCoordinatesTitle')}</h3>
      <button class="btn-icon projects-modal-close">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="projects-modal-body">
      <p>${t('coordinates.noCoordinatesBody')}</p>
    </div>
    <div class="projects-modal-footer" style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-primary" data-action="import">
        <span class="material-icons" style="font-size:18px;vertical-align:middle;margin-inline-end:4px;">upload_file</span>
        ${t('coordinates.import')}
      </button>
      <button class="btn btn-secondary" data-action="open">
        ${t('coordinates.openWithoutCoords')}
      </button>
      <button class="btn btn-secondary" data-action="cancel">
        ${t('cancel')}
      </button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  modal.querySelector('.projects-modal-close').addEventListener('click', closeModal);

  modal.querySelector('[data-action="import"]').addEventListener('click', () => {
    closeModal();
    const importCoordinatesFile = document.getElementById('importCoordinatesFile');
    if (importCoordinatesFile) importCoordinatesFile.click();
  });

  modal.querySelector('[data-action="open"]').addEventListener('click', () => {
    closeModal();
    for (const node of S.nodes) {
      delete node._hidden;
    }
    F.scheduleDraw();
  });

  modal.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    closeModal();
    F.renderHome();
  });
}

/**
 * Update scale display in UI
 */
function updateScaleDisplay() {
  const displayText = `1:${S.coordinateScale}`;
  const scaleValueDisplay = document.getElementById('scaleValueDisplay');
  const mobileScaleValueDisplay = document.getElementById('mobileScaleValueDisplay');
  if (scaleValueDisplay) {
    scaleValueDisplay.textContent = displayText;
  }
  if (mobileScaleValueDisplay) {
    mobileScaleValueDisplay.textContent = displayText;
  }
}

/**
 * Save coordinate scale to storage
 */
function saveCoordinateScale() {
  try {
    localStorage.setItem(COORDINATE_SCALE_KEY, JSON.stringify(S.coordinateScale));
  } catch (e) {
    console.warn('[Coordinates] Failed to save coordinate scale', e.message);
  }
}

/**
 * Load coordinate scale from storage
 */
function loadCoordinateScale() {
  try {
    const raw = localStorage.getItem(COORDINATE_SCALE_KEY);
    if (raw) {
      const scale = JSON.parse(raw);
      if (typeof scale === 'number' && scale > 0) {
        S.coordinateScale = scale;
      }
    }
  } catch (e) {
    console.warn('[Coordinates] Failed to load coordinate scale', e.message);
  }
}

/**
 * Update stretch display in UI
 */
function updateStretchDisplay() {
  const displayX = S.viewStretchX.toFixed(1);
  const displayY = S.viewStretchY.toFixed(1);
  const stretchXValueDisplay = document.getElementById('stretchXValueDisplay');
  const mobileStretchXValueDisplay = document.getElementById('mobileStretchXValueDisplay');
  const stretchYValueDisplay = document.getElementById('stretchYValueDisplay');
  const mobileStretchYValueDisplay = document.getElementById('mobileStretchYValueDisplay');
  if (stretchXValueDisplay) {
    stretchXValueDisplay.textContent = displayX;
  }
  if (mobileStretchXValueDisplay) {
    mobileStretchXValueDisplay.textContent = displayX;
  }
  if (stretchYValueDisplay) {
    stretchYValueDisplay.textContent = displayY;
  }
  if (mobileStretchYValueDisplay) {
    mobileStretchYValueDisplay.textContent = displayY;
  }
}

/**
 * Save view stretch to storage
 */
function saveViewStretch() {
  try {
    localStorage.setItem(VIEW_STRETCH_KEY, JSON.stringify({ x: S.viewStretchX, y: S.viewStretchY }));
  } catch (e) {
    console.warn('[App] Failed to save view stretch', e.message);
  }
}

/**
 * Load view stretch from storage
 */
function loadViewStretch() {
  try {
    const raw = localStorage.getItem(VIEW_STRETCH_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data.x === 'number' && typeof data.y === 'number') {
        S.viewStretchX = Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, data.x));
        S.viewStretchY = Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, data.y));
      }
    }
  } catch (e) {
    console.warn('[App] Failed to load view stretch', e.message);
  }
}

/**
 * Change view stretch (horizontal or vertical)
 * @param {'x' | 'y'} axis - Which axis to change
 * @param {number} delta - Change direction: 1 for increase, -1 for decrease
 */
function changeViewStretch(axis, delta) {
  const currentValue = axis === 'x' ? S.viewStretchX : S.viewStretchY;
  const newValue = currentValue + (delta * STRETCH_STEP);
  const clamped = Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, newValue));
  const rounded = Math.round(clamped * 10) / 10;

  if (rounded === currentValue) return;

  const rect = S.canvas.getBoundingClientRect();
  const screenCenterX = rect.width / 2;
  const screenCenterY = rect.height / 2;
  const worldCenter = F.screenToWorld(screenCenterX, screenCenterY);

  if (axis === 'x') {
    S.viewStretchX = rounded;
  } else {
    S.viewStretchY = rounded;
  }

  S.viewTranslate.x = screenCenterX - worldCenter.x * S.viewStretchX * S.viewScale;
  S.viewTranslate.y = screenCenterY - worldCenter.y * S.viewStretchY * S.viewScale;

  saveViewStretch();
  updateStretchDisplay();
  F.scheduleDraw();
  F.showToast(t('stretch.changed', axis, rounded));
}

/**
 * Reset view stretch to default (1.0, 1.0)
 */
function resetViewStretch() {
  if (S.viewStretchX === 1.0 && S.viewStretchY === 1.0) return;

  const rect = S.canvas.getBoundingClientRect();
  const screenCenterX = rect.width / 2;
  const screenCenterY = rect.height / 2;
  const worldCenter = F.screenToWorld(screenCenterX, screenCenterY);

  S.viewStretchX = 1.0;
  S.viewStretchY = 1.0;

  S.viewTranslate.x = screenCenterX - worldCenter.x * S.viewStretchX * S.viewScale;
  S.viewTranslate.y = screenCenterY - worldCenter.y * S.viewStretchY * S.viewScale;

  saveViewStretch();
  updateStretchDisplay();
  F.scheduleDraw();
  F.showToast(t('stretch.resetDone'));
}

/**
 * Change coordinate scale and re-apply coordinates
 * @param {number} delta - Change direction: 1 for increase, -1 for decrease
 */
function changeCoordinateScale(delta) {
  const currentIndex = SCALE_PRESETS.indexOf(S.coordinateScale);
  let newIndex;

  if (currentIndex === -1) {
    newIndex = delta > 0
      ? SCALE_PRESETS.findIndex(s => s > S.coordinateScale)
      : SCALE_PRESETS.findIndex(s => s >= S.coordinateScale) - 1;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= SCALE_PRESETS.length) newIndex = SCALE_PRESETS.length - 1;
  } else {
    newIndex = currentIndex + delta;
  }

  newIndex = Math.max(0, Math.min(SCALE_PRESETS.length - 1, newIndex));

  const newScale = SCALE_PRESETS[newIndex];
  if (newScale !== S.coordinateScale) {
    const oldScale = S.coordinateScale;

    S.coordinateScale = newScale;
    saveCoordinateScale();
    updateScaleDisplay();

    if (S.coordinatesEnabled && S.coordinatesMap.size > 0) {
      applyCoordinatesIfEnabled({ recenter: false, oldScale: oldScale });
    }

    F.showToast(t('coordinates.scaleChanged', S.coordinateScale));
  }
}

/**
 * Initialize coordinates from storage
 */
function initCoordinates() {
  S.coordinatesMap = loadCoordinatesFromStorage();
  S.coordinatesEnabled = loadCoordinatesEnabled();
  loadCoordinateScale();
  loadViewStretch();
  syncCoordinatesToggleUI();
  updateScaleDisplay();
  updateStretchDisplay();

  // Mark nodes with coordinate status
  if (S.coordinatesMap.size > 0) {
    S.nodes.forEach(node => {
      const inMap = S.coordinatesMap.has(String(node.id));
      if (inMap) {
        node.hasCoordinates = true;
        if (node.gnssFixQuality !== 4 && node.gnssFixQuality !== 5) {
          node.gnssFixQuality = 4;
        }
      } else {
        node.hasCoordinates = node.surveyX != null && node.surveyY != null;
      }
    });
  }

  // Initialize map layer state from saved settings
  S.mapLayerEnabled = isMapLayerEnabled();
  syncMapLayerToggleUI();

  if (S.mapLayerEnabled) {
    updateMapReferencePoint();
  }

  // Initialize Street View pegman widget
  initStreetView({
    canvasContainer: S.canvas.parentElement,
    canvas: S.canvas,
    getViewState: () => ({
      viewTranslate: { x: S.viewTranslate.x, y: S.viewTranslate.y },
      viewScale: S.viewScale,
      viewStretchX: S.viewStretchX,
      viewStretchY: S.viewStretchY,
    }),
    getCoordinateScale: () => S.coordinateScale,
    showToast: (...args) => F.showToast(...args),
    t,
  });
  setStreetViewVisible(!!getMapReferencePoint());

  // Initialize Layers Config button + panel
  initLayersConfig({
    canvasContainer: S.canvas.parentElement,
    scheduleDraw: (...args) => F.scheduleDraw(...args),
    t,
    toggleMapLayer,
    syncMapLayerToggleUI,
  });
}

/**
 * Wire up coordinate-related DOM event listeners.
 * Called once from main.js init() after DOM is ready.
 */
function initCoordinateHandlers() {
  const importCoordinatesBtn = document.getElementById('importCoordinatesBtn');
  const mobileImportCoordinatesBtn = document.getElementById('mobileImportCoordinatesBtn');
  const importCoordinatesFile = document.getElementById('importCoordinatesFile');
  const coordinatesToggle = document.getElementById('coordinatesToggle');
  const mobileCoordinatesToggle = document.getElementById('mobileCoordinatesToggle');
  const mapLayerToggle = document.getElementById('mapLayerToggle');
  const mobileMapLayerToggle = document.getElementById('mobileMapLayerToggle');
  const mapTypeSelect = document.getElementById('mapTypeSelect');
  const mobileMapTypeSelect = document.getElementById('mobileMapTypeSelect');
  const exportDropdown = document.getElementById('exportDropdown');
  const liveMeasureToggle = document.getElementById('liveMeasureToggle');
  const mobileLiveMeasureToggle = document.getElementById('mobileLiveMeasureToggle');

  // Import coordinates button handler (desktop)
  if (importCoordinatesBtn) {
    importCoordinatesBtn.addEventListener('click', () => {
      if (exportDropdown) exportDropdown.classList.remove('menu-dropdown--open');
      if (importCoordinatesFile) importCoordinatesFile.click();
    });
  }

  // Import coordinates button handler (mobile)
  if (mobileImportCoordinatesBtn) {
    mobileImportCoordinatesBtn.addEventListener('click', () => {
      F.closeMobileMenu();
      if (importCoordinatesFile) importCoordinatesFile.click();
    });
  }

  // Coordinates file input handler
  if (importCoordinatesFile) {
    importCoordinatesFile.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleCoordinatesImport(file);
        e.target.value = '';
      }
    });
  }

  // Coordinates toggle handler (desktop)
  if (coordinatesToggle) {
    coordinatesToggle.addEventListener('change', (e) => {
      toggleCoordinates(e.target.checked);
    });
  }

  // Coordinates toggle handler (mobile)
  if (mobileCoordinatesToggle) {
    mobileCoordinatesToggle.addEventListener('change', (e) => {
      toggleCoordinates(e.target.checked);
      F.closeMobileMenu();
    });
  }

  // Map layer toggle handler (desktop)
  if (mapLayerToggle) {
    mapLayerToggle.addEventListener('change', (e) => {
      toggleMapLayer(e.target.checked);
    });
  }

  // Map layer toggle handler (mobile)
  if (mobileMapLayerToggle) {
    mobileMapLayerToggle.addEventListener('change', (e) => {
      toggleMapLayer(e.target.checked);
      F.closeMobileMenu();
    });
  }

  // Map type selector handler (desktop)
  if (mapTypeSelect) {
    mapTypeSelect.addEventListener('change', (e) => {
      const type = e.target.value;
      setMapType(type);
      saveMapSettings();
      if (mobileMapTypeSelect) mobileMapTypeSelect.value = type;
      F.scheduleDraw();
    });
  }

  // Map type selector handler (mobile)
  if (mobileMapTypeSelect) {
    mobileMapTypeSelect.addEventListener('change', (e) => {
      const type = e.target.value;
      setMapType(type);
      saveMapSettings();
      if (mapTypeSelect) mapTypeSelect.value = type;
      F.scheduleDraw();
      F.closeMobileMenu();
    });
  }

  // Note: liveMeasureToggle handlers remain in gnss-handlers.js / main.js
  // as they belong to the GNSS subsystem
}

export {
  initCoordinateHandlers,
  handleCoordinatesImport,
  applyCoordinatesIfEnabled,
  restoreOriginalPositions,
  toggleCoordinates,
  syncCoordinatesToggleUI,
  toggleMapLayer,
  syncMapLayerToggleUI,
  getMeasurementBoundsItm,
  startMeasurementTilesPrecache,
  updateMapReferencePoint,
  autoRepositionFromEmbeddedCoords,
  showCoordinatesRequiredPrompt,
  updateScaleDisplay,
  saveCoordinateScale,
  loadCoordinateScale,
  updateStretchDisplay,
  saveViewStretch,
  loadViewStretch,
  changeViewStretch,
  resetViewStretch,
  changeCoordinateScale,
  initCoordinates,
};
