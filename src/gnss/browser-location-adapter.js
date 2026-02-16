/**
 * Browser Location Adapter
 * Bridges navigator.geolocation into gnssState for unified location tracking.
 * When Trimble Mobile Manager (TMM) provides mock location on Android,
 * the browser Geolocation API reads RTK-grade coordinates automatically.
 */

import { gnssState, ConnectionState, ConnectionType } from './gnss-state.js';

let watchId = null;

/**
 * Infer GNSS fix quality from browser geolocation accuracy (meters).
 * When TMM provides mock location, accuracy reflects Trimble RTK quality.
 * @param {number} accuracyMeters - Horizontal accuracy in meters
 * @returns {{ fixQuality: number, fixLabel: string }}
 */
export function inferFixQuality(accuracyMeters) {
  if (accuracyMeters == null || isNaN(accuracyMeters)) {
    return { fixQuality: 0, fixLabel: 'No Fix' };
  }
  if (accuracyMeters < 0.05) return { fixQuality: 4, fixLabel: 'RTK Fixed' };
  if (accuracyMeters < 0.5)  return { fixQuality: 5, fixLabel: 'RTK Float' };
  if (accuracyMeters < 5)    return { fixQuality: 2, fixLabel: 'DGPS' };
  if (accuracyMeters < 15)   return { fixQuality: 1, fixLabel: 'GPS' };
  return { fixQuality: 0, fixLabel: 'Low Accuracy' };
}

/**
 * Translate a browser GeolocationPosition into gnssState position format
 * @param {GeolocationPosition} geolocationPosition
 * @returns {object} Position object compatible with gnssState.updatePosition()
 */
function translateBrowserPosition(geolocationPosition) {
  const coords = geolocationPosition.coords;
  const { fixQuality, fixLabel } = inferFixQuality(coords.accuracy);

  return {
    lat: coords.latitude,
    lon: coords.longitude,
    alt: coords.altitude,
    accuracy: coords.accuracy,
    fixQuality,
    fixLabel,
    satellites: null,
    hdop: Math.max(0.1, coords.accuracy / 3),
    speed: coords.speed,
    course: coords.heading,
    timestamp: Date.now(),
    isValid: true
  };
}

/**
 * Start watching browser geolocation and feeding positions into gnssState.
 * @returns {boolean} True if watch started successfully
 */
export function startBrowserLocationAdapter() {
  if (watchId !== null) return true;
  if (!('geolocation' in navigator)) return false;

  gnssState.setConnectionState(ConnectionState.CONNECTING, {
    type: ConnectionType.BROWSER
  });

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      gnssState.setConnectionState(ConnectionState.CONNECTED, {
        type: ConnectionType.BROWSER
      });
      gnssState.updatePosition(translateBrowserPosition(position));
    },
    (error) => {
      console.warn('[GNSS Browser Adapter] Error:', error.code, error.message);
      gnssState.setConnectionState(ConnectionState.ERROR, {
        error: error.message || 'Location error'
      });
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
  );

  return true;
}

/**
 * Stop watching browser geolocation.
 */
export function stopBrowserLocationAdapter() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  gnssState.setConnectionState(ConnectionState.DISCONNECTED);
  gnssState.position.isValid = false;
}

/**
 * Check if browser location adapter is currently active.
 * @returns {boolean}
 */
export function isBrowserLocationActive() {
  return watchId !== null;
}
