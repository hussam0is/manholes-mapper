/**
 * Command Menu Component
 * Dropdown menu for secondary actions (export, import, coordinates)
 * Organized with visual group headers for better UX
 */

import { menuConfig } from './menu-config.js';
import { menuEvents } from './menu-events.js';

/**
 * Create a single menu item
 * @param {Object} item - Item configuration
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
function createMenuItem(item, t) {
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
}

/**
 * Create the command menu dropdown with grouped sections
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function createCommandMenu(t) {
  // Use the new grouped structure for better organization
  const groups = menuConfig.secondaryGroups || [];
  
  const groupsHtml = groups.map((group, index) => {
    const items = group.items.map(item => createMenuItem(item, t)).join('');
    const isFirst = index === 0;
    
    return `
      ${!isFirst ? '<hr class="menu-dropdown__divider" />' : ''}
      <div class="menu-dropdown__group" data-group="${group.id}">
        <div class="menu-dropdown__group-header">
          <span class="material-icons menu-dropdown__group-icon" aria-hidden="true">${group.icon}</span>
          <span class="menu-dropdown__group-label">${t(group.labelKey)}</span>
        </div>
        <div class="menu-dropdown__group-items">
          ${items}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="menu-group menu-group--command">
      <button 
        id="commandMenuBtn"
        class="menu-btn menu-btn--ghost menu-btn--icon-only menu-btn--command"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-controls="commandDropdown"
        title="${t('menu')}"
        aria-label="${t('menu')}"
      >
        <span class="material-icons" aria-hidden="true">apps</span>
      </button>
      <div 
        id="commandDropdown" 
        class="menu-dropdown menu-dropdown--grouped" 
        role="menu"
        aria-label="${t('menu')}"
      >
        <div class="menu-dropdown__header">
          <span class="material-icons" aria-hidden="true">dashboard</span>
          <span>${t('menuGroup.actions')}</span>
        </div>
        <div class="menu-dropdown__content">
          ${groupsHtml}
        </div>
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

  /**
   * Position the dropdown using fixed coordinates relative to the trigger button.
   * This avoids clipping by overflow:auto on ancestor containers (.menu-controls).
   */
  function positionDropdown() {
    const rect = menuBtn.getBoundingClientRect();
    const isRTL = document.documentElement.dir === 'rtl';

    // Place below the trigger button
    dropdown.style.top = `${rect.bottom + 4}px`;

    // Align to the end edge (right in LTR, left in RTL)
    if (isRTL) {
      dropdown.style.left = `${rect.left}px`;
      dropdown.style.right = 'auto';
    } else {
      dropdown.style.right = `${window.innerWidth - rect.right}px`;
      dropdown.style.left = 'auto';
    }

    // Ensure dropdown doesn't overflow the viewport bottom
    requestAnimationFrame(() => {
      const dropdownRect = dropdown.getBoundingClientRect();
      if (dropdownRect.bottom > window.innerHeight - 8) {
        const maxH = window.innerHeight - rect.bottom - 12;
        dropdown.querySelector('.menu-dropdown__content').style.maxHeight = `${maxH}px`;
      }
    });
  }

  function openMenu() {
    isOpen = true;
    dropdown.classList.add('menu-dropdown--open');
    menuBtn.setAttribute('aria-expanded', 'true');
    positionDropdown();
    
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

  // Close after action (except toggles, scales, and selects)
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-dropdown__item');
    if (item && 
        !item.classList.contains('menu-dropdown__item--toggle') && 
        !item.classList.contains('menu-dropdown__item--scale') &&
        !item.classList.contains('menu-dropdown__item--select')) {
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
