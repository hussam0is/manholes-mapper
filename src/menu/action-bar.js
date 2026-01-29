/**
 * Action Bar Component
 * Renders primary and utility action buttons
 */

import { menuConfig } from './menu-config.js';

/**
 * Create a single action button
 * @param {Object} action - Action configuration
 * @param {Function} t - Translation function
 * @param {Object} options - Additional options
 * @returns {string} HTML string
 */
export function createActionButton(action, t, options = {}) {
  const { variant = 'ghost', size = 'medium', showLabel = action.showLabel } = options;
  
  const label = t(action.labelKey);
  const classes = [
    'menu-btn',
    `menu-btn--${variant}`,
    `menu-btn--${size}`,
    !showLabel && 'menu-btn--icon-only',
  ].filter(Boolean).join(' ');

  return `
    <button 
      id="${action.id}Btn"
      class="${classes}" 
      data-action="${action.id}"
      title="${label}"
      aria-label="${label}"
    >
      <span class="material-icons" aria-hidden="true">${action.icon}</span>
      ${showLabel ? `<span class="menu-btn__label">${label}</span>` : ''}
    </button>
  `;
}

/**
 * Create the primary actions group (New Sketch, Save)
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function createPrimaryActions(t) {
  const buttons = menuConfig.primary.map(action => {
    if (action.id === 'save') {
      // Save button with autosave indicator
      return `
        <div class="menu-save-group">
          <button 
            id="saveBtn"
            class="menu-btn menu-btn--primary" 
            data-action="save"
            title="${t('save')}"
            aria-label="${t('save')}"
          >
            <span class="material-icons" aria-hidden="true">save</span>
            <span class="menu-btn__label">${t('save')}</span>
          </button>
          <label class="menu-autosave" title="${t('autosave')}">
            <input type="checkbox" id="autosaveToggle" data-action="autosave" />
            <span class="menu-autosave__indicator"></span>
            <span class="menu-autosave__label">${t('autosave')}</span>
          </label>
        </div>
      `;
    }
    return createActionButton(action, t, { variant: 'primary' });
  }).join('');

  return `
    <div class="menu-group menu-group--primary">
      ${buttons}
    </div>
  `;
}

/**
 * Create the search group
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function createSearchGroup(t) {
  const { search } = menuConfig;
  return `
    <div class="menu-group menu-group--search">
      <div class="menu-search">
        <span class="material-icons menu-search__icon" aria-hidden="true">search</span>
        <input 
          type="text" 
          id="searchNodeInput"
          class="menu-search__input" 
          placeholder="${t(search.placeholderKey)}"
          title="${t(search.titleKey)}"
          aria-label="${t(search.titleKey)}"
        />
      </div>
    </div>
  `;
}

/**
 * Create size controls group
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function createSizeControls(t) {
  const buttons = menuConfig.sizeControls.map(action => 
    createActionButton(action, t, { variant: 'ghost', size: 'small' })
  ).join('');

  return `
    <div class="menu-group menu-group--size">
      <div class="menu-segmented">
        ${buttons}
      </div>
    </div>
  `;
}

/**
 * Create utility actions (help, admin, projects, home, language)
 * @param {Function} t - Translation function
 * @param {string} currentLang - Current language code
 * @returns {string} HTML string
 */
export function createUtilityActions(t, currentLang = 'he') {
  const buttons = menuConfig.utility.map(action => {
    if (action.type === 'select') {
      // Language selector
      const options = action.options.map(opt => 
        `<option value="${opt.value}" ${opt.value === currentLang ? 'selected' : ''}>${opt.label}</option>`
      ).join('');
      
      return `
        <select 
          id="langSelect" 
          class="menu-select"
          title="${t(action.labelKey)}"
          aria-label="${t(action.labelKey)}"
        >
          ${options}
        </select>
      `;
    }
    
    if (action.type === 'toggle' && action.id === 'autosave') {
      // Autosave is handled in primary group
      return '';
    }

    return createActionButton(action, t, { 
      variant: 'ghost', 
      showLabel: action.showLabel 
    });
  }).filter(Boolean).join('');

  return `
    <div class="menu-group menu-group--utility">
      ${buttons}
    </div>
  `;
}

/**
 * Create the complete action bar
 * @param {Function} t - Translation function
 * @param {string} currentLang - Current language code
 * @returns {string} HTML string
 */
export function createActionBar(t, currentLang = 'he') {
  return `
    <nav class="menu-nav" role="navigation" aria-label="Main navigation">
      ${createPrimaryActions(t)}
      ${createSearchGroup(t)}
      ${createSizeControls(t)}
      ${createUtilityActions(t, currentLang)}
    </nav>
  `;
}
