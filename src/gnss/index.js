/**
 * GNSS Module Index
 * Exports all GNSS-related functionality
 */

// Connection management
import { 
  gnssConnection, 
  GNSSConnectionManager 
} from './connection-manager.js';

// State management
import { 
  gnssState, 
  GNSSStateManager, 
  ConnectionState, 
  ConnectionType 
} from './gnss-state.js';

export { 
  gnssState, 
  GNSSStateManager, 
  ConnectionState, 
  ConnectionType 
}

export { 
  gnssConnection, 
  GNSSConnectionManager 
};

// NMEA parsing
export { 
  NMEAParser, 
  FIX_QUALITY_LABELS 
} from './nmea-parser.js';

// Marker rendering
export { 
  drawGnssMarker, 
  drawGnssStatusBadge, 
  gnssToCanvas,
  FIX_COLORS 
} from './gnss-marker.js';

// Point capture dialog - import for local use AND re-export
import { 
  initPointCaptureDialog, 
  openPointCaptureDialog, 
  closeDialog as closePointCaptureDialog, 
  isDialogOpen as isPointCaptureDialogOpen 
} from './point-capture-dialog.js';

export { 
  initPointCaptureDialog, 
  openPointCaptureDialog, 
  closePointCaptureDialog, 
  isPointCaptureDialogOpen 
};

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
  
  console.log('GNSS module initialized');
}

/**
 * Quick setup for development/testing with mock GNSS
 * @returns {Promise<boolean>}
 */
export async function setupMockGnss() {
  const success = await gnssConnection.connectMock();
  if (success) {
    gnssState.setLiveMeasureEnabled(true);
    console.log('Mock GNSS connected and Live Measure enabled');
  }
  return success;
}
