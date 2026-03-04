// ES module entry for the Graph Sketcher app

// Capacitor API proxy must load before any fetch() calls (auth, sync, etc.)
import './capacitor-api-proxy.js';

// Import CSS via JS so Vite handles it correctly in both dev and build modes
import '../styles.css';
import './menu/menu.css';

// Load small utilities first so legacy code can rely on them during migration.
import './utils/toast.js';
import './serviceWorker/register-sw.js';

import { injectSpeedInsights } from '@vercel/speed-insights';

import { i18n as I18N_DICT, createTranslator, isRTL as i18nIsRTL } from './i18n.js';
import { syncHeaderHeightVar, syncAppHeightVar } from './dom/dom-utils.js';
import * as CONSTS from './state/constants.js';
import { attachFloatingKeyboard } from './utils/floating-keyboard.js';
import { initResizableDrawer } from './utils/resizable-drawer.js';
import { initCanvasFabToolbar } from './canvas-fab-toolbar.js';
import { onAuthStateChange, getAuthState, updateAuthState, guardRoute, redirectIfAuthenticated, refreshSession } from './auth/auth-guard.js';
import { initSyncService } from './auth/sync-service.js';
import { authClient, signOutUser, getCurrentSession } from './auth/auth-client.js';
import { initPermissionsService, getUserRole } from './auth/permissions.js';
import { menuEvents, setupEventDelegation } from './menu/menu-events.js';
import {
  initGnssModule,
  gnssConnection,
  gnssState,
  isBrowserLocationActive,
  FIX_COLORS,
  resetMarkerEntrance,
  initPrecisionMeasureOverlay,
  showPrecisionOverlay,
  PrecisionMeasurement
} from './gnss/index.js';
import {
  requestLocationPermission,
  isGeolocationSupported
} from './map/user-location.js';
import { getFixSuggestions } from './project/fix-suggestions.js';
import { computeSketchIssues } from './project/sketch-issues.js';
import './project/issue-nav-state.js'; // registers window.__issueNav
import { initCockpit } from './cockpit/cockpit.js';

// Initialize Vercel Speed Insights only when deployed on Vercel (production)
// The /_vercel/speed-insights/script.js endpoint only exists on Vercel's platform
if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
  injectSpeedInsights();
}

/** Escape HTML special characters to prevent XSS */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Expose escapeHtml globally so legacy monolith (main.js) can use it
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
}

