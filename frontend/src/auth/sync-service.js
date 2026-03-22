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

import { getToken, getAuthState } from './auth-guard.js';
import {
  saveSketch as saveSketchToIdb,
  getAllSketches as getAllSketchesFromIdb,
  deleteSketch as deleteSketchFromIdb,
  enqueueSyncOperation,
  drainSyncQueue,
  removeSyncQueueItem,
} from '../db.js';

// Retry configuration for exponential backoff
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Sleep for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate the delay for a given retry attempt using exponential backoff with jitter.
 * @param {number} attempt - Zero-based retry attempt number
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffDelay(attempt) {
  const delay = Math.min(
    RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
    RETRY_CONFIG.maxDelayMs
  );
  // Add jitter (±25%) to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(delay + jitter));
}

/**
 * Execute an async function with retry logic and exponential backoff.
 * Only retries on transient errors (network, 5xx, 429). Non-retryable errors
 * (4xx except 429, auth errors) are thrown immediately.
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} [options]
 * @param {number} [options.maxRetries] - Override default max retries
 * @param {string} [options.operationName] - Name for logging
 * @returns {Promise<*>} Result of the function
 */
export async function withRetry(fn, options = {}) {
  const maxRetries = options.maxRetries ?? RETRY_CONFIG.maxRetries;
  const operationName = options.operationName ?? 'operation';
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry non-transient errors
      const statusCode = error.statusCode || 0;
      const isTransient =
        !statusCode || // Network errors (no status code)
        statusCode === 429 || // Rate limited
        statusCode >= 500; // Server errors

      // Don't retry expected dev errors or auth errors
      if (error.isExpectedDevError || statusCode === 401 || statusCode === 403) {
        throw error;
      }

      if (!isTransient || attempt >= maxRetries) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt);
      console.debug(
        `[Sync] ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), ` +
        `retrying in ${delay}ms: ${error.message}`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

// Sync health monitoring — tracks success/failure rates for diagnostics
const syncHealth = {
  totalAttempts: 0,
  successCount: 0,
  failureCount: 0,
  lastFailureTime: null,
  lastFailureMessage: null,
  consecutiveFailures: 0,
};

// Sync state
let syncState = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSyncTime: null,
  pendingChanges: 0,
  error: null,
  // Queue status fields
  queueSize: 0,
  // Health monitoring fields
  healthStatus: 'healthy', // 'healthy' | 'degraded' | 'unhealthy'
  successRate: 1,
  consecutiveFailures: 0,
};

// Sync lock to prevent concurrent sync operations
let isSyncInProgress = false;

// Sync state listeners
const syncStateListeners = new Set();

// Debounce timer for save operations
let saveDebounceTimer = null;
const SAVE_DEBOUNCE_MS = 2000;

// AbortController for online/offline event listeners registered in initSyncService.
// Replaced on every re-call to prevent duplicate listener accumulation.
let listenerAbortController = null;

// Debounce timer for the online-event handler (guards against rapid LTE→WiFi flapping).
let onlineDebounceTimer = null;
const ONLINE_DEBOUNCE_MS = 2000;

// Unsubscribe function for the auth state listener registered in initSyncService().
// Tracked here so re-calling initSyncService() unsubscribes the old listener first,
// preventing auth listener accumulation.
let authListenerUnsub = null;

// UUID validation regex — matches the server-side pattern in api/_lib/validators.js.
// Used to skip cloud sync for legacy local-only sketch IDs (e.g. sk_xxx).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a sketch ID is a valid UUID suitable for cloud API calls.
 * Legacy local IDs (e.g. `sk_1234`, numeric strings) will return false.
 * @param {string} id
 * @returns {boolean}
 */
