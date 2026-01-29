/**
 * Menu Module Index
 * Central export for all menu components
 */

// Configuration
export { menuConfig, breakpoints, getAllActionIds, getActionConfig } from './menu-config.js';

// Event handling
export { menuEvents, setupEventDelegation, bridgeToElement, bridgeAllToLegacy, legacyMappings } from './menu-events.js';

// Components
export { createActionBar, createActionButton, createPrimaryActions, createSearchGroup, createSizeControls, createUtilityActions } from './action-bar.js';
export { createCommandMenu, initCommandMenu, renderCommandMenu } from './command-menu.js';
export { createHeader, createBrand, createMobileMenu, createMobileMenuToggle, HeaderComponent, initHeader } from './header.js';
