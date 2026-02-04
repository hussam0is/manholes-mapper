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

// Sync lock to prevent concurrent sync operations
let isSyncInProgress = false;

// Sync state listeners
const syncStateListeners = new Set();

// Debounce timer for save operations
let saveDebounceTimer = null;
const SAVE_DEBOUNCE_MS = 2000;

// API base URL - in development without vercel dev, API won't be available
// In production or with vercel dev, API is same-origin
const API_BASE = '';

// Flag to track if API is available (set to false after first failure in dev)
let apiAvailable = true;

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
  // Skip API calls if we've detected API isn't available (dev mode without vercel dev)
  if (!apiAvailable) {
    // Silent throw - this is expected in dev mode without vercel dev
    const error = new Error('API not available (development mode)');
    error.isExpectedDevError = true;
    throw error;
  }

  const token = await getToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const url = `${API_BASE}${endpoint}`;
  
  // Add a timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased to 30s for local dev stability

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    // Check if we got HTML back instead of JSON (common when API route doesn't exist)
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      apiAvailable = false;
      const devError = new Error('API not available - received non-JSON response');
      devError.isExpectedDevError = true;
      throw devError;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let errorMessage = errorData.error || `API error: ${response.status}`;
      
      // Include validation details if present
      if (errorData.details && Array.isArray(errorData.details)) {
        errorMessage += ': ' + errorData.details.join(', ');
        console.error('Validation errors:', errorData.details);
      }
      
      if (response.status === 401) {
        console.error('Authentication error. Is BETTER_AUTH_SECRET set in .env.local?');
        throw new Error(`Authentication failed (401). Please check your server configuration.`);
      }
      
      throw new Error(errorMessage);
    }

    // API is working, ensure flag is set
    apiAvailable = true;
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('API request timed out');
    }
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      apiAvailable = false;
      const devError = new Error('API not available (network error)');
      devError.isExpectedDevError = true;
      throw devError;
    }
    throw error;
  }
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
    // Check if this is a JSON parsing error (happens when server returns non-JSON)
    if (error instanceof SyntaxError && error.message.includes('Unexpected token')) {
      apiAvailable = false;
      const devError = new Error('API not available - received non-JSON response');
      devError.isExpectedDevError = true;
      throw devError;
    }
    // Don't log as error for expected "API not available" cases in dev mode
    if (error.isExpectedDevError || 
        error.message?.includes('API not available') || 
        error.message?.includes('network error')) {
      throw error; // Let syncFromCloud handle the logging
    }
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

  if (isSyncInProgress) {
    console.log('Sync already in progress, skipping concurrent call');
    return;
  }

  isSyncInProgress = true;
  updateSyncState({ isSyncing: true, error: null });

  try {
    console.log('Starting cloud sync...');
    // Fetch sketches from cloud
    const cloudSketches = await fetchSketchesFromCloud();
    console.log(`Fetched ${cloudSketches.length} sketches from cloud`);
    
    // Get local sketches
    const localSketches = await getAllSketchesFromIdb();
    
    // Update local cache with cloud data
    for (const cloudSketch of cloudSketches) {
      await saveSketchToIdb(cloudSketch);
    }
    
    // Compatibility: Update legacy localStorage library so the legacy UI sees the sketches
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const legacyLib = cloudSketches.map(s => ({
          id: s.id,
          name: s.name,
          creationDate: s.creationDate,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          nodes: s.nodes || [],
          edges: s.edges || [],
          adminConfig: s.adminConfig || {},
          projectId: s.projectId,
          // Include owner info for admin views
          ownerId: s.ownerId,
          ownerUsername: s.ownerUsername,
          ownerEmail: s.ownerEmail,
          isOwner: s.isOwner,
          createdBy: s.createdBy,
          lastEditedBy: s.lastEditedBy,
          cloudSynced: true
        }));
        window.localStorage.setItem('graphSketch.library', JSON.stringify(legacyLib));
        console.log(`Updated legacy localStorage with ${legacyLib.length} sketches`);
        
        // Trigger a re-render of the home panel if the legacy function is available
        if (typeof window.renderHome === 'function') {
          window.renderHome();
        }
      } catch (err) {
        console.warn('Failed to update legacy localStorage:', err);
      }
    }
    
    // Remove local sketches that don't exist in cloud
    // (only if they were previously synced - have cloud IDs)
    for (const localSketch of localSketches) {
      const existsInCloud = cloudSketches.some(cs => cs.id === localSketch.id);
      if (!existsInCloud && localSketch.cloudSynced) {
        await deleteSketchFromIdb(localSketch.id);
      }
    }

    // Run deduplication to clean up any local sketches that got synced
    // This handles cases where sk_xxx local IDs weren't cleaned up when synced to cloud UUID
    try {
      await cleanupDuplicateSketchesInternal();
    } catch (err) {
      console.warn('[Sync] Deduplication after sync failed:', err);
    }

    updateSyncState({
      isSyncing: false,
      lastSyncTime: new Date(),
      pendingChanges: 0,
    });

    console.log(`Synced ${cloudSketches.length} sketches from cloud successfully`);
    return cloudSketches;
  } catch (error) {
    // Check if this is an "API not available" error - don't show as error in dev
    const isApiUnavailable = error.isExpectedDevError ||
                             error.message?.includes('API not available') || 
                             error.message?.includes('network error') ||
                             error.message?.includes('non-JSON response') ||
                             (error instanceof SyntaxError && error.message.includes('Unexpected token'));
    
    if (isApiUnavailable) {
      // Only log once when first detected
      if (apiAvailable) {
        console.log('Cloud sync: API not available (development mode). Using local data only.');
      }
      apiAvailable = false;
      updateSyncState({
        isSyncing: false,
        error: null, // Don't show as error in dev mode
      });
      // Return empty array - app will use localStorage data
      return [];
    }
    
    console.error('Sync from cloud failed:', error);
    updateSyncState({
      isSyncing: false,
      error: error.message,
    });
    throw error;
  } finally {
    isSyncInProgress = false;
  }
}

