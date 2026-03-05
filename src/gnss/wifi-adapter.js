/**
 * WiFi TCP Adapter
 * Connects to GNSS receiver via TCP socket over WiFi
 * Uses Capacitor plugin for native TCP access
 */

import { NMEAParser } from './nmea-parser.js';

// Check if running in Capacitor
const isCapacitor = typeof window !== 'undefined' && window.Capacitor;

// TCP Socket plugin reference (loaded dynamically)
let tcpSocketPlugin = null;

/**
 * Get the TCP Socket plugin
 * Returns null if not available (web browser without Capacitor)
 */
async function getTcpPlugin() {
  if (!isCapacitor) {
    console.warn('[GNSS] TCP Sockets require Capacitor native runtime');
    return null;
  }

  if (tcpSocketPlugin) {
    return tcpSocketPlugin;
  }

  try {
    // Try to access plugin from Capacitor plugins registry
    // The plugin must be installed: npm install capacitor-tcp-socket
    if (window.Capacitor?.Plugins?.CapacitorTcpSocket) {
      tcpSocketPlugin = window.Capacitor.Plugins.CapacitorTcpSocket;
      return tcpSocketPlugin;
    }
    console.warn('[GNSS] TCP Socket plugin not registered');
    return null;
  } catch (e) {
    console.warn('[GNSS] TCP Socket plugin not available:', e.message);
    return null;
  }
}

/**
 * WiFi TCP Adapter class
 * Manages TCP connection to GNSS receiver over WiFi
 */
export class WifiAdapter {
  constructor() {
    this.plugin = null;
    this.parser = new NMEAParser();
    this.isConnected = false;
    this.socketId = null;
    this.host = null;
    this.port = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.reconnectTimer = null;

    // Callbacks
    this.onData = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
  }

  /**
   * Initialize the TCP plugin
   * @returns {Promise<boolean>} True if plugin is available
   */
  async init() {
    this.plugin = await getTcpPlugin();
    return this.plugin !== null;
  }

  /**
   * Check if TCP sockets are available
   * @returns {boolean}
   */
  isAvailable() {
    return isCapacitor;
  }

  /**
   * Connect to GNSS receiver via TCP
   * @param {string} host - IP address or hostname
   * @param {number} port - TCP port (default 5017 for Trimble)
   * @returns {Promise<boolean>} True if connected successfully
   */
  async connect(host, port = 5017) {
    if (!this.plugin) {
      await this.init();
    }

    if (!this.plugin) {
      if (this.onError) {
        this.onError(new Error('TCP Sockets not available'));
      }
      return false;
    }

    try {
      // Disconnect existing connection
      if (this.isConnected) {
        await this.disconnect();
      }

      this.host = host;
      this.port = port;

      // Create and connect socket
      const result = await this.plugin.connect({
        host: host,
        port: port
      });

      this.socketId = result.socketId;
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Set up data listener
      await this.plugin.registerDataListener(
        this.socketId,
        (data) => this.handleData(data),
        (error) => this.handleError(error)
      );

      if (this.onConnect) {
        this.onConnect({
          name: `${host}:${port}`,
          address: host,
          port: port
        });
      }

      return true;
    } catch (e) {
      console.error('[GNSS] TCP connection failed:', e.message);
      if (this.onError) {
        this.onError(e);
      }
      this.scheduleReconnect();
      return false;
    }
  }

  /**
   * Disconnect from current connection
   */
  async disconnect() {
    this.cancelReconnect();

    if (!this.plugin || !this.isConnected || !this.socketId) {
      return;
    }

    try {
      await this.plugin.disconnect({ socketId: this.socketId });
    } catch (e) {
      console.warn('[GNSS] TCP disconnect error:', e.message);
    }

    this.isConnected = false;
    this.socketId = null;
    this.parser.reset();

    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  /**
   * Handle incoming TCP data
   * @param {object} data - Data from plugin
   */
  handleData(data) {
    if (!data || !data.data) {
      return;
    }

    // Data may come as ArrayBuffer or string
    let stringData;
    if (typeof data.data === 'string') {
      stringData = data.data;
    } else if (data.data instanceof ArrayBuffer) {
      stringData = new TextDecoder().decode(data.data);
    } else {
      return;
    }

    // Process NMEA data
    this.parser.processData(stringData);
    const state = this.parser.getState();

    if (this.onData && state.isValid) {
      this.onData(state);
    }
  }

  /**
   * Handle TCP errors
   * @param {Error} error
   */
  handleError(error) {
    console.error('[GNSS] TCP error:', error.message);
    
    this.isConnected = false;
    this.socketId = null;
    this.parser.reset();

    if (this.onError) {
      this.onError(error);
    }

    // Attempt reconnection
    this.scheduleReconnect();
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[GNSS] Max reconnection attempts reached');
      if (this.onDisconnect) {
        this.onDisconnect();
      }
      return;
    }

    this.cancelReconnect();

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.debug(`[GNSS] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      console.debug(`[GNSS] Reconnecting to ${this.host}:${this.port}...`);
      await this.connect(this.host, this.port);
    }, delay);
  }

  /**
   * Cancel pending reconnection
   */
  cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  getIsConnected() {
    return this.isConnected;
  }

  /**
   * Get connection info
   * @returns {object|null}
   */
  getConnectionInfo() {
    if (!this.isConnected) {
      return null;
    }
    return {
      host: this.host,
      port: this.port,
      socketId: this.socketId
    };
  }
}
