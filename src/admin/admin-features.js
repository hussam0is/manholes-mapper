/**
 * Admin Features Tab
 *
 * Manage feature flags per user or organization.
 * Features: export_csv, export_sketch, admin_settings, finish_workday, node_types, edge_types
 */

const FEATURE_KEYS = ['export_csv', 'export_sketch', 'admin_settings', 'finish_workday', 'node_types', 'edge_types'];

function escapeHtml(str) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class AdminFeatures {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.t
   * @param {Function} options.showToast
   * @param {object} options.currentUser - { role }
   */
  constructor({ container, t, showToast, currentUser }) {
    this.container = container;
    this.t = t;
    this.showToast = showToast;
    this.currentUser = currentUser;
    this._users = [];
    this._orgs = [];
    this._selectedTargetType = 'org';
    this._selectedTargetId = null;
    this._features = {};
    this._saving = false;
  }

  async render() {
    const isSuperAdmin = this.currentUser?.role === 'super_admin';

    this.container.innerHTML = `
      <div class="ap-section">
        <div class="ap-features-target">
          <div class="ap-features-target__type">
            <label class="ap-field-label">${escapeHtml(this.t('adminPanel.features.targetType'))}</label>
            <div class="ap-toggle-group" id="apFeaturesTypeGroup" role="group">
              <button type="button" class="ap-toggle ${this._selectedTargetType === 'org' ? 'active' : ''}" data-type="org">
                <span class="material-icons">business</span>
                ${escapeHtml(this.t('adminPanel.features.orgTarget'))}
              </button>
              <button type="button" class="ap-toggle ${this._selectedTargetType === 'user' ? 'active' : ''}" data-type="user">
                <span class="material-icons">person</span>
                ${escapeHtml(this.t('adminPanel.features.userTarget'))}
              </button>
            </div>
          </div>
          <div class="ap-features-target__select">
            <label class="ap-field-label" for="apFeaturesTargetSel">${escapeHtml(this.t('adminPanel.features.selectTarget'))}</label>
            <select class="ap-select" id="apFeaturesTargetSel">
              <option value="">${escapeHtml(this.t('adminPanel.features.chooseTarget'))}</option>
            </select>
          </div>
        </div>
        <div id="apFeaturesPanel" class="ap-features-panel" style="display:none;"></div>
      </div>
    `;

    if (!isSuperAdmin) {
      // Admins can only set org-level features for their own org; hide type toggle
      this.container.querySelector('#apFeaturesTypeGroup').style.display = 'none';
    }

    this.container.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectedTargetType = btn.dataset.type;
        this._selectedTargetId = null;
        this.container.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === this._selectedTargetType));
        this._populateTargetSelect();
        this.container.querySelector('#apFeaturesPanel').style.display = 'none';
      });
    });

    this.container.querySelector('#apFeaturesTargetSel').addEventListener('change', async (e) => {
      this._selectedTargetId = e.target.value || null;
      if (this._selectedTargetId) {
        await this._loadFeatures();
      } else {
        this.container.querySelector('#apFeaturesPanel').style.display = 'none';
      }
    });

    await this._loadTargets();
  }

  async _loadTargets() {
    try {
      const [usersRes, orgsRes] = await Promise.all([
        fetch('/api/users', { credentials: 'include' }),
        fetch('/api/organizations', { credentials: 'include' }),
      ]);
      if (usersRes.ok) {
        const j = await usersRes.json();
        this._users = Array.isArray(j) ? j : (j.users || []);
      }
      if (orgsRes.ok) {
        const j = await orgsRes.json();
        this._orgs = Array.isArray(j) ? j : (j.organizations || []);
      }
    } catch (err) {
      console.error('[AdminFeatures] load targets error', err);
    }
    this._populateTargetSelect();
  }

  _populateTargetSelect() {
    const sel = this.container.querySelector('#apFeaturesTargetSel');
    if (!sel) return;
    const items = this._selectedTargetType === 'org' ? this._orgs : this._users;
    sel.innerHTML = `<option value="">${escapeHtml(this.t('adminPanel.features.chooseTarget'))}</option>` +
      items.map(item => {
        const label = item.name || item.email || item.id;
        return `<option value="${escapeHtml(String(item.id))}">${escapeHtml(label)}</option>`;
      }).join('');
    this._selectedTargetId = null;
    this.container.querySelector('#apFeaturesPanel').style.display = 'none';
  }

  async _loadFeatures() {
    const panel = this.container.querySelector('#apFeaturesPanel');
    if (!panel) return;
    panel.innerHTML = `<div class="ap-spinner"><span class="material-icons ap-spin">sync</span></div>`;
    panel.style.display = '';

    try {
      const res = await fetch(
        `/api/features/${encodeURIComponent(this._selectedTargetType)}/${encodeURIComponent(this._selectedTargetId)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      this._features = json.features || json || {};
    } catch (err) {
      console.error('[AdminFeatures] load features error', err);
      this._features = {};
    }

    this._renderFeaturePanel(panel);
  }

  _renderFeaturePanel(panel) {
    const rows = FEATURE_KEYS.map(key => {
      const enabled = !!this._features[key];
      return `
        <div class="ap-feature-row">
          <div class="ap-feature-row__info">
            <div class="ap-feature-row__name">${escapeHtml(this.t(`adminPanel.features.keys.${key}`))}</div>
            <div class="ap-feature-row__desc">${escapeHtml(this.t(`adminPanel.features.descs.${key}`))}</div>
          </div>
          <label class="ap-toggle-switch" aria-label="${escapeHtml(this.t(`adminPanel.features.keys.${key}`))}">
            <input type="checkbox" class="ap-toggle-switch__input" data-feature-key="${escapeHtml(key)}" ${enabled ? 'checked' : ''} />
            <span class="ap-toggle-switch__track"></span>
          </label>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="ap-features-list">
        ${rows}
      </div>
      <div class="ap-form__actions">
        <button type="button" class="btn btn-primary" id="apFeaturesSaveBtn">
          <span class="material-icons">save</span>
          ${escapeHtml(this.t('buttons.save'))}
        </button>
      </div>
    `;

    panel.querySelector('#apFeaturesSaveBtn').addEventListener('click', () => {
      this._saveFeatures(panel);
    });
  }

  async _saveFeatures(panel) {
    if (this._saving) return;
    this._saving = true;
    const saveBtn = panel.querySelector('#apFeaturesSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    const features = {};
    panel.querySelectorAll('[data-feature-key]').forEach(cb => {
      features[cb.dataset.featureKey] = cb.checked;
    });

    try {
      const res = await fetch(
        `/api/features/${encodeURIComponent(this._selectedTargetType)}/${encodeURIComponent(this._selectedTargetId)}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ features }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._features = features;
      this.showToast(this.t('adminPanel.features.saved'));
    } catch (err) {
      console.error('[AdminFeatures] save error', err);
      this.showToast(this.t('adminPanel.features.saveError'));
    }

    this._saving = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}
