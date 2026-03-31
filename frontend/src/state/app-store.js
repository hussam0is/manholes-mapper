/**
 * app-store.js — Centralized app state registry + coordination layer.
 *
 * Exports:
 *  - AppStore  — reactive key/value store class (get/set/subscribe/batch/etc.)
 *  - store     — singleton AppStore instance used across the app
 *  - appStore  — coordination layer that holds subsystem singletons (GNSS, auth, etc.)
 *
 * AppStore API:
 *   store.get(key)              → current value
 *   store.set(key, value)       → write + notify subscribers + emit store:<key> on bus
 *   store.has(key)              → boolean
 *   store.init(obj)             → bulk seed without firing subscribers
 *   store.subscribe(key, fn)    → returns unsub function; fn(newVal, oldVal)
 *   store.batch(fn)             → run fn(), coalesce notifications (one per key)
 *   store.snapshot()            → plain object copy of all state
 *   store.keys()                → array of current keys
 *   store.clear()               → wipe all state + subscribers
 *   store.debug()               → { key: 'type' } map for introspection
 */

import { bus } from './event-bus.js';
import { appState } from './app-state.js';

// ── AppStore class ─────────────────────────────────────────────────────────────

export class AppStore {
  constructor() {
    /** @type {Map<string, any>} */
    this._data = new Map();
    /** @type {Map<string, Set<Function>>} */
    this._subs = new Map();
    /** @type {number} — batch nesting depth */
    this._batchDepth = 0;
    /**
     * Pending flush entries: Map<key, { oldVal, newVal }>
     * We track the *first* oldVal and the *last* newVal seen in a batch.
     * @type {Map<string, { oldVal: any, newVal: any }>}
     */
    this._pending = new Map();
  }

  /**
   * Get the current value for a key.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this._data.get(key);
  }

  /**
   * Set a key and notify subscribers (respects batch mode).
   * No-op when the new value is strictly identical to the current value.
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    const old = this._data.get(key);
    if (old === value) return;

    this._data.set(key, value);

    if (this._batchDepth > 0) {
      // Track first old / latest new
      if (this._pending.has(key)) {
        this._pending.get(key).newVal = value;
      } else {
        this._pending.set(key, { oldVal: old, newVal: value });
      }
    } else {
      this._notify(key, value, old);
    }
  }

  /**
   * Check if a key exists in the store.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._data.has(key);
  }

  /**
   * Bulk-initialize state without firing any subscribers.
   * Useful for seeding initial state on startup.
   * @param {Record<string, any>} obj
   */
  init(obj) {
    for (const [key, value] of Object.entries(obj)) {
      this._data.set(key, value);
    }
  }

  /**
   * Subscribe to changes on a specific key.
   * @param {string} key
   * @param {(newVal: any, oldVal: any) => void} handler
   * @returns {Function} unsubscribe function
   */
  subscribe(key, handler) {
    if (!this._subs.has(key)) {
      this._subs.set(key, new Set());
    }
    this._subs.get(key).add(handler);
    return () => this._subs.get(key)?.delete(handler);
  }

  /**
   * Run fn() in batch mode: coalesces subscriber notifications so each key
   * fires at most once, with the first old value and the final new value.
   * Flushes even if fn throws.
   * Nested batches are absorbed into the outermost batch.
   * @param {Function} fn
   */
  batch(fn) {
    this._batchDepth++;
    try {
      fn();
    } finally {
      this._batchDepth--;
      if (this._batchDepth === 0) {
        this._flush();
      }
    }
  }

  /**
   * Return a plain object snapshot of the current state.
   * Mutations to the snapshot do NOT affect the store.
   * @returns {Record<string, any>}
   */
  snapshot() {
    return Object.fromEntries(this._data);
  }

  /**
   * Return an array of all current keys.
   * @returns {string[]}
   */
  keys() {
    return Array.from(this._data.keys());
  }

  /**
   * Remove all state and all subscribers.
   */
  clear() {
    this._data.clear();
    this._subs.clear();
    this._pending.clear();
    this._batchDepth = 0;
  }

  /**
   * Return a type-descriptor map for debugging.
   * Arrays are 'array(N)', null is 'null', everything else is typeof.
   * @returns {Record<string, string>}
   */
  debug() {
    const info = {};
    for (const [key, val] of this._data) {
      if (val === null) {
        info[key] = 'null';
      } else if (Array.isArray(val)) {
        info[key] = `array(${val.length})`;
      } else {
        info[key] = typeof val;
      }
    }
    return info;
  }

