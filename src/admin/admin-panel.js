/**
 * Admin Panel - User and Organization Management
 * 
 * Provides super admin and org admin functionality for managing users,
 * organizations, and feature permissions.
 */

import { getToken } from '../auth/auth-guard.js';
import { isSuperAdmin } from '../auth/permissions.js';

/**
 * Feature display names for UI
 */
const FEATURE_LABELS = {
  export_csv: { en: 'Export CSV', he: 'יצוא CSV' },
  export_sketch: { en: 'Export/Import Sketch', he: 'יצוא/יבוא שרטוט' },
  admin_settings: { en: 'Admin Settings', he: 'הגדרות מנהל' },
  finish_workday: { en: 'Finish Workday', he: 'סיום יום עבודה' },
  node_types: { en: 'Custom Node Types', he: 'סוגי שוחות מותאמים' },
  edge_types: { en: 'Custom Edge Types', he: 'סוגי קווים מותאמים' },
};

/**
 * Role display names
 */
const ROLE_LABELS = {
  super_admin: { en: 'Super Admin', he: 'מנהל על' },
  admin: { en: 'Admin', he: 'מנהל' },
  user: { en: 'User', he: 'משתמש' },
};

/**
 * AdminPanel - Full-screen admin management panel
 */
export class AdminPanel {
  constructor({ container, t, onClose }) {
    this.container = container;
    this.t = t || ((key) => key);
    this.onClose = onClose;
    this.activeTab = 'users';
    this.users = [];
    this.organizations = [];
    this.selectedUser = null;
    this.selectedOrg = null;
    this.loading = false;
    this.lang = window.currentLang || 'he';
  }

  /**
   * Initialize and render the admin panel
   */
  async render() {
    this.container.innerHTML = '';
    this.container.className = 'admin-panel-wrapper';

    // Build panel structure
    const panel = document.createElement('div');
    panel.className = 'admin-panel';
    panel.innerHTML = `
      <div class="admin-panel-header">
        <div class="admin-panel-title">
          <span class="material-icons">admin_panel_settings</span>
          <h2>${this._label('panelTitle')}</h2>
        </div>
        <button class="admin-panel-close" title="${this._label('close')}">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="admin-panel-tabs">
        <button class="admin-panel-tab active" data-tab="users">
          <span class="material-icons">people</span>
          <span>${this._label('usersTab')}</span>
        </button>
        ${isSuperAdmin() ? `
        <button class="admin-panel-tab" data-tab="organizations">
          <span class="material-icons">business</span>
          <span>${this._label('orgsTab')}</span>
        </button>
        ` : ''}
        <button class="admin-panel-tab" data-tab="features">
          <span class="material-icons">toggle_on</span>
          <span>${this._label('featuresTab')}</span>
        </button>
      </div>
      <div class="admin-panel-content">
        <div class="admin-panel-loading" style="display: none;">
          <span class="material-icons spin">sync</span>
          <span>${this._label('loading')}</span>
        </div>
        <div class="admin-panel-section" data-section="users"></div>
        <div class="admin-panel-section" data-section="organizations" style="display: none;"></div>
        <div class="admin-panel-section" data-section="features" style="display: none;"></div>
      </div>
    `;

    this.container.appendChild(panel);

    // Bind events
    this._bindEvents(panel);

    // Load initial data
    await this._loadData();
    this._renderActiveSection();
  }

