/**
 * Auth Guard - Route protection for the Manholes Mapper PWA
 * 
 * Handles authentication state checking and route protection.
 * Works with Better Auth session management.
 */

import { getCurrentSession } from './auth-client.js';

// Auth state cache
let authState = {
  isLoaded: false,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  user: null,
};

// Callbacks for auth state changes
const authStateListeners = new Set();

// Session refresh interval ID (to prevent accumulation on re-init)
let sessionRefreshInterval = null;

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Called when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  authStateListeners.add(callback);
  // Immediately call with current state if loaded
  if (authState.isLoaded) {
    callback(authState);
  }
  return () => authStateListeners.delete(callback);
}

/**
 * Notify all listeners of auth state change
 */
function notifyAuthStateChange() {
  authStateListeners.forEach(cb => {
    try { cb(authState); } catch (e) { console.warn('[Auth] State listener threw:', e.message); }
  });
}

/**
 * Update auth state from Better Auth session
 * @param {Object} sessionData - Session data from Better Auth
 */
export function updateAuthState(sessionData) {
  authState = {
    isLoaded: true,
    isSignedIn: !!sessionData?.session,
    userId: sessionData?.user?.id || null,
    sessionId: sessionData?.session?.id || null,
    user: sessionData?.user || null,
  };
  notifyAuthStateChange();
}

/**
 * Get current auth state
 * @returns {Object} Current auth state
 */
export function getAuthState() {
  return { ...authState };
}

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export function isAuthenticated() {
  return authState.isSignedIn === true;
}

/**
 * Get the current user ID
 * @returns {string|null}
 */
export function getUserId() {
  return authState.userId;
}

/**
 * Get the current username
 * @returns {string|null}
 */
export function getUsername() {
  if (authState.user) {
    return authState.user.name || 
           authState.user.email ||
           authState.userId;
  }
  return authState.userId;
}

/**
 * Get the current user's email
 * @returns {string|null}
 */
export function getUserEmail() {
  return authState.user?.email || null;
}

/**
 * Get the current session token for API calls
 * Better Auth uses cookies for session management, so we don't need a token
 * @returns {Promise<string|null>}
 */
export async function getToken() {
  // Better Auth uses cookie-based sessions
  // For API calls, the session cookie is automatically sent
  // Return the session ID as a reference if needed
  return authState.sessionId;
}

/**
 * Check if current route requires authentication
 * @param {string} hash - The current location hash
 * @returns {boolean}
 */
export function routeRequiresAuth(hash) {
  // Login and signup routes don't require auth
  const publicRoutes = ['#/login', '#/signup'];
  return !publicRoutes.includes(hash);
}

/**
 * Redirect to login if not authenticated
 * @param {string} currentHash - Current location hash
 * @returns {boolean} True if redirected, false if allowed
 */
export function guardRoute(currentHash) {
  // Don't guard public routes
  if (!routeRequiresAuth(currentHash)) {
    return false;
  }
  
  // Wait for auth to load
  if (!authState.isLoaded) {
    // Show loading state, don't redirect yet
    return false;
  }
  
  // Redirect to login if not signed in
  if (!authState.isSignedIn) {
    window.location.hash = '#/login';
    return true;
  }
  
  return false;
}

/**
 * Redirect authenticated users away from login/signup pages
 * @param {string} currentHash - Current location hash
 * @returns {boolean} True if redirected
 */
export function redirectIfAuthenticated(currentHash) {
  if (!authState.isLoaded) return false;
  
  const authRoutes = ['#/login', '#/signup'];
  if (authRoutes.includes(currentHash) && authState.isSignedIn) {
    window.location.hash = '#/';
    return true;
  }
  
  return false;
}

/**
 * Refresh the current session from the server
 * @returns {Promise<void>}
 */
export async function refreshSession() {
  // DEV BYPASS: On localhost, skip real auth and fake a session
  // so local development can continue when DB/auth is unavailable
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalDev) {
    console.warn('[Auth] DEV BYPASS: Faking session for local development');
    updateAuthState({
      session: { id: 'dev-session', expiresAt: new Date(Date.now() + 86400000).toISOString() },
      user: { id: 'dev-user', name: 'Dev User', email: 'dev@localhost' },
    });
    return;
  }

  try {
    const { data, error } = await getCurrentSession();
    if (error) {
      console.warn('[Auth] Session refresh failed:', error);
      updateAuthState({ session: null, user: null });
    } else {
      updateAuthState(data);
    }
  } catch (err) {
    // Network errors or API not available
    console.warn('[Auth] Session refresh error (API may not be configured):', err.message);
    // Mark as loaded but not signed in so the app can still work
    updateAuthState({ session: null, user: null });
  }
}

/**
 * Initialize auth state monitoring with Better Auth
 */
export async function initAuthMonitor() {
  console.debug('[Auth] Initializing session monitoring');
  
  // Check for existing session
  await refreshSession();
  
  // Set up periodic session refresh (every 15 minutes)
  if (sessionRefreshInterval) {
    clearInterval(sessionRefreshInterval);
  }
  sessionRefreshInterval = setInterval(refreshSession, 15 * 60 * 1000);
}

// Initialize on module load
initAuthMonitor();
/**
 * Auth Guard - Route protection for the Manholes Mapper PWA
 * 
 * Handles authentication state checking and route protection.
 * Works with Better Auth session management.
 */
/**
 * Auth Guard - Route protection for the Manholes Mapper PWA
 * 
 * Handles authentication state checking and route protection.
 * Works with Better Auth session management.
 */\n