  // ── Internal helpers ─────────────────────────────────────

  /**
   * Notify subscribers and emit bus event for a single key.
   * Errors in individual subscribers are caught and logged so others still run.
   * @param {string} key
   * @param {any} newVal
   * @param {any} oldVal
   */
  _notify(key, newVal, oldVal) {
    const subs = this._subs.get(key);
    if (subs) {
      for (const cb of subs) {
        try { cb(newVal, oldVal); } catch (err) {
          console.error(`[AppStore] Error in subscriber for "${key}":`, err);
        }
      }
    }
    // Emit on the global bus so other modules can react
    bus.emit(`store:${key}`, { key, value: newVal, prev: oldVal });
  }

  /**
   * Flush all pending batch notifications.
   */
  _flush() {
    for (const [key, { oldVal, newVal }] of this._pending) {
      this._notify(key, newVal, oldVal);
    }
    this._pending.clear();
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

/** Singleton AppStore instance used across the app. */
export const store = new AppStore();

// ── Coordination layer (appStore) ──────────────────────────────────────────────

/**
 * appStore — holds references to all subsystem singletons and bridges their
 * native events onto the unified event bus.
 *
 * @typedef {Object} AppRegistry
 * @property {import('./event-bus.js').EventBus} bus — the global event bus
 * @property {Object|null} gnss — gnssState singleton
 * @property {Object|null} gnssConnection — gnssConnection singleton
 * @property {Object|null} menu — menuEvents singleton
 * @property {Object|null} auth — auth-guard functions
 * @property {Object|null} sync — sync-service functions
 */

/** @type {AppRegistry} */
const appStore = {
  bus,
  state: appState,
  gnss: null,
  gnssConnection: null,
  menu: null,
  auth: null,
  sync: null,

  // ── Registration methods ─────────────────────────────────

  registerGnss(gnssState) {
    this.gnss = gnssState;
    gnssState.on('position', (pos) => {
      bus.emit('gnss:position', pos);
      appState.set('gnssPosition', pos);
    });
    gnssState.on('connection', (state) => {
      bus.emit('gnss:connection', state);
      appState.set('gnssConnected', state === 'connected');
    });
    gnssState.on('capture', (point) => bus.emit('gnss:capture', point));
  },

  registerGnssConnection(conn) {
    this.gnssConnection = conn;
  },

  registerMenu(menuEvt) {
    this.menu = menuEvt;

    const bridgedEvents = [
      'sketch:changed', 'sketch:complete', 'sync:stateChange',
      'tsc3:connected', 'tsc3:disconnected', 'mode:changed',
      'heatmap:toggle', 'mySketches', 'node:added',
      'issues:allResolved', 'translations:updated',
    ];

    for (const evt of bridgedEvents) {
      menuEvt.on(evt, (data) => bus.emit(evt, data));
    }

    const origEmit = menuEvt.emit.bind(menuEvt);
    menuEvt.emit = function (event, data) {
      origEmit(event, data);
      if (!bridgedEvents.includes(event)) {
        bus.emit(`menu:${event}`, data);
      }
    };
  },

  registerAuth(authFns) {
    this.auth = authFns;
    if (authFns.onAuthStateChange) {
      authFns.onAuthStateChange((state) => {
        bus.emit('auth:stateChanged', state);
        appState.set('authState', state);
        appState.set('currentUser', state?.user ?? null);
      });
    }
  },

  registerSync(syncFns) {
    this.sync = syncFns;
    if (syncFns.onSyncStateChange) {
      syncFns.onSyncStateChange((state) => {
        bus.emit('sync:stateChange', state);
        appState.set('syncState', state);
      });
    }
  },

  // ── Convenience accessors ────────────────────────────────

  isGnssConnected() {
    return this.gnss?.connectionState === 'connected';
  },

  getGnssPosition() {
    return this.gnss?.getPosition?.() ?? null;
  },

  isAuthenticated() {
    return this.auth?.isAuthenticated?.() ?? false;
  },

  getAuthState() {
    return this.auth?.getAuthState?.() ?? null;
  },
};

// Expose for debugging
if (typeof window !== 'undefined') {
  window.__appStore = appStore;
}

export { appStore };
