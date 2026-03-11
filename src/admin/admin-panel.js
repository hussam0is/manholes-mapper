/**
 * Admin Panel Hub
 *
 * Tabbed admin interface with 6 tabs:
 *   Users, Organizations, Features, Settings, Projects, Issues & Fixes
 *
 * Tab visibility is role-based:
 *   admin:       Settings, Projects
 *   super_admin: Users, Organizations, Features, Settings, Projects, Issues & Fixes
 *
 * This module renders into an existing #adminScreenContent element and manages
 * its own tab state. Sub-tab modules are lazy-loaded on first activation.
 */

function escapeHtml(str) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tabs definition — role controls visibility */
const TABS = [
  { id: 'settings',  icon: 'tune',         i18nKey: 'adminPanel.tabs.settings',  roles: ['admin', 'super_admin'] },
  { id: 'projects',  icon: 'folder_open',   i18nKey: 'adminPanel.tabs.projects',  roles: ['admin', 'super_admin'] },
  { id: 'users',     icon: 'people',        i18nKey: 'adminPanel.tabs.users',     roles: ['super_admin'] },
  { id: 'orgs',      icon: 'business',      i18nKey: 'adminPanel.tabs.orgs',      roles: ['super_admin'] },
  { id: 'features',  icon: 'toggle_on',     i18nKey: 'adminPanel.tabs.features',  roles: ['super_admin'] },
  { id: 'fixes',     icon: 'build',         i18nKey: 'adminPanel.tabs.fixes',     roles: ['super_admin'] },
  { id: 'statistics', icon: 'bar_chart',    i18nKey: 'adminPanel.tabs.statistics', roles: ['admin', 'super_admin'] },
];

export class AdminPanel {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container  - The #adminScreenContent element
   * @param {object} options.adminConfig     - Current admin configuration (nodes/edges settings)
   * @param {Function} options.t             - Translation function
   * @param {Function} options.showToast     - Toast notification function
   * @param {Function} options.onSaveSettings - Called when Settings tab saves (config, newConfig)
   * @param {Function} options.onClose       - Called when the panel requests to close
   */
  constructor({ container, adminConfig, t, showToast, onSaveSettings, onClose }) {
    this.container = container;
    this.adminConfig = adminConfig;
    this.t = t;
    this.showToast = showToast;
    this.onSaveSettings = onSaveSettings;
    this.onClose = onClose;
    this._activeTab = null;
    this._loadedTabs = new Set();
    this._currentUser = null;
    this._tabInstances = {};
  }

