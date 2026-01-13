/**
 * Cloud Sync Service for Manholes Mapper PWA
 * 
 * Handles synchronization between local IndexedDB cache and cloud database.
 * Features:
 * - Fetch sketches from cloud on login
 * - Cache sketches in IndexedDB for offline access
 * - Sync local changes to cloud when online
 * - Queue changes when offline for later sync
 */

import { getToken, getUserId, getAuthState } from './auth-guard.js';
import {
  openDb,
  saveSketch as saveSketchToIdb,
  getAllSketches as getAllSketchesFromIdb,
  deleteSketch as deleteSketchFromIdb,
  saveCurrentSketch,
  enqueueSyncOperation,
  drainSyncQueue,
} from '../db.js';

// Sync state
let syncState = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSyncTime: null,
  pendingChanges: 0,
  error: null,
};

// Sync state listeners
const syncStateListeners = new Set();

// Debounce timer for save operations
let saveDebounceTimer = null;
const SAVE_DEBOUNCE_MS = 2000;

// API base URL - empty for same-origin
const API_BASE = '';

/**
 * Subscribe to sync state changes
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function onSyncStateChange(callback) {
  syncStateListeners.add(callback);
  callback(syncState);
  return () => syncStateListeners.delete(callback);
}

/**
 * Notify all sync state listeners
 */
function notifySyncStateChange() {
  syncStateListeners.forEach(cb => {
    try { cb({ ...syncState }); } catch (_) {}
  });
}

/**
 * Update sync state
 * @param {Partial<typeof syncState>} updates
 */
function updateSyncState(updates) {
  Object.assign(syncState, updates);
  notifySyncStateChange();
}

/**
 * Make an authenticated API request
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function apiRequest(endpoint, options = {}) {
  const token = await getToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response;
}

/**
 * Fetch all sketches from cloud API
 * @returns {Promise<Array>} Array of sketches
 */
export async function fetchSketchesFromCloud() {
  try {
    const response = await apiRequest('/api/sketches');
    const data = await response.json();
    return data.sketches || [];
  } catch (error) {
    console.error('Failed to fetch sketches from cloud:', error);
    throw error;
  }
}

/**
 * Create a sketch in the cloud
 * @param {Object} sketch - Sketch data
 * @returns {Promise<Object>} Created sketch
 */
export async function createSketchInCloud(sketch) {
  const response = await apiRequest('/api/sketches', {
    method: 'POST',
    body: JSON.stringify(sketch),
  });
  const data = await response.json();
  return data.sketch;
}

/**
 * Update a sketch in the cloud
 * @param {string} sketchId - Sketch ID
 * @param {Object} updates - Sketch updates
 * @returns {Promise<Object>} Updated sketch
 */
