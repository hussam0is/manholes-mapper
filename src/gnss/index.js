/**
 * GNSS Module Index
 * Exports all GNSS-related functionality
 */

import { gnssConnection, GNSSConnectionManager } from './connection-manager.js';
import { gnssState, GNSSStateManager, ConnectionState, ConnectionType } from './gnss-state.js';
import {
  initPointCaptureDialog,
  openPointCaptureDialog,
  closeDialog as closePointCaptureDialog,
  isDialogOpen as isPointCaptureDialogOpen
} from './point-capture-dialog.js';

export { gnssState, GNSSStateManager, ConnectionState, ConnectionType };
export { gnssConnection, GNSSConnectionManager };

// NMEA parsing
export { NMEAParser, FIX_QUALITY_LABELS } from './nmea-parser.js';

// Marker rendering
export { drawGnssMarker, drawGnssStatusBadge, gnssToCanvas, FIX_COLORS } from './gnss-marker.js';

export { initPointCaptureDialog, openPointCaptureDialog, closePointCaptureDialog, isPointCaptureDialogOpen };

// Browser location adapter (primary for TMM workflow)
export {
  startBrowserLocationAdapter,
  stopBrowserLocationAdapter,
  isBrowserLocationActive,
  inferFixQuality
} from './browser-location-adapter.js';

// Adapters (for advanced usage)
export { BluetoothAdapter } from './bluetooth-adapter.js';
export { WifiAdapter } from './wifi-adapter.js';
export { MockGNSSAdapter } from './mock-adapter.js';

/**
 * Initialize the GNSS module
 * Sets up UI components and event listeners
 */
export function initGnssModule() {
  // Initialize point capture dialog
  initPointCaptureDialog();
  
  console.debug('[GNSS] Module initialized');
}

/**
 * Quick setup for development/testing with mock GNSS
 * @returns {Promise<boolean>}
 */
export async function setupMockGnss() {
  const success = await gnssConnection.connectMock();
  if (success) {
    gnssState.setLiveMeasureEnabled(true);
    console.debug('[GNSS] Mock GNSS connected and Live Measure enabled');
  }
  return success;
}
