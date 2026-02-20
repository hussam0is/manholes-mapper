/**
 * TSC3 Bluetooth SPP Adapter
 * Connects to a Trimble TSC3 controller via Bluetooth Serial Port Profile.
 * Uses @e-is/capacitor-bluetooth-serial plugin for native Bluetooth access.
 */

import { processDataChunk, createParserState } from './tsc3-parser.js';

const isCapacitor = typeof window !== 'undefined' && window.Capacitor;

let bluetoothSerialPlugin = null;

async function getBluetoothPlugin() {
  if (!isCapacitor) {
    console.warn('[TSC3] Bluetooth SPP requires Capacitor native runtime');
    return null;
  }
  if (bluetoothSerialPlugin) return bluetoothSerialPlugin;
  try {
    if (window.Capacitor?.Plugins?.BluetoothSerial) {
      bluetoothSerialPlugin = window.Capacitor.Plugins.BluetoothSerial;
      return bluetoothSerialPlugin;
    }
    console.warn('[TSC3] Bluetooth Serial plugin not registered');
    return null;
  } catch (e) {
    console.warn('[TSC3] Bluetooth Serial plugin not available:', e.message);
    return null;
  }
}

/**
 * TSC3 Bluetooth Adapter
 * Manages Bluetooth connection to TSC3 controller and parses incoming survey points.
 */
export class TSC3BluetoothAdapter {
  constructor() {
    this.plugin = null;
    this.parserState = createParserState();
    this.isConnected = false;
    this.connectedDevice = null;
    this.listenerHandle = null;

    // Callbacks
    this.onPoint = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
  }

  async init() {
    this.plugin = await getBluetoothPlugin();
    return this.plugin !== null;
  }

  /**
   * Check and request Android 12+ Bluetooth runtime permissions (BLUETOOTH_CONNECT,
   * BLUETOOTH_SCAN). On API < 31 or in web browsers the plugin won't expose these
   * methods, so we fall through optimistically instead of blocking.
   * @returns {Promise<boolean>} True if permissions are granted (or not applicable).
   */
  async ensurePermissions() {
    if (!this.plugin) await this.init();
    if (!this.plugin) return false;
    try {
      const status = await this.plugin.checkPermissions();
      if (status.bluetooth === 'granted' || status.connect === 'granted') return true;
      const result = await this.plugin.requestPermissions();
      return result.bluetooth === 'granted' || result.connect === 'granted';
    } catch (e) {
      // Plugin version or platform doesn't support permission methods — continue optimistically
      console.warn('[TSC3] Permission check not supported:', e.message);
      return true;
    }
  }

  async isAvailable() {
    if (!this.plugin) await this.init();
    if (!this.plugin) return false;
    try {
      const { enabled } = await this.plugin.isEnabled();
      return enabled;
    } catch (e) {
      console.error('[TSC3] Bluetooth availability check failed:', e.message);
      return false;
    }
  }

  /**
   * Get paired/bonded devices, filtered for likely TSC3/survey controllers.
   * Uses list() rather than scan() to avoid active discovery — faster and
   * requires only BLUETOOTH_CONNECT permission (matches GNSS adapter pattern).
   * @returns {Promise<Array<{name: string, address: string, isSurvey: boolean}>>}
   */
  async getPairedDevices() {
    if (!this.plugin) await this.init();
    if (!this.plugin) return [];
    const permitted = await this.ensurePermissions();
    if (!permitted) {
      console.warn('[TSC3] Bluetooth permissions denied — cannot list paired devices');
      return [];
    }
    try {
      const { devices } = await this.plugin.list();
      return devices.map(device => ({
        name: device.name || 'Unknown Device',
        address: device.address || device.id,
        isSurvey: /trimble|tsc|survey/i.test(device.name || ''),
      }));
    } catch (e) {
      console.error('[TSC3] Failed to list paired devices:', e.message);
      return [];
    }
  }

  /**
   * Connect to a Bluetooth device.
   * @param {string} address - Device MAC address
   * @returns {Promise<boolean>}
   */
  async connect(address) {
    if (!this.plugin) await this.init();
    if (!this.plugin) {
      if (this.onError) this.onError(new Error('Bluetooth not available'));
      return false;
    }
    const permitted = await this.ensurePermissions();
    if (!permitted) {
      const err = new Error('Bluetooth permissions denied');
      console.warn('[TSC3]', err.message);
      if (this.onError) this.onError(err);
      return false;
    }

    try {
      if (this.isConnected) await this.disconnect();

      await this.plugin.connect({ address });
      this.isConnected = true;
      this.connectedDevice = address;
      this.parserState = createParserState();

      // Start receiving data via notifications with newline delimiter
      await this.plugin.startNotifications({ address, delimiter: '\n' });

      // Listen for incoming data
      this.listenerHandle = await this.plugin.addListener('onRead', (result) => {
        this._handleData(result);
      });

      if (this.onConnect) {
        const devices = await this.getPairedDevices();
        const device = devices.find(d => (d.address || d.id) === address);
        this.onConnect({ name: device?.name || 'Unknown', address });
      }

      return true;
    } catch (e) {
      console.error('[TSC3] Bluetooth connection failed:', e.message);
      if (this.onError) this.onError(e);
      return false;
    }
  }

  async disconnect() {
    if (!this.plugin || !this.isConnected) return;
    const address = this.connectedDevice;
    try {
      if (address) {
        await this.plugin.stopNotifications({ address });
      }
      if (this.listenerHandle) {
        await this.listenerHandle.remove();
        this.listenerHandle = null;
      }
      if (address) {
        await this.plugin.disconnect({ address });
      }
    } catch (e) {
      console.warn('[TSC3] Disconnect error:', e.message);
    }
    this.isConnected = false;
    this.connectedDevice = null;
    this.parserState = createParserState();
    if (this.onDisconnect) this.onDisconnect();
  }

  _handleData(data) {
    if (!data || !data.value) return;
    const points = processDataChunk(data.value, this.parserState);
    for (const point of points) {
      if (this.onPoint) this.onPoint(point);
    }
  }

  getIsConnected() {
    return this.isConnected;
  }

  getConnectedDevice() {
    return this.connectedDevice;
  }
}
