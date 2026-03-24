/**
 * gnss-handlers.js
 *
 * Extracted GNSS / Live Measure integration handlers from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * Exported init function `initGnssHandlers()` wires up event listeners that
 * require DOM and gnssState to already be available.
 */

import {
  gnssState,
  startBrowserLocationAdapter,
  stopBrowserLocationAdapter,
  isBrowserLocationActive,
  openPointCaptureDialog,
  gnssToCanvas,
  FIX_COLORS,
} from '../gnss/index.js';
import {
  getMapReferencePoint,
  setMapReferencePoint,
  wgs84ToItm,
} from '../map/govmap-layer.js';
import {
  calculateCenterOnUser,
} from '../map/user-location.js';
import {
  saveCoordinatesToStorage,
} from '../utils/coordinates.js';
import {
  EDGE_TYPES,
} from '../state/constants.js';
import { S, F } from './shared-state.js';

// Convenience wrapper so calls inside this module look like plain t() calls
const t = (...args) => F.t(...args);

// ============================================
// GNSS / Live Measure Mode Integration
// ============================================

/**
 * Enable or disable Live Measure mode (unified location system).
 * Starts/stops the browser geolocation adapter and feeds positions into gnssState.
 * @param {boolean} enabled
 */
function setLiveMeasureMode(enabled) {
  if (enabled) {
    // Auto-enable coordinates display when Live Measure is turned on
    if (!S.coordinatesEnabled) {
      S.coordinatesEnabled = true;
      F.saveCoordinatesEnabled(true);
      F.syncCoordinatesToggleUI();
    }

    // Skip browser adapter when TMM (or another managed adapter) is already connected
    const connType = gnssState.connectionType;
    if (connType !== 'tmm' && connType !== 'bluetooth' && connType !== 'wifi' && connType !== 'mock') {
      // Start browser geolocation → gnssState bridge
      const started = startBrowserLocationAdapter();
      if (!started) {
        F.showToast(t('location.notSupported') || 'Location not supported');
        S.liveMeasureEnabled = false;
        gnssState.setLiveMeasureEnabled(false);
        syncLiveMeasureToggleUI();
        return;
      }
    }

    S.liveMeasureEnabled = true;
    gnssState.setLiveMeasureEnabled(true);
  } else {
    // Stop browser adapter only if it was the active one
    const connType = gnssState.connectionType;
    if (!connType || connType === 'browser') {
      stopBrowserLocationAdapter();
    }
    S.liveMeasureEnabled = false;
    gnssState.setLiveMeasureEnabled(false);
    S._liveMeasureFirstFixDone = false; // Allow auto-center on next enable
  }

  syncLiveMeasureToggleUI();
  updateLocationStatus();
  F.scheduleDraw();
}

/**
 * Sync Live Measure toggle UI state across desktop and mobile checkboxes
 */
function syncLiveMeasureToggleUI() {
  const liveMeasureToggle = document.getElementById('liveMeasureToggle');
  const mobileLiveMeasureToggle = document.getElementById('mobileLiveMeasureToggle');
  if (liveMeasureToggle) {
    liveMeasureToggle.checked = S.liveMeasureEnabled;
  }
  if (mobileLiveMeasureToggle) {
    mobileLiveMeasureToggle.checked = S.liveMeasureEnabled;
  }
  // Show/hide GPS Quick Capture FAB
  const fab = document.getElementById('gpsQuickCaptureBtn');
  if (fab) {
    fab.style.display = S.liveMeasureEnabled ? '' : 'none';
    if (S.liveMeasureEnabled) updateGpsQuickCaptureBtn();
  }
}

/**
 * Update location status display in menu toggles
 */
function updateLocationStatus() {
  const statusEl = document.getElementById('locationStatus');
  const mobileStatusEl = document.getElementById('mobileLocationStatus');

  let text = '';
  if (S.liveMeasureEnabled) {
    const pos = gnssState.getPosition();
    if (pos && pos.isValid) {
      text = pos.fixLabel || 'Active';
    } else {
      text = t('liveMeasure.waiting') || 'Waiting...';
    }
  }

  if (statusEl) statusEl.textContent = text;
  if (mobileStatusEl) mobileStatusEl.textContent = text;
}

/**
 * Open the GNSS point capture dialog
 * Called when user clicks the "Capture Point" button
 */
function openGnssPointCaptureDialog() {
  openPointCaptureDialog(
    S.nodes,
    (captureData) => {
      handleGnssPointCapture(captureData);
    },
    () => {
      // On cancel - nothing to do
    }
  );
}

/**
 * Handle a captured GNSS point
 * @param {object} captureData - Data from point capture dialog
 */
