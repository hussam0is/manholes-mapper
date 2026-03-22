/**
 * tsc3-handlers.js
 *
 * Extracted TSC3 Survey Controller integration from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * Call initTSC3Handlers() once from main.js (after F registry is populated)
 * to wire tsc3Connection callbacks and menu event handlers.
 */

import { S, F } from './shared-state.js';
import { tsc3Connection } from '../survey/tsc3-connection-manager.js';
import { gnssConnection } from '../gnss/index.js';
import { initSurveyNodeTypeDialog, openSurveyNodeTypeDialog, getSurveyAutoConnect } from '../survey/survey-node-type-dialog.js';
import { openDevicePickerDialog } from '../survey/device-picker-dialog.js';
import { initSketchSidePanel } from '../project/sketch-side-panel.js';
import { menuEvents } from '../menu/menu-events.js';
import { saveCoordinatesToStorage } from '../utils/coordinates.js';
import { STORAGE_KEYS } from '../state/persistence.js';

// Convenience wrappers
const t = (...args) => F.t(...args);

/**
 * Handle an incoming survey point from the TSC3 connection manager.
 * @param {string} pointName - Point name/ID
 * @param {{ easting: number, northing: number, elevation: number }} coords - ITM coordinates
 * @param {boolean} isNew - Whether this is a new node (no existing match)
 * @param {string} nodeType - 'Manhole', 'Home', or 'Drainage'
 */
export function handleTSC3PointReceived(pointName, coords, isNew, nodeType) {
  let node;

  if (isNew) {
    // Create a new node at canvas center; applyCoordinatesIfEnabled() will immediately
    // reposition it to the correct world coordinates once the survey data is applied below.
    node = F.createNode(S.canvas.width / 2, S.canvas.height / 2);
    // Override the auto-generated ID with the survey point name
    node.id = String(pointName);
    node.nodeType = nodeType || 'Manhole';
  } else {
    node = S.nodes.find(n => String(n.id) === String(pointName));
    if (!node) return;
  }

  // Preserve manual float coords before overwriting with TSC3 survey data
  if (node.gnssFixQuality === 6 && node.surveyX != null && node.surveyY != null) {
    node.manual_x = node.surveyX;
    node.manual_y = node.surveyY;
  }

  // Store survey coordinates on the node (TSC3 = RTK Fixed)
  node.hasCoordinates = true;
  node._hidden = false;
  node.surveyX = coords.easting;
  node.surveyY = coords.northing;
  node.surveyZ = coords.elevation;
  node.measure_precision = 0.02; // TSC3 RTK default precision (meters)
  node.gnssFixQuality = 4; // TSC3 delivers RTK Fixed coordinates
  // Measurement metadata
  node.measuredAt = Date.now();
  const tscAuthUser = window.authGuard?.getAuthState?.()?.user;
  node.measuredBy = tscAuthUser?.name || tscAuthUser?.email || null;

  // Update coordinatesMap
  S.coordinatesMap.set(String(pointName), {
    x: coords.easting,
    y: coords.northing,
    z: coords.elevation,
  });
  saveCoordinatesToStorage(S.coordinatesMap);

  // Auto-enable coordinates if not already on
  if (!S.coordinatesEnabled) {
    S.coordinatesEnabled = true;
    F.saveCoordinatesEnabled(S.coordinatesEnabled);
  }

  // Apply coordinates to reposition nodes on canvas
  F.applyCoordinatesIfEnabled();

  // Auto-connect to previous survey node
  if (isNew && S.surveyAutoConnect && S.lastSurveyNodeId) {
    F.createEdge(S.lastSurveyNodeId, node.id);
  }
  if (isNew) S.lastSurveyNodeId = node.id;

  // Select the node and update UI
  S.selectedNode = node;
  S.selectedEdge = null;
  F.renderDetails();
  F.computeNodeTypes();
  F.saveToStorage();
  F.scheduleDraw();

  // Auto zoom/recenter after new survey points
  if (isNew) {
    const surveyNodes = S.nodes.filter(n => n.hasCoordinates);
    if (surveyNodes.length >= 2) {
      F.zoomToFit();
    } else {
      F.recenterView();
    }
  }

  // Show toast
  if (isNew) {
    const typeLabel = t(`mode${nodeType}`) || nodeType;
    F.showToast(t('survey.pointCreated', typeLabel, pointName) || `Created ${nodeType} ${pointName}`);
  } else {
    F.showToast(t('survey.pointUpdated', pointName) || `Point ${pointName} updated`);
  }
}

