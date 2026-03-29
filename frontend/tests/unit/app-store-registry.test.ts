/**
 * Unit tests for appStore registry object
 *
 * Tests the registration methods, event bridging, and convenience accessors
 * of the appStore singleton (not the AppStore class, which is tested separately).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

async function freshModule() {
  vi.resetModules();
  const appStoreMod = await import('../../src/state/app-store.js');
  const busMod = await import('../../src/state/event-bus.js');
  const appStateMod = await import('../../src/state/app-state.js');
  return { appStore: appStoreMod.appStore, bus: busMod.bus, appState: appStateMod.appState };
}

describe('appStore Registry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should have null subsystems initially', async () => {
      const { appStore } = await freshModule();
      expect(appStore.gnss).toBeNull();
      expect(appStore.gnssConnection).toBeNull();
      expect(appStore.menu).toBeNull();
      expect(appStore.auth).toBeNull();
      expect(appStore.sync).toBeNull();
    });

    it('should have bus and state references', async () => {
      const { appStore, bus, appState } = await freshModule();
      expect(appStore.bus).toBe(bus);
      expect(appStore.state).toBe(appState);
    });
  });

  describe('registerGnss', () => {
    it('should store gnss reference', async () => {
      const { appStore } = await freshModule();
      const mockGnss = { on: vi.fn(), getPosition: vi.fn() };
      appStore.registerGnss(mockGnss);
      expect(appStore.gnss).toBe(mockGnss);
    });

    it('should bridge position events to bus', async () => {
      const { appStore, bus } = await freshModule();
      const handlers: Record<string, Function> = {};
      const mockGnss = {
        on: vi.fn((event: string, cb: Function) => { handlers[event] = cb; }),
        getPosition: vi.fn(),
      };
      appStore.registerGnss(mockGnss);

      const busListener = vi.fn();
      bus.on('gnss:position', busListener);

      const pos = { lat: 32.08, lon: 34.78 };
      handlers['position'](pos);
      expect(busListener).toHaveBeenCalledWith(pos);
    });

    it('should bridge connection events to bus and appState', async () => {
      const { appStore, bus, appState } = await freshModule();
      const handlers: Record<string, Function> = {};
      const mockGnss = {
        on: vi.fn((event: string, cb: Function) => { handlers[event] = cb; }),
      };
      appStore.registerGnss(mockGnss);

      const busListener = vi.fn();
      bus.on('gnss:connection', busListener);

      handlers['connection']('connected');
      expect(busListener).toHaveBeenCalledWith('connected');
      expect(appState.get('gnssConnected')).toBe(true);

      handlers['connection']('disconnected');
      expect(appState.get('gnssConnected')).toBe(false);
    });
  });

  describe('registerGnssConnection', () => {
    it('should store gnssConnection reference', async () => {
      const { appStore } = await freshModule();
      const mockConn = { connect: vi.fn() };
      appStore.registerGnssConnection(mockConn);
      expect(appStore.gnssConnection).toBe(mockConn);
    });
  });

  describe('registerMenu', () => {
    it('should store menu reference', async () => {
      const { appStore } = await freshModule();
      const mockMenu = { on: vi.fn(), emit: vi.fn() };
      appStore.registerMenu(mockMenu);
      expect(appStore.menu).toBe(mockMenu);
    });

    it('should bridge known menu events to bus', async () => {
      const { appStore, bus } = await freshModule();
      const handlers: Record<string, Function[]> = {};
      const mockMenu = {
        on: vi.fn((event: string, cb: Function) => {
          if (!handlers[event]) handlers[event] = [];
          handlers[event].push(cb);
        }),
        emit: vi.fn(),
      };
      appStore.registerMenu(mockMenu);

      const busListener = vi.fn();
      bus.on('sketch:changed', busListener);

      // Trigger a bridged event
      for (const cb of (handlers['sketch:changed'] || [])) cb({ test: true });
      expect(busListener).toHaveBeenCalledWith({ test: true });
    });

    it('should forward non-bridged events with menu: prefix', async () => {
      const { appStore, bus } = await freshModule();
      const mockMenu = {
        on: vi.fn(),
        emit: vi.fn(),
      };
      appStore.registerMenu(mockMenu);

      const busListener = vi.fn();
      bus.on('menu:custom:event', busListener);

      // After registerMenu, mockMenu.emit is monkey-patched
      mockMenu.emit('custom:event', { data: 1 });
      expect(busListener).toHaveBeenCalledWith({ data: 1 });
    });
  });

  describe('registerAuth', () => {
    it('should store auth reference', async () => {
      const { appStore } = await freshModule();
      const mockAuth = {
        getAuthState: vi.fn(),
        isAuthenticated: vi.fn(),
        onAuthStateChange: vi.fn(),
      };
      appStore.registerAuth(mockAuth);
      expect(appStore.auth).toBe(mockAuth);
    });

    it('should bridge auth state changes to bus and appState', async () => {
      const { appStore, bus, appState } = await freshModule();
      let authCallback: Function | null = null;
      const mockAuth = {
        onAuthStateChange: vi.fn((cb: Function) => { authCallback = cb; }),
        getAuthState: vi.fn(),
        isAuthenticated: vi.fn(),
      };
      appStore.registerAuth(mockAuth);

      const busListener = vi.fn();
      bus.on('auth:stateChanged', busListener);

      const state = { user: { id: 'u1', name: 'Test' } };
      authCallback!(state);
      expect(busListener).toHaveBeenCalledWith(state);
      expect(appState.get('authState')).toBe(state);
      expect(appState.get('currentUser')).toEqual({ id: 'u1', name: 'Test' });
    });

    it('should handle null user in auth state', async () => {
      const { appStore, appState } = await freshModule();
      let authCallback: Function | null = null;
      const mockAuth = {
        onAuthStateChange: vi.fn((cb: Function) => { authCallback = cb; }),
      };
      appStore.registerAuth(mockAuth);
      authCallback!(null);
      expect(appState.get('currentUser')).toBeNull();
    });
  });

  describe('registerSync', () => {
    it('should store sync reference', async () => {
      const { appStore } = await freshModule();
      const mockSync = { onSyncStateChange: vi.fn() };
      appStore.registerSync(mockSync);
      expect(appStore.sync).toBe(mockSync);
    });

    it('should bridge sync state changes to bus', async () => {
      const { appStore, bus, appState } = await freshModule();
      let syncCallback: Function | null = null;
      const mockSync = {
        onSyncStateChange: vi.fn((cb: Function) => { syncCallback = cb; }),
      };
      appStore.registerSync(mockSync);

      const busListener = vi.fn();
      bus.on('sync:stateChange', busListener);

      syncCallback!('syncing');
      expect(busListener).toHaveBeenCalledWith('syncing');
      expect(appState.get('syncState')).toBe('syncing');
    });
  });

  describe('convenience accessors', () => {
    it('isGnssConnected should return false when gnss is null', async () => {
      const { appStore } = await freshModule();
      expect(appStore.isGnssConnected()).toBe(false);
    });

    it('isGnssConnected should check connectionState', async () => {
      const { appStore } = await freshModule();
      appStore.gnss = { connectionState: 'connected' };
      expect(appStore.isGnssConnected()).toBe(true);
      appStore.gnss = { connectionState: 'disconnected' };
      expect(appStore.isGnssConnected()).toBe(false);
    });

    it('getGnssPosition should return null when gnss is null', async () => {
      const { appStore } = await freshModule();
      expect(appStore.getGnssPosition()).toBeNull();
    });

    it('getGnssPosition should call getPosition', async () => {
      const { appStore } = await freshModule();
      appStore.gnss = { getPosition: () => ({ lat: 32, lon: 34 }) };
      expect(appStore.getGnssPosition()).toEqual({ lat: 32, lon: 34 });
    });

    it('isAuthenticated should return false when auth is null', async () => {
      const { appStore } = await freshModule();
      expect(appStore.isAuthenticated()).toBe(false);
    });

    it('isAuthenticated should delegate to auth', async () => {
      const { appStore } = await freshModule();
      appStore.auth = { isAuthenticated: () => true };
      expect(appStore.isAuthenticated()).toBe(true);
    });

    it('getAuthState should return null when auth is null', async () => {
      const { appStore } = await freshModule();
      expect(appStore.getAuthState()).toBeNull();
    });

    it('getAuthState should delegate to auth', async () => {
      const { appStore } = await freshModule();
      const state = { user: { id: 'u1' } };
      appStore.auth = { getAuthState: () => state };
      expect(appStore.getAuthState()).toBe(state);
    });
  });
});
