/**
 * Header Component
 * Main header with responsive menu system
 */

import { menuConfig, breakpoints } from './menu-config.js';
import { menuEvents, setupEventDelegation } from './menu-events.js';
import { createActionBar } from './action-bar.js';
import { createCommandMenu, initCommandMenu } from './command-menu.js';

/**
 * Create the brand section (logo + title + sketch name)
 * @returns {string} HTML string
 */
export function createBrand() {
  return `
    <div class="menu-brand" id="brand">
      <img 
        id="brandLogo" 
        class="menu-brand__logo" 
        src="./geopoint_logo.png" 
        alt="Geopoint" 
      />
      <h1 id="appTitle" class="menu-brand__title">
        <span class="menu-brand__title-main">Man</span><span class="menu-brand__title-highlight">hole</span>
        <span class="menu-brand__title-main">Map</span><span class="menu-brand__title-highlight">per</span>
      </h1>
      <span id="sketchNameDisplay" class="menu-sketch-name"></span>
    </div>
    <span id="sketchNameDisplayMobile" class="menu-sketch-name menu-sketch-name--mobile"></span>
  `;
}

/**
 * Create mobile menu toggle button
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function createMobileMenuToggle(t) {
  return `
    <button 
      id="mobileMenuBtn"
      class="menu-toggle"
      aria-label="${t('menu')}"
      aria-expanded="false"
      aria-controls="mobileMenu"
    >
      <span class="material-icons" aria-hidden="true">menu</span>
    </button>
  `;
}

/**
 * Create the mobile slide-out menu
 * @param {Function} t - Translation function
 * @param {string} currentLang - Current language code
 * @returns {string} HTML string
 */
export function createMobileMenu(t, currentLang = 'he') {
  const groups = menuConfig.mobileGroups.map(group => {
    const items = group.items.map(itemId => {
      // Find item config
      const allItems = [
        ...menuConfig.primary,
        ...menuConfig.secondaryGroups.flatMap(g => g.items),
        ...menuConfig.sizeControls,
        ...menuConfig.utility,
        { id: 'searchNode', type: 'search' },
        { id: 'searchAddress', type: 'searchAddress' },
      ];
      
      const item = allItems.find(i => i.id === itemId);
      if (!item) return '';

      if (item.type === 'search' || itemId === 'searchNode') {
        return `
          <div class="mobile-menu__search">
            <span class="material-icons" aria-hidden="true">search</span>
            <input 
              type="text" 
              id="mobileSearchNodeInput"
              class="mobile-menu__search-input" 
              placeholder="${t('searchNode')}"
              aria-label="${t('searchNodeTitle')}"
            />
          </div>
        `;
      }

      if (item.type === 'searchAddress' || itemId === 'searchAddress') {
        return `
          <div class="mobile-menu__search">
            <span class="material-icons" aria-hidden="true">place</span>
            <input 
              type="text" 
              id="mobileSearchAddressInput"
              class="mobile-menu__search-input" 
              placeholder="${t('searchAddress')}"
              aria-label="${t('searchAddressTitle')}"
            />
          </div>
        `;
      }

      if (item.type === 'select') {
        const options = item.options.map(opt => 
          `<option value="${opt.value}" ${opt.value === currentLang ? 'selected' : ''}>${opt.label}</option>`
        ).join('');
        
        return `
          <select 
            id="mobileLangSelect" 
            class="mobile-menu__select"
            data-action="languageChange"
            aria-label="${t(item.labelKey)}"
          >
            ${options}
          </select>
        `;
      }

      if (item.type === 'toggle' && itemId === 'autosave') {
        return `
          <label class="mobile-menu__toggle">
            <input type="checkbox" id="mobileAutosaveToggle" />
            <span class="mobile-menu__label">${t(item.labelKey)}</span>
          </label>
        `;
      }

      if (item.type === 'toggle' && itemId === 'toggleCoordinates') {
        return `
          <label class="mobile-menu__toggle">
            <input type="checkbox" id="mobileCoordinatesToggle" />
            <span class="material-icons" aria-hidden="true">${item.icon}</span>
            <span class="mobile-menu__label">${t(item.labelKey)}</span>
          </label>
        `;
      }

      if (item.type === 'scale') {
        return `
          <div class="mobile-menu__scale" id="mobileCoordinateScaleControls">
            <span class="material-icons" aria-hidden="true">${item.icon}</span>
            <span class="mobile-menu__label">${t(item.labelKey)}:</span>
            <div class="mobile-menu__scale-adjuster">
              <button id="mobileScaleDecreaseBtn" class="mobile-menu__scale-btn">−</button>
              <span id="mobileScaleValueDisplay" class="mobile-menu__scale-value">1:100</span>
              <button id="mobileScaleIncreaseBtn" class="mobile-menu__scale-btn">+</button>
            </div>
          </div>
        `;
      }

      const variantClass = item.variant ? `mobile-menu__btn--${item.variant}` : '';
      const mobileId = `mobile${itemId.charAt(0).toUpperCase() + itemId.slice(1)}Btn`;

      return `
        <button 
          id="${mobileId}"
          class="mobile-menu__btn ${variantClass}"
          data-action="${item.id}"
        >
          <span class="material-icons" aria-hidden="true">${item.icon}</span>
          <span class="mobile-menu__label">${t(item.labelKey)}</span>
        </button>
      `;
    }).join('');

    const groupIcon = group.icon || 'folder';
    return `
      <div class="mobile-menu__group" data-group="${group.id}">
        <div class="mobile-menu__group-header" id="menuGroup${group.id.charAt(0).toUpperCase() + group.id.slice(1)}">
          <span class="material-icons mobile-menu__group-icon" aria-hidden="true">${groupIcon}</span>
          <span class="mobile-menu__group-label">${t(group.labelKey)}</span>
        </div>
        ${items}
      </div>
    `;
  }).join('');

  return `
    <div id="mobileMenu" class="mobile-menu" role="dialog" aria-modal="true" aria-labelledby="mobileMenuTitle">
      <div class="mobile-menu__header">
        <h3 class="mobile-menu__title">
          <span class="material-icons" aria-hidden="true">menu</span>
          <span id="mobileMenuTitle">${t('menu')}</span>
        </h3>
        <button 
          id="mobileMenuCloseBtn" 
          class="mobile-menu__close"
          aria-label="${t('close')}"
        >
          <span class="material-icons" aria-hidden="true">close</span>
        </button>
      </div>
      <div id="mobileUserButtonContainer" class="mobile-menu__user">
        <div id="mobileAuthUserButton"></div>
      </div>
      <div class="mobile-menu__content">
        ${groups}
      </div>
    </div>
    <div id="mobileMenuBackdrop" class="mobile-menu__backdrop"></div>
  `;
}

