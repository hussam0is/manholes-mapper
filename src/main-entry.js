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
import { menuEvents, setupEventDelegation } from './menu/menu-events.js';

// GNSS Module imports
import { 
  initGnssModule, 
  gnssConnection, 
  gnssState, 
  ConnectionState 
} from './gnss/index.js';

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
    
    // Initialize new menu system
    initMenuSystem();
    
    // Initialize GNSS module
    initGnssModule();
    initGnssUI();
  });
}

/**
 * Initialize GNSS UI controls and event listeners
 */
function initGnssUI() {
  const liveMeasureBtn = document.getElementById('liveMeasureBtn');
  const gnssStatusPill = document.getElementById('gnssStatusPill');
  const gnssControlsPanel = document.getElementById('gnssControlsPanel');
  const gnssConnectBtn = document.getElementById('gnssConnectBtn');
  const gnssCaptureBtn = document.getElementById('gnssCaptureBtn');
  
  if (!liveMeasureBtn) return;
  
  let liveMeasureEnabled = false;
  
  // Toggle Live Measure mode
  liveMeasureBtn.addEventListener('click', () => {
    liveMeasureEnabled = !liveMeasureEnabled;
    gnssState.setLiveMeasureEnabled(liveMeasureEnabled);
    
    liveMeasureBtn.classList.toggle('active', liveMeasureEnabled);
    gnssStatusPill?.classList.toggle('hidden', !liveMeasureEnabled);
    gnssControlsPanel?.classList.toggle('hidden', !liveMeasureEnabled);
    
    // Notify legacy code
    if (window.setLiveMeasureMode) {
      window.setLiveMeasureMode(liveMeasureEnabled);
    }
    
    console.log('Live Measure mode:', liveMeasureEnabled ? 'enabled' : 'disabled');
  });
  
  // Connect button - show connection options
  gnssConnectBtn?.addEventListener('click', async () => {
    const connectionInfo = gnssState.getConnectionInfo();
    
    if (connectionInfo.isConnected) {
      // Disconnect
      await gnssConnection.disconnect();
    } else {
      // Show connection dialog or connect to mock for testing
      // In production, this would show a dialog to select Bluetooth device or enter WiFi IP
      
      // Check if running in Capacitor
      if (window.Capacitor) {
        // Show device selection dialog
        showConnectionDialog();
      } else {
        // In browser, use mock for testing
        console.log('Connecting to Mock GNSS (browser mode)...');
        await gnssConnection.connectMock();
      }
    }
  });
  
  // Capture button
  gnssCaptureBtn?.addEventListener('click', () => {
    if (window.openGnssPointCaptureDialog) {
      window.openGnssPointCaptureDialog();
    }
  });
  
  // Listen for connection state changes
  gnssConnection.onConnectionChange((info) => {
    updateGnssStatusUI(info);
    
    // Update connect button
    if (gnssConnectBtn) {
      const icon = gnssConnectBtn.querySelector('.material-icons');
      const label = gnssConnectBtn.querySelector('span:not(.material-icons)');
      
      if (info.isConnected) {
        if (icon) icon.textContent = 'bluetooth_connected';
        if (label) label.textContent = 'נתק';
        gnssConnectBtn.classList.add('connected');
      } else {
        if (icon) icon.textContent = 'bluetooth';
        if (label) label.textContent = 'התחבר ל-R780';
        gnssConnectBtn.classList.remove('connected');
      }
    }
    
    // Enable/disable capture button
    if (gnssCaptureBtn) {
      gnssCaptureBtn.disabled = !info.isConnected;
    }
  });
  
  // Listen for position updates
  gnssConnection.onPositionUpdate((position) => {
    updateGnssPositionUI(position);
    
    // Enable capture button when position is valid
    if (gnssCaptureBtn) {
      gnssCaptureBtn.disabled = !position.isValid;
    }
    
    // Trigger canvas redraw
    if (window.scheduleDraw) {
      window.scheduleDraw();
    }
  });
  
  // Expose for legacy code
  window.gnssConnection = gnssConnection;
  window.gnssState = gnssState;
}

