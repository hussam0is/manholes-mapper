/**
 * GNSS Connection Manager
 * Unified interface for connecting to GNSS receivers
 * Supports Bluetooth SPP, WiFi TCP, and Mock connections
 */

import { BluetoothAdapter } from './bluetooth-adapter.js';
import { WifiAdapter } from './wifi-adapter.js';
import { MockGNSSAdapter } from './mock-adapter.js';
import { gnssState, ConnectionState, ConnectionType } from './gnss-state.js';

/**
 * GNSS Connection Manager class
 * Provides unified interface for all connection types
 */
class GNSSConnectionManager {
  constructor() {
    this.bluetoothAdapter = new BluetoothAdapter();
    this.wifiAdapter = new WifiAdapter();
    this.mockAdapter = new MockGNSSAdapter();
    this.activeAdapter = null;
    this.activeType = null;

    // Wire up adapters to state manager
    this.setupAdapterCallbacks(this.bluetoothAdapter, ConnectionType.BLUETOOTH);
    this.setupAdapterCallbacks(this.wifiAdapter, ConnectionType.WIFI);
    this.setupAdapterCallbacks(this.mockAdapter, ConnectionType.MOCK);
  }

  /**
   * Set up callbacks for an adapter
   * @param {object} adapter - Adapter instance
   * @param {string} type - Connection type
   */
  setupAdapterCallbacks(adapter, type) {
    adapter.onConnect = (device) => {
      this.activeAdapter = adapter;
      this.activeType = type;
      gnssState.setConnectionState(ConnectionState.CONNECTED, {
        type: type,
        deviceName: device?.name,
        deviceAddress: device?.address
      });
    };

    adapter.onDisconnect = () => {
      if (this.activeAdapter === adapter) {
        this.activeAdapter = null;
        this.activeType = null;
        gnssState.setConnectionState(ConnectionState.DISCONNECTED);
      }
    };

    adapter.onError = (error) => {
      gnssState.setConnectionState(ConnectionState.ERROR, {
        error: error.message || 'Connection error'
      });
    };

    adapter.onData = (data) => {
      gnssState.updatePosition(data);
    };
  }

  /**
   * Check if Bluetooth is available
   * @returns {Promise<boolean>}
   */
  async isBluetoothAvailable() {
    return await this.bluetoothAdapter.isAvailable();
  }

  /**
   * Check if WiFi TCP is available
   * @returns {boolean}
   */
  isWifiAvailable() {
    return this.wifiAdapter.isAvailable();
  }

  /**
   * Get list of paired Bluetooth devices
   * @returns {Promise<Array>}
   */
  async getPairedDevices() {
    return await this.bluetoothAdapter.getPairedDevices();
  }

  /**
   * Connect via Bluetooth
   * @param {string} address - Device MAC address
   * @returns {Promise<boolean>}
   */
  async connectBluetooth(address) {
    // Disconnect any existing connection
    await this.disconnect();

    gnssState.setConnectionState(ConnectionState.CONNECTING, {
      type: ConnectionType.BLUETOOTH
    });

    const success = await this.bluetoothAdapter.connect(address);
    
    if (!success) {
      gnssState.setConnectionState(ConnectionState.ERROR, {
        error: 'Bluetooth connection failed'
      });
    }

    return success;
  }

  /**
   * Connect via WiFi TCP
   * @param {string} host - IP address or hostname
   * @param {number} port - TCP port (default 5017)
   * @returns {Promise<boolean>}
   */
  async connectWifi(host, port = 5017) {
    // Disconnect any existing connection
    await this.disconnect();

    gnssState.setConnectionState(ConnectionState.CONNECTING, {
      type: ConnectionType.WIFI
    });

    const success = await this.wifiAdapter.connect(host, port);
    
    if (!success) {
      gnssState.setConnectionState(ConnectionState.ERROR, {
        error: 'WiFi TCP connection failed'
      });
    }

    return success;
  }

  /**
   * Connect using mock adapter (for development)
   * @returns {Promise<boolean>}
   */
  async connectMock() {
    // Disconnect any existing connection
    await this.disconnect();

    gnssState.setConnectionState(ConnectionState.CONNECTING, {
      type: ConnectionType.MOCK
    });

    const success = await this.mockAdapter.connect();
    return success;
  }

  /**
   * Disconnect current connection
   */
  async disconnect() {
    if (this.activeAdapter) {
      await this.activeAdapter.disconnect();
      this.activeAdapter = null;
      this.activeType = null;
    }

    // Also ensure all adapters are disconnected
    if (this.bluetoothAdapter.getIsConnected()) {
      await this.bluetoothAdapter.disconnect();
    }
    if (this.wifiAdapter.getIsConnected()) {
      await this.wifiAdapter.disconnect();
    }
    if (this.mockAdapter.isConnected) {
      this.mockAdapter.disconnect();
    }

    gnssState.setConnectionState(ConnectionState.DISCONNECTED);
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  isConnected() {
    return this.activeAdapter !== null && gnssState.connectionState === ConnectionState.CONNECTED;
  }

  /**
   * Get the current connection type
   * @returns {string|null}
   */
  getConnectionType() {
    return this.activeType;
  }

  /**
   * Get current GNSS position
   * @returns {object}
   */
  getCurrentPosition() {
    return gnssState.getPosition();
  }

  /**
   * Capture current position for a node
   * @param {string|number} nodeId
   * @param {object} options
   * @returns {object|null}
   */
  capturePoint(nodeId, options = {}) {
    return gnssState.capturePoint(nodeId, options);
  }

  /**
   * Get connection status
   * @returns {object}
   */
  getStatus() {
    return gnssState.getStatus();
  }

  /**
   * Subscribe to position updates
   * @param {Function} callback
   */
  onPositionUpdate(callback) {
    gnssState.on('position', callback);
  }

  /**
   * Subscribe to connection state changes
   * @param {Function} callback
   */
  onConnectionChange(callback) {
    gnssState.on('connection', callback);
  }

  /**
   * Subscribe to point capture events
   * @param {Function} callback
   */
  onPointCapture(callback) {
    gnssState.on('capture', callback);
  }

  /**
   * Remove position update listener
   * @param {Function} callback
   */
  offPositionUpdate(callback) {
    gnssState.off('position', callback);
  }

  /**
   * Remove connection change listener
   * @param {Function} callback
   */
  offConnectionChange(callback) {
    gnssState.off('connection', callback);
  }

  /**
   * Set mock adapter position (for testing)
   * @param {number} lat
   * @param {number} lon
   */
  setMockPosition(lat, lon) {
    this.mockAdapter.setPosition(lat, lon);
  }
}

// Singleton instance
export const gnssConnection = new GNSSConnectionManager();

// Export class for testing
export { GNSSConnectionManager };
