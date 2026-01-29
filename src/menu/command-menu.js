/**
 * Command Menu Component
 * Dropdown menu for secondary actions (export, import, coordinates)
 */

import { menuConfig } from './menu-config.js';
import { menuEvents } from './menu-events.js';

/**
 * Create the command menu dropdown
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function createCommandMenu(t) {
  const items = menuConfig.secondary.map(item => {
    if (item.type === 'divider') {
      return '<hr class="menu-dropdown__divider" />';
    }

    if (item.type === 'toggle') {
      return `
        <label class="menu-dropdown__item menu-dropdown__item--toggle">
          <input type="checkbox" id="${item.id}Toggle" data-action="${item.id}" />
          <span class="material-icons" aria-hidden="true">${item.icon}</span>
          <span class="menu-dropdown__label">${t(item.labelKey)}</span>
        </label>
      `;
    }

    if (item.type === 'scale') {
      return `
        <div class="menu-dropdown__item menu-dropdown__item--scale" id="coordinateScaleControls">
          <span class="material-icons" aria-hidden="true">${item.icon}</span>
          <span class="menu-dropdown__label">${t(item.labelKey)}:</span>
          <div class="menu-scale-adjuster">
            <button 
              class="menu-scale-btn" 
              data-action="scaleDecrease"
              title="${t('sizeDecrease')}"
              aria-label="${t('sizeDecrease')}"
            >−</button>
            <span id="scaleValueDisplay" class="menu-scale-value">1:100</span>
            <button 
              class="menu-scale-btn" 
              data-action="scaleIncrease"
              title="${t('sizeIncrease')}"
              aria-label="${t('sizeIncrease')}"
            >+</button>
          </div>
        </div>
      `;
    }

    const variantClass = item.variant ? `menu-dropdown__item--${item.variant}` : '';
    
    return `
      <button 
        id="${item.id}Btn"
        class="menu-dropdown__item ${variantClass}"
        data-action="${item.id}"
      >
        <span class="material-icons" aria-hidden="true">${item.icon}</span>
        <span class="menu-dropdown__label">${t(item.labelKey)}</span>
      </button>
    `;
  }).join('');

  return `
    <div class="menu-group menu-group--command">
      <button 
        id="commandMenuBtn"
        class="menu-btn menu-btn--ghost menu-btn--icon-only"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-controls="commandDropdown"
        title="${t('menu')}"
        aria-label="${t('menu')}"
      >
        <span class="material-icons" aria-hidden="true">more_vert</span>
      </button>
      <div 
        id="commandDropdown" 
        class="menu-dropdown" 
        role="menu"
        aria-label="${t('menu')}"
      >
        ${items}
      </div>
    </div>
  `;
}

/**
 * Initialize command menu behavior
 * @param {HTMLElement} container - Container element
 */
export function initCommandMenu(container) {
  const menuBtn = container.querySelector('#commandMenuBtn');
  const dropdown = container.querySelector('#commandDropdown');
  
  if (!menuBtn || !dropdown) return;

  let isOpen = false;

  function openMenu() {
    isOpen = true;
    dropdown.classList.add('menu-dropdown--open');
    menuBtn.setAttribute('aria-expanded', 'true');
    
    // Focus first item
    const firstItem = dropdown.querySelector('button, input');
    if (firstItem) firstItem.focus();
  }

  function closeMenu() {
    isOpen = false;
    dropdown.classList.remove('menu-dropdown--open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  // Toggle on button click
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (isOpen && !dropdown.contains(e.target) && e.target !== menuBtn) {
      closeMenu();
    }
  });

  // Close on escape
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeMenu();
      menuBtn.focus();
    }
  });

  // Close after action (except toggles)
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-dropdown__item');
    if (item && !item.classList.contains('menu-dropdown__item--toggle') && 
        !item.classList.contains('menu-dropdown__item--scale')) {
      closeMenu();
    }
  });

  // Keyboard navigation within menu
  dropdown.addEventListener('keydown', (e) => {
    const items = Array.from(dropdown.querySelectorAll('button:not([disabled]), input:not([disabled])'));
    const currentIndex = items.indexOf(document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      items[prevIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  });

  // Emit events
  menuEvents.emit('commandMenu:init', { menuBtn, dropdown });
}

/**
 * Create and initialize the command menu
 * @param {HTMLElement} container - Container element
 * @param {Function} t - Translation function
 */
export function renderCommandMenu(container, t) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = createCommandMenu(t);
  
  const group = wrapper.firstElementChild;
  container.appendChild(group);
  
  initCommandMenu(container);
  
  return group;
}