/**
 * Update GNSS status UI elements
 * @param {object} info - Connection info
 */
function updateGnssStatusUI(info) {
  const statusIndicator = document.getElementById('gnssStatusIndicator');
  const statusMain = document.getElementById('gnssStatusMain');
  const statusDetail = document.getElementById('gnssStatusDetail');
  const liveMeasureBtn = document.getElementById('liveMeasureBtn');
  
  if (statusIndicator) {
    statusIndicator.className = 'status-indicator';
    
    if (info.state === ConnectionState.CONNECTED) {
      statusIndicator.classList.add('connected');
    } else if (info.state === ConnectionState.CONNECTING) {
      statusIndicator.classList.add('connecting');
    } else if (info.state === ConnectionState.ERROR) {
      statusIndicator.classList.add('error');
    }
  }
  
  if (statusMain) {
    switch (info.state) {
      case ConnectionState.CONNECTED:
        statusMain.textContent = 'מחובר';
        break;
      case ConnectionState.CONNECTING:
        statusMain.textContent = 'מתחבר...';
        break;
      case ConnectionState.ERROR:
        statusMain.textContent = 'שגיאה';
        break;
      default:
        statusMain.textContent = 'לא מחובר';
    }
  }
  
  if (statusDetail) {
    statusDetail.textContent = info.deviceName || '';
  }
  
  // Update button state
  if (liveMeasureBtn) {
    liveMeasureBtn.classList.toggle('connecting', info.state === ConnectionState.CONNECTING);
  }
}

/**
 * Update GNSS position display
 * @param {object} position - Position data
 */
function updateGnssPositionUI(position) {
  const statusMain = document.getElementById('gnssStatusMain');
  const statusDetail = document.getElementById('gnssStatusDetail');
  const statusIndicator = document.getElementById('gnssStatusIndicator');
  
  if (!position.isValid) {
    return;
  }
  
  if (statusMain) {
    statusMain.textContent = position.fixLabel || 'GPS';
  }
  
  if (statusDetail) {
    const parts = [];
    if (position.satellites != null) {
      parts.push(`${position.satellites} לוויינים`);
    }
    if (position.hdop != null) {
      parts.push(`HDOP: ${position.hdop.toFixed(1)}`);
    }
    statusDetail.textContent = parts.join(' | ');
  }
  
  if (statusIndicator && position.isStale) {
    statusIndicator.classList.add('stale');
  } else if (statusIndicator) {
    statusIndicator.classList.remove('stale');
  }
}

/**
 * Show connection dialog for selecting Bluetooth device or WiFi
 * This is a placeholder - will be implemented with actual device selection
 */
async function showConnectionDialog() {
  // For now, try Bluetooth first
  const isBluetoothAvailable = await gnssConnection.isBluetoothAvailable();
  
  if (isBluetoothAvailable) {
    const devices = await gnssConnection.getPairedDevices();
    
    if (devices.length === 0) {
      alert('לא נמצאו מכשירים מותאמים. אנא התאם את ה-R780 בהגדרות Bluetooth של המכשיר.');
      return;
    }
    
    // Find Trimble device or show first device
    const trimbleDevice = devices.find(d => d.isTrimble);
    const deviceToConnect = trimbleDevice || devices[0];
    
    console.log('Connecting to:', deviceToConnect.name);
    await gnssConnection.connectBluetooth(deviceToConnect.address);
  } else {
    // Try WiFi with default IP
    const host = prompt('הזן כתובת IP של ה-R780:', '192.168.1.10');
    if (host) {
      await gnssConnection.connectWifi(host, 5017);
    }
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
      case 'ArrowDown':
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        items[prevIndex]?.focus();
        break;
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
try { syncAppHeightVar(); } catch (_) { }
try { syncHeaderHeightVar(); } catch (_) { }
