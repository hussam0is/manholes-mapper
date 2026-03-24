/**
 * Admin Users Tab
 *
 * Displays and manages users for admins and super_admins.
 * Admins see their own org users; super_admins see all users.
 */

const ROLE_OPTIONS = ['user', 'admin', 'super_admin'];

function escapeHtml(str) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class AdminUsers {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.t
   * @param {Function} options.showToast
   * @param {object} options.currentUser - { role, organizationId }
   */
  constructor({ container, t, showToast, currentUser }) {
    this.container = container;
    this.t = t;
    this.showToast = showToast;
    this.currentUser = currentUser;
    this._users = [];
    this._orgs = [];
    this._filter = '';
    this._loading = false;
  }

  async render() {
    this.container.innerHTML = `
      <div class="ap-section">
        <div class="ap-toolbar">
          <div class="ap-search">
            <span class="material-icons ap-search__icon">search</span>
            <input
              type="text"
              class="ap-search__input"
              id="apUsersSearch"
              placeholder="${escapeHtml(this.t('adminPanel.users.searchPlaceholder'))}"
              aria-label="${escapeHtml(this.t('adminPanel.users.searchPlaceholder'))}"
            />
          </div>
        </div>
        <div id="apUsersList" class="ap-list" role="list" aria-live="polite">
          <div class="ap-spinner"><span class="material-icons ap-spin">sync</span></div>
        </div>
      </div>
    `;

    this.container.querySelector('#apUsersSearch').addEventListener('input', (e) => {
      this._filter = e.target.value.trim().toLowerCase();
      this._renderList();
    });

    await this._loadData();
  }

  async _loadData() {
    try {
      const [usersRes, orgsRes] = await Promise.all([
        fetch('/api/users', { credentials: 'include' }),
        fetch('/api/organizations', { credentials: 'include' }),
      ]);
      if (!usersRes.ok) throw new Error(`HTTP ${usersRes.status}`);
      const usersJson = await usersRes.json();
      this._users = Array.isArray(usersJson) ? usersJson : (usersJson.users || []);

      // Orgs may be empty for regular admins (403 is acceptable)
      if (orgsRes.ok) {
        const orgsJson = await orgsRes.json();
        this._orgs = Array.isArray(orgsJson) ? orgsJson : (orgsJson.organizations || []);
      }
    } catch (err) {
      console.error('[AdminUsers] load error', err);
      this._users = [];
    }
    this._renderList();
  }

  _renderList() {
    const listEl = this.container.querySelector('#apUsersList');
    if (!listEl) return;

    const query = this._filter;
    const filtered = this._users.filter(u => {
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return !query || name.includes(query) || email.includes(query);
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<p class="ap-empty">${escapeHtml(this.t('adminPanel.users.noUsers'))}</p>`;
      return;
    }

    listEl.innerHTML = filtered.map(u => this._renderUserCard(u)).join('');

    // Wire up role selects
    listEl.querySelectorAll('[data-user-role-select]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const userId = e.target.dataset.userRoleSelect;
        const newRole = e.target.value;
        this._updateUserRole(userId, newRole, e.target);
      });
    });

    // Wire up org selects
    listEl.querySelectorAll('[data-user-org-select]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const userId = e.target.dataset.userOrgSelect;
        const newOrgId = e.target.value || null;
        this._updateUserOrg(userId, newOrgId, e.target);
      });
    });
  }

  _renderUserCard(user) {
    const isSuperAdmin = this.currentUser?.role === 'super_admin';
    const roleBadge = user.role === 'super_admin' ? 'ap-badge--danger' : user.role === 'admin' ? 'ap-badge--warning' : 'ap-badge--muted';

    const roleOptions = ROLE_OPTIONS.map(r => `
      <option value="${r}" ${user.role === r ? 'selected' : ''}>${escapeHtml(this.t(`adminPanel.roles.${r}`))}</option>
    `).join('');

    const orgOptions = [
      `<option value="">${escapeHtml(this.t('adminPanel.users.noOrg'))}</option>`,
      ...this._orgs.map(o => `<option value="${escapeHtml(String(o.id))}" ${user.organizationId === o.id ? 'selected' : ''}>${escapeHtml(o.name || o.id)}</option>`),
    ].join('');

    return `
      <div class="ap-card" role="listitem" data-user-id="${escapeHtml(String(user.id))}">
        <div class="ap-card__avatar">
          <span class="material-icons">account_circle</span>
        </div>
        <div class="ap-card__body">
          <div class="ap-card__name">${escapeHtml(user.name || '—')}</div>
          <div class="ap-card__email">${escapeHtml(user.email || '')}</div>
          <div class="ap-card__meta">
            <span class="ap-badge ${roleBadge}">${escapeHtml(this.t(`adminPanel.roles.${user.role || 'user'}`))}</span>
            ${user.organizationName ? `<span class="ap-badge ap-badge--muted">${escapeHtml(user.organizationName)}</span>` : ''}
          </div>
        </div>
        ${isSuperAdmin ? `
        <div class="ap-card__actions">
          <label class="ap-field-label" aria-label="${escapeHtml(this.t('adminPanel.users.roleLabel'))}">
            <select class="ap-select" data-user-role-select="${escapeHtml(String(user.id))}">
              ${roleOptions}
            </select>
          </label>
          <label class="ap-field-label" aria-label="${escapeHtml(this.t('adminPanel.users.orgLabel'))}">
            <select class="ap-select" data-user-org-select="${escapeHtml(String(user.id))}">
              ${orgOptions}
            </select>
          </label>
        </div>
        ` : `
        <div class="ap-card__actions">
          <label class="ap-field-label" aria-label="${escapeHtml(this.t('adminPanel.users.roleLabel'))}">
            <select class="ap-select" data-user-role-select="${escapeHtml(String(user.id))}">
              ${roleOptions}
            </select>
          </label>
        </div>
        `}
      </div>
    `;
  }

  async _updateUserRole(userId, role, selectEl) {
    const original = selectEl.dataset.originalRole || role;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      selectEl.dataset.originalRole = role;
      // Update local cache
      const user = this._users.find(u => String(u.id) === String(userId));
      if (user) user.role = role;
      this.showToast(this.t('adminPanel.users.roleSaved'));
    } catch (err) {
      console.error('[AdminUsers] role update error', err);
      selectEl.value = original;
      this.showToast(this.t('adminPanel.users.roleError'));
    }
  }

  async _updateUserOrg(userId, organizationId, selectEl) {
    const original = selectEl.value;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: organizationId || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const user = this._users.find(u => String(u.id) === String(userId));
      if (user) user.organizationId = organizationId;
      this.showToast(this.t('adminPanel.users.orgSaved'));
    } catch (err) {
      console.error('[AdminUsers] org update error', err);
      selectEl.value = original;
      this.showToast(this.t('adminPanel.users.orgError'));
    }
  }
}