function isValidCloudUUID(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

/**
 * Compare local and server sketch data to determine if a real structural
 * conflict exists (different nodes/edges) or only metadata differs.
 *
 * @param {Object} local  - Local sketch payload (the data we tried to PUT)
 * @param {Object} server - Server sketch returned in the 409 response
 * @returns {{ hasConflict: boolean, localNodeCount?: number, serverNodeCount?: number, localEdgeCount?: number, serverEdgeCount?: number }}
 */
export function compareSketchData(local, server) {
  const localNodes = local.nodes || [];
  const serverNodes = server.nodes || [];
  const localEdges = local.edges || [];
  const serverEdges = server.edges || [];

  // Quick length check
  if (localNodes.length !== serverNodes.length || localEdges.length !== serverEdges.length) {
    return {
      hasConflict: true,
      localNodeCount: localNodes.length,
      serverNodeCount: serverNodes.length,
      localEdgeCount: localEdges.length,
      serverEdgeCount: serverEdges.length,
    };
  }

  // Deep comparison of node key fields (id, x, y, surveyX, surveyY, type)
  for (let i = 0; i < localNodes.length; i++) {
    const ln = localNodes[i];
    const sn = serverNodes[i];
    if (
      ln.id !== sn.id ||
      ln.x !== sn.x ||
      ln.y !== sn.y ||
      ln.surveyX !== sn.surveyX ||
      ln.surveyY !== sn.surveyY ||
      ln.type !== sn.type
    ) {
      return {
        hasConflict: true,
        localNodeCount: localNodes.length,
        serverNodeCount: serverNodes.length,
        localEdgeCount: localEdges.length,
        serverEdgeCount: serverEdges.length,
      };
    }
  }

  // Deep comparison of edge key fields (id, from, to, length, type)
  for (let i = 0; i < localEdges.length; i++) {
    const le = localEdges[i];
    const se = serverEdges[i];
    if (
      le.id !== se.id ||
      le.from !== se.from ||
      le.to !== se.to ||
      le.length !== se.length ||
      le.type !== se.type
    ) {
      return {
        hasConflict: true,
        localNodeCount: localNodes.length,
        serverNodeCount: serverNodes.length,
        localEdgeCount: localEdges.length,
        serverEdgeCount: serverEdges.length,
      };
    }
  }

  // Only metadata differs — no structural conflict
  return { hasConflict: false };
}

/**
 * Save a conflict backup to localStorage so the user can recover their local
 * changes if needed. Keeps at most 5 backups (oldest are evicted).
 *
 * @param {string} sketchId
 * @param {Object} localData - The local sketch payload that was overridden
 * @param {string} sketchName - Human-readable sketch name for the toast
 */

/**
 * Merge local and server sketch data using a union strategy.
 * 
 * Strategy:
 * - Nodes: union by ID. If both sides have the same node ID, prefer the server version.
 * - Edges: union by ID with the same preference logic.
 * - This produces a "best effort" merge that preserves work from both sides.
 *
 * @param {Object} local  - Local sketch payload
 * @param {Object} server - Server sketch data
 * @returns {{ nodes: Array, edges: Array, mergeInfo: { addedNodes: number, addedEdges: number, conflictingNodes: number, conflictingEdges: number } }}
 */
export function mergeSketchData(local, server) {
  const localNodes = local.nodes || [];
  const serverNodes = server.nodes || [];
  const localEdges = local.edges || [];
  const serverEdges = server.edges || [];

  const serverNodeMap = new Map(serverNodes.map(n => [n.id, n]));
  const serverEdgeMap = new Map(serverEdges.map(e => [e.id, e]));
  const localNodeMap = new Map(localNodes.map(n => [n.id, n]));
  const localEdgeMap = new Map(localEdges.map(e => [e.id, e]));

  let addedNodes = 0;
  let addedEdges = 0;
  let conflictingNodes = 0;
  let conflictingEdges = 0;

  // Start with server nodes (authoritative base), then add local-only nodes
  const mergedNodeMap = new Map(serverNodeMap);
  for (const [id, localNode] of localNodeMap) {
    if (!mergedNodeMap.has(id)) {
      mergedNodeMap.set(id, localNode);
      addedNodes++;
    } else {
      const serverNode = mergedNodeMap.get(id);
      const differs =
        localNode.x !== serverNode.x ||
        localNode.y !== serverNode.y ||
        localNode.type !== serverNode.type;
      if (differs) conflictingNodes++;
    }
  }

  const mergedEdgeMap = new Map(serverEdgeMap);
  for (const [id, localEdge] of localEdgeMap) {
    if (!mergedEdgeMap.has(id)) {
      mergedEdgeMap.set(id, localEdge);
      addedEdges++;
    } else {
      const serverEdge = mergedEdgeMap.get(id);
      const differs =
        localEdge.from !== serverEdge.from ||
        localEdge.to !== serverEdge.to ||
        localEdge.length !== serverEdge.length;
      if (differs) conflictingEdges++;
    }
  }

  return {
    nodes: Array.from(mergedNodeMap.values()),
    edges: Array.from(mergedEdgeMap.values()),
    mergeInfo: { addedNodes, addedEdges, conflictingNodes, conflictingEdges },
  };
}

function saveConflictBackup(sketchId, localData, sketchName) {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const MAX_BACKUPS = 5;
  const key = `conflict_backup_${sketchId}_${Date.now()}`;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      sketchId,
      sketchName,
      savedAt: new Date().toISOString(),
      data: localData,
    }));

    // Evict oldest backups if we exceed the limit
    const allKeys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('conflict_backup_')) {
        allKeys.push(k);
      }
    }
    if (allKeys.length > MAX_BACKUPS) {
      allKeys.sort(); // Chronological — timestamp is at the end
      const toRemove = allKeys.slice(0, allKeys.length - MAX_BACKUPS);
      for (const old of toRemove) {
        window.localStorage.removeItem(old);
      }
    }
  } catch (err) {
    console.warn('[Sync] Failed to save conflict backup:', err);
  }
}

// API base URL - in development without vercel dev, API won't be available
// In production or with vercel dev, API is same-origin
const API_BASE = '';

// Flag to track if API is available (set to false after first failure in dev)
let apiAvailable = true;

/**
 * Read the csrf_token cookie set by the server (double-submit cookie pattern).
 * Returns the token string, or null if the cookie is not present.
 */
