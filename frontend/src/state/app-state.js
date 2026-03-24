/**
 * app-state.js — Centralized reactive state for the app.
 *
 * Single source of truth for key application state. Changes emit events
 * through the event bus so any module can react without tight coupling.
 *
 * Usage:
 *   import { appState } from '../state/app-state.js';
 *
 *   // Read
 *   const user = appState.get('currentUser');
 *
 *   // Write (auto-emits 'state:currentUser' on the bus)
 *   appState.set('currentUser', { id: 1, name: 'Hussam' });
 *
 *   // Subscribe to a specific key
 *   const unsub = appState.subscribe('currentSketch', (newVal, oldVal) => { ... });
 *   unsub(); // cleanup
 *
 *   // Batch updates (single 'state:batch' event instead of N individual events)
 *   appState.batch({ currentProject: proj, uiMode: 'edit' });
 */

import { bus } from './event-bus.js';

// ── State keys (type-safe constants) ───────────────────────

export const STATE_KEYS = Object.freeze({
  CURRENT_SKETCH: 'currentSketch',
  CURRENT_USER: 'currentUser',
  CURRENT_PROJECT: 'currentProject',
  UI_MODE: 'uiMode',
  GNSS_CONNECTED: 'gnssConnected',
  GNSS_POSITION: 'gnssPosition',
  SYNC_STATE: 'syncState',
  AUTH_STATE: 'authState',
  SKILL_LEVEL: 'skillLevel',
});

// ── Internal store ─────────────────────────────────────────

/** @type {Map<string, any>} */
const _store = new Map();

/** @type {Map<string, Set<Function>>} */
const _subscribers = new Map();

// ── Public API ─────────────────────────────────────────────

const appState = {
  /**
   * Get the current value for a state key.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return _store.get(key);
  },

  /**
   * Set a state value. Emits `state:<key>` on the bus and notifies subscribers.
   * No-op if the value is strictly equal to the current one.
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    const old = _store.get(key);
    if (old === value) return;

    _store.set(key, value);

    // Notify direct subscribers
    const subs = _subscribers.get(key);
    if (subs) {
      for (const cb of subs) {
        try { cb(value, old); } catch (err) {
          console.error(`[AppState] Error in subscriber for "${key}":`, err);
        }
      }
    }

    // Emit on the global bus
    bus.emit(`state:${key}`, { key, value, oldValue: old });
  },

  /**
   * Subscribe to changes on a specific key.
   * @param {string} key
   * @param {(newVal: any, oldVal: any) => void} handler
   * @returns {Function} unsubscribe
   */
  subscribe(key, handler) {
    if (!_subscribers.has(key)) {
      _subscribers.set(key, new Set());
    }
    _subscribers.get(key).add(handler);
    return () => _subscribers.get(key)?.delete(handler);
  },

  /**
   * Batch-update multiple keys at once. Emits individual `state:<key>` events
   * for each changed key, plus a single `state:batch` summary event.
   * @param {Record<string, any>} updates — { key: value, ... }
   */
  batch(updates) {
    const changes = [];

    for (const [key, value] of Object.entries(updates)) {
      const old = _store.get(key);
      if (old === value) continue;

      _store.set(key, value);
      changes.push({ key, value, oldValue: old });

      // Notify direct subscribers
      const subs = _subscribers.get(key);
      if (subs) {
        for (const cb of subs) {
          try { cb(value, old); } catch (err) {
            console.error(`[AppState] Error in subscriber for "${key}":`, err);
          }
        }
      }
    }

    // Emit individual events
    for (const ch of changes) {
      bus.emit(`state:${ch.key}`, ch);
    }

    // Emit batch summary
    if (changes.length > 0) {
      bus.emit('state:batch', { changes });
    }
  },

  /**
   * Get a snapshot of all state as a plain object.
   * @returns {Record<string, any>}
   */
  snapshot() {
    return Object.fromEntries(_store);
  },

  /**
   * Reset all state. Useful for tests or sign-out.
   */
  clear() {
    const keys = [..._store.keys()];
    _store.clear();
    _subscribers.clear();
    bus.emit('state:cleared', { keys });
  },
};

// Expose for debugging
if (typeof window !== 'undefined') {
  window.__appState = appState;
}

export { appState };