// ============================================
// Sketch Lock Management
// ============================================

// Currently held lock
let currentLock = null;
let lockRefreshTimer = null;
const LOCK_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // Refresh every 15 minutes

/**
 * Acquire a lock on a sketch
 * @param {string} sketchId - Sketch ID to lock
 * @returns {Promise<{success: boolean, lock?: object, error?: string}>}
 */
export async function acquireSketchLock(sketchId) {
  if (!apiAvailable) {
    return { success: true, offline: true }; // Allow editing offline
  }
  
  if (!navigator.onLine) {
    return { success: true, offline: true }; // Allow editing offline
  }
  
  try {
    const response = await apiRequest(`/api/sketches/${sketchId}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'lock' }),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      currentLock = {
        sketchId,
        ...data.lock,
      };
      
      // Start refresh timer
      startLockRefreshTimer(sketchId);
      
      console.log('[SyncService] Lock acquired for sketch:', sketchId);
      return { success: true, lock: data.lock };
    } else {
      console.warn('[SyncService] Failed to acquire lock:', data.error);
      return { success: false, error: data.error, lock: data.lock };
    }
  } catch (error) {
    if (error.isExpectedDevError) {
      return { success: true, offline: true };
    }
    console.error('[SyncService] Error acquiring lock:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Release the current lock
 * @param {string} sketchId - Sketch ID to unlock
 * @returns {Promise<{success: boolean}>}
 */
export async function releaseSketchLock(sketchId) {
  // Stop refresh timer
  stopLockRefreshTimer();
  
  if (!apiAvailable || !navigator.onLine) {
    currentLock = null;
    return { success: true };
  }
  
  try {
    const response = await apiRequest(`/api/sketches/${sketchId}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'unlock' }),
    });
    
    currentLock = null;
    
    if (response.ok) {
      console.log('[SyncService] Lock released for sketch:', sketchId);
      return { success: true };
    } else {
      const data = await response.json();
      console.warn('[SyncService] Failed to release lock:', data.error);
      return { success: false, error: data.error };
    }
  } catch (error) {
    if (error.isExpectedDevError) {
      return { success: true };
    }
    console.error('[SyncService] Error releasing lock:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Refresh the current lock
 */
async function refreshCurrentLock() {
  if (!currentLock || !currentLock.sketchId) {
    return;
  }
  
  try {
    const response = await apiRequest(`/api/sketches/${currentLock.sketchId}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'refresh' }),
    });
    
    if (response.ok) {
      const data = await response.json();
      currentLock.lockExpiresAt = data.lockExpiresAt;
      console.log('[SyncService] Lock refreshed, expires at:', data.lockExpiresAt);
    } else {
      console.warn('[SyncService] Failed to refresh lock');
    }
  } catch (error) {
    console.error('[SyncService] Error refreshing lock:', error);
  }
}

/**
 * Start the lock refresh timer
 */
function startLockRefreshTimer(sketchId) {
  stopLockRefreshTimer();
  lockRefreshTimer = setInterval(refreshCurrentLock, LOCK_REFRESH_INTERVAL_MS);
}

/**
 * Stop the lock refresh timer
 */
function stopLockRefreshTimer() {
  if (lockRefreshTimer) {
    clearInterval(lockRefreshTimer);
    lockRefreshTimer = null;
  }
}

/**
 * Get the current lock status
 * @returns {object|null}
 */
export function getCurrentLock() {
  return currentLock;
}

/**
 * Check if we currently hold a lock for a sketch
 * @param {string} sketchId - Sketch ID
 * @returns {boolean}
 */
export function hasLockForSketch(sketchId) {
  return currentLock && currentLock.sketchId === sketchId;
}

// Release lock on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (currentLock && currentLock.sketchId) {
      // Use sendBeacon for reliable delivery during page unload
      const token = window.__authToken; // Need to store token globally for this
      if (token && navigator.sendBeacon) {
        navigator.sendBeacon(
          `/api/sketches/${currentLock.sketchId}`,
          JSON.stringify({ action: 'unlock' })
        );
      }
    }
  });
}

/**
 * Sync a single sketch to the cloud
 * Called after local changes with debouncing
 * @param {Object} sketch - Sketch to sync
 */
export async function syncSketchToCloud(sketch) {
  // Skip if API not available (dev mode)
  if (!apiAvailable) {
    console.log('Cloud sync skipped - API not available (development mode)');
    return;
  }

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

  if (isSyncInProgress) {
    console.log('Sync already in progress, queuing this update');
    await enqueueSyncOperation({
      type: 'UPDATE',
      sketchId: sketch.id,
      data: sketch,
      timestamp: Date.now(),
    });
    updateSyncState({ pendingChanges: syncState.pendingChanges + 1 });
    return;
  }

  isSyncInProgress = true;
  updateSyncState({ isSyncing: true });

  try {
    // Check if sketch exists in cloud (has UUID format)
    const isCloudSketch = sketch.id && /^[0-9a-f-]{36}$/i.test(sketch.id);
    
    // Log sketch data for debugging validation issues
    console.log(`Syncing sketch "${sketch.name}" (${sketch.id}):`, {
      nodesCount: sketch.nodes?.length ?? 0,
      edgesCount: sketch.edges?.length ?? 0,
      hasAdminConfig: !!sketch.adminConfig,
    });
    
    if (isCloudSketch) {
      // Update existing sketch
      await updateSketchInCloud(sketch.id, {
        name: sketch.name,
        creationDate: sketch.creationDate,
        nodes: sketch.nodes,
        edges: sketch.edges,
        adminConfig: sketch.adminConfig,
        lastEditedBy: sketch.lastEditedBy,
      });
    } else {
      // Create new sketch in cloud
      const oldId = sketch.id; // Remember old local ID for cleanup
      const cloudSketch = await createSketchInCloud({
        name: sketch.name,
        creationDate: sketch.creationDate,
        nodes: sketch.nodes,
        edges: sketch.edges,
        adminConfig: sketch.adminConfig,
        createdBy: sketch.createdBy,
        lastEditedBy: sketch.lastEditedBy,
      });
      
      // Update local sketch with cloud ID
      sketch.id = cloudSketch.id;
      sketch.cloudSynced = true;
      await saveSketchToIdb(sketch);
      
      // Also remove the old local ID from IndexedDB to prevent duplicates
      if (oldId && oldId !== cloudSketch.id) {
        try {
          await deleteSketchFromIdb(oldId);
        } catch (_) {
          // Ignore errors - old ID might not exist
        }
      }
      
      // Update localStorage to replace old ID with new UUID
      // This prevents duplicates when the legacy UI re-reads the library
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = window.localStorage.getItem('graphSketch.library');
          if (raw) {
            const lib = JSON.parse(raw);
            if (Array.isArray(lib)) {
              // Find entry with old ID and update it to new ID
              const idx = lib.findIndex(s => s.id === oldId);
              if (idx >= 0) {
                lib[idx] = { ...lib[idx], id: cloudSketch.id, cloudSynced: true };
                window.localStorage.setItem('graphSketch.library', JSON.stringify(lib));
                console.log(`Updated localStorage: ${oldId} → ${cloudSketch.id}`);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to update localStorage with new cloud ID:', err);
        }
      }
    }

    updateSyncState({
      isSyncing: false,
      lastSyncTime: new Date(),
    });
  } catch (error) {
    // Check if API became unavailable
    const isApiUnavailable = error.message?.includes('API not available');
    if (isApiUnavailable) {
      console.log('Cloud sync skipped - API not available (development mode)');
      updateSyncState({ isSyncing: false });
      return;
    }

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
  } finally {
    isSyncInProgress = false;
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

  // Skip cloud delete if API not available
  if (!apiAvailable) {
    console.log('Cloud delete skipped - API not available (development mode)');
    return;
  }

  // Delete from cloud if online
  if (navigator.onLine && getAuthState().isSignedIn) {
    try {
      await deleteSketchFromCloud(sketchId);
    } catch (error) {
      // Ignore API unavailable errors
      if (error.message?.includes('API not available')) {
        console.log('Cloud delete skipped - API not available (development mode)');
        return;
      }
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
 * Reset API availability flag - call when environment changes
 * or when user wants to retry cloud connection
 */
export function resetApiAvailability() {
  apiAvailable = true;
  console.log('API availability reset - will retry on next request');
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

  if (isSyncInProgress) {
    console.log('Sync already in progress, will retry processing queue later');
    return;
  }

  console.log(`Processing ${operations.length} queued sync operations`);
  isSyncInProgress = true;
  updateSyncState({ isSyncing: true });

  let failedOps = [];

  try {
    for (const op of operations) {
      try {
        if (op.type === 'UPDATE') {
          // Internal call - we already have the lock
          // We bypass the check in syncSketchToCloud by calling its logic directly
          // or just letting it fail the lock check and re-queue.
          // Actually, let's just use the syncSketchToCloud logic but without the lock check.
          
          const isCloudSketch = op.data.id && /^[0-9a-f-]{36}$/i.test(op.data.id);
          if (isCloudSketch) {
            await updateSketchInCloud(op.data.id, {
              name: op.data.name,
              creationDate: op.data.creationDate,
              nodes: op.data.nodes,
              edges: op.data.edges,
              adminConfig: op.data.adminConfig,
              lastEditedBy: op.data.lastEditedBy,
            });
          } else {
            const cloudSketch = await createSketchInCloud({
              name: op.data.name,
              creationDate: op.data.creationDate,
              nodes: op.data.nodes,
              edges: op.data.edges,
              adminConfig: op.data.adminConfig,
              createdBy: op.data.createdBy,
              lastEditedBy: op.data.lastEditedBy,
            });
            op.data.id = cloudSketch.id;
            op.data.cloudSynced = true;
            await saveSketchToIdb(op.data);
          }
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
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Compute a simple content hash for a sketch to identify duplicates.
 * Uses creationDate + node count + edge count + first/last node IDs as a fingerprint.
 * @param {Object} sketch - Sketch object
 * @returns {string} Content hash
 */
function computeSketchFingerprint(sketch) {
  const nodes = sketch.nodes || [];
  const edges = sketch.edges || [];
  const creationDate = sketch.creationDate || sketch.createdAt || '';
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const firstNodeId = nodes[0]?.id || '';
  const lastNodeId = nodes[nodes.length - 1]?.id || '';
  const name = sketch.name || '';
  
  return `${creationDate}|${nodeCount}|${edgeCount}|${firstNodeId}|${lastNodeId}|${name}`;
}

/**
 * Check if a sketch ID is a cloud UUID format
 * @param {string} id - Sketch ID
 * @returns {boolean}
 */
function isCloudId(id) {
  return id && /^[0-9a-f-]{36}$/i.test(id);
}

/**
 * Deduplicate sketches by removing local versions that have cloud counterparts.
 * This handles the case where a sketch was created locally (sk_xxx ID) and later
 * synced to cloud (UUID), resulting in two entries with the same content.
 * 
 * @param {Array} sketches - Array of sketch objects
 * @returns {Object} { deduplicated: Array, removedCount: number, removedIds: Array }
 */
export function deduplicateSketches(sketches) {
  if (!Array.isArray(sketches) || sketches.length === 0) {
    return { deduplicated: sketches, removedCount: 0, removedIds: [] };
  }
  
  // Group sketches by fingerprint
  const fingerprintGroups = new Map();
  
  for (const sketch of sketches) {
    const fingerprint = computeSketchFingerprint(sketch);
    if (!fingerprintGroups.has(fingerprint)) {
      fingerprintGroups.set(fingerprint, []);
    }
    fingerprintGroups.get(fingerprint).push(sketch);
  }
  
  const deduplicated = [];
  const removedIds = [];
  
  for (const [_fingerprint, group] of fingerprintGroups) {
    if (group.length === 1) {
      // No duplicates for this fingerprint
      deduplicated.push(group[0]);
    } else {
      // Multiple sketches with same fingerprint - keep the cloud version
      // Sort: cloud IDs first, then by updatedAt (newest first)
      group.sort((a, b) => {
        const aIsCloud = isCloudId(a.id);
        const bIsCloud = isCloudId(b.id);
        if (aIsCloud && !bIsCloud) return -1;
        if (!aIsCloud && bIsCloud) return 1;
        // Both are cloud or both are local - prefer newer
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      
      // Keep the first (best) version, mark others as duplicates
      deduplicated.push(group[0]);
      for (let i = 1; i < group.length; i++) {
        removedIds.push(group[i].id);
      }
    }
  }
  
  return { deduplicated, removedCount: removedIds.length, removedIds };
}

/**
 * Internal cleanup function - doesn't refresh UI (called during sync)
 * @returns {Promise<Object>} { removedCount: number, removedIds: Array }
 */
async function cleanupDuplicateSketchesInternal() {
  let totalRemoved = 0;
  const allRemovedIds = [];
  
  // 1. Clean up localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem('graphSketch.library');
      if (raw) {
        const lib = JSON.parse(raw);
        if (Array.isArray(lib)) {
          const { deduplicated, removedCount, removedIds } = deduplicateSketches(lib);
          if (removedCount > 0) {
            window.localStorage.setItem('graphSketch.library', JSON.stringify(deduplicated));
            console.log(`[Sync] Removed ${removedCount} duplicate(s) from localStorage:`, removedIds);
            totalRemoved += removedCount;
            allRemovedIds.push(...removedIds);
          }
        }
      }
    } catch (err) {
      console.warn('[Sync] Failed to dedupe localStorage:', err);
    }
  }
  
  // 2. Clean up IndexedDB
  try {
    const idbSketches = await getAllSketchesFromIdb();
    const { deduplicated, removedCount, removedIds } = deduplicateSketches(idbSketches);
    if (removedCount > 0) {
      // Delete the duplicate entries from IndexedDB
      for (const id of removedIds) {
        try {
          await deleteSketchFromIdb(id);
        } catch (_) {
          // Ignore individual delete errors
        }
      }
      console.log(`[Sync] Removed ${removedCount} duplicate(s) from IndexedDB:`, removedIds);
      totalRemoved += removedCount;
      // Only add IDs not already in allRemovedIds
      for (const id of removedIds) {
        if (!allRemovedIds.includes(id)) {
          allRemovedIds.push(id);
        }
      }
    }
  } catch (err) {
    console.warn('[Sync] Failed to dedupe IndexedDB:', err);
  }
  
  if (totalRemoved > 0) {
    console.log(`[Sync] Duplicate cleanup complete. Total removed: ${totalRemoved}`);
  }
  
  return { removedCount: totalRemoved, removedIds: allRemovedIds };
}

/**
 * Clean up duplicate sketches from all storage locations.
 * This should be called after sync or when duplicates are detected.
 * 
 * @returns {Promise<Object>} { removedCount: number, removedIds: Array }
 */
export async function cleanupDuplicateSketches() {
  console.log('[Sync] Starting duplicate sketch cleanup...');
  
  const result = await cleanupDuplicateSketchesInternal();
  
  if (result.removedCount > 0) {
    // Trigger UI refresh if available
    if (typeof window !== 'undefined' && typeof window.renderHome === 'function') {
      window.renderHome();
    }
  } else {
    console.log('[Sync] No duplicate sketches found.');
  }
  
  return result;
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
          syncFromCloud().catch((error) => {
            // Don't log expected "API not available" errors in dev mode
            if (error.message?.includes('API not available') || 
                error.message?.includes('network error') ||
                error.message?.includes('non-JSON response')) {
              // Already handled - silent in dev mode
              return;
            }
            console.error('Sync error:', error);
          });
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
    resetApiAvailability,
    deduplicateSketches,
    cleanupDuplicateSketches,
  };
}
