/**
 * app-store.js — Centralized reactive application store
 *
 * Replaces the legacy S (shared-state proxy) pattern with a proper store
 * that supports subscriptions to state changes.
 *
 * Design goals:
 *   1. Drop-in compatible with existing S.foo reads/writes
 *   2. Adds change subscriptions: store.subscribe('nodes', cb)
 *   3. Batch updates to coalesce multiple writes into one notification
 *   4. Immutable snapshots via store.snapshot()
 *   5. Typed JSDoc for IDE completion
 *
 * Migration path:
 *   Phase 1 (this): AppStore exists alongside S/F.  New code uses store.
 *   Phase 2: S getters/setters delegate to AppStore internally.
 *   Phase 3: Remove S proxy, all modules use store directly.
 *
 * Usage:
 *   import { store } from '../state/app-store.js';
 *
 *   // Read
 *   const nodes = store.get('nodes');
 *
 *   // Write (fires subscribers)
 *   store.set('nodes', newNodes);
 *
 *   // Subscribe to changes
 *   const off = store.subscribe('nodes', (newVal, oldVal) => { ... });
 *   off(); // unsubscribe
 *
 *   // Batch multiple writes — subscribers fire once at end
 *   store.batch(() => {
 *     store.set('nodes', n);
 *     store.set('edges', e);
 *   });
 */

import { bus } from './event-bus.js';

/** @typedef {(newValue: any, oldValue: any) => void} StoreSubscriber */

class AppStore {
  constructor() {
    /** @type {Map<string, any>} */
    this._state = new Map();

    /** @type {Map<string, Set<StoreSubscriber>>} */
    this._subscribers = new Map();

    /** @type {boolean} */
    this._batching = false;

    /** @type {Map<string, { newVal: any, oldVal: any }>} */
    this._pendingChanges = new Map();
  }

  /**
   * Get a value from the store.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this._state.get(key);
  }

  /**
   * Set a value in the store.  Notifies subscribers unless batching.
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    const oldVal = this._state.get(key);
    if (oldVal === value) return; // no-op for identical refs
    this._state.set(key, value);

    if (this._batching) {
      // During a batch, only record the first old value for each key
      if (!this._pendingChanges.has(key)) {
        this._pendingChanges.set(key, { newVal: value, oldVal });
      } else {
        this._pendingChanges.get(key).newVal = value;
      }
    } else {
      this._notify(key, value, oldVal);
    }
  }

  /**
   * Check if a key exists in the store.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._state.has(key);
  }

  /**
   * Bulk-initialize state (typically at app startup).
   * Does NOT fire subscribers — use for initial hydration only.
   * @param {Record<string, any>} entries
   */
  init(entries) {
    for (const [k, v] of Object.entries(entries)) {
      this._state.set(k, v);
    }
  }

  /**
   * Subscribe to changes on a specific key.
   * Returns an unsubscribe function.
   * @param {string} key
   * @param {StoreSubscriber} handler
   * @returns {() => void}
   */
  subscribe(key, handler) {
    if (!this._subscribers.has(key)) {
      this._subscribers.set(key, new Set());
    }
    this._subscribers.get(key).add(handler);
    return () => {
      const set = this._subscribers.get(key);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this._subscribers.delete(key);
      }
    };
  }

  /**
   * Batch multiple writes — subscribers fire once when the batch completes.
   * @param {() => void} fn
   */
  batch(fn) {
    if (this._batching) {
      // Already in a batch, just run
      fn();
      return;
    }
    this._batching = true;
    this._pendingChanges.clear();
    try {
      fn();
    } finally {
      this._batching = false;
      // Fire notifications for all changed keys
      for (const [key, { newVal, oldVal }] of this._pendingChanges) {
        this._notify(key, newVal, oldVal);
      }
      this._pendingChanges.clear();
    }
  }

  /**
   * Return a plain-object snapshot of the current state.
   * @returns {Record<string, any>}
   */
  snapshot() {
    return Object.fromEntries(this._state);
  }

  /**
   * Return all keys currently in the store.
   * @returns {string[]}
   */
  keys() {
    return [...this._state.keys()];
  }

  /** @private */
  _notify(key, newVal, oldVal) {
    // Notify key-specific subscribers
    const subs = this._subscribers.get(key);
    if (subs) {
      for (const fn of subs) {
        try { fn(newVal, oldVal); } catch (e) { console.error(`[AppStore] subscriber error on "${key}":`, e); }
      }
    }
    // Also emit on the event bus for cross-cutting concerns
    bus.emit(`store:${key}`, { key, value: newVal, prev: oldVal });
  }

  /**
   * Remove all state and subscribers (useful for testing / teardown).
   */
  clear() {
    this._state.clear();
    this._subscribers.clear();
    this._pendingChanges.clear();
    this._batching = false;
  }

  /**
   * Debug helper: list all keys with their current value types.
   * @returns {Record<string, string>}
   */
  debug() {
    const out = {};
    for (const [k, v] of this._state) {
      out[k] = v === null ? 'null' : Array.isArray(v) ? `array(${v.length})` : typeof v;
    }
    return out;
  }
}

/** Singleton app store for the application */
export const store = new AppStore();

// Expose for debugging in DevTools
if (typeof window !== 'undefined') {
  window.__store = store;
}

export { AppStore };
