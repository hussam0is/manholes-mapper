/**
 * Input Flow Settings UI
 * 
 * A visual rule builder for configuring input flow rules per project.
 * Allows admins to create, edit, and manage conditional field behaviors.
 */

import {
  DEFAULT_INPUT_FLOW_CONFIG,
  INPUT_FLOW_ACTION_TYPES,
  INPUT_FLOW_OPERATORS,
  NODE_INPUT_FLOW_FIELDS,
  EDGE_INPUT_FLOW_FIELDS
} from '../state/constants.js';
import {
  createEmptyRule,
  createEmptyAction,
  validateInputFlowConfig
} from '../utils/input-flow-engine.js';

/**
 * InputFlowSettings - Visual rule builder component
 */
export class InputFlowSettings {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element to render into
   * @param {Object} options.config - Current input flow configuration
   * @param {Function} options.t - Translation function
   * @param {Function} options.onSave - Callback when settings are saved
   * @param {Function} options.onCancel - Callback when cancelled
   * @param {Object} options.project - Project data (optional)
   */
  constructor({ container, config, t, onSave, onCancel, project }) {
    this.container = container;
    this.config = JSON.parse(JSON.stringify(config || DEFAULT_INPUT_FLOW_CONFIG));
    // Wrap t function to handle cases where key is not found
    this.t = (key, ...args) => {
      if (typeof t === 'function') {
        const result = t(key, ...args);
        return result !== key ? result : this._getDefaultTranslation(key);
      }
      return this._getDefaultTranslation(key);
    };
    this.onSave = onSave;
    this.onCancel = onCancel;
    this.project = project;
    this.activeTab = 'nodes';
    this.editingRuleId = null;
  }

  /**
   * Get default translation for a key (fallback)
   */
  _getDefaultTranslation(key) {
    const defaults = {
      'inputFlow.title': 'Input Flow Settings',
      'inputFlow.import': 'Import',
      'inputFlow.export': 'Export',
      'inputFlow.tabNodes': 'Nodes',
      'inputFlow.tabEdges': 'Edges',
      'inputFlow.noRules': 'No rules defined',
      'inputFlow.addRule': 'Add Rule',
      'inputFlow.editRule': 'Edit Rule',
      'inputFlow.rule': 'Rule',
      'inputFlow.ruleName': 'Rule Name',
      'inputFlow.ruleNamePlaceholder': 'Enter rule name...',
      'inputFlow.ruleDescription': 'Description',
      'inputFlow.ruleDescriptionPlaceholder': 'Enter description...',
      'inputFlow.triggerSection': 'Trigger Condition',
      'inputFlow.actionsSection': 'Actions',
      'inputFlow.field': 'Field',
      'inputFlow.operator': 'Condition',
      'inputFlow.value': 'Value',
      'inputFlow.selectField': 'Select field...',
      'inputFlow.selectValue': 'Select value...',
      'inputFlow.when': 'When',
      'inputFlow.addAction': 'Add Action',
      'inputFlow.actionNullify': 'Set to Empty',
      'inputFlow.actionDisable': 'Hide Field',
      'inputFlow.actionRequire': 'Make Required',
      'inputFlow.actionBulkReset': 'Bulk Reset',
      'inputFlow.actionFillValue': 'Fill Value',
      'inputFlow.confirmDelete': 'Delete this rule?',
      'inputFlow.invalidConfig': 'Invalid configuration',
      'inputFlow.importSuccess': 'Imported successfully',
      'inputFlow.importError': 'Import error',
      'inputFlow.validationErrors': 'Validation errors',
      'buttons.cancel': 'Cancel',
      'buttons.save': 'Save',
      'buttons.edit': 'Edit',
      'buttons.delete': 'Delete',
    };
    return defaults[key] || key;
  }

  /**
   * Render the input flow settings UI
   */
  render() {
    this.container.innerHTML = '';
    this.container.classList.add('input-flow-settings');

    // Header with project name and import/export buttons
    const header = this._createHeader();
    this.container.appendChild(header);

    // Tabs for nodes/edges
    const tabs = this._createTabs();
    this.container.appendChild(tabs);

    // Rules container
    const rulesContainer = document.createElement('div');
    rulesContainer.className = 'input-flow-rules-container';
    rulesContainer.id = 'inputFlowRulesContainer';
    this.container.appendChild(rulesContainer);

    // Render rules for active tab
    this._renderRules();

    // Footer with save/cancel buttons
    const footer = this._createFooter();
    this.container.appendChild(footer);
  }