export async function updateSketchInCloud(sketchId, updates) {
  const response = await apiRequest(`/api/sketches/${sketchId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  const data = await response.json();
  return data.sketch;
}

/**
 * Delete a sketch from the cloud
 * @param {string} sketchId - Sketch ID
 * @returns {Promise<boolean>}
 */
export async function deleteSketchFromCloud(sketchId) {
  await apiRequest(`/api/sketches/${sketchId}`, {
    method: 'DELETE',
  });
  return true;
}

/**
 * Sync sketches from cloud to local IndexedDB
 * Called on login success
 */
export async function syncFromCloud() {
  const authState = getAuthState();
  if (!authState.isSignedIn) {
    console.warn('Cannot sync: not signed in');
    return;
  }

  if (!navigator.onLine) {
    console.log('Offline - loading from cache');
    return;
  }

  updateSyncState({ isSyncing: true, error: null });

  try {
    // Fetch sketches from cloud
    const cloudSketches = await fetchSketchesFromCloud();
    
    // Get local sketches
    const localSketches = await getAllSketchesFromIdb();
    const localSketchMap = new Map(localSketches.map(s => [s.id, s]));
    
    // Update local cache with cloud data
    for (const cloudSketch of cloudSketches) {
      await saveSketchToIdb(cloudSketch);
    }
    
    // Remove local sketches that don't exist in cloud
    // (only if they were previously synced - have cloud IDs)
    for (const localSketch of localSketches) {
      const existsInCloud = cloudSketches.some(cs => cs.id === localSketch.id);
      if (!existsInCloud && localSketch.cloudSynced) {
        await deleteSketchFromIdb(localSketch.id);
      }
    }

    updateSyncState({
      isSyncing: false,
      lastSyncTime: new Date(),
      pendingChanges: 0,
    });

    console.log(`Synced ${cloudSketches.length} sketches from cloud`);
    return cloudSketches;
  } catch (error) {
    console.error('Sync from cloud failed:', error);
    updateSyncState({
      isSyncing: false,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Sync a single sketch to the cloud
 * Called after local changes with debouncing
 * @param {Object} sketch - Sketch to sync
 */
export async function syncSketchToCloud(sketch) {
  if (!navigator.onLine) {
    // Queue for later sync
    await enqueueSyncOperation({
      type: 'UPDATE',
      sketchId: sketch.id,
      data: sketch,
      timestamp: Date.now(),
    });
    updateSyncState({ pendingChanges: syncState.pendingChanges + 1 });
    return;
  }

  const authState = getAuthState();
  if (!authState.isSignedIn) {
    return;
  }

  try {
    updateSyncState({ isSyncing: true });

    // Check if sketch exists in cloud (has UUID format)
    const isCloudSketch = sketch.id && /^[0-9a-f-]{36}$/i.test(sketch.id);
    
    if (isCloudSketch) {
      // Update existing sketch
      await updateSketchInCloud(sketch.id, {
        name: sketch.name,
        creationDate: sketch.creationDate,
        nodes: sketch.nodes,
        edges: sketch.edges,
        adminConfig: sketch.adminConfig,
      });
    } else {
      // Create new sketch in cloud
      const cloudSketch = await createSketchInCloud({
        name: sketch.name,
        creationDate: sketch.creationDate,
        nodes: sketch.nodes,
        edges: sketch.edges,
        adminConfig: sketch.adminConfig,
      });
      
      // Update local sketch with cloud ID
      sketch.id = cloudSketch.id;
      sketch.cloudSynced = true;
      await saveSketchToIdb(sketch);
    }

    updateSyncState({
      isSyncing: false,
      lastSyncTime: new Date(),
    });
  } catch (error) {
    console.error('Failed to sync sketch to cloud:', error);
    updateSyncState({
      isSyncing: false,
      error: error.message,
    });
    
    // Queue for later retry
    await enqueueSyncOperation({
      type: 'UPDATE',
      sketchId: sketch.id,
      data: sketch,
      timestamp: Date.now(),
    });
    updateSyncState({ pendingChanges: syncState.pendingChanges + 1 });
  }
}

/**
 * Debounced sync to cloud - called on every local change
 * @param {Object} sketch - Sketch to sync
 */
export function debouncedSyncToCloud(sketch) {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  
  saveDebounceTimer = setTimeout(() => {
    syncSketchToCloud(sketch);
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Delete a sketch from both local and cloud
 * @param {string} sketchId - Sketch ID
 */
export async function deleteSketchEverywhere(sketchId) {
  // Delete locally first
  await deleteSketchFromIdb(sketchId);

  // Delete from cloud if online
  if (navigator.onLine && getAuthState().isSignedIn) {
    try {
      await deleteSketchFromCloud(sketchId);
    } catch (error) {
      console.error('Failed to delete from cloud:', error);
      // Queue for later
      await enqueueSyncOperation({
        type: 'DELETE',
        sketchId,
        timestamp: Date.now(),
      });
    }
  } else {
    // Queue for later
    await enqueueSyncOperation({
      type: 'DELETE',
      sketchId,
      timestamp: Date.now(),
    });
  }
}

/**
 * Process queued sync operations
 * Called when coming back online
 */
export async function processSyncQueue() {
  if (!navigator.onLine || !getAuthState().isSignedIn) {
    return;
  }

  const operations = await drainSyncQueue();
  if (operations.length === 0) return;

  console.log(`Processing ${operations.length} queued sync operations`);
  updateSyncState({ isSyncing: true });

  let failedOps = [];

  for (const op of operations) {
    try {
      if (op.type === 'UPDATE') {
        await syncSketchToCloud(op.data);
      } else if (op.type === 'DELETE') {
        await deleteSketchFromCloud(op.sketchId);
      }
    } catch (error) {
      console.error('Failed to process sync op:', op, error);
      failedOps.push(op);
    }
  }

  // Re-queue failed operations
  for (const op of failedOps) {
    await enqueueSyncOperation(op);
  }

  updateSyncState({
    isSyncing: false,
    lastSyncTime: new Date(),
    pendingChanges: failedOps.length,
  });
}

/**
 * Initialize sync service
 * Sets up online/offline listeners
 */
export function initSyncService() {
  // Listen for online/offline events
  window.addEventListener('online', () => {
    updateSyncState({ isOnline: true });
    console.log('Back online - processing sync queue');
    processSyncQueue();
  });

  window.addEventListener('offline', () => {
    updateSyncState({ isOnline: false });
    console.log('Gone offline - changes will be queued');
  });

  // Initial sync on auth ready
  if (window.authGuard?.onAuthStateChange) {
    window.authGuard.onAuthStateChange((authState) => {
      if (authState.isSignedIn && authState.isLoaded) {
        // Small delay to ensure everything is ready
        setTimeout(() => {
          syncFromCloud().catch(console.error);
        }, 500);
      }
    });
  }
}

/**
 * Get current sync state
 * @returns {Object}
 */
export function getSyncState() {
  return { ...syncState };
}

// Export for use in legacy code
if (typeof window !== 'undefined') {
  window.syncService = {
    syncFromCloud,
    syncSketchToCloud,
    debouncedSyncToCloud,
    deleteSketchEverywhere,
    processSyncQueue,
    getSyncState,
    onSyncStateChange,
  };
}
