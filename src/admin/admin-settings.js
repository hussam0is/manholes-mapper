/**
 * Unified Admin Settings Module
 * 
 * This module provides a single AdminSettings class that can render into any container,
 * eliminating code duplication between modal and screen versions.
 */

/**
 * Field specifications for nodes configuration
 */
export function getNodeSpecs(t) {
  return [
    { key: 'material', label: t('labels.coverMaterial'), type: 'select', optionsKey: 'material', valueKind: 'label' },
    { key: 'cover_diameter', label: t('labels.coverDiameter'), type: 'text' },
    { key: 'access', label: t('labels.access'), type: 'select', optionsKey: 'access', valueKind: 'code' },
    { key: 'accuracy_level', label: t('labels.accuracyLevel'), type: 'select', optionsKey: 'accuracy_level', valueKind: 'code' },
    { key: 'engineering_status', label: t('labels.nodeEngineeringStatus'), type: 'select', optionsKey: 'engineering_status', valueKind: 'code' },
    { key: 'maintenance_status', label: t('labels.maintenanceStatus'), type: 'select', optionsKey: 'maintenance_status', valueKind: 'code' },
  ];
}

/**
 * Field specifications for edges configuration
 */
export function getEdgeSpecs(t) {
  return [
    { key: 'material', label: t('labels.edgeMaterial'), type: 'select', optionsKey: 'material', valueKind: 'label' },
    { key: 'edge_type', label: t('labels.edgeType'), type: 'select', optionsKey: 'edge_type', valueKind: 'label' },
    { key: 'line_diameter', label: t('labels.lineDiameter'), type: 'select', optionsKey: 'line_diameter', valueKind: 'label' },
    { key: 'fall_position', label: t('labels.fallPosition'), type: 'select', optionsKey: 'fall_position', valueKind: 'code' },
    { key: 'engineering_status', label: t('labels.engineeringStatus'), type: 'select', optionsKey: 'engineering_status', valueKind: 'code' },
    { key: 'tail_measurement', label: t('labels.tailMeasure'), type: 'text' },
    { key: 'head_measurement', label: t('labels.headMeasure'), type: 'text' },
    { key: 'fall_depth', label: t('labels.fallDepth'), type: 'text' },
  ];
}

/**
 * Keys that should be stored as numeric values
 */
const NUMERIC_DEFAULT_KEYS = new Set([
  'access', 'accuracy_level', 'fall_position', 'engineering_status', 'maintenance_status'
]);

/**
 * AdminSettings - Unified admin settings UI component
 */
export class AdminSettings {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element to render into
   * @param {Object} options.config - Current admin configuration object
   * @param {Function} options.t - Translation function
   * @param {Function} options.onSave - Callback when settings are saved
   * @param {Function} options.onCancel - Callback when cancelled
   * @param {boolean} options.showHeader - Whether to show section headers with icons (modal style)
   */
  constructor({ container, config, t, onSave, onCancel, showHeader = true }) {
    this.container = container;
    this.config = config;
    this.t = t;
    this.onSave = onSave;
    this.onCancel = onCancel;
    this.showHeader = showHeader;
    this.activeTab = 'nodes';
    this.validationErrors = [];
  }

  /**
   * Render the admin settings UI
   */
  render() {
    this.container.innerHTML = '';

    // Tabs
    const tabs = this._createTabs();
    this.container.appendChild(tabs);

    // Sections
    const nodeSpecs = getNodeSpecs(this.t);
    const edgeSpecs = getEdgeSpecs(this.t);

    this.container.appendChild(this._buildSection(this.t('admin.tabNodes'), 'nodes', nodeSpecs));
    this.container.appendChild(this._buildSection(this.t('admin.tabEdges'), 'edges', edgeSpecs));

    // Initialize values and behavior
    this._initializeDefaults();
    this._initializeTabs(tabs);
    this._initializeCollapsibleGroups();
    this._initializeOptionHandlers();
  }

