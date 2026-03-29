/**
 * app-store.js — Centralized app state registry + coordination layer.
 *
 * Problem: 5+ singletons (gnssState, menuEvents, authGuard, syncService,
 * projectSketches) all publish/subscribe independently via window.* globals
 * with no coordination. Modules do defensive `if (window.menuEvents)` checks.
 *
 * Solution: A thin registry that:
 *  1. Holds references to all subsystem singletons
 *  2. Bridges their native events onto the unified event bus
 *  3. Provides typed accessors so modules import from here instead of window.*
 *  4. Supports late registration (singletons can register as they init)
 *
 * Migration path (non-breaking):
 *  - window.* globals are still set for backward compat
 *  - New code imports { appStore } and uses typed methods
 *  - Old code continues to work via window.* until gradually migrated
 *
 * Usage:
 *   import { appStore } from '../state/app-store.js';
 *   appStore.gnss.getPosition();
 *   appStore.auth.isAuthenticated();
 *   appStore.bus.on('sketch:changed', ...);
 */

import { bus } from './event-bus.js';
import { appState } from './app-state.js';

/**
 * @typedef {Object} AppStore
 * @property {import('./event-bus.js').EventBus} bus — the global event bus
 * @property {Object|null} gnss — gnssState singleton
 * @property {Object|null} gnssConnection — gnssConnection singleton
 * @property {Object|null} menu — menuEvents singleton
 * @property {Object|null} auth — auth-guard functions
 * @property {Object|null} sync — sync-service functions
 * @property {(gnssState: Object) => void} registerGnss — register GNSS state manager
 * @property {(conn: Object) => void} registerGnssConnection — register GNSS connection manager
 * @property {(menuEvt: Object) => void} registerMenu — register menu events
 * @property {(authFns: Object) => void} registerAuth — register auth functions
 * @property {(syncFns: Object) => void} registerSync — register sync service
 * @property {() => boolean} isGnssConnected — whether GNSS is connected
 * @property {() => {lat: number, lon: number}|null} getGnssPosition — get GNSS position
 * @property {() => boolean} isAuthenticated — whether user is authenticated
 * @property {() => Object|null} getAuthState — get auth state
 */

