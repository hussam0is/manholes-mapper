/**
 * TSC3 WebSocket Bridge Adapter
 * Connects to a WebSocket server that relays TSC3 survey points.
 * Useful for browser/PWA development and testing without Bluetooth.
 */

import { processDataChunk, createParserState } from './tsc3-parser.js';

/**
 * TSC3 WebSocket Adapter
 * Connects to ws://host:port and parses incoming survey point lines.
 */
export class TSC3WebSocketAdapter {
  constructor() {
    this.ws = null;
    this.parserState = createParserState();
    this.isConnected = false;
    this.host = null;
    this.port = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.reconnectTimer = null;
    this._intentionalDisconnect = false;

    // Callbacks
    this.onPoint = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
  }

  /**
   * Connect to a WebSocket bridge server.
   * @param {string} host - Hostname or IP
   * @param {number} [port=8765] - Port number
   * @returns {boolean} True if connection was initiated
   */
  connect(host, port = 8765) {
    if (typeof WebSocket === 'undefined') {
      if (this.onError) this.onError(new Error('WebSocket not available'));
      return false;
    }

    if (this.isConnected) this.disconnect();

    this.host = host;
    this.port = port;
    this._intentionalDisconnect = false;
    this.parserState = createParserState();

    try {
      const url = `ws://${host}:${port}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.debug(`[TSC3] WebSocket connected to ${url}`);
        if (this.onConnect) {
          this.onConnect({ name: `${host}:${port}`, address: host, port });
        }
      };

      this.ws.onmessage = (event) => {
        this._handleData(event.data);
      };

      this.ws.onclose = () => {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.ws = null;

        if (wasConnected && !this._intentionalDisconnect) {
          console.debug('[TSC3] WebSocket closed unexpectedly');
          if (this.onDisconnect) this.onDisconnect();
          this._scheduleReconnect();
        } else if (wasConnected) {
          if (this.onDisconnect) this.onDisconnect();
        }
      };

      this.ws.onerror = (_event) => {
        console.error('[TSC3] WebSocket error');
        if (this.onError) this.onError(new Error('WebSocket connection error'));
      };

      return true;
    } catch (e) {
      console.error('[TSC3] WebSocket connect failed:', e.message);
      if (this.onError) this.onError(e);
      return false;
    }
  }

  disconnect() {
    this._intentionalDisconnect = true;
    this._cancelReconnect();

    if (this.ws) {
      try { this.ws.close(); } catch (_) { /* ignore */ }
      this.ws = null;
    }

    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.parserState = createParserState();

    if (wasConnected && this.onDisconnect) {
      this.onDisconnect();
    }
  }

  _handleData(raw) {
    const text = typeof raw === 'string' ? raw : String(raw);
    const points = processDataChunk(text, this.parserState);
    for (const point of points) {
      if (this.onPoint) this.onPoint(point);
    }
  }

  _scheduleReconnect() {
    if (this._intentionalDisconnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[TSC3] Max WebSocket reconnection attempts reached');
      return;
    }

    this._cancelReconnect();

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.debug(`[TSC3] Scheduling WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect(this.host, this.port);
    }, delay);
  }

  _cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  getIsConnected() {
    return this.isConnected;
  }

  getConnectionInfo() {
    if (!this.isConnected) return null;
    return { host: this.host, port: this.port };
  }
}
