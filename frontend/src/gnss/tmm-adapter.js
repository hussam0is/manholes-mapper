/**
 * TMM (Trimble Mobile Manager) WebSocket Adapter
 * Connects to TMM's local WebSocket for rich GNSS position streaming.
 *
 * TMM V1 API (open to all apps on device):
 * - Port discovery: GET http://localhost:{httpPort}/api/v1/positionStream
 * - Position stream: ws://localhost:{wsPort}
 * - JSON messages with lat, lon, alt, hrms, vrms, hdop, diffStatus, satellites, etc.
 */

const FIX_LABELS = {
  0: 'No Fix',
  1: 'GPS',
  2: 'DGPS',
  4: 'RTK Fixed',
  5: 'RTK Float'
};

// Common TMM HTTP API ports to try during auto-discovery
const TMM_COMMON_PORTS = [7216, 7217, 7218, 7219, 7220];

// No-data timeout: trigger reconnection if no position for this long
const STALE_TIMEOUT_MS = 5000;

/**
 * Translate TMM JSON position to gnssState-compatible format.
 * @param {object} tmm - Raw TMM WebSocket JSON message
 * @returns {object} Position object for gnssState.updatePosition()
 */
export function translateTMMPosition(tmm) {
  const fixQuality = tmm.diffStatus != null ? (tmm.diffStatus || 0) : 0;

  return {
    lat: tmm.latitude,
    lon: tmm.longitude,
    alt: tmm.altitude,
    accuracy: tmm.hrms || tmm.accuracy || null,
    fixQuality,
    fixLabel: FIX_LABELS[fixQuality] || 'No Fix',
    satellites: tmm.totalSatInUse || tmm.satellites || 0,
    hdop: tmm.hdop ?? null,
    speed: tmm.speed ?? null,
    course: tmm.bearing ?? null,
    timestamp: Date.now(),
    isValid: tmm.latitude != null && tmm.longitude != null && fixQuality > 0,
    // Extended TMM-specific fields
    hrms: tmm.hrms ?? null,
    vrms: tmm.vrms ?? null,
    diffAge: tmm.diffAge ?? null,
    diffStatus: tmm.diffStatus ?? null,
    vdop: tmm.vdop ?? null,
    pdop: tmm.pdop ?? null,
    receiverModel: tmm.receiverModel || null,
    totalSatInView: tmm.totalSatInView || null,
    mslHeight: tmm.mslHeight ?? null,
    undulation: tmm.undulation ?? null,
  };
}

/**
 * TMM WebSocket Adapter
 * Pattern A: class-based with onData/onConnect/onDisconnect/onError callbacks,
 * managed by GNSSConnectionManager.
 */
export class TMMAdapter {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.httpPort = null;
    this.wsPort = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.reconnectTimer = null;
    this.staleTimer = null;
    this._intentionalDisconnect = false;