  async render() {
    // Fetch current user role before rendering
    await this._fetchCurrentUser();

    const visibleTabs = TABS.filter(tab => this._currentUser && tab.roles.includes(this._currentUser.role));

    // Default to first available tab
    const defaultTab = visibleTabs[0]?.id || 'settings';
    this._activeTab = this._activeTab && visibleTabs.find(t => t.id === this._activeTab)
      ? this._activeTab
      : defaultTab;

    this.container.innerHTML = '';
    this.container.classList.add('admin-modern-content');

    // Build tab bar
    const tabBar = document.createElement('div');
    tabBar.className = 'admin-tabs ap-hub-tabs';
    tabBar.setAttribute('role', 'tablist');

    visibleTabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tab${tab.id === this._activeTab ? ' active' : ''}`;
      btn.dataset.tabId = tab.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', tab.id === this._activeTab ? 'true' : 'false');
      btn.setAttribute('aria-controls', `ap-tab-panel-${tab.id}`);
      btn.innerHTML = `<span class="material-icons">${escapeHtml(tab.icon)}</span><span class="ap-tab-label">${escapeHtml(this.t(tab.i18nKey))}</span>`;
      btn.addEventListener('click', () => this._switchTab(tab.id));
      tabBar.appendChild(btn);
    });

    this.container.appendChild(tabBar);

    // Build tab panels (hidden by default except active)
    visibleTabs.forEach(tab => {
      const panel = document.createElement('div');
      panel.id = `ap-tab-panel-${tab.id}`;
      panel.className = 'ap-tab-panel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `ap-tab-${tab.id}`);
      panel.style.display = tab.id === this._activeTab ? '' : 'none';
      this.container.appendChild(panel);
    });

    // Load the active tab
    await this._loadTab(this._activeTab);
  }

  async _fetchCurrentUser() {
    try {
      const res = await fetch('/api/user-role', { credentials: 'include' });
      if (res.ok) {
        this._currentUser = await res.json();
      }
    } catch (_) {
      // Silently fail — guest users handled upstream by auth guard
    }
  }

  async _switchTab(tabId) {
    if (this._activeTab === tabId) return;

    // Update tab button states
    this.container.querySelectorAll('.admin-tabs .tab').forEach(btn => {
      const isActive = btn.dataset.tabId === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    // Hide current panel, show new one
    this.container.querySelectorAll('.ap-tab-panel').forEach(panel => {
      panel.style.display = panel.id === `ap-tab-panel-${tabId}` ? '' : 'none';
    });

    this._activeTab = tabId;

    // Lazy-load if not done yet
    if (!this._loadedTabs.has(tabId)) {
      await this._loadTab(tabId);
    }
  }

  async _loadTab(tabId) {
    const panel = this.container.querySelector(`#ap-tab-panel-${tabId}`);
    if (!panel) return;

    if (this._loadedTabs.has(tabId)) return;
    this._loadedTabs.add(tabId);

    panel.innerHTML = `<div class="ap-spinner"><span class="material-icons ap-spin">sync</span></div>`;

    try {
      switch (tabId) {
        case 'settings':
          await this._loadSettingsTab(panel);
          break;
        case 'projects':
          await this._loadProjectsTab(panel);
          break;
        case 'users':
          await this._loadUsersTab(panel);
          break;
        case 'orgs':
          await this._loadOrgsTab(panel);
          break;
        case 'features':
          await this._loadFeaturesTab(panel);
          break;
        case 'fixes':
          await this._loadFixesTab(panel);
          break;
        case 'statistics':
          await this._loadStatisticsTab(panel);
          break;
        default:
          panel.innerHTML = '';
      }
    } catch (err) {
      console.error('[AdminPanel] load tab error', tabId, err);
      panel.innerHTML = `<p class="ap-empty ap-empty--error">${escapeHtml(this.t('adminPanel.tabs.loadError'))}</p>`;
    }
  }

  async _loadSettingsTab(panel) {
    const { AdminSettings } = await import('./admin-settings.js');

    // Settings tab wraps existing AdminSettings with save/cancel in the panel
    const innerContainer = document.createElement('div');
    innerContainer.className = 'admin-content ap-settings-inner';
    panel.innerHTML = '';
    panel.appendChild(innerContainer);

    const settingsInstance = new AdminSettings({
      container: innerContainer,
      config: this.adminConfig,
      t: this.t,
      showHeader: false,
    });
    settingsInstance.render();
    this._tabInstances.settings = settingsInstance;

    // Add Save / Close actions row at the bottom of the settings panel
    const actionsRow = document.createElement('div');
    actionsRow.className = 'ap-tab-actions';
    actionsRow.innerHTML = `
      <div class="ap-import-export">
        <button type="button" class="btn btn-ghost" id="apSettingsImportBtn">
          <span class="material-icons">upload_file</span>
          <span>${escapeHtml(this.t('admin.import'))}</span>
        </button>
        <button type="button" class="btn btn-ghost" id="apSettingsExportBtn">
          <span class="material-icons">download</span>
          <span>${escapeHtml(this.t('admin.export'))}</span>
        </button>
      </div>
      <div class="ap-action-btns">
        <button type="button" class="btn btn-ghost" id="apSettingsCancelBtn">${escapeHtml(this.t('buttons.cancel'))}</button>
        <button type="button" class="btn btn-primary" id="apSettingsSaveBtn">${escapeHtml(this.t('admin.saveSettings'))}</button>
      </div>
    `;
    panel.appendChild(actionsRow);

    actionsRow.querySelector('#apSettingsSaveBtn')?.addEventListener('click', () => {
      this._saveSettings();
    });

    actionsRow.querySelector('#apSettingsCancelBtn')?.addEventListener('click', () => {
      if (this.onClose) this.onClose();
    });

    actionsRow.querySelector('#apSettingsExportBtn')?.addEventListener('click', () => {
      this._exportSettings();
    });

    const importBtn = actionsRow.querySelector('#apSettingsImportBtn');
    const importFile = document.createElement('input');
    importFile.type = 'file';
    importFile.accept = 'application/json,.json';
    importFile.className = 'visually-hidden';
    panel.appendChild(importFile);

    importBtn.addEventListener('click', () => {
      importFile.value = '';
      importFile.click();
    });

    importFile.addEventListener('change', async () => {
      const file = importFile.files?.[0];
      if (!file) return;
      try {
        let text = await file.text();
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const parsed = JSON.parse(text.trim());
        const incoming = (parsed?.kind === 'graphSketchAdminConfig' && parsed.data) ? parsed.data : parsed;
        if (!incoming?.nodes && !incoming?.edges) throw new Error('invalid');
        Object.assign(this.adminConfig, incoming);
        if (this.onSaveSettings) this.onSaveSettings(this.adminConfig, incoming);
        // Reload settings tab to reflect import
        this._loadedTabs.delete('settings');
        panel.innerHTML = '';
        await this._loadTab('settings');
        this.showToast(this.t('admin.importSuccess'));
      } catch (_) {
        this.showToast(this.t('admin.importInvalid'));
      }
    });
  }

