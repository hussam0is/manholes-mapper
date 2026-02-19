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
 * Modern mobile-menu inspired design
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
    // Keep existing classes (e.g., admin-content for scrolling) and add modern styling
    this.container.classList.add('admin-modern-content');

    // Tabs (styled like segmented controls)
    const tabs = this._createTabs();
    this.container.appendChild(tabs);

    // Sections container
    const sectionsWrapper = document.createElement('div');
    sectionsWrapper.className = 'admin-sections-wrapper';

    // Sections
    const nodeSpecs = getNodeSpecs(this.t);
    const edgeSpecs = getEdgeSpecs(this.t);

    sectionsWrapper.appendChild(this._buildSection(this.t('admin.tabNodes'), 'nodes', nodeSpecs));
    sectionsWrapper.appendChild(this._buildSection(this.t('admin.tabEdges'), 'edges', edgeSpecs));

    this.container.appendChild(sectionsWrapper);

    // Initialize values and behavior
    this._initializeDefaults();
    this._initializeTabs(tabs);
    this._initializeCollapsibleGroups();
    this._initializeOptionHandlers();
  }

  /**
   * Create tab buttons (segmented control style like mobile menu)
   */
  _createTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'admin-modern-tabs';
    tabs.innerHTML = `
      <button class="admin-modern-tab active" data-tab-btn="nodes">
        <span class="material-icons">account_tree</span>
        <span class="tab-label">${this.t('admin.tabNodes')}</span>
      </button>
      <button class="admin-modern-tab" data-tab-btn="edges">
        <span class="material-icons">timeline</span>
        <span class="tab-label">${this.t('admin.tabEdges')}</span>
      </button>
    `;
    return tabs;
  }

  /**
   * Build a section for nodes or edges (mobile menu style)
   */
  _buildSection(title, cfgKey, specs) {
    const section = document.createElement('div');
    section.className = 'admin-modern-section';
    section.setAttribute('data-tab', cfgKey);

    // Include toggles group
    section.appendChild(this._buildMenuGroup(
      this.t('admin.includeTitle'),
      'checklist',
      this._buildIncludeContent(cfgKey)
    ));

    // Defaults group
    section.appendChild(this._buildMenuGroup(
      this.t('admin.defaultsTitle'),
      'settings',
      this._buildDefaultsContent(cfgKey, specs)
    ));

    // Options groups
    const optionSpecs = specs.filter(s => s.optionsKey);
    for (const spec of optionSpecs) {
      section.appendChild(this._buildMenuGroup(
        this.t('admin.optionsTitle', spec.label),
        'list',
        this._buildOptionsContent(cfgKey, spec)
      ));
    }

    return section;
  }

  /**
   * Build a menu group (mobile menu style with label and content)
   */
  _buildMenuGroup(label, icon, content) {
    const group = document.createElement('div');
    group.className = 'admin-menu-group';
    
    // Group header (collapsible toggle)
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'admin-menu-group-header';
    header.setAttribute('aria-expanded', 'true');
    header.innerHTML = `
      <div class="admin-menu-group-title">
        <span class="material-icons">${icon}</span>
        <span>${label}</span>
      </div>
      <span class="material-icons admin-menu-chevron">expand_more</span>
    `;
    
    // Group content
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'admin-menu-group-content';
    contentWrapper.appendChild(content);
    
    group.appendChild(header);
    group.appendChild(contentWrapper);
    
    return group;
  }

  /**
   * Build the include checkboxes content (mobile menu style)
   */
  _buildIncludeContent(cfgKey) {
    const include = this.config[cfgKey].include;
    const content = document.createElement('div');
    content.className = 'admin-menu-items';

    const desc = document.createElement('p');
    desc.className = 'admin-menu-desc';
    desc.textContent = this.t('admin.includeDesc');
    content.appendChild(desc);

    const checkboxList = document.createElement('div');
    checkboxList.className = 'admin-toggle-list';
    
    Object.keys(include).forEach(k => {
      const checked = include[k] ? 'checked' : '';
      const id = `inc_${cfgKey}_${k}`;
      const item = document.createElement('label');
      item.className = 'admin-toggle-item';
      item.innerHTML = `
        <span class="admin-toggle-label">${k}</span>
        <input type="checkbox" data-inc="${cfgKey}:${k}" ${checked} id="${id}" class="admin-toggle-checkbox"/>
        <span class="admin-toggle-switch"></span>
      `;
      checkboxList.appendChild(item);
    });

    content.appendChild(checkboxList);
    return content;
  }

  /**
   * Build the defaults content (mobile menu style)
   */
  _buildDefaultsContent(cfgKey, specs) {
    const defaults = this.config[cfgKey].defaults;
    const content = document.createElement('div');
    content.className = 'admin-menu-items';

    const desc = document.createElement('p');
    desc.className = 'admin-menu-desc';
    desc.textContent = this.t('admin.defaultsDesc');
    content.appendChild(desc);

    const fieldsList = document.createElement('div');
    fieldsList.className = 'admin-fields-list';

    specs.forEach(spec => {
      const current = defaults[spec.key] ?? '';
      const id = `def_${cfgKey}_${spec.key}`;
      
      const field = document.createElement('div');
      field.className = 'admin-field-item';

      if (spec.type === 'select') {
        const opts = this.config[cfgKey].options[spec.key] || [];
        const optionsHtml = [`<option value="">${this.t('labels.optional')}</option>`].concat(
          opts.filter(o => o.enabled !== false).map(o => {
            const value = (spec.valueKind === 'code') ? String(o.code) : String(o.label);
            return `<option value="${value}">${o.label}</option>`;
          })
        ).join('');

        field.innerHTML = `
          <label for="${id}" class="admin-field-label">${spec.label}</label>
          <select id="${id}" data-def="${cfgKey}:${spec.key}" class="admin-field-select">${optionsHtml}</select>
        `;
      } else {
        field.innerHTML = `
          <label for="${id}" class="admin-field-label">${spec.label}</label>
          <input id="${id}" type="text" value="${current}" data-def="${cfgKey}:${spec.key}" 
                 placeholder="${this.t('admin.placeholders.defaultValue')}" class="admin-field-input"/>
        `;
      }

      fieldsList.appendChild(field);
    });

    content.appendChild(fieldsList);
    return content;
  }

  /**
   * Build options content (mobile menu style with cards)
   */
  _buildOptionsContent(cfgKey, spec) {
    const opts = this.config[cfgKey].options[spec.optionsKey] || [];
    const content = document.createElement('div');
    content.className = 'admin-menu-items';

    const desc = document.createElement('p');
    desc.className = 'admin-menu-desc';
    desc.textContent = this.t('admin.optionsDesc');
    content.appendChild(desc);

    // Option cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'admin-option-cards';
    cardsContainer.setAttribute('data-opt-cards', `${cfgKey}:${spec.optionsKey}`);
    
    opts.forEach((o, idx) => {
      cardsContainer.innerHTML += this._buildOptionCard(cfgKey, spec.optionsKey, o, idx);
    });

    content.appendChild(cardsContainer);

    // Hidden table for desktop (data collection)
    const table = document.createElement('table');
    table.className = 'option-table';
    table.setAttribute('data-opt-table', `${cfgKey}:${spec.optionsKey}`);
    table.innerHTML = `
      <thead>
        <tr>
          <th class="opt-enabled">${this.t('admin.thEnabled')}</th>
          <th class="opt-label">${this.t('admin.thLabel')}</th>
          <th class="opt-code">${this.t('admin.thCode')}</th>
          <th class="opt-actions"></th>
        </tr>
      </thead>
      <tbody data-opt-body="${cfgKey}:${spec.optionsKey}">
        ${opts.map(o => this._buildOptionRow(cfgKey, spec.optionsKey, o)).join('')}
      </tbody>
    `;
    content.appendChild(table);

    // Add button
    const addBtn = document.createElement('button');
    addBtn.className = 'admin-add-btn';
    addBtn.setAttribute('data-opt-add', `${cfgKey}:${spec.optionsKey}`);
    addBtn.innerHTML = `
      <span class="material-icons">add_circle</span>
      <span>${this.t('admin.addOption')}</span>
    `;
    content.appendChild(addBtn);

    return content;
  }

  /**
   * Build a single option card (mobile menu style)
   */
  _buildOptionCard(cfgKey, optKey, option, index) {
    const enabled = option.enabled !== false;
    const checkId = `opt_card_${cfgKey}_${optKey}_${index}`;

    return `
      <div class="admin-option-card ${enabled ? '' : 'disabled'}" data-option-card="${cfgKey}:${optKey}">
        <div class="admin-option-card-main">
          <label class="admin-option-toggle">
            <input type="checkbox" ${enabled ? 'checked' : ''} 
                   data-opt-card-enabled="${cfgKey}:${optKey}" 
                   id="${checkId}"
                   class="admin-toggle-checkbox"/>
            <span class="admin-toggle-switch"></span>
          </label>
          <div class="admin-option-card-fields">
            <input type="text" class="admin-option-label-input" 
                   value="${this._escapeHtml(option.label)}" 
                   data-opt-card-label="${cfgKey}:${optKey}"
                   placeholder="${this.t('admin.placeholders.newLabel')}"
                   aria-label="${this.t('admin.thLabel')}"/>
            <div class="admin-option-code-row">
              <span class="admin-option-code-label">${this.t('admin.thCode')}:</span>
              <input type="text" class="admin-option-code-input" 
                     value="${this._escapeHtml(String(option.code))}" 
                     data-opt-card-code="${cfgKey}:${optKey}"
                     placeholder="${this.t('admin.placeholders.code')}"
                     aria-label="${this.t('admin.thCode')}"/>
            </div>
          </div>
          <button class="admin-option-delete-btn" 
                  data-opt-card-del="${cfgKey}:${optKey}"
                  title="${this.t('admin.delete')}" 
                  aria-label="${this.t('admin.delete')}">
            <span class="material-icons">close</span>
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

      tabs.querySelectorAll('.admin-modern-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      this.container.querySelectorAll('[data-tab]').forEach(sec => {
        sec.style.display = (sec.getAttribute('data-tab') === target) ? '' : 'none';
      });
    });
  }

  /**
   * Initialize collapsible groups (mobile menu style)
   */
  _initializeCollapsibleGroups() {
    this.container.querySelectorAll('.admin-menu-group-header').forEach((header) => {
      header.addEventListener('click', () => {
        const group = header.closest('.admin-menu-group');
        if (!group) return;

        const isCollapsed = group.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', !isCollapsed);
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
      this._attachDeleteHandler(btn, '.admin-option-card');
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
      this._attachDeleteHandler(cardDelBtn, '.admin-option-card');

      // Focus label input
      const labelInput = card.querySelector('.admin-option-label-input');
      if (labelInput) labelInput.focus();
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

      tbody.querySelectorAll('tr').forEach((tr, _rowIdx) => {
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