/**
 * Create the complete header
 * @param {Function} t - Translation function
 * @param {string} currentLang - Current language code
 * @returns {string} HTML string
 */
export function createHeader(t, currentLang = 'he') {
  return `
    <header class="app-header" role="banner">
      ${createBrand()}
      <div id="controls" class="menu-controls">
        ${createActionBar(t, currentLang)}
        ${createCommandMenu(t)}
        <div class="menu-group menu-group--user" id="userButtonContainer">
          <div id="authUserButton"></div>
        </div>
      </div>
      ${createMobileMenuToggle(t)}
    </header>
    <!-- Hidden file inputs for import functionality -->
    <input type="file" id="importSketchFile" accept="application/json,.json" style="display:none;" aria-label="Import sketch file" />
    <input type="file" id="importCoordinatesFile" accept=".csv,text/csv" style="display:none;" aria-label="Import coordinates file" />
    ${createMobileMenu(t, currentLang)}
  `;
}

/**
 * Header component class for managing the header UI
 */
export class HeaderComponent {
  constructor(containerSelector, translator, getLang) {
    this.container = document.querySelector(containerSelector) || document.body;
    this.t = translator;
    this.getLang = getLang;
    this.headerEl = null;
    this.mobileMenuEl = null;
    this.isMobileMenuOpen = false;
  }

  /**
   * Render the header into the container
   */
  render() {
    const currentLang = this.getLang();
    const html = createHeader(this.t, currentLang);
    
    // Create a temporary container
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Extract header and mobile menu elements
    this.headerEl = temp.querySelector('.app-header');
    this.mobileMenuEl = temp.querySelector('.mobile-menu');
    const backdropEl = temp.querySelector('.mobile-menu__backdrop');
    const fileInputs = temp.querySelectorAll('input[type="file"]');
    
    // Insert at the beginning of the container
    const firstChild = this.container.firstChild;
    if (firstChild) {
      this.container.insertBefore(this.headerEl, firstChild);
      fileInputs.forEach(input => this.container.insertBefore(input, firstChild));
      this.container.insertBefore(backdropEl, firstChild);
      this.container.insertBefore(this.mobileMenuEl, firstChild);
    } else {
      this.container.appendChild(this.headerEl);
      fileInputs.forEach(input => this.container.appendChild(input));
      this.container.appendChild(this.mobileMenuEl);
      this.container.appendChild(backdropEl);
    }

    // Set up event delegation
    setupEventDelegation(this.headerEl);
    setupEventDelegation(this.mobileMenuEl);
    
    // Initialize command menu
    initCommandMenu(this.headerEl);
    
    // Initialize mobile menu behavior
    this.initMobileMenu();
    
    // Set up responsive behavior
    this.initResponsive();
    
    return this;
  }

  /**
   * Initialize mobile menu behavior
   */
  initMobileMenu() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    const closeBtn = document.getElementById('mobileMenuCloseBtn');
    const backdrop = document.getElementById('mobileMenuBackdrop');
    const mobileMenu = document.getElementById('mobileMenu');

