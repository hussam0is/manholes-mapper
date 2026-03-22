/**
 * auth-ui.js
 *
 * Extracted auth/login UI and routing from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 */

import { mountSignIn as _mountSignIn, mountSignUp as _mountSignUp } from '../auth/auth-provider.jsx';
import { S, F } from './shared-state.js';
import {
  isProjectCanvasMode,
  clearProjectCanvas,
  refreshActiveSketchData,
} from '../project/project-canvas-state.js';
import { hideSketchSidePanel } from '../project/sketch-side-panel.js';
import { syncProjectSketchesToLibrary } from './library-manager.js';

// ── Convenience wrappers for cross-module calls ─────────────────────────
const t = (...args) => F.t(...args);
const showToast = (...args) => F.showToast(...args);

// ── DOM refs ────────────────────────────────────────────────────────────
const loginPanel = document.getElementById('loginPanel');
const authLoadingOverlay = document.getElementById('authLoadingOverlay');
const authContainer = document.getElementById('authContainer');
const loginTitle = document.getElementById('loginTitle');
const loginSubtitle = document.getElementById('loginSubtitle');
const loginLoadingText = document.getElementById('loginLoadingText');
const authLoadingText = document.getElementById('authLoadingText');
const userButtonContainer = document.getElementById('userButtonContainer');
const mobileUserButtonContainer = document.getElementById('mobileUserButtonContainer');
const adminBtn = document.getElementById('adminBtn');
const mobileAdminBtn = document.getElementById('mobileAdminBtn');
const projectsBtn = document.getElementById('projectsBtn');
const mobileProjectsBtn = document.getElementById('mobileProjectsBtn');
const threeDViewBtn = document.getElementById('threeDViewBtn');

// ── Animated panel close helper ─────────────────────────────────────────
export function hidePanelAnimated(el, callback) {
  if (!el || el.style.display === 'none') { if (callback) callback(); return; }
  // If reduced motion or animation not supported, skip animation
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    el.classList.remove('panel-closing');
    el.style.display = 'none';
    if (callback) callback();
    return;
  }
  el.classList.add('panel-closing');
  const onEnd = () => {
    el.removeEventListener('animationend', onEnd);
    el.classList.remove('panel-closing');
    el.style.display = 'none';
    if (callback) callback();
  };
  el.addEventListener('animationend', onEnd, { once: true });
  // Safety timeout in case animationend never fires
  setTimeout(() => {
    if (el.classList.contains('panel-closing')) {
      el.classList.remove('panel-closing');
      el.style.display = 'none';
      if (callback) callback();
    }
  }, 200);
}

// ── Show/hide login panel ───────────────────────────────────────────────
export function showLoginPanel() {
  if (loginPanel) {
    loginPanel.classList.remove('panel-closing');
    loginPanel.style.display = 'flex';
    document.body.classList.add('show-login');
  }
  // Update login panel text based on language
  if (loginTitle) loginTitle.textContent = t('auth.loginTitle');
  if (loginSubtitle) loginSubtitle.textContent = t('auth.loginSubtitle');
  if (loginLoadingText) loginLoadingText.textContent = t('auth.loading');
  
  // Mount SignIn when ready
  mountAuthSignIn();
}

export function hideLoginPanel() {
  if (loginPanel) {
    hidePanelAnimated(loginPanel, () => {
      document.body.classList.remove('show-login');
    });
  }
}

export function showAuthLoading() {
  if (authLoadingOverlay) {
    authLoadingOverlay.style.display = 'flex';
    if (authLoadingText) authLoadingText.textContent = t('auth.checkingAuth');
  }
}

export function hideAuthLoading() {
  if (authLoadingOverlay) {
    authLoadingOverlay.style.display = 'none';
  }
}

// ── Mount auth components ───────────────────────────────────────────────
export function mountAuthSignIn() {
  if (!authContainer) return;
  _mountSignIn(authContainer, { signUpUrl: '#/signup' });
}

export function mountAuthSignUp() {
  if (!authContainer) return;
  _mountSignUp(authContainer, { signInUrl: '#/login' });
}