  /**
   * Get localized label
   */
  _label(key) {
    const labels = {
      panelTitle: { en: 'Admin Panel', he: 'לוח ניהול' },
      close: { en: 'Close', he: 'סגור' },
      usersTab: { en: 'Users', he: 'משתמשים' },
      orgsTab: { en: 'Organizations', he: 'ארגונים' },
      featuresTab: { en: 'Features', he: 'תכונות' },
      loading: { en: 'Loading...', he: 'טוען...' },
      noUsers: { en: 'No users found', he: 'לא נמצאו משתמשים' },
      noOrgs: { en: 'No organizations', he: 'אין ארגונים' },
      createOrg: { en: 'Create Organization', he: 'צור ארגון' },
      orgName: { en: 'Organization Name', he: 'שם הארגון' },
      save: { en: 'Save', he: 'שמור' },
      cancel: { en: 'Cancel', he: 'ביטול' },
      delete: { en: 'Delete', he: 'מחק' },
      role: { en: 'Role', he: 'תפקיד' },
      organization: { en: 'Organization', he: 'ארגון' },
      none: { en: 'None', he: 'ללא' },
      editUser: { en: 'Edit User', he: 'ערוך משתמש' },
      editFeatures: { en: 'Edit Features', he: 'ערוך תכונות' },
      userFeatures: { en: 'User Features', he: 'תכונות משתמש' },
      orgFeatures: { en: 'Organization Features', he: 'תכונות ארגון' },
      selectTarget: { en: 'Select a user or organization to manage features', he: 'בחר משתמש או ארגון לניהול תכונות' },
      enabled: { en: 'Enabled', he: 'מופעל' },
      disabled: { en: 'Disabled', he: 'מושבת' },
      confirmDelete: { en: 'Are you sure you want to delete this organization?', he: 'האם אתה בטוח שברצונך למחוק ארגון זה?' },
      saved: { en: 'Saved successfully', he: 'נשמר בהצלחה' },
      error: { en: 'An error occurred', he: 'אירעה שגיאה' },
    };
    return labels[key]?.[this.lang] || labels[key]?.en || key;
  }

