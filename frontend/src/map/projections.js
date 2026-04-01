/**
 * Projection utilities using proj4
 * Handles accurate coordinate transformations for Israel TM Grid (ITM/EPSG:2039)
 */

import proj4 from 'proj4';

// Define Israel TM Grid (ITM) projection - EPSG:2039
// Based on WGS84 datum with Transverse Mercator projection
// This is the official coordinate system used in Israel surveys
proj4.defs('EPSG:2039', '+proj=tmerc +lat_0=31.7344 +lon_0=35.2049 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=23.772,17.49,17.859,-0.3132,-1.85274,1.67299,-5.4262 +units=m +no_defs +type=crs');

// WGS84 is the standard GPS datum (EPSG:4326)
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

/**
 * Convert WGS84 (latitude, longitude) to Israel TM Grid (ITM)
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @returns {{x: number, y: number}} ITM coordinates (easting, northing)
 */
export function wgs84ToItm(lat, lon) {
  try {
    const [x, y] = proj4('EPSG:4326', 'EPSG:2039', [lon, lat]);
    return { x, y };
  } catch (error) {
    console.error('[Map] WGS84 to ITM conversion error:', error.message);
    throw error;
  }
}

/**
 * Convert Israel TM Grid (ITM) to WGS84 (latitude, longitude)
 * @param {number} x - ITM X coordinate (easting)
 * @param {number} y - ITM Y coordinate (northing)
 * @returns {{lat: number, lon: number}} WGS84 coordinates
 */
export function itmToWgs84(x, y) {
  try {
    const [lon, lat] = proj4('EPSG:2039', 'EPSG:4326', [x, y]);
    return { lat, lon };
  } catch (error) {
    console.error('[Map] ITM to WGS84 conversion error:', error.message);
    throw error;
  }
}

/**
 * Validate if coordinates are within Israel's ITM bounds
 * @param {number} x - ITM X coordinate
 * @param {number} y - ITM Y coordinate
 * @returns {boolean} True if coordinates are within Israel
 */
export function isValidItmCoordinate(x, y) {
  // Israel ITM bounds (approximate)
  // X (Easting): ~100,000 - 300,000
  // Y (Northing): ~350,000 - 800,000
  return (
    x >= 100000 && x <= 300000 &&
    y >= 350000 && y <= 800000
  );
}

/**
 * Calculate distance between two ITM points in meters
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {number} Distance in meters
 */
export function distanceItm(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate bearing between two ITM points in degrees (0-360)
 * 0 = North, 90 = East, 180 = South, 270 = West
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {number} Bearing in degrees
 */
export function bearingItm(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let bearing = Math.atan2(dx, dy) * 180 / Math.PI;
  if (bearing < 0) bearing += 360;
  return bearing;
}
