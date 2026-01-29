/**
 * Mock GNSS Adapter
 * Simulates GNSS data for development and testing without a physical device
 */

import { NMEAParser } from './nmea-parser.js';

/**
 * Mock GNSS Adapter class
 * Generates simulated NMEA sentences for testing
 */
export class MockGNSSAdapter {
  constructor() {
    this.parser = new NMEAParser();
    this.intervalId = null;
    this.isConnected = false;
    this.onData = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;

    // Simulation settings
    this.basePosition = {
      lat: 32.0853,  // Tel Aviv area
      lon: 34.7818
    };
    this.altitude = 15.5;
    this.fixQuality = 4;  // RTK Fixed
    this.satellites = 18;
    this.hdop = 0.8;
    this.updateInterval = 1000; // 1 second
    this.wanderRadius = 0.00001; // ~1 meter
  }

  /**
   * Simulate connecting to a device
   * @returns {Promise<boolean>}
   */
  async connect() {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.isConnected = true;
        if (this.onConnect) {
          this.onConnect({ name: 'Mock GNSS', address: 'mock-device-001' });
        }
        this.startSimulation();
        resolve(true);
      }, 500);
    });
  }

  /**
   * Disconnect from simulated device
   */
  disconnect() {
    this.stopSimulation();
    this.isConnected = false;
    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  /**
   * Start generating mock NMEA sentences
   */
  startSimulation() {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.generateAndEmit();
    }, this.updateInterval);

    // Emit first position immediately
    this.generateAndEmit();
  }

  /**
   * Stop generating mock data
   */
  stopSimulation() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Generate and emit a mock position
   */
  generateAndEmit() {
    // Add small random wander to simulate movement
    const lat = this.basePosition.lat + (Math.random() - 0.5) * this.wanderRadius;
    const lon = this.basePosition.lon + (Math.random() - 0.5) * this.wanderRadius;

    // Generate GGA sentence
    const gga = this.generateGGA(lat, lon);
    
    // Parse and emit
    this.parser.processData(gga + '\r\n');
    const state = this.parser.getState();

    if (this.onData) {
      this.onData(state);
    }
  }

  /**
   * Generate a mock GGA sentence
   * @param {number} lat - Latitude in decimal degrees
   * @param {number} lon - Longitude in decimal degrees
   * @returns {string} NMEA GGA sentence
   */
  generateGGA(lat, lon) {
    const now = new Date();
    const utcTime = now.toISOString().substr(11, 8).replace(/:/g, '');

    // Convert decimal degrees to NMEA format (ddmm.mmmm)
    const latNmea = this.decimalToNmea(Math.abs(lat));
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonNmea = this.decimalToNmea(Math.abs(lon), true);
    const lonDir = lon >= 0 ? 'E' : 'W';

    // Build sentence without checksum
    const sentence = `$GPGGA,${utcTime},${latNmea},${latDir},${lonNmea},${lonDir},${this.fixQuality},${this.satellites.toString().padStart(2, '0')},${this.hdop.toFixed(1)},${this.altitude.toFixed(1)},M,0.0,M,,`;

    // Calculate checksum
    const checksum = this.calculateChecksum(sentence);

    return `${sentence}*${checksum}`;
  }

  /**
   * Convert decimal degrees to NMEA format
   * @param {number} decimal - Decimal degrees
   * @param {boolean} isLon - True for longitude (3 degree digits)
   * @returns {string} NMEA format coordinate
   */
  decimalToNmea(decimal, isLon = false) {
    const degrees = Math.floor(decimal);
    const minutes = (decimal - degrees) * 60;
    
    const degPadding = isLon ? 3 : 2;
    return degrees.toString().padStart(degPadding, '0') + minutes.toFixed(4).padStart(7, '0');
  }

  /**
   * Calculate NMEA checksum
   * @param {string} sentence - Sentence starting with $
   * @returns {string} Two-character hex checksum
   */
  calculateChecksum(sentence) {
    const data = sentence.substring(1); // Remove $
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum ^= data.charCodeAt(i);
    }
    return checksum.toString(16).toUpperCase().padStart(2, '0');
  }

  /**
   * Set the simulated base position
   * @param {number} lat
   * @param {number} lon
   */
  setPosition(lat, lon) {
    this.basePosition.lat = lat;
    this.basePosition.lon = lon;
  }

  /**
   * Set the simulated fix quality
   * @param {number} quality - 0-8
   */
  setFixQuality(quality) {
    this.fixQuality = quality;
  }

  /**
   * Simulate moving to a new position over time
   * @param {number} lat - Target latitude
   * @param {number} lon - Target longitude
   * @param {number} duration - Duration in ms
   */
  simulateMoveTo(lat, lon, duration = 5000) {
    const startLat = this.basePosition.lat;
    const startLon = this.basePosition.lon;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      this.basePosition.lat = startLat + (lat - startLat) * progress;
      this.basePosition.lon = startLon + (lon - startLon) * progress;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }
}