function handleGnssPointCapture(captureData) {
  let targetNodeId = captureData.nodeId;

  // Create new node if requested
  if (captureData.createNewNode) {
    const newId = F.getNextNodeId();
    const newNode = {
      id: newId,
      x: 400, // Will be updated by coordinates
      y: 300,
      type: 'type1',
      nodeType: 'Manhole',
      hasCoordinates: true
    };
    S.nodes.push(newNode);
    S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
    targetNodeId = newId;
  }

  // Store coordinates
  S.coordinatesMap.set(String(targetNodeId), {
    x: captureData.itm.x,
    y: captureData.itm.y,
    z: captureData.position.alt || 0
  });
  saveCoordinatesToStorage(S.coordinatesMap);

  // Mark the node as having coordinates
  const node = S.nodes.find(n => String(n.id) === String(targetNodeId));
  if (node) {
    node.hasCoordinates = true;
    node._hidden = false;
    node.surveyX = captureData.itm.x;
    node.surveyY = captureData.itm.y;
    node.surveyZ = captureData.position.alt || 0;
    node.gnssFixQuality = captureData.position.fixQuality;
    node.gnssHdop = captureData.position.hdop;
    node.measure_precision = captureData.position.accuracy || null;
    // Measurement metadata
    node.measuredAt = captureData.capturedAt || Date.now();
    const authUser = window.authGuard?.getAuthState?.()?.user;
    node.measuredBy = authUser?.name || authUser?.email || null;
  }

  // Create edge if requested
  if (captureData.createEdge && captureData.edgeFromNode) {
    const newEdge = {
      id: getNextEdgeId(),
      tail: captureData.edgeFromNode,
      head: targetNodeId,
      edge_type: captureData.edgeType || EDGE_TYPES[0],
      material: 0,
      line_diameter: null
    };
    S.edges.push(newEdge);
  }

  // Update gnss state with the captured point
  gnssState?.capturePoint(targetNodeId, {
    itm: captureData.itm,
    fixQuality: captureData.position.fixQuality,
    hdop: captureData.position.hdop
  });

  // Re-apply coordinates to update node positions (keep current view — don't recenter)
  F.applyCoordinatesIfEnabled({ recenter: false });

  // Select the node (reset wizard so RTK badge and updated tabs are shown)
  S.__wizardActiveTab = null;
  S.selectedNode = node;
  S.selectedEdge = null;
  F.renderDetails();

  F.scheduleDraw();
  F.showToast(t('gpsCapture.pointCaptured', targetNodeId));
}

/**
 * Vibrate the phone based on GNSS fix quality
 * @param {number} fixQuality - GNSS fix quality value
 */
// Throttle GNSS vibration: at most once per 2 seconds to save battery in field use
let _lastGnssVibrate = 0;
function vibrateForFixQuality(fixQuality) {
  if (!navigator.vibrate) return;
  const now = performance.now();
  if (now - _lastGnssVibrate < 2000) return; // skip if vibrated recently
  _lastGnssVibrate = now;
  if (fixQuality === 4) {
    // RTK Fixed — single buzz
    navigator.vibrate(100);
  } else if (fixQuality === 5) {
    // RTK Float — two buzzes
    navigator.vibrate([100, 80, 100]);
  } else {
    // GPS/DGPS — three buzzes
    navigator.vibrate([100, 80, 100, 80, 100]);
  }
}

/**
 * GPS Quick Capture — create a node at the current GPS position.
 * Delegates to precision-gated measurement flow when available,
 * otherwise falls back to instant capture.
 */
function gpsQuickCapture() {
  const position = gnssState.getPosition();
  if (!position || !position.isValid) {
    F.showToast(t('gpsCapture.noFix') || 'No GPS fix available');
    return;
  }

  // Use precision-gated flow if the orchestrator is wired up
  if (typeof window.__startPrecisionMeasure === 'function') {
    window.__startPrecisionMeasure();
    return;
  }

  // Fallback: instant capture (legacy behavior)
  createNodeFromMeasurement({ position });
}

/**
 * Create a node from a measurement result (used by both instant capture
 * and precision-gated flow).
 * @param {object} result - { position: { lat, lon, alt, fixQuality, fixLabel, hdop, satellites, accuracy, hrms, vrms } }
 */