function getCsrfCookie() {
  try {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Optimistic locking: tracks the integer `version` counter that the server returned
// for each sketch on the last successful fetch or save. Used as `clientVersion`
// in PUT requests so the server can detect if another process (e.g. a DB fix script)
// has updated the sketch since we last synced. Integer comparison is deterministic
// and immune to clock/precision issues unlike the old timestamp-based approach.
// Key: sketchId (UUID), Value: integer version number
const lastKnownServerVersion = new Map();

/**
 * Record a sync success for health monitoring.
 */
function recordSyncSuccess() {
  syncHealth.totalAttempts++;
  syncHealth.successCount++;
  syncHealth.consecutiveFailures = 0;
  _updateHealthStatus();
}

/**
 * Record a sync failure for health monitoring.
 * @param {string} message - Error message
 */
function recordSyncFailure(message) {
  syncHealth.totalAttempts++;
  syncHealth.failureCount++;
  syncHealth.consecutiveFailures++;
  syncHealth.lastFailureTime = new Date();
  syncHealth.lastFailureMessage = message;
  _updateHealthStatus();
}

/**
 * Derive the health status from recorded metrics.
 * healthy: success rate >= 90% and <= 2 consecutive failures
 * degraded: success rate >= 50% or <= 5 consecutive failures
 * unhealthy: otherwise
 */
function _updateHealthStatus() {
  const rate = syncHealth.totalAttempts > 0
    ? syncHealth.successCount / syncHealth.totalAttempts
    : 1;
  let status = 'healthy';
  if (syncHealth.consecutiveFailures > 5 || rate < 0.5) {
    status = 'unhealthy';
  } else if (syncHealth.consecutiveFailures > 2 || rate < 0.9) {
    status = 'degraded';
  }
  updateSyncState({
    healthStatus: status,
    successRate: Math.round(rate * 100) / 100,
    consecutiveFailures: syncHealth.consecutiveFailures,
  });
}

/**
 * Get the current sync health metrics.
 * @returns {Object}
 */
export function getSyncHealth() {
  return { ...syncHealth };
}

/**
 * Reset sync health counters (e.g. after login or manual reset).
 */
export function resetSyncHealth() {
  syncHealth.totalAttempts = 0;
  syncHealth.successCount = 0;
  syncHealth.failureCount = 0;
  syncHealth.lastFailureTime = null;
  syncHealth.lastFailureMessage = null;
  syncHealth.consecutiveFailures = 0;
  _updateHealthStatus();
}

/**
 * Refresh the queue status by peeking at the current queue size.
 * Updates syncState with the current queue info.
 */
export async function refreshQueueStatus() {
  try {
    const operations = await drainSyncQueue();
    // Re-enqueue drained items (non-destructive peek)
    for (const op of operations) {
      await enqueueSyncOperation(op);
    }
    updateSyncState({
      queueSize: operations.length,
      pendingChanges: operations.length,
    });
    return operations.length;
  } catch (err) {
    console.warn('[Sync] Failed to refresh queue status:', err);
    return syncState.queueSize;
  }
}

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
    try { cb({ ...syncState }); } catch (e) { console.warn('[SyncService] Listener error:', e); }
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
    ...options.headers,
  };

  // Attach CSRF token for mutating requests (double-submit cookie pattern)
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    const csrfToken = getCsrfCookie();
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
  }

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
      // CSRF bootstrap: server set the csrf_token cookie but rejected this
      // request because no header was sent yet. Retry once with the new cookie.
      if (response.status === 403 && !options._csrfRetried) {
        const body403 = await response.json().catch(() => ({}));
        if (body403.error && body403.error.includes('CSRF')) {
          console.debug('[Sync] CSRF token bootstrapped, retrying request');
          return apiRequest(endpoint, { ...options, _csrfRetried: true });
        }
      }

      // Allow callers to handle 409 Conflict themselves (optimistic locking)
      if (response.status === 409 && options.bypassThrowOnConflict) {
        return response;
      }

      const errorData = await response.json().catch(() => ({}));
      let errorMessage = errorData.error || `API error: ${response.status}`;

      // Include validation details if present
      if (errorData.details && Array.isArray(errorData.details)) {
        errorMessage += ': ' + errorData.details.join(', ');
        console.error('[Sync] Validation errors:', errorData.details);
      }

      // Build a descriptive error with status code for the UI to provide
      // user-friendly messages (session expired, rate limited, server error)
      const err = new Error(errorMessage);
      err.statusCode = response.status;

      if (response.status === 401) {
        console.error('[Sync] Authentication failed (401). Check server auth configuration.');
      }

      throw err;
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
    console.error('[Sync] Failed to fetch sketches from cloud:', error);
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
 * Fetch a single sketch with full data (nodes, edges, adminConfig) from the cloud.
 * Used for lazy-loading when only metadata was synced.
 * @param {string} sketchId
 * @returns {Promise<Object>} Full sketch data
 */
