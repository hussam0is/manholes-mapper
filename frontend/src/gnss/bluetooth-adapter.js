/**
 * Bluetooth SPP Adapter
 * Connects to GNSS receiver via Bluetooth Serial Port Profile
 * Uses Capacitor plugin for native Bluetooth access
 */

import { NMEAParser } from './nmea-parser.js';

// Check if running in Capacitor
const isCapacitor = typeof window !== 'undefined' && window.Capacitor;

// Bluetooth Serial plugin reference (loaded dynamically)
let bluetoothSerialPlugin = null;

/**
 * Get the Bluetooth Serial plugin
 * Returns null if not available (web browser without Capacitor)
 */
async function getBluetoothPlugin() {
  if (!isCapacitor) {
    console.warn('[GNSS] Bluetooth SPP requires Capacitor native runtime');
    return null;
  }

  if (bluetoothSerialPlugin) {
    return bluetoothSerialPlugin;
  }

  try {
    // Try to access plugin from Capacitor plugins registry
    // The plugin must be installed: npm install @niceprogrammer/capacitor-bluetooth-serial
    if (window.Capacitor?.Plugins?.BluetoothSerial) {
      bluetoothSerialPlugin = window.Capacitor.Plugins.BluetoothSerial;
      return bluetoothSerialPlugin;
    }
    console.warn('[GNSS] Bluetooth Serial plugin not registered');
    return null;
  } catch (e) {
    console.warn('[GNSS] Bluetooth Serial plugin not available:', e.message);
    return null;
  }
}

/**
 * Bluetooth SPP Adapter class
 * Manages Bluetooth connection to GNSS receiver
 */
export class BluetoothAdapter {
  constructor() {
    this.plugin = null;
    this.parser = new NMEAParser();
    this.isConnected = false;
    this.connectedDevice = null;
    this.dataSubscription = null;

    // Callbacks
    this.onData = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
  }

  /**
   * Initialize the Bluetooth plugin
   * @returns {Promise<boolean>} True if plugin is available
   */
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
      console.warn('[GNSS] Permission check not supported:', e.message);
      return true;
    }
  }

  /**
   * Check if Bluetooth is available and enabled
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    if (!this.plugin) {
      await this.init();
    }
    
    if (!this.plugin) {
      return false;
    }

    try {
      const { enabled } = await this.plugin.isEnabled();
      return enabled;
    } catch (e) {
      console.error('[GNSS] Bluetooth availability check failed:', e.message);
      return false;
    }
  }

  /**
   * Request Bluetooth to be enabled
   * @returns {Promise<boolean>}
   */
  async requestEnable() {
    if (!this.plugin) {
      return false;
    }

    try {
      await this.plugin.enable();
      return true;
    } catch (e) {
      console.warn('[GNSS] Failed to enable Bluetooth:', e.message);
      return false;
    }
  }

  /**
   * Scan for paired Bluetooth devices
   * @returns {Promise<Array>} List of paired devices
   */
  async getPairedDevices() {
    if (!this.plugin) {
      await this.init();
    }

    if (!this.plugin) {
      return [];
    }

    const permitted = await this.ensurePermissions();
    if (!permitted) {
      console.warn('[GNSS] Bluetooth permissions denied — cannot list paired devices');
      return [];
    }

    try {
      const { devices } = await this.plugin.list();
      // Filter for likely GNSS receivers (Trimble devices)
      return devices.map(device => ({
        name: device.name || 'Unknown Device',
        address: device.address,
        isTrimble: device.name?.toLowerCase().includes('trimble') || 
                   device.name?.toLowerCase().includes('r780')
      }));
    } catch (e) {
      console.error('[GNSS] Failed to list paired devices:', e.message);
      return [];
    }
  }

  /**
   * Connect to a Bluetooth device
   * @param {string} address - Device MAC address
   * @returns {Promise<boolean>} True if connected successfully
   */
  async connect(address) {
    if (!this.plugin) {
      await this.init();
    }

    if (!this.plugin) {
      if (this.onError) {
        this.onError(new Error('Bluetooth not available'));
      }
      return false;
    }

    const permitted = await this.ensurePermissions();
    if (!permitted) {
      const err = new Error('Bluetooth permissions denied');
      console.warn('[GNSS]', err.message);
      if (this.onError) {
        this.onError(err);
      }
      return false;
    }

    try {
      // Disconnect existing connection
      if (this.isConnected) {
        await this.disconnect();
      }

      // Connect to device
      await this.plugin.connect({ address });
      
      this.isConnected = true;
      this.connectedDevice = address;

      // Subscribe to incoming data
      this.dataSubscription = await this.plugin.registerDataListener(
        (data) => this.handleData(data),
        (error) => this.handleError(error)
      );

      if (this.onConnect) {
        const devices = await this.getPairedDevices();
        const device = devices.find(d => d.address === address);
        this.onConnect({
          name: device?.name || 'Unknown',
          address: address
        });
      }

      return true;
    } catch (e) {
      console.error('[GNSS] Bluetooth connection failed:', e.message);
      if (this.onError) {
        this.onError(e);
      }
      return false;
    }
  }

  /**
   * Disconnect from current device
   */
  async disconnect() {
    if (!this.plugin || !this.isConnected) {
      return;
    }

    try {
      // Unsubscribe from data
      if (this.dataSubscription) {
        await this.dataSubscription.remove();
        this.dataSubscription = null;
      }

      // Disconnect
      await this.plugin.disconnect();
    } catch (e) {
      console.warn('[GNSS] Disconnect error:', e.message);
    }

    this.isConnected = false;
    this.connectedDevice = null;
    this.parser.reset();

    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  /**
   * Handle incoming Bluetooth data
   * @param {object} data - Data from plugin
   */
  handleData(data) {
    if (!data || !data.value) {
      return;
    }

    // Process NMEA data
    this.parser.processData(data.value);
    const state = this.parser.getState();

    if (this.onData && state.isValid) {
      this.onData(state);
    }
  }

  /**
   * Handle Bluetooth errors
   * @param {Error} error
   */
  handleError(error) {
    console.error('[GNSS] Bluetooth error:', error.message);
    
    if (this.onError) {
      this.onError(error);
    }

    // Attempt to disconnect cleanly
    this.disconnect();
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  getIsConnected() {
    return this.isConnected;
  }

  /**
   * Get connected device address
   * @returns {string|null}
   */
  getConnectedDevice() {
    return this.connectedDevice;
  }
}
