// ES module entry for the Graph Sketcher app
// Load small utilities first so legacy code can rely on them during migration.
import './utils/toast.js';
import './serviceWorker/register-sw.js';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { i18n as I18N_DICT, createTranslator, isRTL as i18nIsRTL } from './i18n.js';
import { syncHeaderHeightVar, syncAppHeightVar } from './dom/dom-utils.js';
import * as CONSTS from './state/constants.js';
import { attachFloatingKeyboard } from './utils/floating-keyboard.js';
import { initResizableDrawer } from './utils/resizable-drawer.js';
import { initAuthMonitor, onAuthStateChange, getAuthState, updateAuthState, guardRoute, redirectIfAuthenticated } from './auth/auth-guard.js';
import { initSyncService } from './auth/sync-service.js';

// Initialize Vercel Speed Insights only when deployed on Vercel (production)
// The /_vercel/speed-insights/script.js endpoint only exists on Vercel's platform
if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
  injectSpeedInsights();
}

// Initialize Clerk authentication
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (typeof window !== 'undefined' && CLERK_KEY) {
  // Dynamically load Clerk when key is available
  // We use @clerk/clerk-js for the global instance to provide the constructor
  import('@clerk/clerk-js').then(({ Clerk }) => {
    const clerk = new Clerk(CLERK_KEY);
    window.__clerk = clerk;
    
    clerk.load().then(() => {
      console.log('Clerk loaded successfully');
      
      const authData = {
        isSignedIn: clerk.user != null,
        userId: clerk.user?.id || null,
        sessionId: clerk.session?.id || null,
      };

      // Update auth state when Clerk loads
      updateAuthState(authData);
      
      // Listen for auth changes
      clerk.addListener((event) => {
        updateAuthState({
          isSignedIn: clerk.user != null,
          userId: clerk.user?.id || null,
          sessionId: clerk.session?.id || null,
        });
      });

      // Mount user button if container exists
      const userBtnContainer = document.getElementById('clerkUserButton');
      if (userBtnContainer && clerk.user) {
        clerk.mountUserButton(userBtnContainer, {
          afterSignOutUrl: '#/login',
        });
      }

      // Dispatch custom event so other parts of the app know auth is ready
      window.dispatchEvent(new CustomEvent('clerk-loaded', { detail: { clerk } }));
      
      // Force a route check now that we are sure everything is loaded
      if (window.handleRoute) {
        window.handleRoute();
      }
    }).catch((err) => {
      console.error('Failed to load Clerk:', err);
      // Set as loaded but not signed in to allow app to continue
      updateAuthState({ isSignedIn: false, userId: null, sessionId: null });
    });
  }).catch((err) => {
    console.warn('Clerk module not available:', err);
    // Ensure auth state is marked as loaded even if module fails
    updateAuthState({ isSignedIn: false, userId: null, sessionId: null });
  });
} else if (typeof window !== 'undefined') {
  // No Clerk key - mark auth as loaded (unauthenticated mode)
  console.warn('VITE_CLERK_PUBLISHABLE_KEY not set. Running without authentication.');
}

// Expose auth functions globally for legacy code
if (typeof window !== 'undefined') {
  window.authGuard = { getAuthState, onAuthStateChange, guardRoute, redirectIfAuthenticated, updateAuthState };
}

// Initialize sync service for cloud synchronization
if (typeof window !== 'undefined') {
  initSyncService();
}

// Provide a translator globally for legacy code if not yet present
if (typeof window !== 'undefined') {
  if (typeof window.t !== 'function') {
    window.t = createTranslator(I18N_DICT, () => (window.currentLang === 'en' ? 'en' : 'he'));
  }
  if (typeof window.isRTL !== 'function') {
    window.isRTL = i18nIsRTL;
  }
  // Expose constants catalog for legacy code paths
  if (!window.CONSTS) {
    window.CONSTS = CONSTS;
  }
}

// This preserves current behavior by importing the legacy script as a side-effect.
// We will gradually move logic from main.js into organized modules under src/.
import './legacy/main.js';

// Initialize floating keyboard for mobile numeric inputs
// This will only activate on mobile/touch devices
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    attachFloatingKeyboard();
    initResizableDrawer();
  });
}

// After app scripts load, ensure header height and app height variables are synced
// syncAppHeightVar fixes Android devices (e.g., Samsung Note 10) where 100dvh doesn't work correctly
try { syncAppHeightVar(); } catch (_) { }
try { syncHeaderHeightVar(); } catch (_) { }