    if (!menuBtn || !mobileMenu) return;

    const openMenu = () => {
      this.isMobileMenuOpen = true;

      // Reset scroll to top so Home/New Sketch buttons are always visible
      const scrollContainer = mobileMenu.querySelector('.mobile-menu-content');
      if (scrollContainer) scrollContainer.scrollTop = 0;

      mobileMenu.classList.add('mobile-menu--open');
      mobileMenu.style.display = 'flex';
      backdrop.style.display = 'block';
      menuBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('mobile-menu-open');

      // Focus trap
      const firstFocusable = mobileMenu.querySelector('button, input, select');
      if (firstFocusable) firstFocusable.focus();
    };

    const closeMenu = () => {
      this.isMobileMenuOpen = false;
      mobileMenu.classList.remove('mobile-menu--open');
      mobileMenu.style.display = 'none';
      backdrop.style.display = 'none';
      menuBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('mobile-menu-open');
      menuBtn.focus();
    };

    menuBtn.addEventListener('click', () => {
      if (this.isMobileMenuOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    closeBtn?.addEventListener('click', closeMenu);
    backdrop?.addEventListener('click', closeMenu);

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isMobileMenuOpen) {
        closeMenu();
      }
    });

    // Close after action
    mobileMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('.mobile-menu__btn');
      if (btn) {
        closeMenu();
      }
    });
  }

  /**
   * Initialize responsive behavior
   */
  initResponsive() {
    const updateLayout = () => {
      const width = window.innerWidth;
      const controls = document.getElementById('controls');
      const mobileBtn = document.getElementById('mobileMenuBtn');

      if (width <= breakpoints.mobile) {
        controls?.classList.add('menu-controls--hidden');
        mobileBtn?.classList.remove('menu-toggle--hidden');
      } else {
        controls?.classList.remove('menu-controls--hidden');
        mobileBtn?.classList.add('menu-toggle--hidden');
        
        // Close mobile menu if open
        if (this.isMobileMenuOpen) {
          const closeBtn = document.getElementById('mobileMenuCloseBtn');
          closeBtn?.click();
        }
      }
    };

    window.addEventListener('resize', updateLayout);
    updateLayout();
  }

  /**
   * Update translations
   */
  updateTranslations() {
    // Update all translatable elements
    const currentLang = this.getLang();
    
    // Update button labels
    menuConfig.primary.forEach(action => {
      const btn = document.getElementById(`${action.id}Btn`);
      if (btn) {
        const label = this.t(action.labelKey);
        btn.title = label;
        btn.setAttribute('aria-label', label);
        const labelEl = btn.querySelector('.menu-btn__label');
        if (labelEl) labelEl.textContent = label;
      }
    });

    // Update search placeholders
    const searchInput = document.getElementById('searchNodeInput');
    if (searchInput) {
      searchInput.placeholder = this.t(menuConfig.search.placeholderKey);
      searchInput.title = this.t(menuConfig.search.titleKey);
    }
    const searchAddressInput = document.getElementById('searchAddressInput');
    if (searchAddressInput) {
      searchAddressInput.placeholder = this.t(menuConfig.searchAddress.placeholderKey);
      searchAddressInput.title = this.t(menuConfig.searchAddress.titleKey);
    }
    const mobileSearchAddressInput = document.getElementById('mobileSearchAddressInput');
    if (mobileSearchAddressInput) {
      mobileSearchAddressInput.placeholder = this.t(menuConfig.searchAddress.placeholderKey);
      mobileSearchAddressInput.setAttribute('aria-label', this.t(menuConfig.searchAddress.titleKey));
    }

    // Emit event for other components to update
    menuEvents.emit('translations:updated', { lang: currentLang });
  }

  /**
   * Set sketch name display
   * @param {string} name - Sketch name to display
   */
  setSketchName(name) {
    const desktopDisplay = document.getElementById('sketchNameDisplay');
    const mobileDisplay = document.getElementById('sketchNameDisplayMobile');
    
    if (desktopDisplay) desktopDisplay.textContent = name || '';
    if (mobileDisplay) mobileDisplay.textContent = name || '';
  }

  /**
   * Destroy the header component
   */
  destroy() {
    this.headerEl?.remove();
    this.mobileMenuEl?.remove();
    document.getElementById('mobileMenuBackdrop')?.remove();
    document.getElementById('importSketchFile')?.remove();
    document.getElementById('importCoordinatesFile')?.remove();
  }
}

/**
 * Create and initialize header component
 * @param {string} containerSelector - CSS selector for container
 * @param {Function} translator - Translation function
 * @param {Function} getLang - Function to get current language
 * @returns {HeaderComponent}
 */
export function initHeader(containerSelector, translator, getLang) {
  const header = new HeaderComponent(containerSelector, translator, getLang);
  header.render();
  return header;
}
