// @ts-check
/**
 * Permissions Service for Manholes Mapper
 *
 * Handles user role and feature permission checking on the client side.
 * Fetches and caches user role data from the API.
 *
 * @typedef {import('../types/index.js').UserRoleData} UserRoleData
 * @typedef {import('../types/index.js').AuthState} AuthState
 */

import { getToken, getAuthState } from './auth-guard.js';

// Cached user role data
/** @type {UserRoleData | null} */
let userRoleCache = null;
/** @type {Promise<UserRoleData | null> | null} */
let fetchPromise = null;
// After a failed fetch, don't re-hit the API for this long. Without this,
// every caller retriggers a request on flaky field connections (each panel
// init + the 5-min session poll), flooding the network and the console.
const FAILED_FETCH_COOLDOWN_MS = 30_000;
let lastFailedFetchAt = 0;

// Listeners for permission changes
/** @type {Set<(role: UserRoleData | null) => void>} */
const permissionListeners = new Set();

/**
 * Subscribe to permission changes
 * @param {(role: UserRoleData | null) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function onPermissionChange(callback) {
  permissionListeners.add(callback);
  if (userRoleCache) {
    callback(userRoleCache);
  }
  return () => permissionListeners.delete(callback);
}

/**
 * Notify all listeners of permission change
 */
function notifyPermissionChange() {
  permissionListeners.forEach(cb => {
    try { cb(userRoleCache); } catch (e) { console.warn('[Permissions] Listener error:', e); }
  });
}

/**
 * Fetch user role and permissions from API
 * @param {boolean} [forceRefresh] - Force refresh from API
 * @returns {Promise<UserRoleData | null>} User role data
 */
export async function fetchUserRole(forceRefresh = false) {
  const authState = getAuthState();
  
  if (!authState.isSignedIn) {
    userRoleCache = null;
    return null;
  }

  // Return cached data if available and not forcing refresh
  if (userRoleCache && !forceRefresh) {
    return userRoleCache;
  }

  // Return existing promise if already fetching
  if (fetchPromise && !forceRefresh) {
    return fetchPromise;
  }

  // Back off after a failure so dozens of callers don't retrigger the
  // request in a loop (explicit forceRefresh still goes through).
  if (!forceRefresh && lastFailedFetchAt && Date.now() - lastFailedFetchAt < FAILED_FETCH_COOLDOWN_MS) {
    return null;
  }

  fetchPromise = (async () => {
    try {
      const token = await getToken();
      if (!token) {
        return null;
      }

      const response = await fetch('/api/user-role', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('[Auth] Failed to fetch user role:', response.status);
        lastFailedFetchAt = Date.now();
        return null;
      }

      // Captive portals and misconfigured proxies return HTML with a 200 —
      // detect that before .json() throws a cryptic parse error. A missing
      // content-type is tolerated (the .json() catch below handles it).
      const contentType = (response.headers && typeof response.headers.get === 'function' && response.headers.get('content-type')) || '';
      if (contentType.includes('text/html')) {
        console.error('[Auth] /api/user-role returned HTML instead of JSON — captive portal or proxy in the way?');
        lastFailedFetchAt = Date.now();
        return null;
      }

      const data = await response.json();
      userRoleCache = data;
      lastFailedFetchAt = 0;
      notifyPermissionChange();
      return data;

    } catch (error) {
      console.error('[Auth] Error fetching user role:', error instanceof Error ? error.message : String(error));
      lastFailedFetchAt = Date.now();
      return null;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Get cached user role data
 * @returns {UserRoleData | null}
 */
export function getUserRole() {
  return userRoleCache;
}

/**
 * Check if current user is a super admin
 * @returns {boolean}
 */
export function isSuperAdmin() {
  return userRoleCache?.isSuperAdmin === true;
}

/**
 * Check if current user is an admin (includes super admin)
 * @returns {boolean}
 */
export function isAdmin() {
  return userRoleCache?.isAdmin === true;
}

/**
 * Check if a feature is enabled for the current user
 * @param {string} featureKey
 * @returns {boolean}
 */
export function canAccessFeature(featureKey) {
  if (!userRoleCache?.features) {
    return true; // Default to enabled if not loaded
  }
  return userRoleCache.features[featureKey] !== false;
}

/**
 * Get all features for current user
 * @returns {Record<string, boolean>}
 */
export function getFeatures() {
  return userRoleCache?.features || {};
}

/**
 * Clear cached permissions (call on logout)
 */
export function clearPermissions() {
  userRoleCache = null;
  fetchPromise = null;
  lastFailedFetchAt = 0;
  notifyPermissionChange();
}

/**
 * Initialize permissions service
 * Listens for auth state changes and fetches permissions
 */
export function initPermissionsService() {
  if (typeof window === 'undefined') return;

  // Connectivity returning is a legitimate reason to retry immediately —
  // don't let the failure cooldown delay recovery in the field.
  window.addEventListener('online', () => {
    lastFailedFetchAt = 0;
    const authState = getAuthState();
    if (authState.isSignedIn && !userRoleCache) {
      fetchUserRole().catch(() => {});
    }
  });

  // Listen for auth state changes
  if (window.authGuard?.onAuthStateChange) {
    window.authGuard.onAuthStateChange((authState) => {
      if (authState.isSignedIn && authState.isLoaded) {
        // Fetch permissions when signed in
        fetchUserRole().catch(err => {
          console.error('[Auth] Failed to fetch user permissions:', err.message);
        });
      } else if (!authState.isSignedIn) {
        // Clear permissions on sign out
        clearPermissions();
      }
    });
  }
}

// Export for use in legacy code
if (typeof window !== 'undefined') {
  window.permissionsService = {
    fetchUserRole,
    getUserRole,
    isSuperAdmin,
    isAdmin,
    canAccessFeature,
    getFeatures,
    clearPermissions,
    onPermissionChange,
    initPermissionsService,
  };
}

/** Available feature keys for reference. */
export const FEATURE_KEYS = /** @type {const} */ ([
  'export_csv',
  'export_sketch',
  'admin_settings',
  'finish_workday',
  'node_types',
  'edge_types',
]);
