/**
 * admin-handlers.js
 *
 * Extracted admin panel / projects screen open/close handlers from src/legacy/main.js.
 *
 * Reads admin config through the shared S proxy.
 * Calls cross-module functions through the shared F registry.
 *
 * Call initAdminHandlers() from main.js after DOM is available and F is populated.
 */

import { S, F } from './shared-state.js';

// Convenience wrappers
const t = (...args) => F.t(...args);
const showToast = (...args) => F.showToast(...args);

// Shared AdminSettings / AdminPanel instances (legacy compat)
let adminSettingsModal = null;
let adminSettingsScreen = null;
let projectsSettingsScreen = null;

// ── Hub state ───────────────────────────────────────────────────────────
let _activeHubTab = 'settings';   // persists across re-opens within session
let _hubTabInstances = {};        // reset on each openAdminScreen()
let _hubTabContentEl = null;      // ref to #adminScreenContent
let _prevSettingsSubTab = null;   // preserve Nodes/Edges sub-tab

/** Tab definitions — order determines display order. */
const ADMIN_HUB_TABS = [
  { id: 'settings',   icon: 'settings',   i18nKey: 'adminPanel.tabs.settings',   superOnly: false },
  { id: 'users',      icon: 'people',      i18nKey: 'adminPanel.tabs.users',      superOnly: false },
  { id: 'orgs',       icon: 'business',    i18nKey: 'adminPanel.tabs.orgs',       superOnly: true  },
  { id: 'features',   icon: 'toggle_on',   i18nKey: 'adminPanel.tabs.features',   superOnly: true  },
  { id: 'fixes',      icon: 'build',       i18nKey: 'adminPanel.tabs.fixes',      superOnly: false },
  { id: 'statistics', icon: 'bar_chart',   i18nKey: 'adminPanel.tabs.statistics', superOnly: false },
];

// ── Admin Modal (lightweight, legacy) ───────────────────────────────────

/**
 * Open the legacy admin config modal (lightweight settings only).
 */
export async function openAdminModal() {
  const adminModal = document.getElementById('adminModal');
  const adminContent = document.getElementById('adminContent');
  if (!adminModal || !adminContent) return;

  const { AdminSettings } = await import('../admin/admin-settings.js');

  adminSettingsModal = new AdminSettings({
    container: adminContent,
    config: S.adminConfig,
    t,
    showHeader: true,
  });
  adminSettingsModal.render();

  adminModal.style.display = 'flex';

  const adminTitleEl = document.getElementById('adminTitle');
  if (adminTitleEl) {
    const titleText = adminTitleEl.querySelector('.admin-title-text');
    if (titleText) titleText.textContent = t('admin.title');
  }

  F.applyLangToStaticUI();
}

/**
 * Close the legacy admin config modal.
 */
export function closeAdminModal() {
  const adminModal = document.getElementById('adminModal');
  if (adminModal) adminModal.style.display = 'none';
}

// ── Admin Hub Screen ────────────────────────────────────────────────────

/**
 * Open the full admin screen (hub with Settings/Users/Orgs/Features/Fixes/Statistics tabs).
 */
