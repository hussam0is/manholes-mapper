/**
 * NMEA Parser Module
 * Parses NMEA 0183 sentences from GNSS receivers
 * Supports GGA and RMC sentences with checksum validation
 */

// Fix quality labels based on GGA fix indicator
const FIX_QUALITY_LABELS = {
  0: 'No Fix',
  1: 'GPS',
  2: 'DGPS',
  3: 'PPS',
  4: 'RTK Fixed',
  5: 'RTK Float',
  6: 'Estimated',
  7: 'Manual',
  8: 'Simulation'
};

/**
 * NMEA Parser class
 * Handles streaming NMEA data with line buffering and checksum validation
 */
export class NMEAParser {
  constructor() {
    this.buffer = '';
    this.currentState = {
      lat: null,
      lon: null,
      alt: null,
      fixQuality: 0,
      fixLabel: 'No Fix',
      satellites: 0,
      hdop: null,
      speed: null,     // meters per second
      course: null,    // degrees true
      timestamp: null,
      utcTime: null,
      isValid: false
    };
    this.listeners = [];
  }

  /**
   * Process incoming data (may be partial lines)
   * @param {string} data - Raw NMEA data chunk
   * @param {object} [options] - Parse options
   * @param {boolean} [options.lenientChecksum=false] - Accept sentences without checksum
   */
  processData(data, options = {}) {
    this.buffer += data;

    // Process complete lines
    const lines = this.buffer.split(/\r?\n/);

    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('$')) {
        this.parseSentence(line.trim(), options);
      }
    }
  }

  /**
   * Parse a complete NMEA sentence
   * @param {string} sentence - Complete NMEA sentence
   * @param {object} [options] - Parse options
   * @param {boolean} [options.lenientChecksum=false] - Accept sentences without checksum
   * @returns {boolean} True if sentence was valid and parsed
   */
  parseSentence(sentence, options = {}) {
    // Validate checksum
    if (!this.validateChecksum(sentence, options)) {
      console.warn('[GNSS] NMEA checksum failed:', sentence);
      return false;
    }

    // Remove checksum for parsing
    const cleanSentence = sentence.split('*')[0];
    const parts = cleanSentence.split(',');
    const sentenceType = parts[0];

    // Parse based on sentence type
    if (sentenceType === '$GPGGA' || sentenceType === '$GNGGA') {
      return this.parseGGA(parts);
    } else if (sentenceType === '$GPRMC' || sentenceType === '$GNRMC') {
      return this.parseRMC(parts);
    }

    return false;
  }

  /**
   * Validate NMEA checksum
   * Checksum is XOR of all characters between $ and *
   * @param {string} sentence - Complete NMEA sentence with checksum
   * @param {object} [options] - Validation options
   * @param {boolean} [options.lenientChecksum=false] - Accept sentences without checksum
   * @returns {boolean} True if checksum is valid
   */
  validateChecksum(sentence, options = {}) {
    const { lenientChecksum = false } = options;
    const asteriskIndex = sentence.indexOf('*');

    // No checksum present - reject by default (corrupted sentence)
    if (asteriskIndex === -1) {
      return lenientChecksum;
    }

    const data = sentence.substring(1, asteriskIndex);
    const providedChecksum = sentence.substring(asteriskIndex + 1, asteriskIndex + 3);

    // Calculate checksum
    let calculated = 0;
    for (let i = 0; i < data.length; i++) {
      calculated ^= data.charCodeAt(i);
    }

    const calculatedHex = calculated.toString(16).toUpperCase().padStart(2, '0');
    return calculatedHex === providedChecksum.toUpperCase();
  }

  /**
   * Parse GGA sentence (Global Positioning System Fix Data)
   * $GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47
   */
  parseGGA(parts) {
    if (parts.length < 15) {
      return false;
    }

    const [
      , // sentence type
      utcTime,
      latRaw, latDir,
      lonRaw, lonDir,
      fixQuality,
      satellites,
      hdop,
      altitude,
      _altUnit,
      // geoidHeight, geoidUnit, ageDgps, dgpsStationId
    ] = parts;

    const lat = this.parseCoordinate(latRaw, latDir);
    const lon = this.parseCoordinate(lonRaw, lonDir);
    const fix = parseInt(fixQuality, 10) || 0;

    if (lat !== null && lon !== null) {
      this.currentState.lat = lat;
      this.currentState.lon = lon;
      this.currentState.alt = altitude ? parseFloat(altitude) : null;
      this.currentState.fixQuality = fix;
      this.currentState.fixLabel = FIX_QUALITY_LABELS[fix] || 'Unknown';
      this.currentState.satellites = parseInt(satellites, 10) || 0;
      this.currentState.hdop = hdop ? parseFloat(hdop) : null;
      this.currentState.utcTime = utcTime;
      this.currentState.timestamp = Date.now();
      this.currentState.isValid = fix > 0;

      this.notifyListeners();
      return true;
    }

    return false;
  }

  /**
   * Parse RMC sentence (Recommended Minimum Navigation Information)
   * $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
   */
  parseRMC(parts) {
    if (parts.length < 12) {
      return false;
    }

    const [
      , // sentence type
      utcTime,
      status,
      latRaw, latDir,
      lonRaw, lonDir,
      speedKnots,
      course,
      // date, magVariation, magDir, mode
    ] = parts;

    // Status A = valid, V = warning
    if (status !== 'A') {
      return false;
    }

    const lat = this.parseCoordinate(latRaw, latDir);
    const lon = this.parseCoordinate(lonRaw, lonDir);

    if (lat !== null && lon !== null) {
      this.currentState.lat = lat;
      this.currentState.lon = lon;
      this.currentState.speed = speedKnots ? parseFloat(speedKnots) * 0.514444 : null; // knots to m/s
      this.currentState.course = course ? parseFloat(course) : null;
      this.currentState.utcTime = utcTime;
      this.currentState.timestamp = Date.now();
      this.currentState.isValid = true;

      // RMC does not carry fix quality — preserve whatever GGA already set.
      // But if no GGA has arrived yet (fixQuality === 0), promote to 1 (GPS)
      // so that isValid=true is not contradicted by fixQuality=0 ("No Fix").
      if (this.currentState.fixQuality === 0) {
        this.currentState.fixQuality = 1;
        this.currentState.fixLabel = FIX_QUALITY_LABELS[1]; // 'GPS'
      }

      this.notifyListeners();
      return true;
    }

    return false;
  }

  /**
   * Parse NMEA coordinate format (ddmm.mmmm) to decimal degrees
   * @param {string} coord - Coordinate in NMEA format
   * @param {string} dir - Direction (N/S/E/W)
   * @returns {number|null} Decimal degrees
   */
  parseCoordinate(coord, dir) {
    if (!coord || coord.length === 0) {
      return null;
    }

    // Find the decimal point
    const decimalIndex = coord.indexOf('.');
    if (decimalIndex === -1) {
      return null;
    }

    // Degrees are everything before the last 2 integer digits
    const degreeDigits = decimalIndex - 2;
    if (degreeDigits < 1) {
      return null;
    }

    const degrees = parseFloat(coord.substring(0, degreeDigits));
    const minutes = parseFloat(coord.substring(degreeDigits));

    if (isNaN(degrees) || isNaN(minutes)) {
      return null;
    }

    let decimal = degrees + minutes / 60;

    // Apply direction
    if (dir === 'S' || dir === 'W') {
      decimal = -decimal;
    }

    return decimal;
  }

  /**
   * Get the current parsed state
   * @returns {object} Current position and status
   */
  getState() {
    return { ...this.currentState };
  }

  /**
   * Add a listener for position updates
   * @param {Function} callback - Called with new state on update
   */
  onUpdate(callback) {
    this.listeners.push(callback);
  }

  /**
   * Remove a listener
   * @param {Function} callback
   */
  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of state update
   */
  notifyListeners() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.error('[GNSS] NMEA listener error:', e.message);
      }
    }
  }

  /**
   * Reset parser state
   */
  reset() {
    this.buffer = '';
    this.currentState = {
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
      utcTime: null,
      isValid: false
    };
  }
}

// Export fix quality labels for UI
export { FIX_QUALITY_LABELS };
