/**
 * Map Module Index
 * Exports all map-related functionality
 */

// Tile management
export {
  getTileFromCache,
  storeTileInCache,
  calculateVisibleTiles,
  calculateTilesInBounds,
  calculateViewBoundsItm,
  calculateZoomLevel,
  itmToTile,
  tileToItm,
  latLonToTile,
  tileToLatLon,
  getTileSizeMeters,
  clearTileCache,
  getCacheStats,
  MAX_CACHE_BYTES_EXPORT,
  TILE_SIZE,
  GOVMAP_RESOLUTIONS,
  GOVMAP_ORIGIN
} from './tile-manager.js';

// GovMap layer
export {
  MAP_TYPES,
  setMapReferencePoint,
  getMapReferencePoint,
  setMapLayerEnabled,
  isMapLayerEnabled,
  setMapType,
  getMapType,
  drawMapTiles,
  drawMapAttribution,
  createReferenceFromNode,
  createReferenceFromWgs84,
  wgs84ToItm,
  itmToWgs84,
  saveMapSettings,
  loadMapSettings,
  precacheTilesForMeasurementBounds
} from './govmap-layer.js';

// User location
export {
  isGeolocationSupported,
  checkPermission,
  requestLocationPermission,
  startWatchingLocation,
  stopWatchingLocation,
  removeLocationCallback,
  isLocationEnabled,
  getCurrentPosition,
  getCurrentPositionItm,
  getPermissionState,
  drawUserLocationMarker,
  calculateCenterOnUser,
  getLocationStatusMessage,
  toggleLocation
} from './user-location.js';
