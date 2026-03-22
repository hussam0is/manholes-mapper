import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bus, EventBus } from '../../src/state/event-bus.js';
import { appStore } from '../../src/state/app-store.js';

describe('appStore', () => {
  beforeEach(() => {
    bus.clear();
    // Reset appStore singletons
    appStore.gnss = null;
    appStore.gnssConnection = null;
    appStore.menu = null;
    appStore.auth = null;
    appStore.sync = null;
  });

  describe('registerGnss', () => {
    it('stores gnss reference and bridges events to bus', () => {
      const positionCb = vi.fn();
      bus.on('gnss:position', positionCb);

      const fakeGnss = {
        connectionState: 'connected',
        _listeners: {} as Record<string, Function>,
        on(event: string, cb: Function) { this._listeners[event] = cb; },
        getPosition() { return { lat: 32, lon: 35 }; },
      };

      appStore.registerGnss(fakeGnss);
      expect(appStore.gnss).toBe(fakeGnss);

      // Simulate gnss emitting a position
      fakeGnss._listeners['position']({ lat: 32, lon: 35 });
      expect(positionCb).toHaveBeenCalledWith({ lat: 32, lon: 35 });
    });

    it('bridges connection events to bus', () => {
      const connCb = vi.fn();
      bus.on('gnss:connection', connCb);

      const fakeGnss = {
        connectionState: 'disconnected',
        _listeners: {} as Record<string, Function>,
        on(event: string, cb: Function) { this._listeners[event] = cb; },
        getPosition() { return null; },
      };

      appStore.registerGnss(fakeGnss);
      fakeGnss._listeners['connection']('connected');
      expect(connCb).toHaveBeenCalledWith('connected');
    });
  });

  describe('registerMenu', () => {
    it('bridges known menu events to bus', () => {
      const sketchCb = vi.fn();
      bus.on('sketch:changed', sketchCb);

      const fakeMenu = {
        _listeners: new Map() as Map<string, Set<Function>>,
        on(event: string, cb: Function) {
          if (!this._listeners.has(event)) this._listeners.set(event, new Set());
          this._listeners.get(event)!.add(cb);
          return () => this._listeners.get(event)?.delete(cb);
        },
        emit(event: string, data?: any) {
          this._listeners.get(event)?.forEach(cb => cb(data));
        },
      };

      appStore.registerMenu(fakeMenu);

      // Emit via the original menu emitter
      fakeMenu._listeners.get('sketch:changed')?.forEach(cb => cb({ id: '1' }));
      expect(sketchCb).toHaveBeenCalledWith({ id: '1' });
    });

    it('forwards non-bridged events with menu: prefix', () => {
      const customCb = vi.fn();
      bus.on('menu:customAction', customCb);

      const fakeMenu = {
        _listeners: new Map() as Map<string, Set<Function>>,
        on(event: string, cb: Function) {
          if (!this._listeners.has(event)) this._listeners.set(event, new Set());
          this._listeners.get(event)!.add(cb);
          return () => this._listeners.get(event)?.delete(cb);
        },
        emit(event: string, data?: any) {
          this._listeners.get(event)?.forEach(cb => cb(data));
        },
      };

      appStore.registerMenu(fakeMenu);
      fakeMenu.emit('customAction', { x: 1 });
      expect(customCb).toHaveBeenCalledWith({ x: 1 });
    });
  });

  describe('registerAuth', () => {
    it('bridges auth state changes to bus', () => {
      const authCb = vi.fn();
      bus.on('auth:stateChanged', authCb);

      let authListener: Function | null = null;
      const fakeAuth = {
        getAuthState: () => ({ isSignedIn: true, userId: '123' }),
        isAuthenticated: () => true,
        onAuthStateChange: (cb: Function) => { authListener = cb; return () => { authListener = null; }; },
      };

      appStore.registerAuth(fakeAuth);
      expect(appStore.auth).toBe(fakeAuth);

      // Simulate auth state change
      authListener!({ isSignedIn: true, userId: '123' });
      expect(authCb).toHaveBeenCalledWith({ isSignedIn: true, userId: '123' });
    });
  });

  describe('registerSync', () => {
    it('bridges sync state changes to bus', () => {
      const syncCb = vi.fn();
      bus.on('sync:stateChange', syncCb);

      let syncListener: Function | null = null;
      const fakeSync = {
        onSyncStateChange: (cb: Function) => { syncListener = cb; return () => { syncListener = null; }; },
        debouncedSyncToCloud: vi.fn(),
      };

      appStore.registerSync(fakeSync);
      expect(appStore.sync).toBe(fakeSync);

      syncListener!({ syncing: true });
      expect(syncCb).toHaveBeenCalledWith({ syncing: true });
    });
  });

  describe('convenience accessors', () => {
    it('isGnssConnected returns true when connected', () => {
      appStore.gnss = { connectionState: 'connected' };
      expect(appStore.isGnssConnected()).toBe(true);
    });

    it('isGnssConnected returns false when not registered', () => {
      expect(appStore.isGnssConnected()).toBe(false);
    });

    it('getGnssPosition delegates to gnss.getPosition()', () => {
      appStore.gnss = { getPosition: () => ({ lat: 32, lon: 35 }) };
      expect(appStore.getGnssPosition()).toEqual({ lat: 32, lon: 35 });
    });

    it('getGnssPosition returns null when not registered', () => {
      expect(appStore.getGnssPosition()).toBeNull();
    });

    it('isAuthenticated delegates to auth', () => {
      appStore.auth = { isAuthenticated: () => true };
      expect(appStore.isAuthenticated()).toBe(true);
    });

    it('isAuthenticated returns false when not registered', () => {
      expect(appStore.isAuthenticated()).toBe(false);
    });

    it('getAuthState delegates to auth', () => {
      const state = { isSignedIn: true, userId: '1' };
      appStore.auth = { getAuthState: () => state };
      expect(appStore.getAuthState()).toEqual(state);
    });

    it('getAuthState returns null when not registered', () => {
      expect(appStore.getAuthState()).toBeNull();
    });
  });
});
