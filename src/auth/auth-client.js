/**
 * Better Auth Client
 * 
 * Client-side authentication using Better Auth.
 * Provides sign-in, sign-up, and session management.
 */

import { createAuthClient } from "better-auth/client";

// Create the auth client
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
});

// Export convenience methods
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;

/**
 * Sign in with email and password
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{data: any, error: any}>}
 */
export async function signInWithEmail(email, password) {
  return authClient.signIn.email({
    email,
    password,
  });
}

/**
 * Sign up with email and password
 * @param {string} email 
 * @param {string} password 
 * @param {string} name 
 * @returns {Promise<{data: any, error: any}>}
 */
export async function signUpWithEmail(email, password, name) {
  return authClient.signUp.email({
    email,
    password,
    name,
  });
}

/**
 * Sign out the current user
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  return authClient.signOut();
}

/**
 * Get current session
 * @returns {Promise<{data: {session: any, user: any} | null, error: any}>}
 */
export async function getCurrentSession() {
  return authClient.getSession();
}

/**
 * Subscribe to session changes
 * @param {Function} callback - Called when session changes
 * @returns {Function} Unsubscribe function
 */
export function onSessionChange(callback) {
  // Better Auth uses a polling mechanism or we can manually check
  let lastSession = null;
  
  const checkSession = async () => {
    try {
      const { data } = await authClient.getSession();
      const currentSession = data?.session || null;
      
      // Only call callback if session actually changed
      if (JSON.stringify(currentSession) !== JSON.stringify(lastSession)) {
        lastSession = currentSession;
        callback({
          session: currentSession,
          user: data?.user || null,
        });
      }
    } catch (error) {
      console.error('[Auth] Session check failed:', error.message);
    }
  };
  
  // Check immediately
  checkSession();
  
  // Set up polling (every 5 minutes)
  const intervalId = setInterval(checkSession, 5 * 60 * 1000);
  
  // Return unsubscribe function
  return () => {
    clearInterval(intervalId);
  };
}

export default authClient;
