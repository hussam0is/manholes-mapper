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
import { initAuthMonitor, onAuthStateChange, getAuthState, updateAuthState, guardRoute, redirectIfAuthenticated, refreshSession } from './auth/auth-guard.js';
import { initSyncService } from './auth/sync-service.js';
import { authClient, signOutUser, getCurrentSession } from './auth/auth-client.js';

// Initialize Vercel Speed Insights only when deployed on Vercel (production)
// The /_vercel/speed-insights/script.js endpoint only exists on Vercel's platform
if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
  injectSpeedInsights();
}

// Initialize Better Auth
if (typeof window !== 'undefined') {
  console.log('Auth: Initializing Better Auth');
  
  // Store auth client globally for legacy code access
  window.__authClient = authClient;
  
  // Function to render user menu (desktop and mobile)
  const renderUserMenu = (user) => {
    const userBtnContainer = document.getElementById('clerkUserButton');
    const mobileUserBtnContainer = document.getElementById('mobileClerkUserButton');
    
    const renderButton = (container) => {
      if (!container) return;
      
      if (user) {
        // User is signed in - show user menu
        container.innerHTML = `
          <div class="user-menu">
            <button class="user-menu-trigger" title="${user.name || user.email}">
              <div class="user-avatar">
                ${user.image ? `<img src="${user.image}" alt="${user.name || 'User'}" />` : `<span>${(user.name || user.email || 'U')[0].toUpperCase()}</span>`}
              </div>
            </button>
            <div class="user-menu-dropdown" style="display: none;">
              <div class="user-menu-header">
                <div class="user-menu-name">${user.name || 'User'}</div>
                <div class="user-menu-email">${user.email || ''}</div>
              </div>
              <hr class="user-menu-divider" />
              <button class="user-menu-item user-menu-signout">
                <span class="material-icons">logout</span>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        `;
        
        // Add event listeners
        const trigger = container.querySelector('.user-menu-trigger');
        const dropdown = container.querySelector('.user-menu-dropdown');
        const signOutBtn = container.querySelector('.user-menu-signout');
        
        if (trigger && dropdown) {
          trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
          });
          
          // Close dropdown when clicking outside
          document.addEventListener('click', () => {
            dropdown.style.display = 'none';
          });
        }
        
        if (signOutBtn) {
          signOutBtn.addEventListener('click', async () => {
            try {
              await signOutUser();
              await refreshSession();
              window.location.hash = '#/login';
            } catch (err) {
              console.error('Sign out failed:', err);
            }
          });
        }
      } else {
        // User is not signed in - show login button
        container.innerHTML = `
          <button class="btn btn-ghost user-login-btn" onclick="window.location.hash='#/login'">
            <span class="material-icons">login</span>
          </button>
        `;
      }
    };
    
    renderButton(userBtnContainer);
    renderButton(mobileUserBtnContainer);
  };
  
  // Listen for auth state changes
  onAuthStateChange((state) => {
    console.log('Auth state changed:', state.isSignedIn ? 'signed in' : 'signed out');
    renderUserMenu(state.user);
    
    // Force a route check when auth state changes
    if (window.handleRoute) {
      window.handleRoute();
    }
  });
  
  // Dispatch custom event so other parts of the app know auth is ready
  getCurrentSession().then(({ data }) => {
    if (data?.session) {
      console.log('Auth: Session restored');
    }
    window.dispatchEvent(new CustomEvent('auth-loaded', { detail: { authClient } }));
  });
}

// Expose auth functions globally for legacy code
if (typeof window !== 'undefined') {
  window.authGuard = { getAuthState, onAuthStateChange, guardRoute, redirectIfAuthenticated, updateAuthState, refreshSession };
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
