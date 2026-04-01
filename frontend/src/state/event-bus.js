/**
 * event-bus.js — Lightweight, typed event bus for cross-module coordination.
 *
 * Replaces scattered window.menuEvents / window.__gnssState / window.authGuard
 * listeners with a single, testable pub/sub channel.
 *
 * Usage:
 *   import { bus } from '../state/event-bus.js';
 *   const unsub = bus.on('auth:stateChanged', (state) => { ... });
 *   bus.emit('auth:stateChanged', { isSignedIn: true });
 *   unsub(); // cleanup
 *
 * Namespaced event convention:
 *   auth:*     — authentication state changes
 *   sync:*     — cloud sync lifecycle
 *   gnss:*     — GNSS position / connection
 *   sketch:*   — sketch data mutations
 *   ui:*       — UI mode changes, navigation
 *   tsc3:*     — TSC3 device events
 */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
    /** @type {Map<string, Set<Function>>} */
    this._onceListeners = new Map();
    /** @type {Set<Function>} */
    this._wildcardListeners = new Set();
    /** @type {Map<string, Set<Function>>} */
    this._nsListeners = new Map();

    if (typeof window !== 'undefined') {
      /** Debug: set window.__busDebug = true to log all events */
      this._debug = false;
    }
  }

  /**
   * Subscribe to an event.
   * @param {string} event — namespaced event name (use '*' for all events)
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  on(event, callback) {
    // Wildcard: subscribe to all events
    if (event === '*') {
      this._wildcardListeners.add(callback);
      return () => this._wildcardListeners.delete(callback);
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event once (auto-removes after first call).
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  once(event, callback) {
    if (!this._onceListeners.has(event)) {
      this._onceListeners.set(event, new Set());
    }
    this._onceListeners.get(event).add(callback);
    return () => {
      this._onceListeners.get(event)?.delete(callback);
    };
  }

  /**
   * Unsubscribe a specific callback from an event.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (event === '*') {
      this._wildcardListeners.delete(callback);
      return;
    }
    this._listeners.get(event)?.delete(callback);
    this._onceListeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event with optional data.
   * @param {string} event
   * @param {*} [data]
   */
  emit(event, data) {
    if (this._debug || (typeof window !== 'undefined' && window.__busDebug)) {
      console.debug(`[EventBus] ${event}`, data);
    }

    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const cb of listeners) {
        try { cb(data); } catch (err) {
          console.error(`[EventBus] Error in listener for "${event}":`, err);
        }
      }
    }

    const onceListeners = this._onceListeners.get(event);
    if (onceListeners) {
      for (const cb of onceListeners) {
        try { cb(data); } catch (err) {
          console.error(`[EventBus] Error in once-listener for "${event}":`, err);
        }
      }
      this._onceListeners.delete(event);
    }

    // Fire wildcard ('*') listeners with (event, data) signature
    if (event !== '*') {
      if (this._wildcardListeners) {
        for (const cb of this._wildcardListeners) {
          try { cb(event, data); } catch (err) {
            console.error(`[EventBus] Error in wildcard listener for "${event}":`, err);
          }
        }
      }
    }

    // Fire namespace listeners
    this._emitNs(event, data);
  }

  /**
   * Subscribe to all events matching a namespace prefix (e.g. 'gnss:').
   * @param {string} prefix — must end with ':'
   * @param {Function} callback — receives (event, data)
   * @returns {Function} unsubscribe function
   */
  onAny(prefix, callback) {
    if (!this._nsListeners.has(prefix)) {
      this._nsListeners.set(prefix, new Set());
    }
    this._nsListeners.get(prefix).add(callback);
    return () => this._nsListeners.get(prefix)?.delete(callback);
  }

  /**
   * Internal override of emit to also fire namespace listeners.
   */
  _emitNs(event, data) {
    if (!this._nsListeners) return;
    for (const [prefix, cbs] of this._nsListeners) {
      if (event.startsWith(prefix)) {
        for (const cb of cbs) {
          try { cb(event, data); } catch (err) {
            console.error(`[EventBus] Error in namespace listener for "${prefix}" on "${event}":`, err);
          }
        }
      }
    }
  }

  /**
   * Remove all listeners. Useful for tests or teardown.
   */
  clear() {
    this._listeners.clear();
    this._onceListeners.clear();
    this._nsListeners.clear();
    this._wildcardListeners.clear();
  }

  /**
   * Return listener counts per event for debugging.
   * @returns {Record<string, number>}
   */
  debug() {
    const result = {};
    for (const [event, listeners] of this._listeners) {
      if (listeners.size > 0) {
        result[event] = listeners.size;
      }
    }
    if (this._wildcardListeners.size > 0) {
      result['*'] = this._wildcardListeners.size;
    }
    return result;
  }
}

/** Singleton event bus for the entire app. */
export const bus = new EventBus();

// Expose for debugging in console
if (typeof window !== 'undefined') {
  window.__bus = bus;
}

// Export class for testing
export { EventBus };