  /**
   * Create header section
   */
  _createHeader() {
    const header = document.createElement('div');
    header.className = 'input-flow-header';
    
    const title = document.createElement('h2');
    title.textContent = this.project?.name 
      ? `${this.t('inputFlow.title')} - ${this.project.name}`
      : this.t('inputFlow.title');
    
    const actions = document.createElement('div');
    actions.className = 'input-flow-header-actions';
    
    // Import button
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-secondary';
    importBtn.innerHTML = `<span class="material-icons">upload</span> ${this.t('inputFlow.import')}`;
    importBtn.addEventListener('click', () => this._handleImport());
    
    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary';
    exportBtn.innerHTML = `<span class="material-icons">download</span> ${this.t('inputFlow.export')}`;
    exportBtn.addEventListener('click', () => this._handleExport());
    
    actions.appendChild(importBtn);
    actions.appendChild(exportBtn);
    
    header.appendChild(title);
    header.appendChild(actions);
    
    return header;
  }

  /**
   * Create tabs for nodes/edges
   */
  _createTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'input-flow-tabs';
    tabs.innerHTML = `
      <button class="input-flow-tab active" data-tab="nodes">
        <span class="material-icons">account_tree</span>
        <span>${this.t('inputFlow.tabNodes')}</span>
        <span class="rule-count">${this.config.nodes?.rules?.length || 0}</span>
      </button>
      <button class="input-flow-tab" data-tab="edges">
        <span class="material-icons">timeline</span>
        <span>${this.t('inputFlow.tabEdges')}</span>
        <span class="rule-count">${this.config.edges?.rules?.length || 0}</span>
      </button>
    `;
    
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      
      this.activeTab = btn.getAttribute('data-tab');
      tabs.querySelectorAll('.input-flow-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      this._renderRules();
    });
    
    return tabs;
  }

  /**
   * Create footer with action buttons
   */
  _createFooter() {
    const footer = document.createElement('div');
    footer.className = 'input-flow-footer';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = this.t('buttons.cancel');
    cancelBtn.addEventListener('click', () => this.onCancel?.());
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = this.t('buttons.save');
    saveBtn.addEventListener('click', () => this._handleSave());
    
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    
    return footer;
  }

  /**
   * Render rules for the active tab
   */
  _renderRules() {
    const container = this.container.querySelector('#inputFlowRulesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    const rules = this.config[this.activeTab]?.rules || [];
    const fields = this.activeTab === 'nodes' ? NODE_INPUT_FLOW_FIELDS : EDGE_INPUT_FLOW_FIELDS;
    
    // Rules list
    if (rules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'input-flow-empty';
      empty.innerHTML = `
        <span class="material-icons">rule</span>
        <p>${this.t('inputFlow.noRules')}</p>
      `;
      container.appendChild(empty);
    } else {
      const rulesList = document.createElement('div');
      rulesList.className = 'input-flow-rules-list';
      
      rules.forEach((rule, index) => {
        rulesList.appendChild(this._createRuleCard(rule, index, fields));
      });
      
      container.appendChild(rulesList);
    }
    
    // Add rule button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-add-rule';
    addBtn.innerHTML = `<span class="material-icons">add</span> ${this.t('inputFlow.addRule')}`;
    addBtn.addEventListener('click', () => this._addRule());
    container.appendChild(addBtn);
  }

  /**
   * Create a rule card
   */
  _createRuleCard(rule, index, fields) {
    const card = document.createElement('div');
    card.className = `input-flow-rule-card ${rule.enabled === false ? 'disabled' : ''}`;
    card.dataset.ruleId = rule.id;
    
    // Get field label for trigger
    const triggerField = fields.find(f => f.key === rule.trigger?.field);
    const triggerFieldLabel = triggerField?.label || rule.trigger?.field || '?';
    const triggerOperator = INPUT_FLOW_OPERATORS.find(o => o.value === rule.trigger?.operator);
    const triggerOperatorLabel = triggerOperator?.label || rule.trigger?.operator || '?';
    
    // Get value label
    let triggerValueLabel = rule.trigger?.value;
    if (triggerField?.options) {
      const valueOption = triggerField.options.find(o => 
        String(o.code) === String(rule.trigger?.value) || o.label === rule.trigger?.value
      );
      if (valueOption) triggerValueLabel = valueOption.label;
    }
    
    // Build actions summary
    const actionsSummary = rule.actions?.map(action => {
      const actionLabels = {
        'nullify': this.t('inputFlow.actionNullify'),
        'disable': this.t('inputFlow.actionDisable'),
        'require': this.t('inputFlow.actionRequire'),
        'bulk_reset': this.t('inputFlow.actionBulkReset'),
        'fill_value': this.t('inputFlow.actionFillValue')
      };
      if (action.type === 'bulk_reset') {
        return `${actionLabels[action.type]} (${action.fields?.length || 0})`;
      }
      if (action.type === 'fill_value') {
        const targetField = fields.find(f => f.key === action.field);
        let valueLabel = action.value;
        if (targetField?.options) {
          const valueOption = targetField.options.find(o => 
            String(o.code) === String(action.value) || o.label === action.value
          );
          if (valueOption) valueLabel = valueOption.label;
        }
        return `${actionLabels[action.type]}: ${targetField?.label || action.field} = ${valueLabel}`;
      }
      const targetField = fields.find(f => f.key === action.field);
      return `${actionLabels[action.type]}: ${targetField?.label || action.field}`;
    }).join(', ') || '';
    
    card.innerHTML = `
      <div class="rule-card-header">
        <div class="rule-card-toggle">
          <label class="switch">
            <input type="checkbox" ${rule.enabled !== false ? 'checked' : ''} data-toggle-rule="${index}">
            <span class="slider"></span>
          </label>
        </div>
        <div class="rule-card-info">
          <h4>${this._escapeHtml(rule.name || `${this.t('inputFlow.rule')} ${index + 1}`)}</h4>
          <p class="rule-card-trigger">
            ${this._escapeHtml(this.t('inputFlow.when'))} <strong>${this._escapeHtml(triggerFieldLabel)}</strong>
            ${this._escapeHtml(triggerOperatorLabel)}
            <strong>${this._escapeHtml(String(triggerValueLabel))}</strong>
          </p>
          <p class="rule-card-actions">${this._escapeHtml(actionsSummary)}</p>
        </div>
        <div class="rule-card-buttons">
          <button class="btn-icon" data-edit-rule="${index}" title="${this.t('buttons.edit')}">
            <span class="material-icons">edit</span>
          </button>
          <button class="btn-icon btn-danger" data-delete-rule="${index}" title="${this.t('buttons.delete')}">
            <span class="material-icons">delete</span>
          </button>
        </div>
      </div>
    `;
    
    // Toggle handler
    card.querySelector(`[data-toggle-rule="${index}"]`)?.addEventListener('change', (e) => {
      this.config[this.activeTab].rules[index].enabled = e.target.checked;
    });
    
    // Edit handler
    card.querySelector(`[data-edit-rule="${index}"]`)?.addEventListener('click', () => {
      this._editRule(index);
    });
    
    // Delete handler
    card.querySelector(`[data-delete-rule="${index}"]`)?.addEventListener('click', () => {
      if (confirm(this.t('inputFlow.confirmDelete'))) {
        this.config[this.activeTab].rules.splice(index, 1);
        this._renderRules();
        this._updateTabCounts();
      }
    });
    
    return card;
  }

  /**
   * Add a new rule
   */
  _addRule() {
    if (!this.config[this.activeTab]) {
      this.config[this.activeTab] = { rules: [] };
    }
    if (!this.config[this.activeTab].rules) {
      this.config[this.activeTab].rules = [];
    }
    
    const newRule = createEmptyRule(this.activeTab);
    this.config[this.activeTab].rules.push(newRule);
    this._renderRules();
    this._updateTabCounts();
    
    // Open editor for the new rule
    this._editRule(this.config[this.activeTab].rules.length - 1);
  }

  /**
   * Edit a rule - opens modal editor
   */
  _editRule(index) {
    const rule = this.config[this.activeTab].rules[index];
    if (!rule) return;
    
    this._showRuleEditor(rule, index);
  }

  /**
   * Show rule editor modal
   */
  _showRuleEditor(rule, index) {
    const fields = this.activeTab === 'nodes' ? NODE_INPUT_FLOW_FIELDS : EDGE_INPUT_FLOW_FIELDS;
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'input-flow-modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'input-flow-modal';
    
    modal.innerHTML = `
      <div class="input-flow-modal-header">
        <h3>${this.t('inputFlow.editRule')}</h3>
        <button class="btn-icon modal-close">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="input-flow-modal-content">
        <div class="form-group">
          <label>${this.t('inputFlow.ruleName')}</label>
          <input type="text" id="ruleName" value="${rule.name || ''}" placeholder="${this.t('inputFlow.ruleNamePlaceholder')}">
        </div>
        <div class="form-group">
          <label>${this.t('inputFlow.ruleDescription')}</label>
          <textarea id="ruleDescription" placeholder="${this.t('inputFlow.ruleDescriptionPlaceholder')}">${rule.description || ''}</textarea>
        </div>
        
        <h4>${this.t('inputFlow.triggerSection')}</h4>
        <div class="form-row">
          <div class="form-group">
            <label>${this.t('inputFlow.field')}</label>
            <select id="triggerField">
              <option value="">${this.t('inputFlow.selectField')}</option>
              ${fields.map(f => `<option value="${f.key}" ${rule.trigger?.field === f.key ? 'selected' : ''}>${f.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>${this.t('inputFlow.operator')}</label>
            <select id="triggerOperator">
              ${INPUT_FLOW_OPERATORS.map(o => `<option value="${o.value}" ${rule.trigger?.operator === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="triggerValueGroup">
            <label>${this.t('inputFlow.value')}</label>
            <div id="triggerValueContainer"></div>
          </div>
        </div>
        
        <h4>${this.t('inputFlow.actionsSection')}</h4>
        <div id="actionsContainer"></div>
        <button class="btn btn-secondary btn-add-action" id="addActionBtn">
          <span class="material-icons">add</span> ${this.t('inputFlow.addAction')}
        </button>
      </div>
      <div class="input-flow-modal-footer">
        <button class="btn btn-secondary" id="cancelRuleBtn">${this.t('buttons.cancel')}</button>
        <button class="btn btn-primary" id="saveRuleBtn">${this.t('buttons.save')}</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Initialize trigger value input
    this._updateTriggerValueInput(modal, rule.trigger?.field, rule.trigger?.value, fields);
    
    // Render existing actions
    this._renderActions(modal, rule.actions || [], fields);
    
    // Event handlers
    modal.querySelector('.modal-close')?.addEventListener('click', () => overlay.remove());
    modal.querySelector('#cancelRuleBtn')?.addEventListener('click', () => overlay.remove());
    
    modal.querySelector('#triggerField')?.addEventListener('change', (e) => {
      this._updateTriggerValueInput(modal, e.target.value, '', fields);
    });
    
    modal.querySelector('#addActionBtn')?.addEventListener('click', () => {
      if (!rule.actions) rule.actions = [];
      rule.actions.push(createEmptyAction('nullify'));
      this._renderActions(modal, rule.actions, fields);
    });
    
    modal.querySelector('#saveRuleBtn')?.addEventListener('click', () => {
      // Collect values
      rule.name = modal.querySelector('#ruleName').value;
      rule.description = modal.querySelector('#ruleDescription').value;
      rule.trigger = {
        field: modal.querySelector('#triggerField').value,
        operator: modal.querySelector('#triggerOperator').value,
        value: this._getTriggerValue(modal)
      };
      rule.actions = this._collectActions(modal);
      
      // Update config
      this.config[this.activeTab].rules[index] = rule;
      
      overlay.remove();
      this._renderRules();
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  /**
   * Update trigger value input based on selected field
   */
  _updateTriggerValueInput(modal, fieldKey, currentValue, fields) {
    const container = modal.querySelector('#triggerValueContainer');
    const field = fields.find(f => f.key === fieldKey);
    
    if (!container) return;
    
    if (!field) {
      container.innerHTML = '<input type="text" id="triggerValue" value="" disabled placeholder="Select a field first">';
      return;
    }
    
    if (field.type === 'select' && field.options) {
      container.innerHTML = `
        <select id="triggerValue">
          <option value="">${this.t('inputFlow.selectValue')}</option>
          ${field.options.map(o => `<option value="${this._escapeHtml(String(o.code))}" ${String(o.code) === String(currentValue) ? 'selected' : ''}>${this._escapeHtml(o.label)}</option>`).join('')}
        </select>
      `;
    } else {
      container.innerHTML = `<input type="text" id="triggerValue" value="${this._escapeHtml(String(currentValue || ''))}">`;
    }
  }

  /**
   * Get trigger value from modal
   */
  _getTriggerValue(modal) {
    const input = modal.querySelector('#triggerValue');
    if (!input) return '';
    
    const value = input.value;
    // Try to parse as number if it looks like one
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }

  /**
   * Render actions in modal
   */
  _renderActions(modal, actions, fields) {
    const container = modal.querySelector('#actionsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    actions.forEach((action, idx) => {
      const actionDiv = document.createElement('div');
      actionDiv.className = 'action-row';
      
      if (action.type === 'bulk_reset') {
        actionDiv.innerHTML = `
          <select class="action-type" data-action-idx="${idx}">
            ${INPUT_FLOW_ACTION_TYPES.map(t => `<option value="${t}" ${action.type === t ? 'selected' : ''}>${this._escapeHtml(this._getActionTypeLabel(t))}</option>`).join('')}
          </select>
          <select class="action-fields" data-action-idx="${idx}" multiple>
            ${fields.map(f => `<option value="${this._escapeHtml(f.key)}" ${action.fields?.includes(f.key) ? 'selected' : ''}>${this._escapeHtml(f.label)}</option>`).join('')}
          </select>
          <button class="btn-icon btn-danger action-delete" data-action-idx="${idx}">
            <span class="material-icons">delete</span>
          </button>
        `;
      } else if (action.type === 'fill_value') {
        // Fill value action: needs field selector AND value selector
        const selectedField = fields.find(f => f.key === action.field);
        const valueOptions = selectedField?.options || [];

        actionDiv.innerHTML = `
          <select class="action-type" data-action-idx="${idx}">
            ${INPUT_FLOW_ACTION_TYPES.map(t => `<option value="${t}" ${action.type === t ? 'selected' : ''}>${this._escapeHtml(this._getActionTypeLabel(t))}</option>`).join('')}
          </select>
          <select class="action-field" data-action-idx="${idx}">
            <option value="">${this.t('inputFlow.selectField')}</option>
            ${fields.map(f => `<option value="${this._escapeHtml(f.key)}" ${action.field === f.key ? 'selected' : ''}>${this._escapeHtml(f.label)}</option>`).join('')}
          </select>
          <select class="action-value" data-action-idx="${idx}">
            <option value="">${this.t('inputFlow.selectValue')}</option>
            ${valueOptions.map(o => `<option value="${this._escapeHtml(String(o.code))}" ${String(o.code) === String(action.value) ? 'selected' : ''}>${this._escapeHtml(o.label)}</option>`).join('')}
          </select>
          <button class="btn-icon btn-danger action-delete" data-action-idx="${idx}">
            <span class="material-icons">delete</span>
          </button>
        `;
        
        // Field change handler for fill_value - update available values
        actionDiv.querySelector('.action-field')?.addEventListener('change', (e) => {
          const newFieldKey = e.target.value;
          actions[idx].field = newFieldKey;
          actions[idx].value = ''; // Reset value when field changes
          this._renderActions(modal, actions, fields);
        });
        
        // Value change handler for fill_value
        actionDiv.querySelector('.action-value')?.addEventListener('change', (e) => {
          const val = e.target.value;
          // Try to parse as number if it looks like one
          const num = Number(val);
          actions[idx].value = Number.isFinite(num) ? num : val;
        });
      } else {
        actionDiv.innerHTML = `
          <select class="action-type" data-action-idx="${idx}">
            ${INPUT_FLOW_ACTION_TYPES.map(t => `<option value="${t}" ${action.type === t ? 'selected' : ''}>${this._escapeHtml(this._getActionTypeLabel(t))}</option>`).join('')}
          </select>
          <select class="action-field" data-action-idx="${idx}">
            <option value="">${this.t('inputFlow.selectField')}</option>
            ${fields.map(f => `<option value="${this._escapeHtml(f.key)}" ${action.field === f.key ? 'selected' : ''}>${this._escapeHtml(f.label)}</option>`).join('')}
          </select>
          <button class="btn-icon btn-danger action-delete" data-action-idx="${idx}">
            <span class="material-icons">delete</span>
          </button>
        `;
      }
      
      // Type change handler
      actionDiv.querySelector('.action-type')?.addEventListener('change', (e) => {
        const newType = e.target.value;
        if (newType === 'bulk_reset') {
          actions[idx] = { type: 'bulk_reset', fields: [] };
        } else if (newType === 'fill_value') {
          actions[idx] = { type: 'fill_value', field: '', value: '' };
        } else {
          actions[idx] = { type: newType, field: '' };
        }
        this._renderActions(modal, actions, fields);
      });
      
      // Delete handler
      actionDiv.querySelector('.action-delete')?.addEventListener('click', () => {
        actions.splice(idx, 1);
        this._renderActions(modal, actions, fields);
      });
      
      container.appendChild(actionDiv);
    });
  }

  /**
   * Collect actions from modal
   */
  _collectActions(modal) {
    const actions = [];
    const container = modal.querySelector('#actionsContainer');
    if (!container) return actions;
    
    container.querySelectorAll('.action-row').forEach((row, _idx) => {
      const typeSelect = row.querySelector('.action-type');
      const type = typeSelect?.value;
      
      if (type === 'bulk_reset') {
        const fieldsSelect = row.querySelector('.action-fields');
        const selectedFields = Array.from(fieldsSelect?.selectedOptions || []).map(o => o.value);
        actions.push({ type: 'bulk_reset', fields: selectedFields });
      } else if (type === 'fill_value') {
        const fieldSelect = row.querySelector('.action-field');
        const valueSelect = row.querySelector('.action-value');
        const val = valueSelect?.value || '';
        // Try to parse as number if it looks like one
        const num = Number(val);
        actions.push({ 
          type: 'fill_value', 
          field: fieldSelect?.value || '',
          value: Number.isFinite(num) ? num : val
        });
      } else {
        const fieldSelect = row.querySelector('.action-field');
        actions.push({ type, field: fieldSelect?.value || '' });
      }
    });
    
    return actions;
  }

  /**
   * Escape HTML special characters to prevent XSS
   */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Get action type label
   */
  _getActionTypeLabel(type) {
    const labels = {
      'nullify': this.t('inputFlow.actionNullify'),
      'disable': this.t('inputFlow.actionDisable'),
      'require': this.t('inputFlow.actionRequire'),
      'bulk_reset': this.t('inputFlow.actionBulkReset'),
      'fill_value': this.t('inputFlow.actionFillValue')
    };
    return labels[type] || type;
  }

  /**
   * Update tab counts
   */
  _updateTabCounts() {
    const nodesCount = this.container.querySelector('[data-tab="nodes"] .rule-count');
    const edgesCount = this.container.querySelector('[data-tab="edges"] .rule-count');
    
    if (nodesCount) nodesCount.textContent = this.config.nodes?.rules?.length || 0;
    if (edgesCount) edgesCount.textContent = this.config.edges?.rules?.length || 0;
  }

  /**
   * Handle import
   */
  _handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        
        // Validate
        const validation = validateInputFlowConfig(imported);
        if (!validation.valid) {
          alert(this.t('inputFlow.invalidConfig') + '\n' + validation.errors.map(e => e.message).join('\n'));
          return;
        }
        
        this.config = imported;
        this._renderRules();
        this._updateTabCounts();
        alert(this.t('inputFlow.importSuccess'));
      } catch (err) {
        alert(this.t('inputFlow.importError') + ': ' + err.message);
      }
    });
    
    input.click();
  }

  /**
   * Handle export
   */
  _handleExport() {
    const json = JSON.stringify(this.config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `input-flow-config-${this.project?.name || 'default'}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Handle save
   */
  _handleSave() {
    // Validate configuration
    const validation = validateInputFlowConfig(this.config);
    if (!validation.valid) {
      alert(this.t('inputFlow.validationErrors') + '\n' + validation.errors.map(e => `${e.path}: ${e.message}`).join('\n'));
      return;
    }
    
    this.onSave?.(this.config);
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this.config;
  }
}
