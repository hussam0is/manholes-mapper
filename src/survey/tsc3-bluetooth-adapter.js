/**
 * TSC3 Bluetooth SPP Adapter
 * Connects to a Trimble TSC3 controller via Bluetooth Serial Port Profile.
 * Uses the same Capacitor plugin as the GNSS bluetooth adapter.
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
    this.dataSubscription = null;

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
   * Get paired devices, filtered for likely TSC3/survey controllers.
   * @returns {Promise<Array<{name: string, address: string, isSurvey: boolean}>>}
   */
  async getPairedDevices() {
    if (!this.plugin) await this.init();
    if (!this.plugin) return [];
    try {
      const { devices } = await this.plugin.list();
      return devices.map(device => ({
        name: device.name || 'Unknown Device',
        address: device.address,
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

    try {
      if (this.isConnected) await this.disconnect();

      await this.plugin.connect({ address });
      this.isConnected = true;
      this.connectedDevice = address;
      this.parserState = createParserState();

      this.dataSubscription = await this.plugin.registerDataListener(
        (data) => this._handleData(data),
        (error) => this._handleError(error)
      );

      if (this.onConnect) {
        const devices = await this.getPairedDevices();
        const device = devices.find(d => d.address === address);
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
    try {
      if (this.dataSubscription) {
        await this.dataSubscription.remove();
        this.dataSubscription = null;
      }
      await this.plugin.disconnect();
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

  _handleError(error) {
    console.error('[TSC3] Bluetooth error:', error.message);
    if (this.onError) this.onError(error);
    this.disconnect();
  }

  getIsConnected() {
    return this.isConnected;
  }

  getConnectedDevice() {
    return this.connectedDevice;
  }
}
