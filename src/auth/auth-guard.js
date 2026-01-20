/**
 * Auth Guard - Route protection for the Manholes Mapper PWA
 * 
 * Handles authentication state checking and route protection.
 * Works with Clerk's session management.
 */

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
console.log('Auth Guard: PUBLISHABLE_KEY present:', !!PUBLISHABLE_KEY);

// Auth state cache
let authState = {
  isLoaded: false,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  token: null,
};

// Callbacks for auth state changes
const authStateListeners = new Set();

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
    try { cb(authState); } catch (_) {}
  });
}

/**
 * Update auth state from Clerk
 * @param {Object} clerkState - State from Clerk
 */
export function updateAuthState(clerkState) {
  authState = {
    isLoaded: true,
    isSignedIn: clerkState.isSignedIn || false,
    userId: clerkState.userId || null,
    sessionId: clerkState.sessionId || null,
    token: clerkState.token || null,
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
 * Get the current session token for API calls
 * @returns {Promise<string|null>}
 */
export async function getToken() {
  if (!authState.isSignedIn) return null;
  
  // Try to get fresh token from Clerk
  try {
    if (window.__clerk) {
      if (typeof window.__clerk.session?.getToken === 'function') {
        const token = await window.__clerk.session.getToken();
        authState.token = token;
        return token;
      } else if (typeof window.__clerk.getToken === 'function') {
        // Fallback to clerk.getToken() if session.getToken() is not available
        const token = await window.__clerk.getToken();
        authState.token = token;
        return token;
      }
    }
  } catch (err) {
    console.warn('Failed to get fresh Clerk token:', err);
  }
  
  // Fallback to cached token
  return authState.token;
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
  // Don't guard if Clerk is not configured
  if (!PUBLISHABLE_KEY) {
    console.warn('Clerk not configured, skipping auth guard');
    return false;
  }
  
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
 * Initialize auth state monitoring with Clerk
 */
export function initAuthMonitor() {
  if (!PUBLISHABLE_KEY) {
    console.warn('Clerk publishable key not set. Auth features disabled.');
    // Set as loaded but not signed in to allow app to work without auth
    authState = { isLoaded: true, isSignedIn: false, userId: null, sessionId: null, token: null };
    notifyAuthStateChange();
    return;
  }

  // Clerk will be initialized by the provider, we listen for its events
  // The ClerkProvider will call updateAuthState when auth state changes
}

// Initialize on module load
initAuthMonitor();
