/**
 * Projection utilities using proj4
 * Handles accurate coordinate transformations for Israel TM Grid (ITM/EPSG:2039)
 */

import proj4 from 'proj4';

// Define Israel TM Grid (ITM) projection - EPSG:2039
// Based on WGS84 datum with Transverse Mercator projection
// This is the official coordinate system used in Israel surveys
proj4.defs('EPSG:2039', '+proj=tmerc +lat_0=31.73439361111111 +lon_0=35.20451694444445 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs');

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
    console.error('WGS84 to ITM conversion error:', error);
    // Fallback to approximate conversion
    return wgs84ToItmSimple(lat, lon);
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
    console.error('ITM to WGS84 conversion error:', error);
    // Fallback to approximate conversion
    return itmToWgs84Simple(x, y);
  }
}

/**
 * Fallback: Simple approximate WGS84 to ITM conversion
 * Good for Israel region but less accurate than proj4
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {{x: number, y: number}}
 */
function wgs84ToItmSimple(lat, lon) {
  const refLat = 31.5;
  const refLon = 35.0;
  const refItmX = 200000;
  const refItmY = 600000;
  
  const metersPerDegLat = 110940;
  const metersPerDegLon = 95500;
  
  const dLat = lat - refLat;
  const dLon = lon - refLon;
  
  const x = refItmX + (dLon * metersPerDegLon);
  const y = refItmY + (dLat * metersPerDegLat);
  
  return { x, y };
}

/**
 * Fallback: Simple approximate ITM to WGS84 conversion
 * @param {number} x - ITM X (easting)
 * @param {number} y - ITM Y (northing)
 * @returns {{lat: number, lon: number}}
 */
function itmToWgs84Simple(x, y) {
  const refLat = 31.5;
  const refLon = 35.0;
  const refItmX = 200000;
  const refItmY = 600000;
  
  const metersPerDegLat = 110940;
  const metersPerDegLon = 95500;
  
  const dX = x - refItmX;
  const dY = y - refItmY;
  
  const lat = refLat + (dY / metersPerDegLat);
  const lon = refLon + (dX / metersPerDegLon);
  
  return { lat, lon };
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