function createNodeFromMeasurement(result) {
  const position = result.position;

  // 1. Get reference point for coordinate conversion
  const referencePoint = getMapReferencePoint();
  if (!referencePoint) {
    F.showToast(t('location.enableCoordinatesFirst') || 'Enable coordinates first');
    return;
  }

  // 2. Convert GPS → canvas world coords
  const canvasPos = gnssToCanvas(position, referencePoint, S.coordinateScale);
  if (!canvasPos) {
    F.showToast(t('gpsCapture.conversionError') || 'Could not convert GPS position');
    return;
  }

  // 3. Create node at the canvas position (gets auto-numbered ID, admin defaults)
  const node = F.createNode(canvasPos.x, canvasPos.y);

  // 4. Set nodeType based on current drawing mode
  if (S.currentMode === 'home') {
    node.nodeType = 'Home';
  } else if (S.currentMode === 'drainage') {
    node.nodeType = 'Drainage';
  } else {
    node.nodeType = 'Manhole';
  }

  // 5. Store survey coordinates
  const itm = wgs84ToItm(position.lat, position.lon);
  node.hasCoordinates = true;
  node._hidden = false;
  node.surveyX = itm.x;
  node.surveyY = itm.y;
  node.surveyZ = position.alt || 0;
  node.gnssFixQuality = position.fixQuality;
  node.gnssHdop = position.hdop;
  node.measure_precision = position.hrms || position.accuracy || null;
  // Measurement metadata
  node.measuredAt = Date.now();
  const qcAuthUser = window.authGuard?.getAuthState?.()?.user;
  node.measuredBy = qcAuthUser?.name || qcAuthUser?.email || null;
  S.coordinatesMap.set(String(node.id), {
    x: itm.x,
    y: itm.y,
    z: position.alt || 0
  });
  saveCoordinatesToStorage(S.coordinatesMap);

  // 6. Auto-create edge from previously captured node (chain pattern)
  const lastId = gnssState.lastCapturedNodeId;
  if (lastId != null) {
    const prevNode = S.nodes.find(n => String(n.id) === String(lastId));
    if (prevNode) {
      F.createEdge(String(lastId), String(node.id));
    }
  }

  // 7. Update gnss state
  gnssState.capturePoint(node.id, {
    itm,
    fixQuality: position.fixQuality,
    hdop: position.hdop
  });

  // 8. Position node correctly if coordinate mode is on (keep current view — don't recenter)
  F.applyCoordinatesIfEnabled({ recenter: false });

  // 9. Vibrate based on fix quality
  vibrateForFixQuality(position.fixQuality);

  // 10. Select node, show toast, save, redraw (reset wizard so RTK badge shows)
  S.__wizardActiveTab = null;
  S.selectedNode = node;
  S.selectedEdge = null;
  F.renderDetails();

  const fixLabels = { 4: 'RTK Fixed', 5: 'RTK Float', 2: 'DGPS', 1: 'GPS' };
  const fixLabel = fixLabels[position.fixQuality] || position.fixLabel || 'GPS';
  F.showToast(t('gpsCapture.captured', node.nodeType, node.id, fixLabel)
    || `Captured ${node.nodeType} #${node.id} (${fixLabel})`);

  F.computeNodeTypes();
  F.saveToStorage();
  F.scheduleDraw();
}

/**
 * Get the next available edge ID
 */
function getNextEdgeId() {
  if (S.edges.length === 0) return 1;
  return Math.max(...S.edges.map(e => typeof e.id === 'number' ? e.id : 0)) + 1;
}

/**
 * Center the view on a GPS location (lat/lon)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if centering was successful
 */
function centerOnGpsLocation(lat, lon) {
  const referencePoint = getMapReferencePoint();
  if (!referencePoint) {
    F.showToast(t('location.enableCoordinatesFirst') || 'Enable coordinates first');
    return false;
  }

  const position = { lat, lon };
  const rect = S.canvas.getBoundingClientRect();
  const newTranslate = calculateCenterOnUser(
    position,
    referencePoint,
    S.coordinateScale,
    rect.width,
    rect.height,
    S.viewScale,
    S.viewStretchX,
    S.viewStretchY
  );

  if (newTranslate) {
    S.viewTranslate.x = newTranslate.x;
    S.viewTranslate.y = newTranslate.y;
    F.scheduleDraw();
    return true;
  }
  return false;
}

/**
 * Center a new empty sketch on the user's mobile location.
 * Uses the active GNSS position if available, otherwise does a one-shot geolocation request.
 * Silently fails if location is unavailable.
 */