/**
 * Initialize TSC3 integration: wire tsc3Connection callbacks, menu event handlers,
 * and init dialog/panel DOM. Must be called after F registry is populated.
 */
export function initTSC3Handlers() {
  // Initialize dialog DOM
  initSurveyNodeTypeDialog();

  // Initialize sketch side panel for project-canvas mode
  initSketchSidePanel();

  // Wire tsc3Connection callbacks
  tsc3Connection._getNodes = () => S.nodes;
  tsc3Connection._showToast = (msg) => F.showToast(msg);
  tsc3Connection._t = (path, ...args) => t(path, ...args);
  tsc3Connection._openTypeDialog = (pointName, coords, onChoose, onCancel, tFn) => {
    openSurveyNodeTypeDialog(pointName, coords, (type) => {
      S.surveyAutoConnect = getSurveyAutoConnect();
      onChoose(type);
    }, onCancel, tFn, { autoConnect: S.surveyAutoConnect });
  };
  tsc3Connection._onPointUpdate = (pointName, coords, isNew, nodeType) => {
    handleTSC3PointReceived(pointName, coords, isNew, nodeType);
  };

  // Wire persistent connection state badge
  tsc3Connection.onConnectionChange = ({ connected, name }) => {
    const badge = document.getElementById('surveyConnectionBadge');
    if (!badge) return;
    badge.style.display = connected ? 'flex' : 'none';
    badge.title = connected && name ? name : '';
  };

  // TSC3 menu event handlers
  menuEvents.on('connectSurveyBluetooth', async () => {
    const devices = await tsc3Connection.getPairedDevices();
    const surveyDevices = devices.filter(d => d.isSurvey);

    if (surveyDevices.length === 1) {
      F.showToast(t('survey.connecting') || 'Connecting...');
      await tsc3Connection.connectBluetooth(surveyDevices[0].address);
    } else if (devices.length > 0) {
      const chosen = await openDevicePickerDialog(devices, t);
      if (chosen) {
        F.showToast(t('survey.connecting') || 'Connecting...');
        await tsc3Connection.connectBluetooth(chosen.address);
      }
    } else {
      F.showToast(t('survey.noDevicesFound') || 'No devices found');
    }
  });

  menuEvents.on('connectSurveyWebSocket', () => {
    const savedAddr = localStorage.getItem(STORAGE_KEYS.tsc3WsAddress) || 'localhost:8765';
    const input = prompt('WebSocket host:port', savedAddr);
    if (!input) return;
    localStorage.setItem(STORAGE_KEYS.tsc3WsAddress, input);
    const parts = input.split(':');
    const host = parts[0] || 'localhost';
    const port = parseInt(parts[1], 10) || 8765;
    F.showToast(t('survey.connecting') || 'Connecting...');
    tsc3Connection.connectWebSocket(host, port);
  });

  menuEvents.on('disconnectSurvey', async () => {
    await tsc3Connection.disconnect();
  });

  // TMM (Trimble Mobile Manager) connection handler
  menuEvents.on('connectTMM', async () => {
    F.showToast(t('tmm.connecting') || 'Connecting to TMM...');
    const success = await gnssConnection.connectTMM();
    if (success) {
      F.setLiveMeasureMode(true);
      F.showToast(t('tmm.connected') || 'TMM Connected');
    } else {
      F.showToast(t('tmm.portNotFound') || 'TMM server not found. Make sure TMM is running.');
    }
  });
}