// ── Update user button visibility ───────────────────────────────────────
export function updateUserButtonVisibility(isSignedIn) {
  if (userButtonContainer) {
    userButtonContainer.style.display = isSignedIn ? 'flex' : 'none';
  }
  if (mobileUserButtonContainer) {
    mobileUserButtonContainer.style.display = isSignedIn ? 'flex' : 'none';
  }

  // Hide admin/project menu items from non-admin users
  const userRole = window.permissionsService?.getUserRole?.();
  const isAdminRole = userRole?.isAdmin === true;
  const adminDisplay = isSignedIn && isAdminRole ? '' : 'none';
  if (adminBtn) adminBtn.style.display = adminDisplay;
  if (mobileAdminBtn) mobileAdminBtn.style.display = adminDisplay;
  if (projectsBtn) projectsBtn.style.display = adminDisplay;
  if (mobileProjectsBtn) mobileProjectsBtn.style.display = adminDisplay;
}

// ── Simple hash routing ─────────────────────────────────────────────────
let _routePending = false;
export function handleRoute() {
  // Debounce: coalesce rapid calls (auth changes, hashchange, init) into one frame
  if (_routePending) return;
  _routePending = true;
  requestAnimationFrame(() => {
    _routePending = false;
    _handleRouteImpl();
  });
}

