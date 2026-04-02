/**
 * TSC3 Connection Manager
 * Singleton that manages TSC3 adapter lifecycle and dispatches incoming survey points.
 * Handles matching points to existing nodes, queuing points while dialog is open,
 * and coordinating with main.js via injected callbacks.
 */

import { TSC3BluetoothAdapter } from './tsc3-bluetooth-adapter.js';
import { TSC3WebSocketAdapter } from './tsc3-websocket-adapter.js';
import { isSurveyNodeTypeDialogOpen } from './survey-node-type-dialog.js';

class TSC3ConnectionManager {
  constructor() {
    this.btAdapter = new TSC3BluetoothAdapter();
    this.wsAdapter = new TSC3WebSocketAdapter();
    this.activeAdapter = null; // 'bt' | 'ws' | null
    this.isConnected = false;
    this.connectionName = null;

    // Point queue for when dialog is open
    this._pointQueue = [];
    this._processingDialog = false;

    // Callbacks to be injected by main.js
    this._getNodes = null;        // () => nodes[]
    this._onPointUpdate = null;   // (pointName, coords, isNew, nodeType) => void
    this._openTypeDialog = null;  // (pointName, coords, onChoose, onCancel, t) => void
    this._showToast = null;       // (message) => void
    this._t = null;               // i18n translator

    // Connection state callbacks
    this.onConnectionChange = null; // ({ connected, name, type }) => void

    // Wire adapter callbacks
    this._setupAdapterCallbacks(this.btAdapter, 'bt');
    this._setupAdapterCallbacks(this.wsAdapter, 'ws');
  }

  /**
   * Wire onPoint/onConnect/onDisconnect/onError for an adapter.
   */
  _setupAdapterCallbacks(adapter, type) {
    adapter.onPoint = (point) => this._handleIncomingPoint(point);

    adapter.onConnect = (info) => {
      this.isConnected = true;
      this.activeAdapter = type;
      this.connectionName = info.name;
      if (this._showToast && this._t) {
        this._showToast(this._t('survey.connected', info.name));
      }
      if (this.onConnectionChange) {
        this.onConnectionChange({ connected: true, name: info.name, type });
      }
    };

    adapter.onDisconnect = () => {
      this.isConnected = false;
      this.activeAdapter = null;
      this.connectionName = null;
      if (this._showToast && this._t) {
        this._showToast(this._t('survey.disconnected'));
      }
      if (this.onConnectionChange) {
        this.onConnectionChange({ connected: false, name: null, type });
      }
    };

    adapter.onError = (err) => {
      console.error(`[TSC3] ${type} error:`, err.message);
      if (this._showToast && this._t) {
        this._showToast(this._t('survey.error'));
      }
    };
  }

  /**
   * Handle an incoming survey point. Match against existing nodes or open dialog.
   * @param {{ pointName: string, easting: number, northing: number, elevation: number }} point
   */
  _handleIncomingPoint(point) {
    // If dialog is open, queue the point
    if (this._processingDialog || isSurveyNodeTypeDialogOpen()) {
      this._pointQueue.push(point);
      return;
    }

    const nodes = this._getNodes ? this._getNodes() : [];
    const match = nodes.find(n => String(n.id) === String(point.pointName));

    const coords = {
      easting: point.easting,
      northing: point.northing,
      elevation: point.elevation,
    };

    if (match) {
      // Existing survey node — update coordinates directly.
      // Works for both already-surveyed nodes and unpositioned schematic nodes
      // drawn manually in advance.
      if (this._onPointUpdate) {
        this._onPointUpdate(point.pointName, coords, false, match.nodeType);
      }
      this._processQueue();
    } else {
      // No match — ask user for node type
      this._processingDialog = true;

      if (this._openTypeDialog) {
        this._openTypeDialog(
          point.pointName,
          coords,
          (chosenType) => {
            // User chose a type
            this._processingDialog = false;
            if (this._onPointUpdate) {
              this._onPointUpdate(point.pointName, coords, true, chosenType);
            }
            this._processQueue();
          },
          () => {
            // User cancelled — discard point
            this._processingDialog = false;
            this._processQueue();
          },
          this._t
        );
      } else {
        // No dialog available — create as Manhole by default
        this._processingDialog = false;
        if (this._onPointUpdate) {
          this._onPointUpdate(point.pointName, coords, true, 'Manhole');
        }
      }
    }
  }

  /**
   * Process queued points after a dialog closes.
   */
  _processQueue() {
    if (this._pointQueue.length > 0) {
      const next = this._pointQueue.shift();
      this._handleIncomingPoint(next);
    }
  }

  // --- Public API ---

  /**
   * Connect via Bluetooth.
   * @param {string} address - Device MAC address
   * @returns {Promise<boolean>}
   */
  async connectBluetooth(address) {
    if (this.isConnected) await this.disconnect();
    return this.btAdapter.connect(address);
  }

  /**
   * Get paired Bluetooth devices (filtered for survey controllers).
   * @returns {Promise<Array>}
   */
  async getPairedDevices() {
    return this.btAdapter.getPairedDevices();
  }

  /**
   * Connect via WebSocket bridge.
   * @param {string} host
   * @param {number} [port=8765]
   * @returns {boolean}
   */
  connectWebSocket(host, port = 8765) {
    if (this.isConnected) this.disconnect();
    return this.wsAdapter.connect(host, port);
  }

  /**
   * Disconnect the active adapter.
   */
  async disconnect() {
    if (this.activeAdapter === 'bt') {
      await this.btAdapter.disconnect();
    } else if (this.activeAdapter === 'ws') {
      this.wsAdapter.disconnect();
    }
    this.isConnected = false;
    this.activeAdapter = null;
    this.connectionName = null;
    this._pointQueue = [];
    this._processingDialog = false;
  }

  getIsConnected() {
    return this.isConnected;
  }

  getConnectionInfo() {
    return {
      connected: this.isConnected,
      type: this.activeAdapter,
      name: this.connectionName,
    };
  }
}

// Singleton
export const tsc3Connection = new TSC3ConnectionManager();
