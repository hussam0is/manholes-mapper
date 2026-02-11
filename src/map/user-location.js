/**
 * User Location Module
 * Handles browser geolocation API for showing user position on the map
 */

import { wgs84ToItm } from './govmap-layer.js';

// Location state
let watchId = null;
let currentPosition = null;
let locationEnabled = false;
let permissionState = 'prompt'; // 'granted', 'denied', 'prompt'
let lastUpdateTime = 0;
let locationCallbacks = [];

// Location options
const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000
};

// Minimum time between updates (ms)
const MIN_UPDATE_INTERVAL = 1000;

/**
 * Check if geolocation is supported
 * @returns {boolean}
 */
export function isGeolocationSupported() {
  return 'geolocation' in navigator;
}

/**
 * Check geolocation permission state
 * @returns {Promise<string>} 'granted', 'denied', or 'prompt'
 */
export async function checkPermission() {
  if (!isGeolocationSupported()) {
    return 'denied';
  }
  
  try {
    // Check permission using Permissions API if available
    if (navigator.permissions) {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      permissionState = result.state;
      
      // Listen for permission changes
      result.onchange = () => {
        permissionState = result.state;
        if (permissionState === 'denied' && watchId) {
          stopWatchingLocation();
        }
      };
      
      return permissionState;
    }
    
    // Fallback: assume prompt state
    return 'prompt';
  } catch (e) {
    console.warn('[Location] Permission check failed:', e.message);
    return 'prompt';
  }
}

/**
 * Request location permission and get current position
 * @returns {Promise<{lat: number, lon: number, accuracy: number, error?: string}|null>}
 */
export function requestLocationPermission() {
  return new Promise((resolve) => {
    if (!isGeolocationSupported()) {
      resolve({ error: 'not_supported' });
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        permissionState = 'granted';
        currentPosition = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        lastUpdateTime = Date.now();
        resolve(currentPosition);
      },
      (error) => {
        console.warn('[Location] Location error:', error.code, error.message);
        let errorType = 'unknown';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            permissionState = 'denied';
            errorType = 'permission_denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorType = 'position_unavailable';
            break;
          case error.TIMEOUT:
            errorType = 'timeout';
            break;
        }
        
        resolve({ error: errorType });
      },
      LOCATION_OPTIONS
    );
  });
}

/**
 * Start watching user location
 * @param {Function} callback - Called with position updates {lat, lon, accuracy}
 * @returns {boolean} True if watch started successfully
 */
export function startWatchingLocation(callback) {
  if (!isGeolocationSupported()) {
    return false;
  }
  
  if (callback && !locationCallbacks.includes(callback)) {
    locationCallbacks.push(callback);
  }
  
  if (watchId !== null) {
    // Already watching
    return true;
  }
  
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const now = Date.now();
      if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
        return;
      }
      
      permissionState = 'granted';
      currentPosition = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp
      };
      lastUpdateTime = now;
      locationEnabled = true;
      
      // Notify all callbacks
      locationCallbacks.forEach(cb => {
        try {
          cb(currentPosition);
        } catch (e) {
          console.error('[Location] Callback error:', e.message);
        }
      });
    },
    (error) => {
      console.warn('[Location] Watch error:', error.message);
      if (error.code === error.PERMISSION_DENIED) {
        permissionState = 'denied';
        stopWatchingLocation();
      }
    },
    LOCATION_OPTIONS
  );
  
  return true;
}

/**
 * Stop watching user location
 */
export function stopWatchingLocation() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  locationEnabled = false;
}

/**
 * Remove a location callback
 * @param {Function} callback
 */
export function removeLocationCallback(callback) {
  const index = locationCallbacks.indexOf(callback);
  if (index !== -1) {
    locationCallbacks.splice(index, 1);
  }
}

/**
 * Check if location tracking is enabled
 * @returns {boolean}
 */
export function isLocationEnabled() {
  return locationEnabled && watchId !== null;
}

/**
 * Get the current position
 * @returns {object|null} {lat, lon, accuracy, ...} or null
 */
export function getCurrentPosition() {
  return currentPosition;
}

/**
 * Get the current position in ITM coordinates
 * @returns {object|null} {x, y, accuracy} or null
 */
export function getCurrentPositionItm() {
  if (!currentPosition) {
    return null;
  }
  
  const itm = wgs84ToItm(currentPosition.lat, currentPosition.lon);
  return {
    x: itm.x,
    y: itm.y,
    accuracy: currentPosition.accuracy
  };
}

/**
 * Get permission state
 * @returns {string} 'granted', 'denied', or 'prompt'
 */
export function getPermissionState() {
  return permissionState;
}

