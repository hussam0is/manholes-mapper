/**
 * Admin Organizations Tab
 *
 * Super-admin management of organizations: list, create, edit, delete.
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

export class AdminOrganizations {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.t
   * @param {Function} options.showToast
   */
  constructor({ container, t, showToast }) {
    this.container = container;
    this.t = t;
    this.showToast = showToast;
    this._orgs = [];
    this._editingId = null;
  }

  async render() {
    this.container.innerHTML = `
      <div class="ap-section">
        <div class="ap-toolbar">
          <button class="btn btn-primary ap-btn-add" id="apAddOrgBtn" type="button">
            <span class="material-icons">add</span>
            <span>${escapeHtml(this.t('adminPanel.orgs.addOrg'))}</span>
          </button>
        </div>
        <div id="apOrgFormWrap" class="ap-form-wrap" style="display:none;"></div>
        <div id="apOrgsList" class="ap-list" role="list" aria-live="polite">
          <div class="ap-spinner"><span class="material-icons ap-spin">sync</span></div>
        </div>
      </div>
    `;

    this.container.querySelector('#apAddOrgBtn').addEventListener('click', () => {
      this._showForm(null);
    });

    await this._loadOrgs();
  }

  async _loadOrgs() {
    try {
      const res = await fetch('/api/organizations', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      this._orgs = Array.isArray(json) ? json : (json.organizations || []);
    } catch (err) {
      console.error('[AdminOrgs] load error', err);
      this._orgs = [];
    }
    this._renderList();
  }

  _renderList() {
    const listEl = this.container.querySelector('#apOrgsList');
    if (!listEl) return;

    if (this._orgs.length === 0) {
      listEl.innerHTML = `<p class="ap-empty">${escapeHtml(this.t('adminPanel.orgs.noOrgs'))}</p>`;
      return;
    }

    listEl.innerHTML = this._orgs.map(o => `
      <div class="ap-card" role="listitem" data-org-id="${escapeHtml(String(o.id))}">
        <div class="ap-card__avatar ap-card__avatar--org">
          <span class="material-icons">business</span>
        </div>
        <div class="ap-card__body">
          <div class="ap-card__name">${escapeHtml(o.name || o.id)}</div>
          ${o.memberCount != null ? `<div class="ap-card__email">${escapeHtml(this.t('adminPanel.orgs.memberCount', o.memberCount))}</div>` : ''}
        </div>
        <div class="ap-card__actions">
          <button class="btn btn-ghost btn-icon-sm" data-edit-org="${escapeHtml(String(o.id))}" aria-label="${escapeHtml(this.t('adminPanel.orgs.edit'))}">
            <span class="material-icons">edit</span>
          </button>
          <button class="btn btn-ghost btn-icon-sm ap-btn--danger" data-delete-org="${escapeHtml(String(o.id))}" aria-label="${escapeHtml(this.t('adminPanel.orgs.delete'))}">
            <span class="material-icons">delete</span>
          </button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-edit-org]').forEach(btn => {
      btn.addEventListener('click', () => {
        const org = this._orgs.find(o => String(o.id) === btn.dataset.editOrg);
        if (org) this._showForm(org);
      });
    });

    listEl.querySelectorAll('[data-delete-org]').forEach(btn => {
      btn.addEventListener('click', () => {
        const org = this._orgs.find(o => String(o.id) === btn.dataset.deleteOrg);
        if (org) this._deleteOrg(org);
      });
    });
  }

  _showForm(org) {
    this._editingId = org ? org.id : null;
    const wrap = this.container.querySelector('#apOrgFormWrap');
    if (!wrap) return;
    wrap.style.display = '';

    const isEdit = !!org;
    wrap.innerHTML = `
      <div class="ap-form">
        <h3 class="ap-form__title">
          <span class="material-icons">${isEdit ? 'edit' : 'add_business'}</span>
          ${escapeHtml(this.t(isEdit ? 'adminPanel.orgs.editOrg' : 'adminPanel.orgs.addOrg'))}
        </h3>
        <div class="ap-form__field">
          <label class="ap-field-label" for="apOrgNameInput">
            ${escapeHtml(this.t('adminPanel.orgs.orgName'))}
          </label>
          <input
            type="text"
            id="apOrgNameInput"
            class="ap-input"
            value="${isEdit ? escapeHtml(org.name || '') : ''}"
            placeholder="${escapeHtml(this.t('adminPanel.orgs.orgNamePlaceholder'))}"
            maxlength="100"
          />
        </div>
        <div class="ap-form__actions">
          <button type="button" class="btn btn-ghost" id="apOrgCancelBtn">${escapeHtml(this.t('buttons.cancel'))}</button>
          <button type="button" class="btn btn-primary" id="apOrgSaveBtn">${escapeHtml(this.t('buttons.save'))}</button>
        </div>
      </div>
    `;

    const nameInput = wrap.querySelector('#apOrgNameInput');
    nameInput.focus();

    wrap.querySelector('#apOrgCancelBtn').addEventListener('click', () => {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      this._editingId = null;
    });

    wrap.querySelector('#apOrgSaveBtn').addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      await this._saveOrg(name);
    });

    // Submit on Enter
    nameInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const name = nameInput.value.trim();
        if (name) await this._saveOrg(name);
      }
    });
  }

  async _saveOrg(name) {
    const wrap = this.container.querySelector('#apOrgFormWrap');
    const saveBtn = wrap?.querySelector('#apOrgSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
      let res;
      if (this._editingId) {
        res = await fetch(`/api/organizations/${encodeURIComponent(this._editingId)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
      } else {
        res = await fetch('/api/organizations', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
      this._editingId = null;
      this.showToast(this.t('adminPanel.orgs.saved'));
      await this._loadOrgs();
    } catch (err) {
      console.error('[AdminOrgs] save error', err);
      if (saveBtn) saveBtn.disabled = false;
      this.showToast(this.t('adminPanel.orgs.saveError'));
    }
  }

  async _deleteOrg(org) {
    if (!confirm(this.t('adminPanel.orgs.confirmDelete', escapeHtml(org.name || org.id)))) return;
    try {
      const res = await fetch(`/api/organizations/${encodeURIComponent(org.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.showToast(this.t('adminPanel.orgs.deleted'));
      await this._loadOrgs();
    } catch (err) {
      console.error('[AdminOrgs] delete error', err);
      this.showToast(this.t('adminPanel.orgs.deleteError'));
    }
  }
}
