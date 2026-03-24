/**
 * app-store.js — Centralized app state registry + coordination layer.
 *
 * Provides:
 *   - AppStore class: key/value store with subscribe, batch, bus integration
 *   - store: singleton instance
 *   - appStore: legacy facade (registers subsystem singletons, convenience accessors)
 */

import { bus } from './event-bus.js';
import { appState } from './app-state.js';

// ── AppStore class ─────────────────────────────────────────

class AppStore {
  constructor() {
    /** @type {Map<string, any>} */
    this._store = new Map();
    /** @type {Map<string, Set<Function>>} */
    this._subscribers = new Map();
    /** @type {number} */
    this._batchDepth = 0;
    /** @type {Map<string, { newVal: any, oldVal: any }>} batched changes */
    this._batchQueue = new Map();
  }

  /**
   * Get a value.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this._store.get(key);
  }

  /**
   * Check if a key exists.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._store.has(key);
  }

  /**
   * Bulk-initialize state without firing subscribers.
   * @param {Record<string, any>} entries
   */
  init(entries) {
    for (const [key, value] of Object.entries(entries)) {
      this._store.set(key, value);
    }
  }

  /**
   * Set a value. Notifies subscribers and emits on the bus.
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    const old = this._store.get(key);
    if (old === value) return;

    this._store.set(key, value);

    if (this._batchDepth > 0) {
      // During a batch, record the change (keep earliest oldVal)
      if (!this._batchQueue.has(key)) {
        this._batchQueue.set(key, { newVal: value, oldVal: old });
      } else {
        this._batchQueue.get(key).newVal = value;
      }
      return;
    }

    this._notify(key, value, old);
  }

  /** @private */
  _notify(key, newVal, oldVal) {
    const subs = this._subscribers.get(key);
    if (subs) {
      for (const cb of subs) {
        try { cb(newVal, oldVal); } catch (err) {
          console.error(`[AppStore] Error in subscriber for "${key}":`, err);
        }
      }
    }
    bus.emit(`store:${key}`, { key, value: newVal, prev: oldVal });
  }

  /**
   * Subscribe to changes on a specific key.
   * @param {string} key
   * @param {(newVal: any, oldVal: any) => void} handler
   * @returns {Function} unsubscribe
   */
  subscribe(key, handler) {
    if (!this._subscribers.has(key)) {
      this._subscribers.set(key, new Set());
    }
    this._subscribers.get(key).add(handler);
    return () => this._subscribers.get(key)?.delete(handler);
  }

  /**
   * Batch updates: subscriber notifications are deferred until fn completes.
   * @param {Function} fn
   */
  batch(fn) {
    this._batchDepth++;
    try {
      fn();
    } finally {
      this._batchDepth--;
      if (this._batchDepth === 0) {
        // Flush
        const queue = new Map(this._batchQueue);
        this._batchQueue.clear();
        for (const [key, { newVal, oldVal }] of queue) {
          this._notify(key, newVal, oldVal);
        }
      }
    }
  }

  /**
   * Snapshot of all state as a plain object.
   * @returns {Record<string, any>}
   */
  snapshot() {
    return Object.fromEntries(this._store);
  }

  /**
   * All key names.
   * @returns {string[]}
   */
  keys() {
    return [...this._store.keys()];
  }

  /**
   * Remove all state and subscribers.
   */
  clear() {
    this._store.clear();
    this._subscribers.clear();
  }

  /**
   * Debug: return type info for each key.
   * @returns {Record<string, string>}
   */
  debug() {
    const result = {};
    for (const [key, value] of this._store) {
      if (value === null) result[key] = 'null';
      else if (value === undefined) result[key] = 'undefined';
      else if (Array.isArray(value)) result[key] = `array(${value.length})`;
      else result[key] = typeof value;
    }
    return result;
  }
}

// ── Singleton instance ─────────────────────────────────────

const store = new AppStore();

// ── Legacy appStore facade ─────────────────────────────────

const appStore = {
  bus,
  state: appState,
  store,
  gnss: null,
  gnssConnection: null,
  menu: null,
  auth: null,
  sync: null,

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

if (typeof window !== 'undefined') {
  window.__appStore = appStore;
}

export { AppStore, store, appStore };