/**
 * Draw user location marker on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {object} position - {lat, lon, accuracy}
 * @param {object} referencePoint - {itm: {x, y}, canvas: {x, y}}
 * @param {number} coordinateScale - Pixels per meter
 * @param {object} viewTranslate - View translation
 * @param {number} viewScale - View zoom scale
 * @param {object} options - Drawing options
 * @param {number} options.stretchX - Horizontal stretch factor (default 1)
 * @param {number} options.stretchY - Vertical stretch factor (default 1)
 */
export function drawUserLocationMarker(ctx, position, referencePoint, coordinateScale, viewTranslate, viewScale, options = {}) {
  if (!position || !referencePoint) {
    return;
  }
  
  const { stretchX = 1, stretchY = 1 } = options;
  
  // Convert position to ITM
  const posItm = wgs84ToItm(position.lat, position.lon);
  
  // Convert to canvas coordinates
  const dx = posItm.x - referencePoint.itm.x;
  const dy = posItm.y - referencePoint.itm.y;
  
  const canvasX = referencePoint.canvas.x + (dx * coordinateScale);
  const canvasY = referencePoint.canvas.y - (dy * coordinateScale); // Flip Y
  
  // Apply view transform with stretch to align with stretched coordinate system
  const screenX = (canvasX * stretchX) * viewScale + viewTranslate.x;
  const screenY = (canvasY * stretchY) * viewScale + viewTranslate.y;
  
  ctx.save();
  
  // Draw accuracy circle
  const accuracyRadius = (position.accuracy || 10) * coordinateScale * viewScale;
  if (accuracyRadius > 5 && accuracyRadius < 500) {
    ctx.beginPath();
    ctx.arc(screenX, screenY, accuracyRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(66, 133, 244, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(66, 133, 244, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  
  // Draw pulsing outer ring
  const pulsePhase = (Date.now() % 2000) / 2000;
  const pulseRadius = 12 + Math.sin(pulsePhase * Math.PI * 2) * 3;
  
  ctx.beginPath();
  ctx.arc(screenX, screenY, pulseRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(66, 133, 244, 0.3)';
  ctx.fill();
  
  // Draw main dot
  ctx.beginPath();
  ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#4285f4'; // Google Maps blue
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Draw heading indicator if available
  if (position.heading != null && !isNaN(position.heading)) {
    const headingRad = (position.heading - 90) * Math.PI / 180;
    const arrowLength = 15;
    
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(
      screenX + Math.cos(headingRad) * arrowLength,
      screenY + Math.sin(headingRad) * arrowLength
    );
    ctx.strokeStyle = '#4285f4';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  
  ctx.restore();
}

/**
 * Center map on user location
 * @param {object} position - Current position {lat, lon}
 * @param {object} referencePoint - Reference point for coordinate conversion
 * @param {number} coordinateScale - Pixels per meter
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @returns {object|null} New view translation {x, y} or null
 */
export function calculateCenterOnUser(position, referencePoint, coordinateScale, canvasWidth, canvasHeight) {
  if (!position || !referencePoint) {
    return null;
  }
  
  // Convert position to ITM
  const posItm = wgs84ToItm(position.lat, position.lon);
  
  // Convert to canvas world coordinates
  const dx = posItm.x - referencePoint.itm.x;
  const dy = posItm.y - referencePoint.itm.y;
  
  const worldX = referencePoint.canvas.x + (dx * coordinateScale);
  const worldY = referencePoint.canvas.y - (dy * coordinateScale);
  
  // Calculate translation to center this point
  return {
    x: canvasWidth / 2 - worldX,
    y: canvasHeight / 2 - worldY
  };
}

/**
 * Get location status message for UI
 * @returns {string}
 */
export function getLocationStatusMessage() {
  if (!isGeolocationSupported()) {
    return 'Location not supported';
  }
  
  switch (permissionState) {
    case 'granted':
      if (currentPosition) {
        const acc = Math.round(currentPosition.accuracy);
        return `Location: ${acc}m accuracy`;
      }
      return 'Getting location...';
    case 'denied':
      return 'Location access denied';
    case 'prompt':
    default:
      return 'Click to enable location';
  }
}

/**
 * Toggle location tracking
 * @param {Function} callback - Position update callback
 * @returns {Promise<boolean>} True if now enabled
 */
export async function toggleLocation(callback) {
  if (isLocationEnabled()) {
    stopWatchingLocation();
    return false;
  } else {
    const position = await requestLocationPermission();
    if (position) {
      startWatchingLocation(callback);
      return true;
    }
    return false;
  }
}

// Check initial permission state
checkPermission();