    // Standard adapter callbacks (wired by connection-manager)
    this.onData = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
  }

  /**
   * Connect to TMM.
   * 1. Discovers WebSocket port via HTTP API
   * 2. Opens WebSocket to stream positions
   * @param {number} [httpPort] - TMM HTTP API port. If omitted, tries common ports.
   * @returns {Promise<boolean>}
   */
  async connect(httpPort) {
    if (typeof WebSocket === 'undefined') {
      if (this.onError) this.onError(new Error('WebSocket not available'));
      return false;
    }

    if (this.isConnected) this.disconnect();

    this._intentionalDisconnect = false;

    try {
      // Discover the WebSocket port
      const wsPort = await this._discoverWsPort(httpPort);
      if (!wsPort) {
        if (this.onError) this.onError(new Error('TMM server not found'));
        return false;
      }

      this.wsPort = wsPort;
      return this._connectWebSocket(wsPort);
    } catch (e) {
      console.error('[TMM] Connect failed:', e.message);
      if (this.onError) this.onError(e);
      return false;
    }
  }

  /**
   * Connect directly to a known WebSocket port (skips HTTP discovery).
   * @param {number} wsPort - WebSocket port
   * @returns {boolean}
   */
  connectDirect(wsPort) {
    if (typeof WebSocket === 'undefined') {
      if (this.onError) this.onError(new Error('WebSocket not available'));
      return false;
    }

    if (this.isConnected) this.disconnect();

    this._intentionalDisconnect = false;
    this.wsPort = wsPort;
    return this._connectWebSocket(wsPort);
  }

  /**
   * Discover TMM WebSocket port via HTTP API.
   * @param {number} [httpPort] - Known HTTP port, or tries common ports
   * @returns {Promise<number|null>}
   */
  async _discoverWsPort(httpPort) {
    const portsToTry = httpPort ? [httpPort] : TMM_COMMON_PORTS;

    for (const port of portsToTry) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(
          `http://localhost:${port}/api/v1/positionStream?format=locationV2`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          this.httpPort = port;
          // TMM returns the WebSocket port in the response
          const wsPort = data.port || data.wsPort || data.socketPort;
          if (wsPort) {
            console.debug(`[TMM] Discovered WS port ${wsPort} via HTTP port ${port}`);
            return wsPort;
          }
        }
      } catch (_) {
        // Try next port
      }
    }

    console.warn('[TMM] Could not discover WebSocket port from HTTP API');
    return null;
  }

  /**
   * Open WebSocket connection to TMM.
   * @param {number} wsPort
   * @returns {boolean}
   */
  _connectWebSocket(wsPort) {
    try {
      const url = `ws://localhost:${wsPort}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._startStaleCheck();
        console.debug(`[TMM] WebSocket connected to ${url}`);
        if (this.onConnect) {
          this.onConnect({ name: 'Trimble Mobile Manager', address: 'localhost' });
        }
      };

      this.ws.onmessage = (event) => {
        this._handleMessage(event.data);
      };

      this.ws.onclose = () => {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.ws = null;
        this._stopStaleCheck();

        if (wasConnected && !this._intentionalDisconnect) {
          console.debug('[TMM] WebSocket closed unexpectedly');
          if (this.onDisconnect) this.onDisconnect();
          this._scheduleReconnect();
        } else if (wasConnected) {
          if (this.onDisconnect) this.onDisconnect();
        }
      };

      this.ws.onerror = () => {
        console.error('[TMM] WebSocket error');
        if (this.onError) this.onError(new Error('TMM WebSocket connection error'));
      };

      return true;
    } catch (e) {
      console.error('[TMM] WebSocket connect failed:', e.message);
      if (this.onError) this.onError(e);
      return false;
    }
  }

  /**
   * Handle incoming WebSocket message — parse JSON and emit position data.
   * @param {string} raw
   */
  _handleMessage(raw) {
    this._resetStaleCheck();

    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const position = translateTMMPosition(data);
      if (this.onData) this.onData(position);
    } catch (e) {
      console.warn('[TMM] Failed to parse position message:', e.message);
    }
  }

  disconnect() {
    this._intentionalDisconnect = true;
    this._cancelReconnect();
    this._stopStaleCheck();

    if (this.ws) {
      try { this.ws.close(); } catch (_) { /* ignore */ }
      this.ws = null;
    }

    const wasConnected = this.isConnected;
    this.isConnected = false;

    if (wasConnected && this.onDisconnect) {
      this.onDisconnect();
    }
  }

  // --- Reconnection (exponential backoff) ---

  _scheduleReconnect() {
    if (this._intentionalDisconnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[TMM] Max reconnection attempts reached');
      return;
    }

    this._cancelReconnect();

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.debug(`[TMM] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      if (this.wsPort) {
        this._connectWebSocket(this.wsPort);
      }
    }, delay);
  }

  _cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // --- Staleness detection ---

  _startStaleCheck() {
    this._stopStaleCheck();
    this.staleTimer = setTimeout(() => this._onStale(), STALE_TIMEOUT_MS);
  }

  _resetStaleCheck() {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = setTimeout(() => this._onStale(), STALE_TIMEOUT_MS);
    }
  }

  _stopStaleCheck() {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  _onStale() {
    if (!this.isConnected) return;
    console.warn('[TMM] No data received for 5s — reconnecting');
    this.disconnect();
    this._intentionalDisconnect = false;
    this._scheduleReconnect();
  }

  // --- Status ---

  getIsConnected() {
    return this.isConnected;
  }

  getConnectionInfo() {
    if (!this.isConnected) return null;
    return { httpPort: this.httpPort, wsPort: this.wsPort };
  }
}