// Initialize Better Auth
if (typeof window !== 'undefined') {
  console.debug('[Auth] Initializing Better Auth');

  // Store auth client globally for legacy code access
  window.__authClient = authClient;

  // Expose GNSS singletons for remote CDP debugging
  window.__gnssState = gnssState;
  window.__gnssConnection = gnssConnection;

  // AbortController to clean up document-level listeners when menu re-renders
  let userMenuAbortController = null;

  // Function to render user menu (desktop and mobile)
  const renderUserMenu = (user) => {
    // Abort previous document-level listeners to prevent accumulation
    if (userMenuAbortController) {
      userMenuAbortController.abort();
    }
    userMenuAbortController = new AbortController();
    const userBtnContainer = document.getElementById('authUserButton');
    const mobileUserBtnContainer = document.getElementById('mobileAuthUserButton');
    
    const renderButton = (container) => {
      if (!container) return;
      
      if (user) {
        // User is signed in - show user menu with role badge
        const roleData = getUserRole();
        const roleName = roleData?.role || 'user';
        const roleLabel = roleName === 'super_admin'
          ? (window.t?.('auth.roleSuperAdmin') || 'Super Admin')
          : roleName === 'admin'
            ? (window.t?.('auth.roleAdmin') || 'Admin')
            : (window.t?.('auth.roleUser') || 'User');
        const roleCssClass = roleName === 'super_admin'
          ? 'user-menu-role--super-admin'
          : roleName === 'admin'
            ? 'user-menu-role--admin'
            : 'user-menu-role--user';

        container.innerHTML = `
          <div class="user-menu">
            <button class="user-menu-trigger" title="${escapeHtml(user.name || user.email)}" aria-haspopup="true" aria-expanded="false">
              <div class="user-avatar">
                ${user.image ? `<img src="${escapeHtml(user.image)}" alt="${escapeHtml(user.name || 'User')}" />` : `<span>${escapeHtml((user.name || user.email || 'U')[0].toUpperCase())}</span>`}
              </div>
            </button>
            <div class="user-menu-dropdown" style="display: none;" role="menu">
              <div class="user-menu-header">
                <div class="user-menu-name">${escapeHtml(user.name || 'User')}</div>
                <div class="user-menu-email">${escapeHtml(user.email || '')}</div>
                <span class="user-menu-role ${roleCssClass}">${escapeHtml(roleLabel)}</span>
              </div>
              <hr class="user-menu-divider" />
              <button class="user-menu-item user-menu-signout" role="menuitem">
                <span class="material-icons">logout</span>
                <span>${window.t?.('auth.signOut') || 'Sign Out'}</span>
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
            const isOpen = dropdown.style.display !== 'none';
            dropdown.style.display = isOpen ? 'none' : 'block';
            trigger.setAttribute('aria-expanded', String(!isOpen));
          });

          // Close dropdown when clicking outside (uses AbortController to prevent listener accumulation)
          document.addEventListener('click', () => {
            dropdown.style.display = 'none';
            trigger.setAttribute('aria-expanded', 'false');
          }, { signal: userMenuAbortController.signal });

          // Close on Escape key
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.style.display !== 'none') {
              dropdown.style.display = 'none';
              trigger.setAttribute('aria-expanded', 'false');
              trigger.focus();
            }
          }, { signal: userMenuAbortController.signal });
        }
        
        if (signOutBtn) {
          signOutBtn.addEventListener('click', async () => {
            try {
              // Clear local sketch data before signing out to prevent cross-account contamination
              if (window.syncService?.clearLocalSketchData) {
                await window.syncService.clearLocalSketchData();
              }
              await signOutUser();
              await refreshSession();
              window.location.hash = '#/login';
            } catch (err) {
              console.error('[Auth] Sign out failed:', err.message);
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
    console.debug('[Auth] State changed:', state.isSignedIn ? 'signed in' : 'signed out');
    renderUserMenu(state.user);

    // Invalidate library cache so stale data from a previous account is never shown
    if (typeof window.invalidateLibraryCache === 'function') {
      window.invalidateLibraryCache();
    }

    // Force a route check when auth state changes
    if (window.handleRoute) {
      window.handleRoute();
    }
  });
  
  // Dispatch custom event so other parts of the app know auth is ready
  getCurrentSession().then(({ data }) => {
    if (data?.session) {
      console.debug('[Auth] Session restored');
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
  initPermissionsService();
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
  // Expose fix-suggestions engine for legacy/canvas code
  window.__getFixSuggestions = getFixSuggestions;
  window.__computeSketchIssues = computeSketchIssues;
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
    initCanvasFabToolbar();
    
    // Initialize new menu system
    initMenuSystem();
    
    // Initialize GNSS module
    initGnssModule();
    initPrecisionMeasureOverlay();
    initPrecisionMeasureOrchestrator();

    // Initialize My Location button
    initMyLocationUI();

    // Initialize Cockpit layout (landscape-first three-zone layout)
    initCockpit();
  });
}

/**
 * Initialize My Location button UI
 * Activates location tracking (Live Measure) and centers on user's position.
 * First click: enables tracking + shows marker + shows Take Measure button.
 * Subsequent clicks: re-centers on current position.
 */
function initMyLocationUI() {
  const myLocationBtn = document.getElementById('myLocationBtn');
  if (!myLocationBtn) return;

  myLocationBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isGeolocationSupported()) {
      window.showToast?.(window.t?.('location.notSupported') || 'Location not supported on this device');
      return;
    }

    // If already tracking, just re-center
    if (isBrowserLocationActive()) {
      const pos = gnssState.getPosition();
      if (pos && pos.isValid && window.centerOnGpsLocation) {
        window.centerOnGpsLocation(pos.lat, pos.lon);
      } else {
        window.showToast?.(window.t?.('liveMeasure.waiting') || 'Waiting for position...');
      }
      return;
    }

    // Enable Live Measure (starts browser location adapter, shows marker + Take Measure FAB)
    myLocationBtn.classList.add('loading');
    resetMarkerEntrance();

    if (window.setLiveMeasureMode) {
      window.setLiveMeasureMode(true);
    }

    // Brief wait for first fix, then center
    const waitForFix = () => new Promise((resolve) => {
      const pos = gnssState.getPosition();
      if (pos && pos.isValid) { resolve(pos); return; }
      let attempts = 0;
      const handler = (p) => {
        if (p && p.isValid) {
          gnssState.off('position', handler);
          resolve(p);
        } else if (++attempts > 50) { // ~5s timeout
          gnssState.off('position', handler);
          resolve(null);
        }
      };
      gnssState.on('position', handler);
    });

    try {
      const pos = await waitForFix();
      if (pos && window.centerOnGpsLocation) {
        window.centerOnGpsLocation(pos.lat, pos.lon);
      } else {
        window.showToast?.(window.t?.('liveMeasure.waiting') || 'Waiting for GPS signal...');
      }
    } finally {
      myLocationBtn.classList.remove('loading');
    }
  });

  // Update button appearance when GNSS state changes
  gnssState.on('position', () => updateMyLocationBtnState(myLocationBtn));
  gnssState.on('connection', () => updateMyLocationBtnState(myLocationBtn));

  // Expose GNSS connection for legacy code
  window.gnssConnection = gnssConnection;
  window.gnssState = gnssState;
}

/**
 * Initialize the precision-gated measurement orchestrator.
 * Wires window.__startPrecisionMeasure which is called by gpsQuickCapture()
 * in legacy/main.js when the Take Measure FAB is tapped.
 */
function initPrecisionMeasureOrchestrator() {
  window.__startPrecisionMeasure = function () {
    const position = gnssState.getPosition();
    if (!position || !position.isValid) {
      if (window.showToast) window.showToast('No GPS fix available');
      return;
    }

    const measurement = new PrecisionMeasurement();

    const overlay = showPrecisionOverlay({
      onCancel: () => { handle.cancel(); },
      onAcceptEarly: () => { handle.acceptEarly(); }
    });

    measurement.onProgress = (stats) => {
      overlay.update(stats);
    };

    measurement.onAutoStore = (result) => {
      overlay.showAutoStored();
      navigator.vibrate?.([50, 30, 50]);
      setTimeout(() => {
        overlay.close();
        if (typeof window.__createNodeFromMeasurement === 'function') {
          window.__createNodeFromMeasurement(result);
        }
      }, 400);
    };

    const handle = measurement.start();

    handle.promise.then((result) => {
      if (result.reason === 'early_accept' || result.reason === 'max_epochs') {
        overlay.close();
        if (typeof window.__createNodeFromMeasurement === 'function') {
          window.__createNodeFromMeasurement(result);
        }
      }
    }).catch(() => {
      overlay.close();
    });
  };
}

/**
 * Update My Location button visual state based on GNSS fix quality.
 * Shows colored ring around button matching the current precision.
 */
function updateMyLocationBtnState(btn) {
  if (!btn) return;
  const active = isBrowserLocationActive();
  btn.classList.toggle('tracking', active);

  if (active) {
    const pos = gnssState.getPosition();
    if (pos && pos.isValid) {
      const color = FIX_COLORS[pos.fixQuality] || FIX_COLORS[0];
      btn.style.setProperty('--fix-color', color);
      btn.classList.add('has-fix');
      btn.classList.remove('no-fix');
    } else {
      btn.classList.remove('has-fix');
      btn.classList.add('no-fix');
    }
  } else {
    btn.classList.remove('has-fix', 'no-fix', 'tracking');
    btn.style.removeProperty('--fix-color');
  }
}

/**
 * Initialize the refactored menu system
 * Sets up event delegation, dropdown behavior, and mobile menu
 */
function initMenuSystem() {
  // Set up event delegation on header and mobile menu
  const header = document.querySelector('.app-header');
  const mobileMenu = document.getElementById('mobileMenu');
  
  if (header) {
    setupEventDelegation(header);
  }
  if (mobileMenu) {
    setupEventDelegation(mobileMenu);
  }
  
  // Initialize command dropdown (More menu)
  initCommandDropdown();

  // Initialize mobile menu behavior
  initMobileMenuBehavior();

  // Wire My Sketches button (desktop + mobile) — navigates to home screen (#/)
  menuEvents.on('mySketches', () => {
    window.location.hash = '#/';
  });

  // Wire standalone mobile My Sketches button (not inside a group, not caught by delegation)
  const mobileMySketches = document.getElementById('mobileMySketchesBtn');
  if (mobileMySketches) {
    mobileMySketches.addEventListener('click', () => {
      window.location.hash = '#/';
      if (window.closeMobileMenu) window.closeMobileMenu();
    });
  }

  // Expose menuEvents globally for legacy code access
  window.menuEvents = menuEvents;
}

/**
 * Initialize command dropdown behavior
 */
function initCommandDropdown() {
  const menuBtn = document.getElementById('exportMenuBtn');
  const dropdown = document.getElementById('exportDropdown');
  
  if (!menuBtn || !dropdown) return;

  let isOpen = false;

  /**
   * Position the dropdown relative to the button using fixed positioning
   * This avoids clipping issues from parent overflow properties
   */
  function positionDropdown() {
    const btnRect = menuBtn.getBoundingClientRect();
    const isRTL = document.dir === 'rtl' || document.documentElement.dir === 'rtl';
    
    // Position below the button with a small gap
    dropdown.style.top = `${btnRect.bottom + 4}px`;
    
    // In RTL, align to the left edge of the button; in LTR, align to the right edge
    if (isRTL) {
      dropdown.style.left = `${btnRect.left}px`;
      dropdown.style.right = 'auto';
    } else {
      // Align dropdown's right edge to button's right edge
      dropdown.style.right = `${window.innerWidth - btnRect.right}px`;
      dropdown.style.left = 'auto';
    }
    
    // Ensure dropdown doesn't go off-screen
    requestAnimationFrame(() => {
      const dropdownRect = dropdown.getBoundingClientRect();
      
      // Check if dropdown goes below viewport
      if (dropdownRect.bottom > window.innerHeight) {
        const maxHeight = window.innerHeight - btnRect.bottom - 16;
        dropdown.style.maxHeight = `${maxHeight}px`;
      }
      
      // Check if dropdown goes off left edge (RTL) or right edge (LTR)
      if (dropdownRect.left < 8) {
        dropdown.style.left = '8px';
        dropdown.style.right = 'auto';
      } else if (dropdownRect.right > window.innerWidth - 8) {
        dropdown.style.right = '8px';
        dropdown.style.left = 'auto';
      }
    });
  }

  function openDropdown() {
    isOpen = true;
    positionDropdown();
    dropdown.classList.add('menu-dropdown--open');
    menuBtn.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown() {
    isOpen = false;
    dropdown.classList.remove('menu-dropdown--open');
    menuBtn.setAttribute('aria-expanded', 'false');
    // Reset max-height when closing
    dropdown.style.maxHeight = '';
  }

  function toggleDropdown(e) {
    e.stopPropagation();
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  // Toggle on button click
  menuBtn.addEventListener('click', toggleDropdown);
  
  // Reposition on window resize if open
  window.addEventListener('resize', () => {
    if (isOpen) {
      positionDropdown();
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (isOpen && !dropdown.contains(e.target) && e.target !== menuBtn) {
      closeDropdown();
    }
  });

  // Close on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeDropdown();
      menuBtn.focus();
    }
  });

  // Close after clicking action items (not toggles, scales, or selects)
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-dropdown__item');
    // Don't close for interactive control items
    if (item && 
        !item.classList.contains('menu-dropdown__item--toggle') && 
        !item.classList.contains('menu-dropdown__item--scale') &&
        !item.classList.contains('menu-dropdown__item--select')) {
      closeDropdown();
    }
  });

  // Keyboard navigation within dropdown
  dropdown.addEventListener('keydown', (e) => {
    const items = Array.from(dropdown.querySelectorAll('button:not([disabled]), input:not([disabled])'));
    const currentIndex = items.indexOf(document.activeElement);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex]?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        items[prevIndex]?.focus();
        break;
      }
      case 'Home':
        e.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Tab':
        // Close dropdown when tabbing out
        closeDropdown();
        break;
    }
  });
  
  // Focus first item when dropdown opens via keyboard
  menuBtn.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') && !isOpen) {
      e.preventDefault();
      openDropdown();
      // Focus first item
      const firstItem = dropdown.querySelector('button:not([disabled]), input:not([disabled])');
      if (firstItem) {
        setTimeout(() => firstItem.focus(), 10);
      }
    }
  });
}

/**
 * Initialize mobile menu behavior
 */
function initMobileMenuBehavior() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const closeBtn = document.getElementById('mobileMenuCloseBtn');
  const backdrop = document.getElementById('mobileMenuBackdrop');
  const mobileMenu = document.getElementById('mobileMenu');

  if (!menuBtn || !mobileMenu) return;

  let isMobileMenuOpen = false;
  let lastFocusedElement = null;

  // Get all focusable elements in the mobile menu
  function getFocusableElements() {
    return Array.from(mobileMenu.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
  }

  function openMobileMenu() {
    isMobileMenuOpen = true;
    lastFocusedElement = document.activeElement;

    mobileMenu.classList.add('mobile-menu--open');
    mobileMenu.style.display = 'flex';
    if (backdrop) backdrop.style.display = 'block';
    menuBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('mobile-menu-open');

    // Reset scroll to top after the CSS slide-in animation finishes (200ms).
    // Double-rAF alone was insufficient on some Android WebViews because the
    // animation hadn't completed yet, leaving scroll position stale.
    const scrollContainer = mobileMenu.querySelector('.mobile-menu-content');
    if (scrollContainer) {
      // Immediate reset (works in most browsers)
      scrollContainer.scrollTop = 0;
      // Also reset after animation completes for Android WebView reliability
      let scrollReset = false;
      const resetScroll = () => {
        if (!scrollReset) {
          scrollReset = true;
          scrollContainer.scrollTop = 0;
        }
      };
      mobileMenu.addEventListener('animationend', resetScroll, { once: true });
      // Fallback timeout in case animationend doesn't fire (e.g., reduced motion)
      setTimeout(resetScroll, 250);
    }

    // Focus close button for accessibility
    if (closeBtn) {
      closeBtn.focus();
    } else {
      const firstFocusable = mobileMenu.querySelector('button, input, select');
      if (firstFocusable) firstFocusable.focus();
    }
    
    // Announce to screen readers
    mobileMenu.setAttribute('aria-hidden', 'false');
  }

  function closeMobileMenu() {
    isMobileMenuOpen = false;
    mobileMenu.classList.remove('mobile-menu--open');
    mobileMenu.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('mobile-menu-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    
    // Return focus to the element that opened the menu
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    } else {
      menuBtn.focus();
    }
  }
  
  // Focus trap - keep focus within mobile menu when open
  mobileMenu.addEventListener('keydown', (e) => {
    if (!isMobileMenuOpen || e.key !== 'Tab') return;
    
    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) return;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    if (e.shiftKey) {
      // Shift+Tab - going backward
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab - going forward
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  });

  // Toggle on menu button click
  menuBtn.addEventListener('click', () => {
    if (isMobileMenuOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  // Close on close button click
  if (closeBtn) {
    closeBtn.addEventListener('click', closeMobileMenu);
  }

  // Close on backdrop click
  if (backdrop) {
    backdrop.addEventListener('click', closeMobileMenu);
    // Prevent touch events from reaching the canvas behind the backdrop
    backdrop.addEventListener('touchmove', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
  }

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobileMenuOpen) {
      closeMobileMenu();
    }
  });

  // Close after clicking action buttons
  mobileMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('.mobile-menu__btn');
    if (btn) {
      closeMobileMenu();
    }
  });

  // Update visibility based on screen size
  function updateResponsiveLayout() {
    const width = window.innerWidth;
    const controls = document.getElementById('controls');
    
    if (width <= 600) {
      controls?.classList.add('menu-controls--hidden');
      menuBtn.classList.remove('menu-toggle--hidden');
    } else {
      controls?.classList.remove('menu-controls--hidden');
      menuBtn.classList.add('menu-toggle--hidden');
      
      // Close mobile menu if open when resizing to desktop
      if (isMobileMenuOpen) {
        closeMobileMenu();
      }
    }
  }

  window.addEventListener('resize', updateResponsiveLayout);
  updateResponsiveLayout();
  
  // Expose close function for legacy code
  window.closeMobileMenu = closeMobileMenu;

  // Initialize collapsible group toggles inside the mobile menu
  initCollapsibleMobileMenuGroups(mobileMenu);
}

/**
 * Make mobile menu groups collapsible with localStorage persistence.
 *
 * Groups expanded by default: "nav" and "settings".
 * All other groups start collapsed and the user's choices are
 * persisted to localStorage('menuCollapsedGroups').
 *
 * Each group uses:
 *   .mobile-menu__group[data-group]              — wrapper element
 *   .mobile-menu__group--collapsed               — CSS class that hides content
 *   .mobile-menu__group-toggle[data-group-toggle] — clickable header button
 *   .mobile-menu__group-chevron                  — Material Icon that rotates
 *   aria-expanded                                — accessibility state
 *
 * @param {HTMLElement} menuEl — the #mobileMenu container element
 */
function initCollapsibleMobileMenuGroups(menuEl) {
  if (!menuEl) return;

  // Groups that are open by default (not in the collapsed set)
  const DEFAULT_EXPANDED = new Set(['settings']);

  // Load persisted collapsed state; derive defaults if absent
  let collapsedGroups;
  try {
    const stored = localStorage.getItem('menuCollapsedGroups');
    collapsedGroups = stored ? new Set(JSON.parse(stored)) : null;
  } catch (_) {
    collapsedGroups = null;
  }

  if (collapsedGroups === null) {
    collapsedGroups = new Set();
    menuEl.querySelectorAll('.mobile-menu__group-toggle[data-group-toggle]').forEach((btn) => {
      const group = btn.dataset.groupToggle;
      if (!DEFAULT_EXPANDED.has(group)) {
        collapsedGroups.add(group);
      }
    });
  }

  function saveCollapsedState() {
    try {
      localStorage.setItem('menuCollapsedGroups', JSON.stringify([...collapsedGroups]));
    } catch (_) { /* storage quota or private mode — fail silently */ }
  }

  /**
   * Apply collapsed/expanded state to a single group element.
   * @param {HTMLElement} groupEl
   * @param {boolean}     collapsed
   */
  function applyGroupState(groupEl, collapsed) {
    const toggleBtn = groupEl.querySelector('.mobile-menu__group-toggle');
    const chevron = groupEl.querySelector('.mobile-menu__group-chevron');

    groupEl.classList.toggle('mobile-menu__group--collapsed', collapsed);

    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    }
    if (chevron) {
      chevron.textContent = collapsed ? 'expand_more' : 'expand_less';
    }
  }

  // Apply initial state and wire click handlers
  menuEl.querySelectorAll('.mobile-menu__group-toggle[data-group-toggle]').forEach((toggleBtn) => {
    const group = toggleBtn.dataset.groupToggle;
    const groupEl = toggleBtn.closest('.mobile-menu__group');
    if (!groupEl) return;

    applyGroupState(groupEl, collapsedGroups.has(group));

    toggleBtn.addEventListener('click', (e) => {
      // Prevent the mobile-menu click handler from closing the whole menu
      e.stopPropagation();

      const isCollapsed = groupEl.classList.contains('mobile-menu__group--collapsed');
      const nowCollapsed = !isCollapsed;

      applyGroupState(groupEl, nowCollapsed);

      if (nowCollapsed) {
        collapsedGroups.add(group);
      } else {
        collapsedGroups.delete(group);
      }
      saveCollapsedState();
    });
  });
}

// After app scripts load, ensure header height and app height variables are synced
// syncAppHeightVar fixes Android devices (e.g., Samsung Note 10) where 100dvh doesn't work correctly
try { syncAppHeightVar(); } catch (e) { console.warn('[main-entry] syncAppHeightVar failed:', e); }
try { syncHeaderHeightVar(); } catch (e) { console.warn('[main-entry] syncHeaderHeightVar failed:', e); }

// --- Landscape header auto-hide ---
// In landscape mobile mode, the header auto-hides during canvas interaction to
// maximise vertical drawing space, then reappears on idle or top-edge hover.
function setupLandscapeHeaderAutoHide() {
  const header = document.querySelector('header');
  const canvas = document.getElementById('graphCanvas');
  if (!header || !canvas) return;

  let hideTimer = null;
  let isLandscape = false;

  /** Check if we're in landscape mobile mode */
  function checkLandscape() {
    isLandscape = window.innerHeight <= 450 && window.matchMedia('(orientation: landscape)').matches;
    if (!isLandscape) {
      // Portrait / desktop: ensure header is visible and classes removed
      header.classList.remove('header--hidden');
      header.classList.remove('header--landscape-auto-hide');
      document.body.classList.remove('landscape-header-hidden');
      clearTimeout(hideTimer);
      // Re-sync the header height variable
      syncHeaderHeight();
    } else {
      header.classList.add('header--landscape-auto-hide');
    }
  }

  /** Sync --header-h based on current header visibility */
  function syncHeaderHeight() {
    if (header.classList.contains('header--hidden')) {
      document.documentElement.style.setProperty('--header-h', '0px');
      document.body.classList.add('landscape-header-hidden');
    } else {
      const h = Math.round(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--header-h', h + 'px');
      document.body.classList.remove('landscape-header-hidden');
    }
  }

  function hideHeader() {
    if (!isLandscape) return;
    header.classList.add('header--hidden');
    syncHeaderHeight();
  }

  function showHeader() {
    header.classList.remove('header--hidden');
    syncHeaderHeight();
    clearTimeout(hideTimer);
    if (isLandscape) {
      hideTimer = setTimeout(hideHeader, 2500);
    }
  }

  // Watch for class changes on header to keep --header-h in sync
  if (typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver(() => syncHeaderHeight());
    mo.observe(header, { attributes: true, attributeFilter: ['class'] });
  }

  /** True when the mobile menu is open — header must stay visible */
  function isMobileMenuOpen() {
    return document.body.classList.contains('mobile-menu-open');
  }

  // Canvas interaction: hide immediately on touch, schedule re-show after release
  canvas.addEventListener('pointerdown', () => {
    if (isLandscape && !isMobileMenuOpen()) hideHeader();
  }, { passive: true });

  canvas.addEventListener('pointerup', () => {
    if (isLandscape && !isMobileMenuOpen()) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideHeader, 2500);
    }
  }, { passive: true });

  // Show header when pointer moves near the top edge (within 30px)
  canvas.addEventListener('pointermove', (e) => {
    if (!isLandscape) return;
    if (e.clientY <= 30) showHeader();
  }, { passive: true });

  // Top-of-screen reveal zone (works even when header is hidden / pointer-events: none)
  document.addEventListener('pointerdown', (e) => {
    if (!isLandscape) return;
    if (e.clientY <= 10) showHeader();
  }, { passive: true });

  // When mobile menu opens, ensure header stays visible; resume auto-hide when closed
  const menuBtnEl = document.getElementById('mobileMenuBtn');
  if (menuBtnEl) {
    menuBtnEl.addEventListener('click', () => {
      if (isLandscape) {
        showHeader();
        // Keep header visible while menu is open — cancel auto-hide timer
        clearTimeout(hideTimer);
      }
    });
  }

  // Watch for mobile-menu-open class removal (menu closed) to restart auto-hide
  if (typeof MutationObserver !== 'undefined') {
    const bodyMo = new MutationObserver(() => {
      if (isLandscape && !isMobileMenuOpen()) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hideHeader, 2500);
      }
    });
    bodyMo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  // Issue #5: Header recall handle — tapping the thin strip shows the header
  const recallHandle = document.getElementById('headerRecallHandle');
  if (recallHandle) {
    recallHandle.addEventListener('click', () => {
      if (isLandscape) showHeader();
    });
    recallHandle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isLandscape) showHeader();
      }
    });
  }

  // Re-evaluate on resize and orientation change
  window.addEventListener('resize', checkLandscape);
  window.addEventListener('orientationchange', checkLandscape);
  checkLandscape();

  // Start auto-hide timer on load in landscape
  if (isLandscape) {
    hideTimer = setTimeout(hideHeader, 3000);
  }
}

try { setupLandscapeHeaderAutoHide(); } catch (e) { console.warn('[main-entry] setupLandscapeHeaderAutoHide failed:', e); }
