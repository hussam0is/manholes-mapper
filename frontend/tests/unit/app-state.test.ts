/**
 * Unit tests for src/state/app-state.js
 *
 * Covers: get/set, no-op on equal value, subscribe/unsubscribe,
 * batch updates, snapshot, clear, and event bus integration.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bus } from '../../src/state/event-bus.js';

// Import after ensuring module state is fresh via clear()
import { appState, STATE_KEYS } from '../../src/state/app-state.js';

describe('appState', () => {
  beforeEach(() => {
    appState.clear();
    bus.clear();
  });

  // ─── STATE_KEYS ──────────────────────────────────────────────────

  describe('STATE_KEYS', () => {
    it('exports frozen STATE_KEYS with expected keys', () => {
      expect(STATE_KEYS.CURRENT_SKETCH).toBe('currentSketch');
      expect(STATE_KEYS.CURRENT_USER).toBe('currentUser');
      expect(STATE_KEYS.UI_MODE).toBe('uiMode');
      expect(STATE_KEYS.GNSS_CONNECTED).toBe('gnssConnected');
      expect(Object.isFrozen(STATE_KEYS)).toBe(true);
    });
  });

  // ─── get / set ───────────────────────────────────────────────────

  describe('get / set', () => {
    it('stores and retrieves a primitive value', () => {
      appState.set('uiMode', 'edit');
      expect(appState.get('uiMode')).toBe('edit');
    });

    it('stores and retrieves an object', () => {
      const user = { id: 1, name: 'Test' };
      appState.set('currentUser', user);
      expect(appState.get('currentUser')).toBe(user);
    });

    it('returns undefined for unknown key', () => {
      expect(appState.get('nonExistentKey')).toBeUndefined();
    });

    it('overwrites existing value', () => {
      appState.set('uiMode', 'view');
      appState.set('uiMode', 'edit');
      expect(appState.get('uiMode')).toBe('edit');
    });

    it('does not emit event when value is strictly equal (no-op)', () => {
      const handler = vi.fn();
      bus.on('state:uiMode', handler);
      appState.set('uiMode', 'edit');
      appState.set('uiMode', 'edit'); // same value again
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ─── subscribe / unsubscribe ──────────────────────────────────────

  describe('subscribe', () => {
    it('calls subscriber when value changes', () => {
      const handler = vi.fn();
      appState.subscribe('uiMode', handler);
      appState.set('uiMode', 'node');
      expect(handler).toHaveBeenCalledWith('node', undefined);
    });

    it('passes old value to subscriber', () => {
      const handler = vi.fn();
      appState.set('uiMode', 'view');
      appState.subscribe('uiMode', handler);
      appState.set('uiMode', 'edit');
      expect(handler).toHaveBeenCalledWith('edit', 'view');
    });

    it('does not call subscriber for unrelated key changes', () => {
      const handler = vi.fn();
      appState.subscribe('uiMode', handler);
      appState.set('currentUser', { id: 2 });
      expect(handler).not.toHaveBeenCalled();
    });

    it('unsubscribe stops future calls', () => {
      const handler = vi.fn();
      const unsub = appState.subscribe('uiMode', handler);
      unsub();
      appState.set('uiMode', 'edge');
      expect(handler).not.toHaveBeenCalled();
    });

    it('multiple subscribers all receive change', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      appState.subscribe('uiMode', h1);
      appState.subscribe('uiMode', h2);
      appState.set('uiMode', 'pan');
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('unsub of one does not affect the other', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const unsub1 = appState.subscribe('uiMode', h1);
      appState.subscribe('uiMode', h2);
      unsub1();
      appState.set('uiMode', 'pan');
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('subscriber error does not break subsequent subscribers', () => {
      const bad = vi.fn(() => { throw new Error('boom'); });
      const good = vi.fn();
      appState.subscribe('uiMode', bad);
      appState.subscribe('uiMode', good);
      appState.set('uiMode', 'node');
      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalled();
    });
  });

  // ─── bus integration ──────────────────────────────────────────────

  describe('bus events', () => {
    it('emits state:<key> event when value changes', () => {
      const busHandler = vi.fn();
      bus.on('state:currentUser', busHandler);
      const user = { id: 99 };
      appState.set('currentUser', user);
      expect(busHandler).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'currentUser', value: user })
      );
    });

    it('does not emit bus event when value unchanged', () => {
      const busHandler = vi.fn();
      appState.set('uiMode', 'view');
      bus.on('state:uiMode', busHandler);
      appState.set('uiMode', 'view'); // same
      expect(busHandler).not.toHaveBeenCalled();
    });
  });

  // ─── batch ───────────────────────────────────────────────────────

  describe('batch', () => {
    it('updates all provided keys', () => {
      appState.batch({ uiMode: 'edit', gnssConnected: true });
      expect(appState.get('uiMode')).toBe('edit');
      expect(appState.get('gnssConnected')).toBe(true);
    });

    it('emits individual state:<key> events for each changed key', () => {
      const uiHandler = vi.fn();
      const gnssHandler = vi.fn();
      bus.on('state:uiMode', uiHandler);
      bus.on('state:gnssConnected', gnssHandler);
      appState.batch({ uiMode: 'node', gnssConnected: false });
      expect(uiHandler).toHaveBeenCalledTimes(1);
      expect(gnssHandler).toHaveBeenCalledTimes(1);
    });

    it('emits state:batch summary event with all changes', () => {
      const batchHandler = vi.fn();
      bus.on('state:batch', batchHandler);
      appState.batch({ uiMode: 'edge', gnssConnected: true });
      expect(batchHandler).toHaveBeenCalledTimes(1);
      const arg = batchHandler.mock.calls[0][0];
      expect(arg.changes).toHaveLength(2);
      expect(arg.changes.map((c: any) => c.key)).toContain('uiMode');
      expect(arg.changes.map((c: any) => c.key)).toContain('gnssConnected');
    });

    it('does not emit batch event when no values changed', () => {
      appState.set('uiMode', 'view');
      const batchHandler = vi.fn();
      bus.on('state:batch', batchHandler);
      appState.batch({ uiMode: 'view' }); // same value
      expect(batchHandler).not.toHaveBeenCalled();
    });

    it('calls subscribers for each changed key in batch', () => {
      const h = vi.fn();
      appState.subscribe('uiMode', h);
      appState.batch({ uiMode: 'node', gnssConnected: true });
      expect(h).toHaveBeenCalledWith('node', undefined);
    });

    it('skips keys that have unchanged values', () => {
      appState.set('uiMode', 'view');
      const batchHandler = vi.fn();
      bus.on('state:batch', batchHandler);
      appState.batch({ uiMode: 'view', gnssConnected: true });
      // batch fires because gnssConnected changed
      const arg = batchHandler.mock.calls[0][0];
      expect(arg.changes.map((c: any) => c.key)).not.toContain('uiMode');
      expect(arg.changes.map((c: any) => c.key)).toContain('gnssConnected');
    });
  });

  // ─── snapshot ────────────────────────────────────────────────────

  describe('snapshot', () => {
    it('returns empty object when no state set', () => {
      const snap = appState.snapshot();
      expect(snap).toEqual({});
    });

    it('includes all set keys', () => {
      appState.set('uiMode', 'edit');
      appState.set('gnssConnected', true);
      const snap = appState.snapshot();
      expect(snap.uiMode).toBe('edit');
      expect(snap.gnssConnected).toBe(true);
    });

    it('returns a plain object (not the internal Map)', () => {
      appState.set('uiMode', 'view');
      const snap = appState.snapshot();
      expect(snap instanceof Map).toBe(false);
      expect(typeof snap).toBe('object');
    });
  });

  // ─── clear ───────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all stored state', () => {
      appState.set('uiMode', 'edit');
      appState.clear();
      expect(appState.get('uiMode')).toBeUndefined();
    });

    it('emits state:cleared event with cleared keys', () => {
      const clearHandler = vi.fn();
      bus.on('state:cleared', clearHandler);
      appState.set('uiMode', 'edit');
      appState.set('gnssConnected', true);
      appState.clear();
      expect(clearHandler).toHaveBeenCalledTimes(1);
      const arg = clearHandler.mock.calls[0][0];
      expect(arg.keys).toContain('uiMode');
      expect(arg.keys).toContain('gnssConnected');
    });

    it('removes all subscribers after clear', () => {
      const h = vi.fn();
      appState.subscribe('uiMode', h);
      appState.clear();
      appState.set('uiMode', 'node');
      expect(h).not.toHaveBeenCalled();
    });
  });
});