export async function fetchSketchFromCloud(sketchId) {
  // Reject legacy non-UUID IDs before hitting the API
  if (!isValidCloudUUID(sketchId)) {
    throw new Error(`Cannot fetch sketch with legacy ID "${sketchId}" from cloud`);
  }

  const response = await apiRequest(`/api/sketches/${sketchId}`, { method: 'GET' });
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
    bypassThrowOnConflict: true,
  });
  if (response.status === 409) {
    const conflictData = await response.json().catch(() => ({}));
    return { _conflict: true, currentSketch: conflictData.currentSketch || null };
  }
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
    console.warn('[Sync] Cannot sync: not signed in');
    return;
  }

  if (!navigator.onLine) {
    console.debug('[Sync] Offline — loading from cache');
    return;
  }

  if (isSyncInProgress) {
    console.debug('[Sync] Sync already in progress, skipping');
    return;
  }

  isSyncInProgress = true;
  updateSyncState({ isSyncing: true, error: null });

  try {
    console.debug('[Sync] Starting cloud sync...');
    // Fetch sketches from cloud
    const cloudSketches = await fetchSketchesFromCloud();
    console.debug(`[Sync] Fetched ${cloudSketches.length} sketches from cloud`);
    
    // Get local sketches
    const localSketches = await getAllSketchesFromIdb();
    
    // Update local cache with cloud data
    for (const cloudSketch of cloudSketches) {
      await saveSketchToIdb(cloudSketch);
      // Track server version for optimistic locking
      if (cloudSketch.id && cloudSketch.version != null) {
        lastKnownServerVersion.set(cloudSketch.id, cloudSketch.version);
      }
    }
    
    // Compatibility: Update legacy localStorage library so the legacy UI sees the sketches
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        // Build updated library, preserving local full data when cloud returns metadata-only
        const existingRaw = window.localStorage.getItem('graphSketch.library');
        const existingLib = existingRaw ? JSON.parse(existingRaw) : [];
        const existingMap = new Map(existingLib.filter(s => s.id).map(s => [s.id, s]));

        const legacyLib = cloudSketches.map(s => {
          const existing = existingMap.get(s.id);
          const hasFullData = !!s.nodes;
          // Preserve locally-stored full data if cloud response is metadata-only
          const localHasData = existing && !existing.metadataOnly && Array.isArray(existing.nodes);
          return {
            id: s.id,
            name: s.name,
            creationDate: s.creationDate,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            projectId: s.projectId,
            // Include owner info for admin views
            ownerId: s.ownerId,
            ownerUsername: s.ownerUsername,
            ownerEmail: s.ownerEmail,
            isOwner: s.isOwner,
            createdBy: s.createdBy,
            lastEditedBy: s.lastEditedBy,
            cloudSynced: true,
            // Node/edge counts from API metadata (always accurate)
            nodeCount: s.nodeCount ?? (hasFullData ? s.nodes.length : (existing?.nodeCount ?? 0)),
            edgeCount: s.edgeCount ?? (hasFullData ? s.edges.length : (existing?.edgeCount ?? 0)),
            // Mark if this is metadata-only (full data fetched on open via GET /api/sketches/[id])
            metadataOnly: !hasFullData && !localHasData,
            // Preserve local full data if cloud response is metadata-only
            nodes: hasFullData ? s.nodes : (localHasData ? existing.nodes : []),
            edges: hasFullData ? s.edges : (localHasData ? existing.edges : []),
            adminConfig: hasFullData ? (s.adminConfig || {}) : (localHasData ? (existing.adminConfig || {}) : {}),
          };
        });
        window.localStorage.setItem('graphSketch.library', JSON.stringify(legacyLib));
        // Invalidate the in-memory library cache so getLibrary() reads the fresh data
        if (typeof window.invalidateLibraryCache === 'function') {
          window.invalidateLibraryCache();
        }
        console.debug(`[Sync] Updated legacy localStorage with ${legacyLib.length} sketches`);

        // NOTE: We do NOT call window.renderHome() here — that would force-open the
        // home panel even when the user is on the canvas.  The onSyncStateChange
        // listener in main.js already re-renders the panel *only* if it is already
        // visible.
      } catch (err) {
        console.warn('[Sync] Failed to update legacy localStorage:', err);
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

    console.debug(`[Sync] Synced ${cloudSketches.length} sketches from cloud successfully`);
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
        console.debug('[Sync] API not available (development mode). Using local data only.');
      }
      apiAvailable = false;
      updateSyncState({
        isSyncing: false,
        error: null, // Don't show as error in dev mode
      });
      // Return empty array - app will use localStorage data
      return [];
    }
    
    console.error('[Sync] Cloud sync failed:', error);
    updateSyncState({
      isSyncing: false,
      error: error.message,
      errorStatusCode: error.statusCode || null,
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
  // Allow editing legacy sketches without a lock — they aren't in the cloud
  if (sketchId && !isValidCloudUUID(sketchId)) {
    return { success: true, offline: true };
  }

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
      
      console.debug('[Sync] Lock acquired for sketch:', sketchId);
      return { success: true, lock: data.lock };
    } else {
      console.warn('[Sync] Failed to acquire lock:', data.error);
      return { success: false, error: data.error, lock: data.lock };
    }
  } catch (error) {
    if (error.isExpectedDevError) {
      return { success: true, offline: true };
    }
    console.error('[Sync] Error acquiring lock:', error);
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

  // Legacy IDs never acquired a cloud lock — nothing to release
  if (sketchId && !isValidCloudUUID(sketchId)) {
    currentLock = null;
    return { success: true };
  }

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
      console.debug('[Sync] Lock released for sketch:', sketchId);
      return { success: true };
    } else {
      const data = await response.json();
      console.warn('[Sync] Failed to release lock:', data.error);
      return { success: false, error: data.error };
    }
  } catch (error) {
    if (error.isExpectedDevError) {
      return { success: true };
    }
    console.error('[Sync] Error releasing lock:', error);
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
      console.debug('[Sync] Lock refreshed, expires at:', data.lockExpiresAt);
    } else {
      console.warn('[Sync] Failed to refresh lock');
    }
  } catch (error) {
    console.error('[Sync] Error refreshing lock:', error);
  }
}