function _handleRouteImpl() {
  const hash = location.hash || '#/';
  if (window.__fcShell?.onRouteChange) window.__fcShell.onRouteChange(hash);
  const isAdmin = (hash === '#/admin');
  const isProjects = (hash === '#/projects');
  const isLogin = (hash === '#/login');
  const isSignup = (hash === '#/signup');
  const isProfile = (hash === '#/profile');
  const isLeaderboard = (hash === '#/leaderboard');
  // Must check /stats BEFORE generic project match to avoid capturing stats as project ID
  const projectStatsMatch = hash.match(/^#\/project\/([^/]+)\/stats$/);
  const projectMatch = projectStatsMatch ? null : hash.match(/^#\/project\/([^/]+)$/);

  // Get auth state if available
  const authState = window.authGuard?.getAuthState?.() || { isLoaded: false, isSignedIn: false };

  console.debug('[App] handleRoute:', { hash, isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn });

  // If auth is not yet loaded, show loading
  if (!authState.isLoaded) {
    showAuthLoading();
    return;
  }

  hideAuthLoading();

  // Handle login/signup routes
  if (isLogin || isSignup) {
    // If already signed in, redirect to home
    if (authState.isSignedIn) {
      location.hash = '#/';
      return;
    }
    showLoginPanel();
    if (isSignup) {
      mountAuthSignUp();
      if (loginTitle) loginTitle.textContent = t('auth.signupTitle');
      if (loginSubtitle) loginSubtitle.textContent = t('auth.signupSubtitle');
    } else {
      mountAuthSignIn();
    }
    return;
  }

  // For protected routes, check authentication
  if (!authState.isSignedIn) {
    location.hash = '#/login';
    return;
  }

  // Hide login panel for authenticated routes
  hideLoginPanel();
  updateUserButtonVisibility(authState.isSignedIn);

  // Hide page panels when navigating away from them
  if (!isProfile) {
    import('../pages/profile-page.js').then(m => m.hideProfilePage()).catch(() => {});
  }
  if (!isLeaderboard) {
    import('../pages/leaderboard-page.js').then(m => m.hideLeaderboardPage()).catch(() => {});
  }
  if (!projectStatsMatch) {
    import('../pages/project-stats-page.js').then(m => m.hideProjectStatsPage()).catch(() => {});
  }

  // Leave project-canvas mode when navigating away from #/project/:id
  if (!projectMatch && !projectStatsMatch && isProjectCanvasMode()) {
    // Sync project sketches back to localStorage so the home view is up to date
    syncProjectSketchesToLibrary();
    clearProjectCanvas();
    hideSketchSidePanel();
  }

  // Cross-module calls via F registry (avoids circular imports)
  const openAdminScreen = (...a) => F.openAdminScreen(...a);
  const closeAdminScreen = (...a) => F.closeAdminScreen(...a);
  const closeAdminModal = (...a) => F.closeAdminModal(...a);
  const openProjectsScreen = (...a) => F.openProjectsScreen(...a);
  const closeProjectsScreen = (...a) => F.closeProjectsScreen(...a);
  const hideHome = (...a) => F.hideHome(...a);
  const renderProjectsHome = (...a) => F.renderProjectsHome(...a);
  const loadProjectCanvas = (...a) => F.loadProjectCanvas(...a);

  // Handle admin route
  if (isAdmin) {
    try { document.body.classList.add('admin-screen'); } catch (_) { }
    try { closeAdminModal(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true);
    openAdminScreen().catch(e => console.error('[Admin] Failed to open admin screen:', e));
  } else if (isProjects) {
    // Handle projects route
    try { document.body.classList.add('admin-screen'); } catch (_) { }
    try { closeAdminModal(); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { openProjectsScreen(); } catch (_) { }
  } else if (isProfile) {
    // Handle #/profile route
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true);
    import('../pages/profile-page.js').then(m => m.renderProfilePage()).catch(e => console.error('[Profile]', e));
  } else if (isLeaderboard) {
    // Handle #/leaderboard route
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true);
    import('../pages/leaderboard-page.js').then(m => m.renderLeaderboardPage()).catch(e => console.error('[Leaderboard]', e));
  } else if (projectStatsMatch) {
    // Handle #/project/:id/stats route
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true);
    import('../pages/project-stats-page.js').then(m => m.renderProjectStatsPage(projectStatsMatch[1])).catch(e => console.error('[ProjectStats]', e));
  } else if (projectMatch) {
    // Handle #/project/:id route — load project canvas
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    hideHome(true); // Immediate hide to prevent race with sync-service
    loadProjectCanvas(projectMatch[1]);
  } else {
    try { document.body.classList.remove('admin-screen'); } catch (_) { }
    try { closeAdminScreen(); } catch (_) { }
    try { closeProjectsScreen(); } catch (_) { }
    // Default route: show projects homepage if user has an org, else show sketch list
    renderProjectsHome();
  }
}

// ── Prevent scroll propagation from modals ──────────────────────────────
export function preventModalScrollPropagation() {
  const modals = ['startPanel', 'homePanel', 'helpModal', 'adminModal', 'adminScreen', 'projectsScreen'];
  modals.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Stop mouse wheel and touch events from reaching the canvas
    const stopProp = (e) => e.stopPropagation();
    el.addEventListener('wheel', stopProp, { passive: false });
    el.addEventListener('touchmove', stopProp, { passive: false });
    el.addEventListener('mousedown', stopProp);
    el.addEventListener('touchstart', stopProp, { passive: false });
  });
}

/**
 * Initialize auth UI: wire up event listeners and auth state handlers.
 * Called from main.js init().
 */
export function initAuthUI() {
  // Listen for auth state changes to re-route
  if (window.authGuard?.onAuthStateChange) {
    window.authGuard.onAuthStateChange((state) => {
      handleRoute();
      updateUserButtonVisibility(state.isSignedIn);
    });
  }

  // Re-evaluate admin button visibility when permissions are loaded (async after auth)
  if (window.permissionsService?.onPermissionChange) {
    window.permissionsService.onPermissionChange((roleData) => {
      const authState = window.authGuard?.getAuthState?.() || {};
      updateUserButtonVisibility(!!authState.isSignedIn);
      // Show 3D View button for admin/super_admin only
      if (threeDViewBtn) {
        threeDViewBtn.style.display = roleData?.isAdmin ? '' : 'none';
      }
    });
  }

  window.addEventListener('hashchange', handleRoute);
  // Expose handleRoute globally so main-entry.js can call it
  window.handleRoute = handleRoute;

  // Initialize route on load (with slight delay to allow auth to initialize)
  setTimeout(() => {
    try { handleRoute(); } catch (_) { }
    preventModalScrollPropagation();
  }, 100);
}