export async function openAdminScreen() {
  const adminScreen = document.getElementById('adminScreen');
  const adminScreenContent = document.getElementById('adminScreenContent');
  const adminScreenTitleEl = document.getElementById('adminScreenTitle');
  const mainEl = document.getElementById('main');
  if (!adminScreen || !adminScreenContent) return;

  // Show admin screen immediately
  if (mainEl) mainEl.style.display = 'none';
  adminScreen.style.display = 'block';
  F.applyLangToStaticUI();

  // Get current user role data
  const roleData = window.permissionsService?.getUserRole?.() || {};

  // Filter tabs by role
  const visibleTabs = ADMIN_HUB_TABS.filter(tab => !tab.superOnly || roleData.isSuperAdmin);

  // Validate active tab is still visible
  if (!visibleTabs.find(tab => tab.id === _activeHubTab)) {
    _activeHubTab = 'settings';
  }

  // Remove any previously injected tab bar (handles re-renders)
  const existingTabBar = adminScreen.querySelector('.ap-hub-tabs');
  if (existingTabBar) existingTabBar.remove();

  // Build tab bar
  const tabBar = document.createElement('nav');
  tabBar.className = 'ap-hub-tabs';
  tabBar.setAttribute('role', 'tablist');

  for (const tab of visibleTabs) {
    const btn = document.createElement('button');
    btn.className = 'tab' + (tab.id === _activeHubTab ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('data-hub-tab', tab.id);
    btn.setAttribute('aria-selected', tab.id === _activeHubTab ? 'true' : 'false');
    btn.innerHTML = `<span class="material-icons">${tab.icon}</span><span class="ap-tab-label">${t(tab.i18nKey)}</span>`;
    btn.addEventListener('click', () => _switchHubTab(tab.id));
    tabBar.appendChild(btn);
  }

  // Insert tab bar between header and content
  const header = adminScreen.querySelector('.admin-header');
  if (header) {
    header.insertAdjacentElement('afterend', tabBar);
  } else {
    adminScreenContent.parentElement?.insertBefore(tabBar, adminScreenContent);
  }

  // Update title
  if (adminScreenTitleEl) {
    const titleText = adminScreenTitleEl.querySelector('.admin-title-text');
    if (titleText) titleText.textContent = t('admin.title');
  }

  // Reset instance cache
  _hubTabInstances = {};
  _hubTabContentEl = adminScreenContent;

  // Activate the current tab
  await _switchHubTab(_activeHubTab);
}

/**
 * Switch to a hub tab by ID. Lazy-loads and renders the tab component.
 */
async function _switchHubTab(tabId) {
  if (!_hubTabContentEl) return;

  _activeHubTab = tabId;

  // Save Settings sub-tab before switching away
  if (_hubTabInstances.settings) {
    try { _prevSettingsSubTab = _hubTabInstances.settings.getActiveTab?.(); } catch (_) { /* ignore */ }
  }

  // Update tab bar active states
  const tabBar = document.querySelector('.ap-hub-tabs');
  if (tabBar) {
    for (const btn of tabBar.querySelectorAll('.tab')) {
      const isActive = btn.getAttribute('data-hub-tab') === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  }

  // Update title
  const tabDef = ADMIN_HUB_TABS.find(t => t.id === tabId);
  const titleEl = document.getElementById('adminScreenTitle');
  if (titleEl && tabDef) {
    const titleText = titleEl.querySelector('.admin-title-text');
    if (titleText) titleText.textContent = t(tabDef.i18nKey);
  }

  // Show spinner
  _hubTabContentEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:200px;">
      <div class="ap-spinner"></div>
    </div>`;

  try {
    const instance = await _loadHubTab(tabId);
    _hubTabInstances[tabId] = instance;

    // Clear spinner and render
    _hubTabContentEl.innerHTML = '';
    instance.container = _hubTabContentEl;
    await instance.render();

    // Restore Settings sub-tab (Nodes/Edges)
    if (tabId === 'settings' && _prevSettingsSubTab) {
      try { instance.setActiveTab?.(_prevSettingsSubTab); } catch (_) { /* ignore */ }
    }
  } catch (err) {
    console.error(`[Admin] Failed to load tab "${tabId}":`, err);
    _hubTabContentEl.innerHTML = `
      <div style="padding:2rem;text-align:center;color:var(--color-muted);">
        <span class="material-icons" style="font-size:2rem;margin-bottom:0.5rem;display:block;">error_outline</span>
        ${t('adminPanel.tabs.loadError')}
      </div>`;
  }
}

/**
 * Lazy-load and instantiate a tab component by ID.
 */
async function _loadHubTab(tabId) {
  const roleData = window.permissionsService?.getUserRole?.() || {};
  const authState = window.authGuard?.getAuthState?.() || {};
  const currentUser = {
    role: roleData.role,
    organizationId: roleData.organizationId,
    isSuperAdmin: roleData.isSuperAdmin,
    isAdmin: roleData.isAdmin,
    ...authState.user,
  };

  switch (tabId) {
    case 'settings': {
      const { AdminSettings } = await import('../admin/admin-settings.js');
      return new AdminSettings({
        container: _hubTabContentEl,
        config: S.adminConfig,
        t,
        showHeader: false,
        onSave: (cfg) => {
          Object.assign(S.adminConfig, cfg);
          F.saveAdminConfig();
          F.renderDetails();
        },
        onCancel: () => {
          F.markInternalNavigation();
          closeAdminScreen();
          try { location.hash = '#/'; } catch (_) { /* ignore */ }
        },
      });
    }
    case 'users': {
      const { AdminUsers } = await import('../admin/admin-users.js');
      return new AdminUsers({
        container: _hubTabContentEl,
        t,
        showToast,
        currentUser,
      });
    }
    case 'orgs': {
      const { AdminOrganizations } = await import('../admin/admin-organizations.js');
      return new AdminOrganizations({
        container: _hubTabContentEl,
        t,
        showToast,
      });
    }
    case 'features': {
      const { AdminFeatures } = await import('../admin/admin-features.js');
      return new AdminFeatures({
        container: _hubTabContentEl,
        t,
        showToast,
        currentUser,
      });
    }
    case 'fixes': {
      const { AdminFixes } = await import('../admin/admin-fixes.js');
      return new AdminFixes({
        container: _hubTabContentEl,
        t,
        showToast,
      });
    }
    case 'statistics': {
      const { AdminStatistics } = await import('../admin/admin-statistics.js');
      return new AdminStatistics({
        container: _hubTabContentEl,
        t,
        showToast,
        currentUser,
      });
    }
    default:
      throw new Error(`Unknown admin tab: ${tabId}`);
  }
}

/**
 * Close the full admin screen and restore main content.
 */
export function closeAdminScreen() {
  const adminScreen = document.getElementById('adminScreen');
  const mainEl = document.getElementById('main');
  if (adminScreen) adminScreen.style.display = 'none';
  if (mainEl) mainEl.style.display = '';

  // Clean up hub state (but preserve _activeHubTab for re-open)
  const tabBar = adminScreen?.querySelector('.ap-hub-tabs');
  if (tabBar) tabBar.remove();
  _hubTabInstances = {};
  _hubTabContentEl = null;
}

// ── Projects Screen ─────────────────────────────────────────────────────

/**
 * Open the projects management screen.
 */
export async function openProjectsScreen() {
  const projectsScreen = document.getElementById('projectsScreen');
  const projectsScreenContent = document.getElementById('projectsScreenContent');
  const projectsScreenTitleEl = document.getElementById('projectsScreenTitle');
  const mainEl = document.getElementById('main');
  if (!projectsScreen || !projectsScreenContent) return;

  if (projectsScreenTitleEl) {
    const titleText = projectsScreenTitleEl.querySelector('.admin-title-text');
    if (titleText) titleText.textContent = t('projects.title');
  }
  if (mainEl) mainEl.style.display = 'none';
  projectsScreen.style.display = 'block';
  F.applyLangToStaticUI();

  const { ProjectsSettings } = await import('../admin/projects-settings.js');

  projectsSettingsScreen = new ProjectsSettings({
    container: projectsScreenContent,
    t,
    showToast: (...a) => F.showToast(...a),
  });
  await projectsSettingsScreen.render();
}

/**
 * Close the projects management screen.
 */
export function closeProjectsScreen() {
  const projectsScreen = document.getElementById('projectsScreen');
  const mainEl = document.getElementById('main');
  if (projectsScreen) projectsScreen.style.display = 'none';
  if (mainEl) mainEl.style.display = '';
}

// ── Navigation helpers ──────────────────────────────────────────────────

/**
 * Navigate to the projects screen (closes mobile menu, updates hash).
 */
export function navigateToProjects() {
  try { F.closeMobileMenu(); } catch (_) { /* ignore */ }
  F.markInternalNavigation();
  try { location.hash = '#/projects'; } catch (_) { /* ignore */ }
  try { F.handleRoute(); } catch (_) { /* ignore */ }
}

/**
 * Navigate to the admin screen (closes mobile menu, updates hash).
 */
export function navigateToAdmin() {
  try { F.closeMobileMenu(); } catch (_) { /* ignore */ }
  F.markInternalNavigation();
  try { location.hash = '#/admin'; } catch (_) { /* ignore */ }
  try { F.handleRoute(); } catch (_) { /* ignore */ }
}

// ── Getters ─────────────────────────────────────────────────────────────

/** Return the current adminSettingsModal instance (for save/import handlers in main.js). */
export function getAdminSettingsModal() { return adminSettingsModal; }

/** Return the current adminSettingsScreen instance (for save/import handlers in main.js). */
export function getAdminSettingsScreen() { return _hubTabInstances.settings || adminSettingsScreen; }

// ── Init ────────────────────────────────────────────────────────────────

/**
 * Wire admin/projects button click and touchend handlers.
 * Must be called after DOM is ready.
 */
export function initAdminHandlers() {
  const adminBtn = document.getElementById('adminBtn');
  const mobileAdminBtn = document.getElementById('mobileAdminBtn');
  const projectsBtn = document.getElementById('projectsBtn');
  const mobileProjectsBtn = document.getElementById('mobileProjectsBtn');

  if (adminBtn) adminBtn.addEventListener('click', (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    navigateToAdmin();
  });
  if (mobileAdminBtn) {
    const openAdminFromMobile = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      navigateToAdmin();
    };
    mobileAdminBtn.addEventListener('click', openAdminFromMobile);
    try { mobileAdminBtn.addEventListener('touchend', openAdminFromMobile, { passive: false }); } catch (_) { mobileAdminBtn.addEventListener('touchend', openAdminFromMobile); }
  }

  if (projectsBtn) projectsBtn.addEventListener('click', (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    navigateToProjects();
  });
  if (mobileProjectsBtn) {
    const openProjectsFromMobile = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      navigateToProjects();
    };
    mobileProjectsBtn.addEventListener('click', openProjectsFromMobile);
    try { mobileProjectsBtn.addEventListener('touchend', openProjectsFromMobile, { passive: false }); } catch (_) { mobileProjectsBtn.addEventListener('touchend', openProjectsFromMobile); }
  }
}