/**
 * Start the lock refresh timer
 */
function startLockRefreshTimer(_sketchId) {
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

// Release lock on page unload using sendBeacon, which sends cookies automatically
// for same-origin requests — no token is needed since the app uses cookie-based auth.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (currentLock && currentLock.sketchId && navigator.sendBeacon && isValidCloudUUID(currentLock.sketchId)) {
      // sendBeacon requires a Blob with an explicit content-type so the server-side
      // JSON parser receives the correct MIME type (text/plain is the default).
      const payload = new Blob(
        [JSON.stringify({ action: 'unlock' })],
        { type: 'application/json' }
      );
      navigator.sendBeacon(`/api/sketches/${currentLock.sketchId}`, payload);
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
    console.debug('[Sync] Cloud sync skipped — API not available');
    return;
  }

  // Skip sync for legacy non-UUID sketch IDs (e.g. sk_xxx) — the API
  // requires a valid UUID and would return 400. Legacy sketches remain
  // in local storage untouched; they just won't sync to the cloud.
  // This check is before the offline queue to prevent legacy IDs from
  // being enqueued in the first place.
  if (sketch.id && !isValidCloudUUID(sketch.id)) {
    console.warn(`[Sync] Skipping cloud sync for legacy sketch ID "${sketch.id}" (not a valid UUID)`);
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

  // Never sync empty sketches
  const nodesEmpty = !sketch.nodes || sketch.nodes.length === 0;
  const edgesEmpty = !sketch.edges || sketch.edges.length === 0;
  if (nodesEmpty && edgesEmpty) {
    console.debug('[Sync] Skipping cloud sync for empty sketch:', sketch.id);
    return;
  }

  if (isSyncInProgress) {
    console.debug('[Sync] Sync in progress, queuing update');
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
    const isCloudSketch = isValidCloudUUID(sketch.id);
    
    // Log sketch data for debugging validation issues
    console.debug(`[Sync] Syncing sketch "${sketch.name}" (${sketch.id}):`, {
      nodesCount: sketch.nodes?.length ?? 0,
      edgesCount: sketch.edges?.length ?? 0,
      hasAdminConfig: !!sketch.adminConfig,
    });
    
    if (isCloudSketch) {
      // Update existing sketch — include clientVersion for deterministic optimistic locking
      const knownVersion = lastKnownServerVersion.get(sketch.id);
      const putPayload = {
        name: sketch.name,
        creationDate: sketch.creationDate,
        nodes: sketch.nodes,
        edges: sketch.edges,
        adminConfig: sketch.adminConfig,
        lastEditedBy: sketch.lastEditedBy,
        projectId: sketch.projectId,
        clientVersion: knownVersion != null ? knownVersion : null,
      };

      let result = await updateSketchInCloud(sketch.id, putPayload);

      if (result?._conflict) {
        const serverSketch = result.currentSketch;
        const serverVersion = serverSketch?.version;
        console.warn(`[Sync] Version conflict for sketch ${sketch.id} — server v${serverVersion ?? '?'}, local v${knownVersion ?? '?'}.`);

        if (serverSketch) {
          const comparison = compareSketchData(putPayload, serverSketch);

          if (!comparison.hasConflict) {
            // Only metadata differs — auto-merge: take server nodes/edges, keep local metadata
            console.debug(`[Sync] Conflict is metadata-only for sketch ${sketch.id} — auto-merging.`);
            result = await updateSketchInCloud(sketch.id, {
              ...putPayload,
              nodes: serverSketch.nodes,
              edges: serverSketch.edges,
              clientVersion: serverVersion != null ? serverVersion : null,
            });
            if (result?._conflict) {
              console.error(`[Sync] Auto-merge retry also failed for sketch ${sketch.id} — giving up for this cycle.`);
              result = null;
            }
          } else {
            // Structural conflict — nodes/edges differ.
            // Save local version as backup, accept server version.
            console.warn(
              `[Sync] Structural conflict for sketch ${sketch.id}: ` +
              `local ${comparison.localNodeCount} nodes / ${comparison.localEdgeCount} edges vs ` +
              `server ${comparison.serverNodeCount} nodes / ${comparison.serverEdgeCount} edges. ` +
              `Accepting server version and backing up local changes.`
            );

            saveConflictBackup(sketch.id, putPayload, sketch.name || sketch.id);

            // Accept the server version into local storage
            const serverData = {
              ...sketch,
              nodes: serverSketch.nodes || [],
              edges: serverSketch.edges || [],
              adminConfig: serverSketch.adminConfig || sketch.adminConfig || {},
              updatedAt: serverSketch.updatedAt,
            };
            await saveSketchToIdb(serverData);

            // Update legacy localStorage
            if (typeof window !== 'undefined' && window.localStorage) {
              try {
                const raw = window.localStorage.getItem('graphSketch.library');
                if (raw) {
                  const lib = JSON.parse(raw);
                  if (Array.isArray(lib)) {
                    const idx = lib.findIndex(s => s.id === sketch.id);
                    if (idx >= 0) {
                      lib[idx] = { ...lib[idx], ...serverData };
                      window.localStorage.setItem('graphSketch.library', JSON.stringify(lib));
                      if (typeof window.invalidateLibraryCache === 'function') {
                        window.invalidateLibraryCache();
                      }
                    }
                  }
                }
              } catch (err) {
                console.warn('[Sync] Failed to update localStorage after conflict resolution:', err);
              }
            }

            // Notify user
            const displayName = sketch.name || sketch.id;
            if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
              window.showToast(
                typeof window.t === 'function'
                  ? window.t('auth.conflictDetected', displayName)
                  : `Sync conflict detected for sketch '${displayName}'. Your local changes were saved as a backup.`
              );
            }

            // Track the server version so the next save uses it
            if (serverVersion != null) {
              lastKnownServerVersion.set(sketch.id, serverVersion);
            }
            // Don't set result — we intentionally did NOT push local data
            result = null;
          }
        } else {
          // No server sketch data in 409 response — cannot compare. Give up for this cycle.
          console.error(`[Sync] Conflict for sketch ${sketch.id} but no server data returned — giving up.`);
          result = null;
        }
      }

      // Track the server's new version for the next save
      if (result && !result._conflict && result.version != null) {
        lastKnownServerVersion.set(sketch.id, result.version);
      }
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
        projectId: sketch.projectId,
      });
      
      // Update local sketch with cloud ID
      sketch.id = cloudSketch.id;
      sketch.cloudSynced = true;
      await saveSketchToIdb(sketch);

      // Also remove the old local ID from IndexedDB to prevent duplicates
      if (oldId && oldId !== cloudSketch.id) {
        try {
          await deleteSketchFromIdb(oldId);
        } catch (_err) {
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
                // Invalidate the in-memory library cache so getLibrary() reads the fresh data
                if (typeof window.invalidateLibraryCache === 'function') {
                  window.invalidateLibraryCache();
                }
                console.debug(`[Sync] Updated localStorage: ${oldId} → ${cloudSketch.id}`);
              }
            }
          }
        } catch (err) {
          console.warn('[Sync] Failed to update localStorage with new cloud ID:', err);
        }
      }

      // Notify main.js (and any other listener) that the sketch ID has changed.
      // This is critical: without this, main.js keeps using the old sk_xxx ID,
      // causing every subsequent save to create yet another cloud duplicate.
      if (typeof window !== 'undefined' && typeof window.__onSketchIdChanged === 'function') {
        try {
          window.__onSketchIdChanged(oldId, cloudSketch.id);
        } catch (err) {
          console.warn('[Sync] __onSketchIdChanged callback error:', err);
        }
      }

      // Track the server's version for the new sketch
      if (cloudSketch.version != null) {
        lastKnownServerVersion.set(cloudSketch.id, cloudSketch.version);
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
      console.debug('[Sync] Cloud sync skipped — API not available');
      updateSyncState({ isSyncing: false });
      return;
    }

    console.error('[Sync] Failed to sync sketch to cloud:', error);
    updateSyncState({
      isSyncing: false,
      error: error.message,
      errorStatusCode: error.statusCode || null,
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
  // Skip legacy non-UUID sketch IDs early (before debounce timer)
  if (sketch?.id && !isValidCloudUUID(sketch.id)) {
    return; // silently skip — syncSketchToCloud would also skip with a warning
  }

  // Never sync empty sketches to cloud
  const nodes = sketch?.nodes || [];
  const edges = sketch?.edges || [];
  if (nodes.length === 0 && edges.length === 0) {
    console.debug('[Sync] Skipping cloud sync for empty sketch:', sketch?.id);
    return;
  }

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

  // Skip cloud operations for legacy non-UUID IDs
  if (sketchId && !isValidCloudUUID(sketchId)) {
    console.debug('[Sync] Cloud delete skipped — legacy sketch ID:', sketchId);
    return;
  }

  // Skip cloud delete if API not available
  if (!apiAvailable) {
    console.debug('[Sync] Cloud delete skipped — API not available');
    return;
  }

  // Delete from cloud if online
  if (navigator.onLine && getAuthState().isSignedIn) {
    try {
      await deleteSketchFromCloud(sketchId);
    } catch (error) {
      // Ignore API unavailable errors
      if (error.message?.includes('API not available')) {
        console.debug('[Sync] Cloud delete skipped — API not available');
        return;
      }
      console.error('[Sync] Failed to delete from cloud:', error);
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
  console.debug('[Sync] API availability reset');
}

/**
 * Process queued sync operations
 * Called when coming back online
 */
export async function processSyncQueue() {
  if (!navigator.onLine || !getAuthState().isSignedIn) {
    return;
  }

  const allOperations = await drainSyncQueue();
  if (allOperations.length === 0) return;

  // Filter out operations for legacy non-UUID sketch IDs — these would
  // cause 400 errors from the API. The sketches themselves are preserved
  // locally; we just remove their cloud sync requests from the queue.
  const operations = [];
  for (const op of allOperations) {
    const opSketchId = op.type === 'DELETE' ? op.sketchId : op.data?.id;
    if (opSketchId && !isValidCloudUUID(opSketchId)) {
      console.warn(`[Sync] Discarding queued ${op.type} for legacy sketch ID "${opSketchId}"`);
      // Remove legacy items from the queue so they don't accumulate
      try { await removeSyncQueueItem(op._queueKey); } catch (e) { /* ignore */ }
      continue;
    }
    operations.push(op);
  }

  if (operations.length === 0) {
    console.debug('[Sync] All queued operations were for legacy IDs — nothing to sync');
    return;
  }

  if (isSyncInProgress) {
    console.debug('[Sync] Sync in progress, will retry queue later');
    return;
  }

  console.debug(`[Sync] Processing ${operations.length} queued operations`);
  isSyncInProgress = true;
  updateSyncState({ isSyncing: true });

  let failedCount = 0;

  try {
    for (const op of operations) {
      try {
        if (op.type === 'UPDATE') {
          const isCloudSketch = isValidCloudUUID(op.data.id);
          if (isCloudSketch) {
            const knownVersion = lastKnownServerVersion.get(op.data.id);
            const queuePayload = {
              name: op.data.name,
              creationDate: op.data.creationDate,
              nodes: op.data.nodes,
              edges: op.data.edges,
              adminConfig: op.data.adminConfig,
              lastEditedBy: op.data.lastEditedBy,
              projectId: op.data.projectId,
              clientVersion: knownVersion != null ? knownVersion : null,
            };

            let queueResult = await updateSketchInCloud(op.data.id, queuePayload);

            if (queueResult?._conflict) {
              const serverSketch = queueResult.currentSketch;
              const serverVersion = serverSketch?.version;
              console.warn(`[Sync] Queue conflict for sketch ${op.data.id} — server v${serverVersion ?? '?'}.`);

              if (serverSketch) {
                const comparison = compareSketchData(queuePayload, serverSketch);

                if (!comparison.hasConflict) {
                  // Metadata-only — auto-merge
                  console.debug(`[Sync] Queue conflict is metadata-only for ${op.data.id} — auto-merging.`);
                  queueResult = await updateSketchInCloud(op.data.id, {
                    ...queuePayload,
                    nodes: serverSketch.nodes,
                    edges: serverSketch.edges,
                    clientVersion: serverVersion != null ? serverVersion : null,
                  });
                } else {
                  // Structural conflict — backup local, accept server
                  console.warn(`[Sync] Structural queue conflict for ${op.data.id}. Accepting server version.`);
                  saveConflictBackup(op.data.id, queuePayload, op.data.name || op.data.id);

                  await saveSketchToIdb({
                    ...op.data,
                    nodes: serverSketch.nodes || [],
                    edges: serverSketch.edges || [],
                    adminConfig: serverSketch.adminConfig || op.data.adminConfig || {},
                    updatedAt: serverSketch.updatedAt,
                  });

                  const displayName = op.data.name || op.data.id;
                  if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                    window.showToast(
                      typeof window.t === 'function'
                        ? window.t('auth.conflictDetected', displayName)
                        : `Sync conflict detected for sketch '${displayName}'. Your local changes were saved as a backup.`
                    );
                  }

                  if (serverVersion != null) {
                    lastKnownServerVersion.set(op.data.id, serverVersion);
                  }
                  // Treat as resolved — don't retry
                  queueResult = null;
                }
              } else {
                console.error(`[Sync] Queue conflict for ${op.data.id} but no server data — skipping.`);
                queueResult = null;
              }
            }

            if (queueResult && !queueResult._conflict && queueResult.version != null) {
              lastKnownServerVersion.set(op.data.id, queueResult.version);
            }
          } else {
            const oldQueueId = op.data.id;
            const cloudSketch = await createSketchInCloud({
              name: op.data.name,
              creationDate: op.data.creationDate,
              nodes: op.data.nodes,
              edges: op.data.edges,
              adminConfig: op.data.adminConfig,
              createdBy: op.data.createdBy,
              lastEditedBy: op.data.lastEditedBy,
              projectId: op.data.projectId,
            });
            op.data.id = cloudSketch.id;
            op.data.cloudSynced = true;
            await saveSketchToIdb(op.data);

            // Remove old local-ID entry from IndexedDB
            if (oldQueueId && oldQueueId !== cloudSketch.id) {
              try { await deleteSketchFromIdb(oldQueueId); } catch (e) { console.warn('[SyncService] Failed to delete old IDB entry:', e); }
            }

            // Notify main.js of the ID change
            if (typeof window !== 'undefined' && typeof window.__onSketchIdChanged === 'function') {
              try { window.__onSketchIdChanged(oldQueueId, cloudSketch.id); } catch (e) { console.warn('[SyncService] onSketchIdChanged error:', e); }
            }

            // Track version for optimistic locking
            if (cloudSketch.version != null) {
              lastKnownServerVersion.set(cloudSketch.id, cloudSketch.version);
            }
          }
        } else if (op.type === 'DELETE') {
          await deleteSketchFromCloud(op.sketchId);
        }

        // Success — remove this operation from the queue
        await removeSyncQueueItem(op._queueKey);
      } catch (error) {
        console.error('[Sync] Failed to process queued operation:', op, error);
        // Leave the operation in the queue — it will be retried next sync cycle
        failedCount++;
      }
    }

    updateSyncState({
      isSyncing: false,
      lastSyncTime: new Date(),
      pendingChanges: failedCount,
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
  return isValidCloudUUID(id);
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
            if (typeof window.invalidateLibraryCache === 'function') {
              window.invalidateLibraryCache();
            }
            console.debug(`[Sync] Removed ${removedCount} duplicate(s) from localStorage:`, removedIds);
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
    const { removedCount, removedIds } = deduplicateSketches(idbSketches);
    if (removedCount > 0) {
      // Delete the duplicate entries from IndexedDB
      for (const id of removedIds) {
        try {
          await deleteSketchFromIdb(id);
        } catch (_err) {
          // Ignore individual delete errors
        }
      }
      console.debug(`[Sync] Removed ${removedCount} duplicate(s) from IndexedDB:`, removedIds);
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
    console.debug(`[Sync] Duplicate cleanup complete. Total removed: ${totalRemoved}`);
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
  console.debug('[Sync] Starting duplicate sketch cleanup...');
  
  const result = await cleanupDuplicateSketchesInternal();
  
  if (result.removedCount > 0) {
    // Trigger UI refresh if available
    if (typeof window !== 'undefined' && typeof window.renderHome === 'function') {
      window.renderHome();
    }
  } else {
    console.debug('[Sync] No duplicate sketches found');
  }
  
  return result;
}

/**
 * Initialize sync service
 * Sets up online/offline listeners
 */
export function initSyncService() {
  // Guard against timer accumulation when called more than once.
  // Any running lock-refresh interval from a prior invocation is cleared here
  // so we never end up with multiple concurrent refresh timers.
  stopLockRefreshTimer();

  // Abort any listeners registered by a previous invocation so we never
  // accumulate duplicate online/offline handlers across re-calls.
  if (listenerAbortController) {
    listenerAbortController.abort();
  }
  listenerAbortController = new AbortController();
  const { signal } = listenerAbortController;

  // Listen for online/offline events.
  // The online handler is debounced to guard against rapid network flapping
  // (e.g. LTE→WiFi handoff) that would otherwise fire processSyncQueue many
  // times in quick succession.
  window.addEventListener('online', () => {
    updateSyncState({ isOnline: true });
    clearTimeout(onlineDebounceTimer);
    onlineDebounceTimer = setTimeout(() => {
      console.debug('[Sync] Back online — processing sync queue');
      processSyncQueue();
    }, ONLINE_DEBOUNCE_MS);
  }, { signal });

  window.addEventListener('offline', () => {
    // Cancel any pending debounced sync — we're offline again before it fired.
    clearTimeout(onlineDebounceTimer);
    updateSyncState({ isOnline: false });
    console.debug('[Sync] Gone offline — changes will be queued');
  }, { signal });

  // Unsubscribe any previous auth listener to prevent accumulation on re-init
  if (authListenerUnsub) {
    authListenerUnsub();
    authListenerUnsub = null;
  }

  // Initial sync on auth ready
  if (window.authGuard?.onAuthStateChange) {
    authListenerUnsub = window.authGuard.onAuthStateChange((authState) => {
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
            console.error('[Sync] Sync error:', error);
          });
        }, 500);
      }
    });
  }
}

/**
 * Clear all locally cached sketch data.
 * Called on logout to prevent cross-account data contamination.
 */
export async function clearLocalSketchData() {
  console.debug('[Sync] Clearing all local sketch data (logout)');
  try {
    // Clear localStorage sketch data
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('graphSketch.library');
      window.localStorage.removeItem('graphSketch');
    }
    // Clear IndexedDB sketches
    const idbSketches = await getAllSketchesFromIdb().catch(() => []);
    for (const s of idbSketches) {
      await deleteSketchFromIdb(s.id).catch(() => {});
    }
    // Invalidate the legacy library cache
    if (typeof window !== 'undefined' && typeof window.invalidateLibraryCache === 'function') {
      window.invalidateLibraryCache();
    }
    console.debug('[Sync] Local sketch data cleared');
  } catch (err) {
    console.warn('[Sync] Error clearing local data:', err.message);
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
    fetchSketchFromCloud,
    acquireSketchLock,
    releaseSketchLock,
    clearLocalSketchData,
    getSyncHealth,
    resetSyncHealth,
    refreshQueueStatus,
  };
}
