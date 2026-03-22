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

// Convenience wrapper
const t = (...args) => F.t(...args);

// Shared AdminSettings / AdminPanel instances
let adminSettingsModal = null;
let adminSettingsScreen = null;
let projectsSettingsScreen = null;

/**
 * Open the legacy admin config modal (lightweight settings only).
 */
export async function openAdminModal() {
  const adminModal = document.getElementById('adminModal');
  const adminContent = document.getElementById('adminContent');
  if (!adminModal || !adminContent) return;

  // Lazy-load AdminSettings (admin-only module)
  const { AdminSettings } = await import('../admin/admin-settings.js');

  adminSettingsModal = new AdminSettings({
    container: adminContent,
    config: S.adminConfig,
    t,
    showHeader: true,
  });
  adminSettingsModal.render();

  adminModal.style.display = 'flex';

  // Apply localized title
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

/**
 * Open the full admin screen (AdminPanel hub with Users/Orgs/Features tabs).
 */
export async function openAdminScreen() {
  const adminScreen = document.getElementById('adminScreen');
  const adminScreenContent = document.getElementById('adminScreenContent');
  const adminScreenTitleEl = document.getElementById('adminScreenTitle');
  const mainEl = document.getElementById('main');
  if (!adminScreen || !adminScreenContent) return;

  // Show admin screen and hide main content IMMEDIATELY
  if (adminScreenTitleEl) {
    const titleText = adminScreenTitleEl.querySelector('.admin-title-text');
    if (titleText) titleText.textContent = t('adminPanel.tabs.settings');
  }
  if (mainEl) mainEl.style.display = 'none';
  adminScreen.style.display = 'block';
  F.applyLangToStaticUI();

  // Lazy-load AdminSettings (admin-only module, supersedes removed AdminPanel)
  const { AdminSettings } = await import('../admin/admin-settings.js');

  // Preserve active tab across re-renders
  const prevTab = adminSettingsScreen ? adminSettingsScreen.getActiveTab?.() : null;

  adminSettingsScreen = new AdminSettings({
    container: adminScreenContent,
    config: S.adminConfig,
    t,
    showHeader: true,
    onSave: (cfg) => {
      Object.assign(S.adminConfig, cfg);
      F.saveAdminConfig();
      F.renderDetails();
    },
    onCancel: () => {
      F.markInternalNavigation();
      closeAdminScreen();
      try { location.hash = '#/'; } catch (_) { }
    },
  });
  adminSettingsScreen.render();

  if (prevTab) {
    try { adminSettingsScreen.setActiveTab(prevTab); } catch (_) { }
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
}

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

/**
 * Navigate to the projects screen (closes mobile menu, updates hash).
 */
export function navigateToProjects() {
  try { F.closeMobileMenu(); } catch (_) { }
  F.markInternalNavigation();
  try { location.hash = '#/projects'; } catch (_) { }
  try { F.handleRoute(); } catch (_) { }
}

/**
 * Navigate to the admin screen (closes mobile menu, updates hash).
 */
export function navigateToAdmin() {
  try { F.closeMobileMenu(); } catch (_) { }
  F.markInternalNavigation();
  try { location.hash = '#/admin'; } catch (_) { }
  try { F.handleRoute(); } catch (_) { }
}

/** Return the current adminSettingsModal instance (for save/import handlers in main.js). */
export function getAdminSettingsModal() { return adminSettingsModal; }

/** Return the current adminSettingsScreen instance (for save/import handlers in main.js). */
export function getAdminSettingsScreen() { return adminSettingsScreen; }

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