  _saveSettings() {
    const instance = this._tabInstances.settings;
    if (!instance) return;

    const validation = instance.validate?.();
    if (validation && !validation.valid) {
      if (validation.errors?.[0]?.field) {
        validation.errors[0].field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        validation.errors[0].field.focus();
      }
      return;
    }

    const newConfig = instance.collectConfig?.();
    if (newConfig) {
      Object.assign(this.adminConfig, newConfig);
    }

    if (this.onSaveSettings) this.onSaveSettings(this.adminConfig, newConfig);
    this.showToast(this.t('admin.saved'));
  }

  _exportSettings() {
    try {
      const payload = {
        kind: 'graphSketchAdminConfig',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: this.adminConfig,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `admin-config_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      this.showToast(this.t('admin.exportSuccess'));
    } catch (e) { console.warn('[AdminPanel] Export failed:', e); }
  }

  async _loadProjectsTab(panel) {
    const { ProjectsSettings } = await import('./projects-settings.js');

    panel.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'admin-content ap-projects-inner';
    panel.appendChild(inner);

    const projectsInstance = new ProjectsSettings({
      container: inner,
      t: this.t,
      showToast: this.showToast,
    });
    this._tabInstances.projects = projectsInstance;
    await projectsInstance.render();
  }

  async _loadUsersTab(panel) {
    const { AdminUsers } = await import('./admin-users.js');

    panel.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'ap-tab-inner';
    panel.appendChild(inner);

    const instance = new AdminUsers({
      container: inner,
      t: this.t,
      showToast: this.showToast,
      currentUser: this._currentUser,
    });
    this._tabInstances.users = instance;
    await instance.render();
  }

  async _loadOrgsTab(panel) {
    const { AdminOrganizations } = await import('./admin-organizations.js');

    panel.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'ap-tab-inner';
    panel.appendChild(inner);

    const instance = new AdminOrganizations({
      container: inner,
      t: this.t,
      showToast: this.showToast,
    });
    this._tabInstances.orgs = instance;
    await instance.render();
  }

  async _loadFeaturesTab(panel) {
    const { AdminFeatures } = await import('./admin-features.js');

    panel.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'ap-tab-inner';
    panel.appendChild(inner);

    const instance = new AdminFeatures({
      container: inner,
      t: this.t,
      showToast: this.showToast,
      currentUser: this._currentUser,
    });
    this._tabInstances.features = instance;
    await instance.render();
  }

  async _loadFixesTab(panel) {
    const { AdminFixes } = await import('./admin-fixes.js');

    panel.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'ap-tab-inner';
    panel.appendChild(inner);

    const instance = new AdminFixes({
      container: inner,
      t: this.t,
      showToast: this.showToast,
    });
    this._tabInstances.fixes = instance;
    await instance.render();
  }

  async _loadStatisticsTab(panel) {
    const { AdminStatistics } = await import('./admin-statistics.js');

    panel.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'ap-tab-inner';
    panel.appendChild(inner);

    const instance = new AdminStatistics({
      container: inner,
      t: this.t,
      showToast: this.showToast,
      currentUser: this._currentUser,
    });
    this._tabInstances.statistics = instance;
    await instance.render();
  }

  /** Get active tab id (for state persistence across re-renders) */
  getActiveTab() {
    return this._activeTab;
  }

  /** Set active tab programmatically */
  setActiveTab(tabId) {
    this._switchTab(tabId);
  }
}
