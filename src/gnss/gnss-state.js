/**
 * GNSS State Management Module
 * Manages connection state, position data, and captured points
 */

// Connection states
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

// Connection types
export const ConnectionType = {
  BLUETOOTH: 'bluetooth',
  WIFI: 'wifi',
  MOCK: 'mock',
  BROWSER: 'browser'
};

/**
 * GNSS State Manager
 * Centralized state for GNSS functionality
 */
class GNSSStateManager {
  constructor() {
    this.reset();
    this.listeners = {
      connection: [],
      position: [],
      capture: []
    };
  }

  /**
   * Reset all state to defaults
   */
  reset() {
    this.connectionState = ConnectionState.DISCONNECTED;
    this.connectionType = null;
    this.connectionError = null;
    this.deviceName = null;
    this.deviceAddress = null;

    // Current position from GNSS
    this.position = {
      lat: null,
      lon: null,
      alt: null,
      fixQuality: 0,
      fixLabel: 'No Fix',
      satellites: 0,
      hdop: null,
      speed: null,
      course: null,
      timestamp: null,
      isValid: false
    };

    // Captured survey points
    this.capturedPoints = [];
    this.lastCapturedNodeId = null;

    // Live Measure mode
    this.liveMeasureEnabled = false;
  }

  /**
   * Update connection state
   * @param {string} state - ConnectionState value
   * @param {object} options - Additional options (error, deviceName, etc.)
   */
  setConnectionState(state, options = {}) {
    this.connectionState = state;
    
    if (options.error) {
      this.connectionError = options.error;
    }
    if (options.deviceName) {
      this.deviceName = options.deviceName;
    }
    if (options.deviceAddress) {
      this.deviceAddress = options.deviceAddress;
    }
    if (options.type) {
      this.connectionType = options.type;
    }

    if (state === ConnectionState.DISCONNECTED) {
      this.connectionType = null;
      this.deviceName = null;
      this.deviceAddress = null;
      this.position.isValid = false;
    }

    this.notifyListeners('connection', this.getConnectionInfo());
  }

  /**
   * Update position from parsed NMEA data
   * @param {object} nmeaState - State from NMEA parser
   */
  updatePosition(nmeaState) {
    Object.assign(this.position, nmeaState);
    this.notifyListeners('position', this.getPosition());
  }

  /**
   * Check if position data is stale (no update for 3+ seconds)
   * @returns {boolean}
   */
  isStale() {
    if (!this.position.timestamp) {
      return true;
    }
    return Date.now() - this.position.timestamp > 3000;
  }

  /**
   * Capture current position for a node
   * @param {string|number} nodeId - Node to assign coordinates to
   * @param {object} options - Additional capture options
   * @returns {object|null} Captured point data or null if position invalid
   */
  capturePoint(nodeId, options = {}) {
    if (!this.position.isValid) {
      return null;
    }

    const capturedPoint = {
      nodeId: String(nodeId),
      lat: this.position.lat,
      lon: this.position.lon,
      alt: this.position.alt,
      fixQuality: this.position.fixQuality,
      fixLabel: this.position.fixLabel,
      hdop: this.position.hdop,
      satellites: this.position.satellites,
      capturedAt: Date.now(),
      ...options
    };

    this.capturedPoints.push(capturedPoint);
    this.lastCapturedNodeId = nodeId;
    
    this.notifyListeners('capture', capturedPoint);
    
    return capturedPoint;
  }

  /**
   * Get captured point for a specific node
   * @param {string|number} nodeId
   * @returns {object|null}
   */
  getCapturedPoint(nodeId) {
    const id = String(nodeId);
    // Return most recent capture for this node
    for (let i = this.capturedPoints.length - 1; i >= 0; i--) {
      if (this.capturedPoints[i].nodeId === id) {
        return this.capturedPoints[i];
      }
    }
    return null;
  }

  /**
   * Get all captured points
   * @returns {Array}
   */
  getAllCapturedPoints() {
    return [...this.capturedPoints];
  }

  /**
   * Clear all captured points
   */
  clearCapturedPoints() {
    this.capturedPoints = [];
    this.lastCapturedNodeId = null;
  }

  /**
   * Enable/disable Live Measure mode
   * @param {boolean} enabled
   */
  setLiveMeasureEnabled(enabled) {
    this.liveMeasureEnabled = enabled;
    if (!enabled) {
      this.position.isValid = false;
    }
  }

  /**
   * Check if Live Measure mode is enabled
   * @returns {boolean}
   */
  isLiveMeasureEnabled() {
    return this.liveMeasureEnabled;
  }

  /**
   * Get connection info summary
   * @returns {object}
   */
  getConnectionInfo() {
    return {
      state: this.connectionState,
      type: this.connectionType,
      deviceName: this.deviceName,
      deviceAddress: this.deviceAddress,
      error: this.connectionError,
      isConnected: this.connectionState === ConnectionState.CONNECTED
    };
  }

  /**
   * Get current position
   * @returns {object}
   */
  getPosition() {
    return {
      ...this.position,
      isStale: this.isStale()
    };
  }

  /**
   * Get status summary for UI
   * @returns {object}
   */
  getStatus() {
    return {
      liveMeasureEnabled: this.liveMeasureEnabled,
      connection: this.getConnectionInfo(),
      position: this.getPosition(),
      capturedCount: this.capturedPoints.length,
      lastCapturedNodeId: this.lastCapturedNodeId
    };
  }

  /**
   * Add event listener
   * @param {string} event - 'connection', 'position', or 'capture'
   * @param {Function} callback
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Remove event listener
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback);
      if (index !== -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }

  /**
   * Notify listeners of an event
   * @param {string} event
   * @param {any} data
   */
  notifyListeners(event, data) {
    if (this.listeners[event]) {
      for (const callback of this.listeners[event]) {
        try {
          callback(data);
        } catch (e) {
          console.error(`[GNSS] State listener error (${event}):`, e.message);
        }
      }
    }
  }
}

// Singleton instance
export const gnssState = new GNSSStateManager();

// Export class for testing
export { GNSSStateManager };
