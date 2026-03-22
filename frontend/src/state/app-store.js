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