async function centerNewSketchOnUserLocation() {
  try {
    let lat, lon;

    // If Live Measure is active, use the already-streaming GNSS position
    if (isBrowserLocationActive()) {
      const pos = gnssState.getPosition();
      if (pos && pos.isValid) {
        lat = pos.lat;
        lon = pos.lon;
      }
    }

    // Otherwise do a one-shot geolocation request
    if (lat == null) {
      if (!navigator.geolocation) return;
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        });
      });
      lat = position.coords.latitude;
      lon = position.coords.longitude;
    }

    // Convert to ITM and set reference point at canvas center
    const itm = wgs84ToItm(lat, lon);
    const rect = S.canvas.getBoundingClientRect();
    setMapReferencePoint({
      itm: { x: itm.x, y: itm.y },
      canvas: { x: rect.width / 2, y: rect.height / 2 }
    });

    // Center the view on this position
    centerOnGpsLocation(lat, lon);
  } catch (err) {
    console.debug('[Location] Could not center new sketch on user location:', err.message);
  }
}

/**
 * Toggle Live Measure mode (unified location tracking).
 * Called from menu event delegation and exposed globally.
 * @returns {boolean} True if now enabled
 */
function toggleUserLocationTracking() {
  const newState = !S.liveMeasureEnabled;
  setLiveMeasureMode(newState);

  if (newState && S.liveMeasureEnabled) {
    F.showToast(t('liveMeasure.enabled') || 'Live measurement enabled');
    // Center on position if available
    const pos = gnssState.getPosition();
    if (pos && pos.isValid) {
      centerOnGpsLocation(pos.lat, pos.lon);
    }
  } else if (!newState) {
    F.showToast(t('liveMeasure.disabled') || 'Live measurement disabled');
  }

  return S.liveMeasureEnabled;
}

/**
 * Update Take Measure button: dynamic color based on fix quality, pulse animation
 * @param {HTMLElement} [btn] - optional button element (defaults to #gpsQuickCaptureBtn)
 */
function updateGpsQuickCaptureBtn(btn) {
  const gpsQuickCaptureBtn = btn || document.getElementById('gpsQuickCaptureBtn');
  if (!gpsQuickCaptureBtn) return;
  const pos = gnssState.getPosition();
  const hasValidFix = pos && pos.isValid;
  gpsQuickCaptureBtn.disabled = !hasValidFix;

  if (hasValidFix) {
    const color = FIX_COLORS[pos.fixQuality] || FIX_COLORS[0];
    gpsQuickCaptureBtn.style.setProperty('--fix-color', color);
    gpsQuickCaptureBtn.classList.add('has-fix');
    // Pulse for high-quality fixes (RTK Fixed/Float, DGPS)
    gpsQuickCaptureBtn.classList.toggle('precision-pulse', pos.fixQuality >= 2);
  } else {
    gpsQuickCaptureBtn.classList.remove('has-fix', 'precision-pulse');
    gpsQuickCaptureBtn.style.removeProperty('--fix-color');
  }
}

/**
 * Wire up gnssState event listeners and DOM button handlers.
 * Called once from main.js after all function definitions and F registration.
 */
function initGnssHandlers() {
  // Subscribe to gnssState position updates for status and redraw.
  // Also auto-center on first GPS fix when Live Measure is enabled and the sketch has
  // no ITM-anchored coordinates yet (e.g. empty sketch or default Tel Aviv reference
  // point). Without this the marker renders off-screen because the default reference
  // point may be far from the user's actual location.
  gnssState.on('position', (pos) => {
    updateLocationStatus();
    updateGpsQuickCaptureBtn();
    F.scheduleDraw();

    if (S.liveMeasureEnabled && !S._liveMeasureFirstFixDone && pos && pos.isValid && S.coordinatesMap.size === 0) {
      S._liveMeasureFirstFixDone = true;
      const itm = wgs84ToItm(pos.lat, pos.lon);
      const rect = S.canvas.getBoundingClientRect();
      setMapReferencePoint({
        itm: { x: itm.x, y: itm.y },
        canvas: { x: rect.width / 2, y: rect.height / 2 }
      });
      centerOnGpsLocation(pos.lat, pos.lon);
    }
  });

  // GPS Quick Capture FAB wiring
  const gpsQuickCaptureBtn = document.getElementById('gpsQuickCaptureBtn');
  if (gpsQuickCaptureBtn) {
    gpsQuickCaptureBtn.addEventListener('click', () => {
      gpsQuickCapture();
    });
  }
}

export {
  initGnssHandlers,
  setLiveMeasureMode,
  syncLiveMeasureToggleUI,
  updateLocationStatus,
  openGnssPointCaptureDialog,
  handleGnssPointCapture,
  vibrateForFixQuality,
  gpsQuickCapture,
  createNodeFromMeasurement,
  getNextEdgeId,
  centerOnGpsLocation,
  centerNewSketchOnUserLocation,
  toggleUserLocationTracking,
  updateGpsQuickCaptureBtn,
};