/** @type {AppStore} */
const appStore = {
  bus,
  state: appState,
  gnss: null,
  gnssConnection: null,
  menu: null,
  auth: null,
  sync: null,

  // ── Registration methods ─────────────────────────────────

  /**
   * Register the GNSS state manager and bridge its events to the bus.
   * @param {Object} gnssState — GNSSStateManager instance
   */
  registerGnss(gnssState) {
    this.gnss = gnssState;

    // Bridge native gnssState events → bus + appState
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

  /**
   * Register the GNSS connection manager.
   * @param {Object} conn — GNSSConnectionManager instance
   */
  registerGnssConnection(conn) {
    this.gnssConnection = conn;
  },

  /**
   * Register menuEvents and bridge its events to the bus.
   * @param {Object} menuEvt — MenuEventEmitter instance
   */
  registerMenu(menuEvt) {
    this.menu = menuEvt;

    // Bridge known menu events → bus
    const bridgedEvents = [
      'sketch:changed', 'sketch:complete', 'sync:stateChange',
      'tsc3:connected', 'tsc3:disconnected', 'mode:changed',
      'heatmap:toggle', 'mySketches', 'node:added',
      'issues:allResolved', 'translations:updated',
    ];

    for (const evt of bridgedEvents) {
      menuEvt.on(evt, (data) => bus.emit(evt, data));
    }

    // Also forward any non-bridged menu events → bus via a catch-all wrapper
    const origEmit = menuEvt.emit.bind(menuEvt);
    menuEvt.emit = function (event, data) {
      origEmit(event, data);
      // Only forward to bus if not already bridged (avoid double-fire)
      if (!bridgedEvents.includes(event)) {
        bus.emit(`menu:${event}`, data);
      }
    };
  },

  /**
   * Register auth-guard functions.
   * @param {Object} authFns — { getAuthState, onAuthStateChange, isAuthenticated, ... }
   */
  registerAuth(authFns) {
    this.auth = authFns;

    // Bridge auth state changes → bus + appState
    if (authFns.onAuthStateChange) {
      authFns.onAuthStateChange((state) => {
        bus.emit('auth:stateChanged', state);
        appState.set('authState', state);
        appState.set('currentUser', state?.user ?? null);
      });
    }
  },

  /**
   * Register sync-service functions.
   * @param {Object} syncFns — { debouncedSyncToCloud, onSyncStateChange, ... }
   */
  registerSync(syncFns) {
    this.sync = syncFns;

    // Bridge sync state changes → bus + appState
    if (syncFns.onSyncStateChange) {
      syncFns.onSyncStateChange((state) => {
        bus.emit('sync:stateChange', state);
        appState.set('syncState', state);
      });
    }
  },

  // ── Convenience accessors ────────────────────────────────

  /** @returns {boolean} whether GNSS is connected */
  isGnssConnected() {
    return this.gnss?.connectionState === 'connected';
  },

  /** @returns {{ lat: number, lon: number } | null} */
  getGnssPosition() {
    return this.gnss?.getPosition?.() ?? null;
  },

  /** @returns {boolean} */
  isAuthenticated() {
    return this.auth?.isAuthenticated?.() ?? false;
  },

  /** @returns {Object|null} */
  getAuthState() {
    return this.auth?.getAuthState?.() ?? null;
  },
};

// Expose for debugging
if (typeof window !== 'undefined') {
  window.__appStore = appStore;
}

export { appStore };

// ── AppStore class — reactive key/value store with bus integration ──

/**
 * Class-based reactive state store with subscriber notifications and
 * event bus integration. Each `set()` emits a `store:<key>` event on the bus.
 */
class AppStore {
  constructor() {
    /** @type {Map<string, any>} */
    this._state = new Map();
    /** @type {Map<string, Set<Function>>} */
    this._subs = new Map();
    /** @type {boolean} */
    this._batching = false;
    /** @type {Map<string, { newVal: any, oldVal: any }>} */
    this._pending = new Map();
  }

  /**
   * Get the current value for a key.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this._state.get(key);
  }

  /**
   * Set a value. Notifies subscribers and emits `store:<key>` on the bus.
   * No-op if the value is the same reference.
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    const old = this._state.get(key);
    if (old === value) return;
    this._state.set(key, value);

    if (this._batching) {
      // During batch, coalesce: keep first old value, update new value
      if (!this._pending.has(key)) {
        this._pending.set(key, { newVal: value, oldVal: old });
      } else {
        this._pending.get(key).newVal = value;
      }
      return;
    }

    this._notify(key, value, old);
  }

  /**
   * Check whether a key exists in the store.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._state.has(key);
  }

  /**
   * Bulk-initialize state without firing subscribers.
   * @param {Record<string, any>} entries
   */
  init(entries) {
    for (const [key, value] of Object.entries(entries)) {
      this._state.set(key, value);
    }
  }

  /**
   * Subscribe to changes on a specific key.
   * @param {string} key
   * @param {(newVal: any, oldVal: any) => void} handler
   * @returns {Function} unsubscribe
   */
  subscribe(key, handler) {
    if (!this._subs.has(key)) {
      this._subs.set(key, new Set());
    }
    this._subs.get(key).add(handler);
    return () => this._subs.get(key)?.delete(handler);
  }

  /**
   * Batch multiple set() calls; subscribers fire once per key after fn completes.
   * @param {Function} fn
   */
  batch(fn) {
    if (this._batching) {
      // Nested batch — just run inline, outer batch will flush
      fn();
      return;
    }
    this._batching = true;
    this._pending = new Map();
    try {
      fn();
    } finally {
      this._batching = false;
      const pending = this._pending;
      this._pending = new Map();
      for (const [key, { newVal, oldVal }] of pending) {
        this._notify(key, newVal, oldVal);
      }
    }
  }

  /**
   * Get a snapshot of all state as a plain object.
   * @returns {Record<string, any>}
   */
  snapshot() {
    return Object.fromEntries(this._state);
  }

  /**
   * Return all key names.
   * @returns {string[]}
   */
  keys() {
    return [...this._state.keys()];
  }

  /**
   * Remove all state and subscribers.
   */
  clear() {
    this._state.clear();
    this._subs.clear();
  }

  /**
   * Return type info for each key (for debugging).
   * @returns {Record<string, string>}
   */
  debug() {
    const result = {};
    for (const [key, value] of this._state) {
      if (value === null) {
        result[key] = 'null';
      } else if (Array.isArray(value)) {
        result[key] = `array(${value.length})`;
      } else {
        result[key] = typeof value;
      }
    }
    return result;
  }

  /**
   * Internal: notify subscribers and emit on bus.
   * @param {string} key
   * @param {any} newVal
   * @param {any} oldVal
   */
  _notify(key, newVal, oldVal) {
    const subs = this._subs.get(key);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(newVal, oldVal);
        } catch (err) {
          console.error(`[AppStore] Error in subscriber for "${key}":`, err);
        }
      }
    }
    bus.emit(`store:${key}`, { key, value: newVal, prev: oldVal });
  }
}

/** Singleton store instance */
const store = new AppStore();

export { AppStore, store };
