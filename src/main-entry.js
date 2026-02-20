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
import { menuEvents, setupEventDelegation } from './menu/menu-events.js';
import {
  initGnssModule,
  gnssConnection,
  gnssState,
  isBrowserLocationActive
} from './gnss/index.js';
import {
  requestLocationPermission,
  isGeolocationSupported
} from './map/user-location.js';

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
        // User is signed in - show user menu
        container.innerHTML = `
          <div class="user-menu">
            <button class="user-menu-trigger" title="${escapeHtml(user.name || user.email)}">
              <div class="user-avatar">
                ${user.image ? `<img src="${escapeHtml(user.image)}" alt="${escapeHtml(user.name || 'User')}" />` : `<span>${escapeHtml((user.name || user.email || 'U')[0].toUpperCase())}</span>`}
              </div>
            </button>
            <div class="user-menu-dropdown" style="display: none;">
              <div class="user-menu-header">
                <div class="user-menu-name">${escapeHtml(user.name || 'User')}</div>
                <div class="user-menu-email">${escapeHtml(user.email || '')}</div>
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
          
          // Close dropdown when clicking outside (uses AbortController to prevent listener accumulation)
          document.addEventListener('click', () => {
            dropdown.style.display = 'none';
          }, { signal: userMenuAbortController.signal });
        }
        
        if (signOutBtn) {
          signOutBtn.addEventListener('click', async () => {
            try {
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
    initCanvasFabToolbar();
    
    // Initialize new menu system
    initMenuSystem();
    
    // Initialize GNSS module
    initGnssModule();
    
    // Initialize My Location button
    initMyLocationUI();
  });
}

/**
 * Initialize My Location button UI
 * Centers the map on the user's GPS location when clicked
 */
function initMyLocationUI() {
  const myLocationBtn = document.getElementById('myLocationBtn');
  if (!myLocationBtn) return;

  myLocationBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isGeolocationSupported()) {
      if (window.showToast) {
        window.showToast(window.t?.('location.notSupported') || 'Location not supported on this device');
      }
      return;
    }

    myLocationBtn.classList.add('loading');
    myLocationBtn.disabled = true;

    try {
      // If Live Measure is active, use the already-streaming gnssState position
      if (isBrowserLocationActive()) {
        const pos = gnssState.getPosition();
        if (pos && pos.isValid && window.centerOnGpsLocation) {
          window.centerOnGpsLocation(pos.lat, pos.lon);
        } else if (window.showToast) {
          window.showToast(window.t?.('liveMeasure.waiting') || 'Waiting for position...');
        }
      } else {
        // One-shot position request (Live Measure not active)
        const result = await requestLocationPermission();

        if (result && result.error) {
          if (window.showToast) {
            switch (result.error) {
              case 'permission_denied':
                window.showToast(window.t?.('location.permissionDenied') || 'Location permission denied. Please enable location in your browser/app settings.');
                break;
              case 'position_unavailable':
                window.showToast(window.t?.('location.positionUnavailable') || 'Location unavailable. Please check GPS is enabled.');
                break;
              case 'timeout':
                window.showToast(window.t?.('location.timeout') || 'Location request timed out. Please try again.');
                break;
              case 'not_supported':
                window.showToast(window.t?.('location.notSupported') || 'Location not supported on this device');
                break;
              default:
                window.showToast(window.t?.('location.error') || 'Could not get location');
            }
          }
        } else if (result && result.lat !== undefined) {
          if (window.centerOnGpsLocation) {
            window.centerOnGpsLocation(result.lat, result.lon);
          }
        } else if (window.showToast) {
          window.showToast(window.t?.('location.error') || 'Could not get location');
        }
      }
    } catch (error) {
      console.error('[Location] Error getting location:', error.message);
      if (window.showToast) {
        window.showToast(window.t?.('location.error') || 'Error getting location');
      }
    } finally {
      myLocationBtn.classList.remove('loading');
      myLocationBtn.disabled = false;
    }
  });

  // Expose GNSS connection for legacy code
  window.gnssConnection = gnssConnection;
  window.gnssState = gnssState;
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
}

// After app scripts load, ensure header height and app height variables are synced
// syncAppHeightVar fixes Android devices (e.g., Samsung Note 10) where 100dvh doesn't work correctly
try { syncAppHeightVar(); } catch (e) { console.warn('[main-entry] syncAppHeightVar failed:', e); }
try { syncHeaderHeightVar(); } catch (e) { console.warn('[main-entry] syncHeaderHeightVar failed:', e); }