  /**
   * Bind event handlers
   */
  _bindEvents(panel) {
    // Close button
    panel.querySelector('.admin-panel-close').addEventListener('click', () => {
      if (this.onClose) this.onClose();
    });

    // Tab switching
    panel.querySelectorAll('.admin-panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this._switchTab(tabName);
      });
    });
  }

  /**
   * Switch to a different tab
   */
  _switchTab(tabName) {
    this.activeTab = tabName;
    
    // Update tab buttons
    this.container.querySelectorAll('.admin-panel-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update sections
    this.container.querySelectorAll('.admin-panel-section').forEach(section => {
      section.style.display = section.dataset.section === tabName ? '' : 'none';
    });

    this._renderActiveSection();
  }

  /**
   * Show/hide loading state
   */
  _setLoading(loading) {
    this.loading = loading;
    const loadingEl = this.container.querySelector('.admin-panel-loading');
    if (loadingEl) {
      loadingEl.style.display = loading ? 'flex' : 'none';
    }
  }

  /**
   * Load data from API
   */
  async _loadData() {
    this._setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Fetch users
      const usersRes = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (usersRes.ok) {
        const data = await usersRes.json();
        this.users = data.users || [];
      }

      // Fetch organizations (super admin only)
      if (isSuperAdmin()) {
        const orgsRes = await fetch('/api/organizations', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (orgsRes.ok) {
          const data = await orgsRes.json();
          this.organizations = data.organizations || [];
        }
      }
    } catch (error) {
      console.error('[AdminPanel] Failed to load admin data:', error.message);
      this._showToast(this._label('error'), 'error');
    } finally {
      this._setLoading(false);
    }
  }

  /**
   * Render the currently active section
   */
  _renderActiveSection() {
    switch (this.activeTab) {
      case 'users':
        this._renderUsersSection();
        break;
      case 'organizations':
        this._renderOrganizationsSection();
        break;
      case 'features':
        this._renderFeaturesSection();
        break;
    }
  }

  /**
   * Render users section
   */
  _renderUsersSection() {
    const section = this.container.querySelector('[data-section="users"]');
    if (!section) return;

    if (this.users.length === 0) {
      section.innerHTML = `
        <div class="admin-panel-empty">
          <span class="material-icons">people_outline</span>
          <p>${this._label('noUsers')}</p>
        </div>
      `;
      return;
    }

    section.innerHTML = `
      <div class="admin-panel-list">
        ${this.users.map(user => `
          <div class="admin-panel-list-item" data-user-id="${user.id}">
            <div class="admin-panel-list-item-main">
              <div class="admin-panel-list-item-icon">
                <span class="material-icons">${user.role === 'super_admin' ? 'admin_panel_settings' : user.role === 'admin' ? 'manage_accounts' : 'person'}</span>
              </div>
              <div class="admin-panel-list-item-info">
                <div class="admin-panel-list-item-title">${this._escapeHtml(user.username || user.email || user.id)}</div>
                <div class="admin-panel-list-item-subtitle">
                  ${ROLE_LABELS[user.role]?.[this.lang] || user.role}
                  ${user.organizationName ? ` • ${this._escapeHtml(user.organizationName)}` : ''}
                </div>
              </div>
            </div>
            <div class="admin-panel-list-item-actions">
              <button class="btn btn-ghost btn-sm" data-action="edit-user" data-user-id="${user.id}" title="${this._label('editUser')}">
                <span class="material-icons">edit</span>
              </button>
              <button class="btn btn-ghost btn-sm" data-action="edit-user-features" data-user-id="${user.id}" title="${this._label('editFeatures')}">
                <span class="material-icons">toggle_on</span>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Bind edit actions
    section.querySelectorAll('[data-action="edit-user"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.userId;
        this._showEditUserModal(userId);
      });
    });

    section.querySelectorAll('[data-action="edit-user-features"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.userId;
        this._showFeaturesModal('user', userId);
      });
    });
  }

  /**
   * Render organizations section
   */
  _renderOrganizationsSection() {
    const section = this.container.querySelector('[data-section="organizations"]');
    if (!section) return;

    section.innerHTML = `
      <div class="admin-panel-toolbar">
        <button class="btn btn-primary" data-action="create-org">
          <span class="material-icons">add</span>
          <span>${this._label('createOrg')}</span>
        </button>
      </div>
      ${this.organizations.length === 0 ? `
        <div class="admin-panel-empty">
          <span class="material-icons">business</span>
          <p>${this._label('noOrgs')}</p>
        </div>
      ` : `
        <div class="admin-panel-list">
          ${this.organizations.map(org => `
            <div class="admin-panel-list-item" data-org-id="${org.id}">
              <div class="admin-panel-list-item-main">
                <div class="admin-panel-list-item-icon">
                  <span class="material-icons">business</span>
                </div>
                <div class="admin-panel-list-item-info">
                  <div class="admin-panel-list-item-title">${this._escapeHtml(org.name)}</div>
                  <div class="admin-panel-list-item-subtitle">${org.userCount} ${this._label('usersTab').toLowerCase()}</div>
                </div>
              </div>
              <div class="admin-panel-list-item-actions">
                <button class="btn btn-ghost btn-sm" data-action="edit-org-features" data-org-id="${org.id}" title="${this._label('editFeatures')}">
                  <span class="material-icons">toggle_on</span>
                </button>
                <button class="btn btn-ghost btn-sm btn-danger" data-action="delete-org" data-org-id="${org.id}" title="${this._label('delete')}">
                  <span class="material-icons">delete</span>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `;

    // Bind create org action
    section.querySelector('[data-action="create-org"]')?.addEventListener('click', () => {
      this._showCreateOrgModal();
    });

    // Bind delete org actions
    section.querySelectorAll('[data-action="delete-org"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(this._label('confirmDelete'))) return;
        const orgId = btn.dataset.orgId;
        await this._deleteOrganization(orgId);
      });
    });

    // Bind edit org features
    section.querySelectorAll('[data-action="edit-org-features"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const orgId = btn.dataset.orgId;
        this._showFeaturesModal('organization', orgId);
      });
    });
  }

  /**
   * Render features section
   */
  _renderFeaturesSection() {
    const section = this.container.querySelector('[data-section="features"]');
    if (!section) return;

    section.innerHTML = `
      <div class="admin-panel-features-intro">
        <span class="material-icons">info</span>
        <p>${this._label('selectTarget')}</p>
      </div>
      <div class="admin-panel-features-targets">
        <div class="admin-panel-features-group">
          <h3><span class="material-icons">people</span> ${this._label('usersTab')}</h3>
          <div class="admin-panel-features-list">
            ${this.users.map(user => `
              <button class="admin-panel-features-target" data-action="manage-features" data-target-type="user" data-target-id="${user.id}">
                <span class="material-icons">person</span>
                <span>${this._escapeHtml(user.username || user.email || user.id)}</span>
              </button>
            `).join('')}
          </div>
        </div>
        ${isSuperAdmin() && this.organizations.length > 0 ? `
        <div class="admin-panel-features-group">
          <h3><span class="material-icons">business</span> ${this._label('orgsTab')}</h3>
          <div class="admin-panel-features-list">
            ${this.organizations.map(org => `
              <button class="admin-panel-features-target" data-action="manage-features" data-target-type="organization" data-target-id="${org.id}">
                <span class="material-icons">business</span>
                <span>${this._escapeHtml(org.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    `;

    // Bind feature management
    section.querySelectorAll('[data-action="manage-features"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetType = btn.dataset.targetType;
        const targetId = btn.dataset.targetId;
        this._showFeaturesModal(targetType, targetId);
      });
    });
  }

  /**
   * Show edit user modal
   */
  _showEditUserModal(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    const modal = document.createElement('div');
    modal.className = 'admin-panel-modal-overlay';
    modal.innerHTML = `
      <div class="admin-panel-modal">
        <div class="admin-panel-modal-header">
          <h3>${this._label('editUser')}</h3>
          <button class="admin-panel-modal-close">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="admin-panel-modal-content">
          <div class="admin-panel-field">
            <label>${this._label('role')}</label>
            <select id="editUserRole" ${!isSuperAdmin() ? 'disabled' : ''}>
              <option value="user" ${user.role === 'user' ? 'selected' : ''}>${ROLE_LABELS.user[this.lang]}</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>${ROLE_LABELS.admin[this.lang]}</option>
              ${isSuperAdmin() ? `<option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>${ROLE_LABELS.super_admin[this.lang]}</option>` : ''}
            </select>
          </div>
          ${isSuperAdmin() ? `
          <div class="admin-panel-field">
            <label>${this._label('organization')}</label>
            <select id="editUserOrg">
              <option value="">${this._label('none')}</option>
              ${this.organizations.map(org => `
                <option value="${org.id}" ${user.organizationId === org.id ? 'selected' : ''}>${this._escapeHtml(org.name)}</option>
              `).join('')}
            </select>
          </div>
          ` : ''}
        </div>
        <div class="admin-panel-modal-footer">
          <button class="btn btn-ghost" data-action="cancel">${this._label('cancel')}</button>
          <button class="btn btn-primary" data-action="save">${this._label('save')}</button>
        </div>
      </div>
    `;

    this.container.appendChild(modal);

    // Bind modal events
    modal.querySelector('.admin-panel-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const role = modal.querySelector('#editUserRole').value;
      const organizationId = modal.querySelector('#editUserOrg')?.value || null;

      try {
        const token = await getToken();
        const response = await fetch(`/api/users/${userId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role, organizationId }),
        });

        if (response.ok) {
          this._showToast(this._label('saved'));
          modal.remove();
          await this._loadData();
          this._renderActiveSection();
        } else {
          const error = await response.json();
          this._showToast(error.error || this._label('error'), 'error');
        }
      } catch (error) {
        console.error('[AdminPanel] Failed to update user:', error.message);
        this._showToast(this._label('error'), 'error');
      }
    });
  }

  /**
   * Show create organization modal
   */
  _showCreateOrgModal() {
    const modal = document.createElement('div');
    modal.className = 'admin-panel-modal-overlay';
    modal.innerHTML = `
      <div class="admin-panel-modal">
        <div class="admin-panel-modal-header">
          <h3>${this._label('createOrg')}</h3>
          <button class="admin-panel-modal-close">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="admin-panel-modal-content">
          <div class="admin-panel-field">
            <label>${this._label('orgName')}</label>
            <input type="text" id="newOrgName" placeholder="${this._label('orgName')}" />
          </div>
        </div>
        <div class="admin-panel-modal-footer">
          <button class="btn btn-ghost" data-action="cancel">${this._label('cancel')}</button>
          <button class="btn btn-primary" data-action="save">${this._label('save')}</button>
        </div>
      </div>
    `;

    this.container.appendChild(modal);

    // Focus input
    modal.querySelector('#newOrgName').focus();

    // Bind modal events
    modal.querySelector('.admin-panel-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const name = modal.querySelector('#newOrgName').value.trim();
      if (!name) return;

      try {
        const token = await getToken();
        const response = await fetch('/api/organizations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name }),
        });

        if (response.ok) {
          this._showToast(this._label('saved'));
          modal.remove();
          await this._loadData();
          this._renderActiveSection();
        } else {
          const error = await response.json();
          this._showToast(error.error || this._label('error'), 'error');
        }
      } catch (error) {
        console.error('[AdminPanel] Failed to create organization:', error.message);
        this._showToast(this._label('error'), 'error');
      }
    });
  }

  /**
   * Show features modal for a target
   */
  async _showFeaturesModal(targetType, targetId) {
    // Fetch current features
    let features = {};
    try {
      const token = await getToken();
      const response = await fetch(`/api/features/${targetType}/${targetId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        features = data.features || {};
      }
    } catch (error) {
      console.error('[AdminPanel] Failed to fetch features:', error.message);
    }

    const targetName = targetType === 'user'
      ? this.users.find(u => u.id === targetId)?.username || targetId
      : this.organizations.find(o => o.id === targetId)?.name || targetId;

    const modal = document.createElement('div');
    modal.className = 'admin-panel-modal-overlay';
    modal.innerHTML = `
      <div class="admin-panel-modal">
        <div class="admin-panel-modal-header">
          <h3>${this._label('editFeatures')}: ${this._escapeHtml(targetName)}</h3>
          <button class="admin-panel-modal-close">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="admin-panel-modal-content">
          <div class="admin-panel-features-toggles">
            ${Object.keys(FEATURE_LABELS).map(key => `
              <label class="admin-panel-feature-toggle">
                <span class="admin-panel-feature-label">${FEATURE_LABELS[key][this.lang]}</span>
                <input type="checkbox" data-feature="${key}" ${features[key] !== false ? 'checked' : ''} />
                <span class="admin-toggle-switch"></span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="admin-panel-modal-footer">
          <button class="btn btn-ghost" data-action="cancel">${this._label('cancel')}</button>
          <button class="btn btn-primary" data-action="save">${this._label('save')}</button>
        </div>
      </div>
    `;

    this.container.appendChild(modal);

    // Bind modal events
    modal.querySelector('.admin-panel-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const newFeatures = {};
      modal.querySelectorAll('[data-feature]').forEach(input => {
        newFeatures[input.dataset.feature] = input.checked;
      });

      try {
        const token = await getToken();
        const response = await fetch(`/api/features/${targetType}/${targetId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ features: newFeatures }),
        });

        if (response.ok) {
          this._showToast(this._label('saved'));
          modal.remove();
        } else {
          const error = await response.json();
          this._showToast(error.error || this._label('error'), 'error');
        }
      } catch (error) {
        console.error('[AdminPanel] Failed to update features:', error.message);
        this._showToast(this._label('error'), 'error');
      }
    });
  }

  /**
   * Delete an organization
   */
  async _deleteOrganization(orgId) {
    try {
      const token = await getToken();
      const response = await fetch(`/api/organizations/${orgId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        this._showToast(this._label('saved'));
        await this._loadData();
        this._renderActiveSection();
      } else {
        const error = await response.json();
        this._showToast(error.error || this._label('error'), 'error');
      }
    } catch (error) {
      console.error('[AdminPanel] Failed to delete organization:', error.message);
      this._showToast(this._label('error'), 'error');
    }
  }

  /**
   * Show toast notification
   */
  _showToast(message, type = 'success') {
    if (window.showToast) {
      window.showToast(message, type === 'error' ? 'error' : 'success');
    } else {
      console.debug(`[AdminPanel] Toast (${type}):`, message);
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

/**
 * Open the admin panel
 */
export function openAdminPanel(container, t, onClose) {
  const panel = new AdminPanel({ container, t, onClose });
  panel.render();
  return panel;
}

// Export for global access
if (typeof window !== 'undefined') {
  window.AdminPanel = AdminPanel;
  window.openAdminPanel = openAdminPanel;
}