  /**
   * Create tab buttons
   */
  _createTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'admin-tabs';
    tabs.innerHTML = `
      <button class="tab active" data-tab-btn="nodes">
        <span class="material-icons">account_tree</span>
        ${this.t('admin.tabNodes')}
      </button>
      <button class="tab" data-tab-btn="edges">
        <span class="material-icons">timeline</span>
        ${this.t('admin.tabEdges')}
      </button>
    `;
    return tabs;
  }

  /**
   * Build a section for nodes or edges
   */
  _buildSection(title, cfgKey, specs) {
    const section = document.createElement('div');
    section.className = 'admin-section';
    section.setAttribute('data-tab', cfgKey);

    // Header (for modal style)
    if (this.showHeader) {
      const header = document.createElement('div');
      header.className = 'admin-section-header';
      const icon = cfgKey === 'nodes' ? 'account_tree' : 'timeline';
      header.innerHTML = `<h3 class="admin-section-title"><span class="material-icons">${icon}</span>${title}</h3>`;
      section.appendChild(header);
    } else {
      const h3 = document.createElement('h3');
      h3.className = 'admin-section-title';
      h3.textContent = title;
      section.appendChild(h3);
    }

    const body = document.createElement('div');
    body.className = 'admin-section-body';

    // Include toggles group
    body.appendChild(this._buildIncludeGroup(cfgKey));

    // Defaults group
    body.appendChild(this._buildDefaultsGroup(cfgKey, specs));

    // Options groups
    const optionSpecs = specs.filter(s => s.optionsKey);
    for (const spec of optionSpecs) {
      body.appendChild(this._buildOptionsGroup(cfgKey, spec));
    }

    section.appendChild(body);
    return section;
  }

  /**
   * Build the include checkboxes group
   */
  _buildIncludeGroup(cfgKey) {
    const include = this.config[cfgKey].include;
    const group = document.createElement('div');
    group.className = 'admin-group';

    const checkboxItems = Object.keys(include).map(k => {
      const checked = include[k] ? 'checked' : '';
      const id = `inc_${cfgKey}_${k}`;
      return `
        <div class="admin-checkbox-item">
          <input type="checkbox" data-inc="${cfgKey}:${k}" ${checked} id="${id}"/>
          <label for="${id}">${k}</label>
        </div>
      `;
    }).join('');

    group.innerHTML = `
      <button type="button" class="admin-group-toggle" aria-expanded="true">
        <div class="admin-group-toggle-header">
          <div class="admin-subtitle">
            ${this.showHeader ? '<span class="material-icons">checklist</span>' : ''}
            ${this.t('admin.includeTitle')}
          </div>
          <span class="material-icons admin-group-toggle-icon">expand_more</span>
        </div>
      </button>
      <div class="admin-group-content">
        <div class="admin-desc">${this.t('admin.includeDesc')}</div>
        <div class="admin-checkbox-group">${checkboxItems}</div>
      </div>
    `;

    return group;
  }

  /**
   * Build the defaults group
   */
  _buildDefaultsGroup(cfgKey, specs) {
    const defaults = this.config[cfgKey].defaults;
    const group = document.createElement('div');
    group.className = 'admin-group';

    const fields = specs.map(spec => {
      const current = defaults[spec.key] ?? '';
      const id = `def_${cfgKey}_${spec.key}`;

      if (spec.type === 'select') {
        const opts = this.config[cfgKey].options[spec.key] || [];
        const optionsHtml = [`<option value="">${this.t('labels.optional')}</option>`].concat(
          opts.filter(o => o.enabled !== false).map(o => {
            const value = (spec.valueKind === 'code') ? String(o.code) : String(o.label);
            return `<option value="${value}">${o.label}</option>`;
          })
        ).join('');

        return `
          <div class="field">
            <label for="${id}">${spec.label}</label>
            <select id="${id}" data-def="${cfgKey}:${spec.key}">${optionsHtml}</select>
          </div>
        `;
      }

      return `
        <div class="field">
          <label for="${id}">${spec.label}</label>
          <input id="${id}" type="text" value="${current}" data-def="${cfgKey}:${spec.key}" 
                 placeholder="${this.t('admin.placeholders.defaultValue')}"/>
        </div>
      `;
    }).join('');

    group.innerHTML = `
      <button type="button" class="admin-group-toggle" aria-expanded="true">
        <div class="admin-group-toggle-header">
          <div class="admin-subtitle">
            ${this.showHeader ? '<span class="material-icons">settings</span>' : ''}
            ${this.t('admin.defaultsTitle')}
          </div>
          <span class="material-icons admin-group-toggle-icon">expand_more</span>
        </div>
      </button>
      <div class="admin-group-content">
        <div class="admin-desc">${this.t('admin.defaultsDesc')}</div>
        ${fields}
      </div>
    `;

    return group;
  }

  /**
   * Build an options group (with mobile-friendly cards)
   */
  _buildOptionsGroup(cfgKey, spec) {
    const opts = this.config[cfgKey].options[spec.optionsKey] || [];
    const group = document.createElement('div');
    group.className = 'admin-group';

    // Build option cards (mobile-friendly) and table rows (desktop)
    const cards = opts.map((o, idx) => this._buildOptionCard(cfgKey, spec.optionsKey, o, idx)).join('');
    const rows = opts.map((o) => this._buildOptionRow(cfgKey, spec.optionsKey, o)).join('');

    group.innerHTML = `
      <button type="button" class="admin-group-toggle" aria-expanded="true">
        <div class="admin-group-toggle-header">
          <div class="admin-subtitle">${this.t('admin.optionsTitle', spec.label)}</div>
          <span class="material-icons admin-group-toggle-icon">expand_more</span>
        </div>
      </button>
      <div class="admin-group-content">
        <div class="admin-desc">${this.t('admin.optionsDesc')}</div>
        
        <!-- Mobile: Option Cards -->
        <div class="option-cards" data-opt-cards="${cfgKey}:${spec.optionsKey}">
          ${cards}
        </div>
        
        <!-- Desktop: Table -->
        <table class="option-table" data-opt-table="${cfgKey}:${spec.optionsKey}">
          <thead>
            <tr>
              <th class="opt-enabled">${this.t('admin.thEnabled')}</th>
              <th class="opt-label">${this.t('admin.thLabel')}</th>
              <th class="opt-code">${this.t('admin.thCode')}</th>
              <th class="opt-actions"></th>
            </tr>
          </thead>
          <tbody data-opt-body="${cfgKey}:${spec.optionsKey}">${rows}</tbody>
        </table>
        
        <div class="admin-options-actions">
          <button class="btn" data-opt-add="${cfgKey}:${spec.optionsKey}">
            <span class="material-icons">add</span>
            ${this.t('admin.addOption')}
          </button>
        </div>
      </div>
    `;

    return group;
  }

  /**
   * Build a single option card (for mobile)
   */
  _buildOptionCard(cfgKey, optKey, option, index) {
    const enabled = option.enabled !== false;
    const checkId = `opt_card_${cfgKey}_${optKey}_${index}`;

    return `
      <div class="option-card" data-option-card="${cfgKey}:${optKey}">
        <div class="option-card-header">
          <input type="checkbox" ${enabled ? 'checked' : ''} 
                 data-opt-card-enabled="${cfgKey}:${optKey}" 
                 id="${checkId}"
                 aria-label="${this.t('admin.thEnabled')}"/>
          <input type="text" class="option-card-label" 
                 value="${this._escapeHtml(option.label)}" 
                 data-opt-card-label="${cfgKey}:${optKey}"
                 placeholder="${this.t('admin.placeholders.newLabel')}"
                 aria-label="${this.t('admin.thLabel')}"/>
        </div>
        <div class="option-card-body">
          <label>${this.t('admin.thCode')}:</label>
          <input type="text" class="option-card-code" 
                 value="${this._escapeHtml(String(option.code))}" 
                 data-opt-card-code="${cfgKey}:${optKey}"
                 placeholder="${this.t('admin.placeholders.code')}"
                 aria-label="${this.t('admin.thCode')}"/>
        </div>
        <div class="option-card-actions">
          <button class="btn btn-danger btn-sm" 
                  data-opt-card-del="${cfgKey}:${optKey}"
                  title="${this.t('admin.delete')}" 
                  aria-label="${this.t('admin.delete')}">
            <span class="material-icons">delete</span>
          </button>
        </div>
        <div class="field-error" style="display:none;"></div>
      </div>
    `;
  }

  /**
   * Build a single option row (for desktop table)
   */
  _buildOptionRow(cfgKey, optKey, option) {
    const enabled = option.enabled !== false;

    return `
      <tr>
        <td class="opt-enabled" data-label="${this.t('admin.thEnabled')}">
          <input type="checkbox" ${enabled ? 'checked' : ''} data-opt-enabled="${cfgKey}:${optKey}"/>
        </td>
        <td class="opt-label" data-label="${this.t('admin.thLabel')}">
          <input type="text" value="${this._escapeHtml(option.label)}" 
                 data-opt-label="${cfgKey}:${optKey}"
                 placeholder="${this.t('admin.placeholders.newLabel')}"/>
          <div class="field-error" style="display:none;"></div>
        </td>
        <td class="opt-code" data-label="${this.t('admin.thCode')}">
          <input type="text" value="${this._escapeHtml(String(option.code))}" 
                 data-opt-code="${cfgKey}:${optKey}"
                 placeholder="${this.t('admin.placeholders.code')}"/>
          <div class="field-error" style="display:none;"></div>
        </td>
        <td class="opt-actions" data-label="${this.t('admin.delete')}">
          <button class="btn btn-danger btn-sm" 
                  title="${this.t('admin.delete')}" 
                  aria-label="${this.t('admin.delete')}" 
                  data-opt-del="${cfgKey}:${optKey}">×</button>
        </td>
      </tr>
    `;
  }

  /**
   * Initialize default values in inputs
   */
  _initializeDefaults() {
    this.container.querySelectorAll('[data-def]').forEach((el) => {
      const [scope, key] = el.getAttribute('data-def').split(':');
      const val = this.config[scope].defaults[key];
      if (el.tagName === 'SELECT') {
        [...el.options].forEach((opt) => {
          if (opt.value === String(val)) opt.selected = true;
        });
      } else {
        el.value = val == null ? '' : String(val);
      }
    });
  }

  /**
   * Initialize tab switching behavior
   */
  _initializeTabs(tabs) {
    // Hide edges tab by default
    this.container.querySelectorAll('[data-tab="edges"]').forEach(el => {
      el.style.display = 'none';
    });

    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab-btn]');
      if (!btn) return;

      const target = btn.getAttribute('data-tab-btn');
      this.activeTab = target;

      tabs.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      this.container.querySelectorAll('[data-tab]').forEach(sec => {
        sec.style.display = (sec.getAttribute('data-tab') === target) ? '' : 'none';
      });
    });
  }

  /**
   * Initialize collapsible groups
   */
  _initializeCollapsibleGroups() {
    this.container.querySelectorAll('.admin-group-toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const group = toggle.closest('.admin-group');
        if (!group) return;

        const isCollapsed = group.classList.toggle('collapsed');
        toggle.setAttribute('aria-expanded', !isCollapsed);
      });
    });
  }

  /**
   * Initialize add/delete option handlers
   */
  _initializeOptionHandlers() {
    // Add option buttons
    this.container.querySelectorAll('[data-opt-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [scope, optKey] = btn.getAttribute('data-opt-add').split(':');
        this._addOption(scope, optKey);
      });
    });

    // Delete buttons (table)
    this.container.querySelectorAll('[data-opt-del]').forEach((btn) => {
      this._attachDeleteHandler(btn, 'tr');
    });

    // Delete buttons (cards)
    this.container.querySelectorAll('[data-opt-card-del]').forEach((btn) => {
      this._attachDeleteHandler(btn, '.option-card');
    });
  }

  /**
   * Add a new option to both table and cards
   */
  _addOption(scope, optKey) {
    // Add to table
    const tbody = this.container.querySelector(`[data-opt-body="${scope}:${optKey}"]`);
    if (tbody) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="opt-enabled" data-label="${this.t('admin.thEnabled')}">
          <input type="checkbox" checked data-opt-enabled="${scope}:${optKey}"/>
        </td>
        <td class="opt-label" data-label="${this.t('admin.thLabel')}">
          <input type="text" value="" data-opt-label="${scope}:${optKey}" 
                 placeholder="${this.t('admin.placeholders.newLabel')}"/>
          <div class="field-error" style="display:none;"></div>
        </td>
        <td class="opt-code" data-label="${this.t('admin.thCode')}">
          <input type="text" value="" data-opt-code="${scope}:${optKey}" 
                 placeholder="${this.t('admin.placeholders.code')}"/>
          <div class="field-error" style="display:none;"></div>
        </td>
        <td class="opt-actions" data-label="${this.t('admin.delete')}">
          <button class="btn btn-danger btn-sm" 
                  title="${this.t('admin.delete')}" 
                  aria-label="${this.t('admin.delete')}" 
                  data-opt-del="${scope}:${optKey}">×</button>
        </td>
      `;
      tbody.appendChild(tr);

      const delBtn = tr.querySelector('[data-opt-del]');
      this._attachDeleteHandler(delBtn, 'tr');

      // Focus label input
      const labelInput = tr.querySelector('[data-opt-label]');
      if (labelInput) labelInput.focus();
    }

    // Add to cards
    const cardsContainer = this.container.querySelector(`[data-opt-cards="${scope}:${optKey}"]`);
    if (cardsContainer) {
      const idx = cardsContainer.children.length;
      const cardDiv = document.createElement('div');
      cardDiv.innerHTML = this._buildOptionCard(scope, optKey, { label: '', code: '', enabled: true }, idx);
      const card = cardDiv.firstElementChild;
      cardsContainer.appendChild(card);

      const cardDelBtn = card.querySelector('[data-opt-card-del]');
      this._attachDeleteHandler(cardDelBtn, '.option-card');
    }
  }

  /**
   * Attach delete handler to a button
   */
  _attachDeleteHandler(btn, parentSelector) {
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (confirm(this.t('admin.confirmDeleteOption'))) {
        const parent = btn.closest(parentSelector);
        if (parent) parent.remove();
      }
    });
  }

  /**
   * Validate the current configuration
   * @returns {Object} { valid: boolean, errors: Array }
   */
  validate() {
    const errors = [];
    const seenCodes = {};

    // Validate options in tables
    this.container.querySelectorAll('[data-opt-body]').forEach((tbody) => {
      const [scope, optKey] = tbody.getAttribute('data-opt-body').split(':');
      const key = `${scope}:${optKey}`;
      seenCodes[key] = new Set();

      tbody.querySelectorAll('tr').forEach((tr, rowIdx) => {
        const labelInput = tr.querySelector(`[data-opt-label="${scope}:${optKey}"]`);
        const codeInput = tr.querySelector(`[data-opt-code="${scope}:${optKey}"]`);

        if (!labelInput || !codeInput) return;

        const label = labelInput.value.trim();
        const code = codeInput.value.trim();

        // Clear previous errors
        this._clearFieldError(labelInput);
        this._clearFieldError(codeInput);

        // Validate label
        if (label === '') {
          errors.push({ field: labelInput, message: this.t('admin.validation.labelRequired') });
          this._showFieldError(labelInput, this.t('admin.validation.labelRequired'));
        }

        // Validate code uniqueness
        if (code !== '' && seenCodes[key].has(code)) {
          errors.push({ field: codeInput, message: this.t('admin.validation.duplicateCode') });
          this._showFieldError(codeInput, this.t('admin.validation.duplicateCode'));
        } else if (code !== '') {
          seenCodes[key].add(code);
        }
      });
    });

    this.validationErrors = errors;
    return { valid: errors.length === 0, errors };
  }

  /**
   * Show a field error
   */
  _showFieldError(input, message) {
    input.classList.add('invalid');
    const errorEl = input.parentElement?.querySelector('.field-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  /**
   * Clear a field error
   */
  _clearFieldError(input) {
    input.classList.remove('invalid');
    const errorEl = input.parentElement?.querySelector('.field-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  /**
   * Collect configuration from the UI
   * @returns {Object} The collected configuration
   */
  collectConfig() {
    const config = JSON.parse(JSON.stringify(this.config));

    // Collect include toggles
    this.container.querySelectorAll('[data-inc]').forEach((el) => {
      const [scope, key] = el.getAttribute('data-inc').split(':');
      config[scope].include[key] = el.checked;
    });

    // Collect defaults
    this.container.querySelectorAll('[data-def]').forEach((el) => {
      const [scope, key] = el.getAttribute('data-def').split(':');
      let stored = el.value;

      if (NUMERIC_DEFAULT_KEYS.has(key)) {
        const num = Number(stored);
        stored = (stored === '' ? '' : (Number.isFinite(num) ? num : 0));
      }

      config[scope].defaults[key] = stored;
    });

    // Collect options from tables (desktop/primary source)
    this.container.querySelectorAll('[data-opt-body]').forEach((tbody) => {
      const [scope, optKey] = tbody.getAttribute('data-opt-body').split(':');
      const rows = [];

      tbody.querySelectorAll('tr').forEach((tr) => {
        const labelInput = tr.querySelector(`[data-opt-label="${scope}:${optKey}"]`);
        const codeInput = tr.querySelector(`[data-opt-code="${scope}:${optKey}"]`);
        const enabledInput = tr.querySelector(`[data-opt-enabled="${scope}:${optKey}"]`);

        if (!labelInput || !codeInput) return;

        const label = labelInput.value;
        const codeRaw = codeInput.value;
        const codeNum = Number(codeRaw);
        const code = Number.isFinite(codeNum) ? codeNum : codeRaw;
        const enabled = enabledInput ? !!enabledInput.checked : true;

        if (String(label).trim() !== '') {
          rows.push({ label, code, enabled });
        }
      });

      config[scope].options[optKey] = rows;
    });

    return config;
  }

  /**
   * Get the currently active tab
   */
  getActiveTab() {
    return this.activeTab;
  }

  /**
   * Set the active tab
   */
  setActiveTab(tabName) {
    const btn = this.container.querySelector(`[data-tab-btn="${tabName}"]`);
    if (btn) btn.click();
  }

  /**
   * Escape HTML to prevent XSS
   */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
