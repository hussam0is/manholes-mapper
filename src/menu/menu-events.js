/**
 * Menu Events Module
 * Centralized event handling with delegation pattern
 */

class MenuEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Register an event listener
   * @param {string} event - Event name (action ID)
   * @param {Function} callback - Handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Handler to remove
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit an event to all listeners
   * @param {string} event - Event name
   * @param {*} data - Optional data to pass
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[Menu] Error in event handler for "${event}":`, err.message);
        }
      });
    }
  }

  /**
   * Register a one-time listener
   * @param {string} event - Event name
   * @param {Function} callback - Handler function
   */
  once(event, callback) {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      callback(data);
    });
    return unsubscribe;
  }
}

// Singleton instance
export const menuEvents = new MenuEventEmitter();

/**
 * Set up event delegation on a container element
 * @param {HTMLElement} container - Container to attach listeners to
 */
export function setupEventDelegation(container) {
  // Click delegation
  container.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      e.preventDefault();
      e.stopPropagation();
      const action = actionEl.dataset.action;
      menuEvents.emit(action, { element: actionEl, originalEvent: e });
    }
  });

  // Keyboard support for buttons
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const actionEl = e.target.closest('[data-action]');
      if (actionEl && actionEl.tagName !== 'BUTTON') {
        e.preventDefault();
        const action = actionEl.dataset.action;
        menuEvents.emit(action, { element: actionEl, originalEvent: e });
      }
    }
  });

  // Change delegation (for selects, inputs)
  container.addEventListener('change', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      menuEvents.emit(action, { 
        element: actionEl, 
        value: actionEl.value,
        originalEvent: e 
      });
    }
  });
}

/**
 * Create a bridge to existing DOM element handlers
 * This allows gradual migration from old to new event system
 * @param {string} actionId - Menu action ID
 * @param {string} elementId - DOM element ID to trigger click on
 */
export function bridgeToElement(actionId, elementId) {
  menuEvents.on(actionId, () => {
    const element = document.getElementById(elementId);
    if (element) {
      element.click();
    }
  });
}

/**
 * Bridge multiple actions to their corresponding legacy elements
 * @param {Object} mappings - Object of { actionId: elementId }
 */
export function bridgeAllToLegacy(mappings) {
  Object.entries(mappings).forEach(([actionId, elementId]) => {
    bridgeToElement(actionId, elementId);
  });
}

// Legacy element ID mappings for backward compatibility
export const legacyMappings = {
  newSketch: 'newSketchBtn',
  save: 'saveBtn',
  exportSketch: 'exportSketchBtn',
  importSketch: 'importSketchBtn',
  exportNodes: 'exportNodesBtn',
  exportEdges: 'exportEdgesBtn',
  finishWorkday: 'finishWorkdayBtn',
  importCoordinates: 'importCoordinatesBtn',
  toggleCoordinates: 'coordinatesToggle',
  sizeDecrease: 'sizeDecreaseBtn',
  sizeIncrease: 'sizeIncreaseBtn',
  help: 'helpBtn',
  admin: 'adminBtn',
  projects: 'projectsBtn',
  home: 'homeBtn',
};
