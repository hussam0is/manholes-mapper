/**
 * Tests for AppState — centralized reactive state management.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to reset the module state between tests, so use dynamic imports
let appState: any;
let bus: any;

beforeEach(async () => {
  // Fresh imports each test via module reset
  vi.resetModules();

  const busMod = await import('../../src/state/event-bus.js');
  bus = busMod.bus;
  bus.clear();

  const stateMod = await import('../../src/state/app-state.js');
  appState = stateMod.appState;
  appState.clear();
});

describe('AppState', () => {
  // ── get / set ──────────────────────────────────────────

  it('should return undefined for unset keys', () => {
    expect(appState.get('nonexistent')).toBeUndefined();
  });

  it('should store and retrieve values', () => {
    appState.set('currentUser', { name: 'Hussam' });
    expect(appState.get('currentUser')).toEqual({ name: 'Hussam' });
  });

  it('should overwrite existing values', () => {
    appState.set('uiMode', 'view');
    appState.set('uiMode', 'edit');
    expect(appState.get('uiMode')).toBe('edit');
  });

  // ── Change detection ─────────────────────────────────

  it('should not emit when value is strictly equal', () => {
    const handler = vi.fn();
    appState.set('uiMode', 'view');
    appState.subscribe('uiMode', handler);

    appState.set('uiMode', 'view'); // same value
    expect(handler).not.toHaveBeenCalled();
  });

  // ── subscribe ────────────────────────────────────────

  it('should notify subscribers on change', () => {
    const handler = vi.fn();
    appState.subscribe('currentSketch', handler);

    appState.set('currentSketch', { id: 'sk1' });
    expect(handler).toHaveBeenCalledWith({ id: 'sk1' }, undefined);
  });

  it('should pass old and new values to subscriber', () => {
    const handler = vi.fn();
    appState.set('currentProject', 'proj-a');
    appState.subscribe('currentProject', handler);

    appState.set('currentProject', 'proj-b');
    expect(handler).toHaveBeenCalledWith('proj-b', 'proj-a');
  });

  it('should support unsubscribe', () => {
    const handler = vi.fn();
    const unsub = appState.subscribe('uiMode', handler);

    appState.set('uiMode', 'edit');
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    appState.set('uiMode', 'view');
    expect(handler).toHaveBeenCalledOnce(); // still 1
  });

  // ── Bus integration ──────────────────────────────────

  it('should emit state:<key> on the global event bus', () => {
    const busHandler = vi.fn();
    bus.on('state:currentUser', busHandler);

    appState.set('currentUser', { id: 1 });

    expect(busHandler).toHaveBeenCalledWith({
      key: 'currentUser',
      value: { id: 1 },
      oldValue: undefined,
    });
  });

  // ── batch ────────────────────────────────────────────

  it('should update multiple keys in a batch', () => {
    appState.batch({
      currentProject: 'proj-1',
      uiMode: 'edit',
      currentUser: { name: 'Test' },
    });

    expect(appState.get('currentProject')).toBe('proj-1');
    expect(appState.get('uiMode')).toBe('edit');
    expect(appState.get('currentUser')).toEqual({ name: 'Test' });
  });

  it('should emit state:batch event with all changes', () => {
    const batchHandler = vi.fn();
    bus.on('state:batch', batchHandler);

    appState.batch({ currentProject: 'p1', uiMode: 'edit' });

    expect(batchHandler).toHaveBeenCalledOnce();
    const { changes } = batchHandler.mock.calls[0][0];
    expect(changes).toHaveLength(2);
    expect(changes.map((c: any) => c.key).sort()).toEqual(['currentProject', 'uiMode']);
  });

  it('should skip unchanged keys in batch', () => {
    appState.set('uiMode', 'view');

    const handler = vi.fn();
    appState.subscribe('uiMode', handler);

    appState.batch({ uiMode: 'view', currentProject: 'new' }); // uiMode unchanged
    expect(handler).not.toHaveBeenCalled();
    expect(appState.get('currentProject')).toBe('new');
  });

  it('should not emit state:batch when nothing changed', () => {
    appState.set('uiMode', 'view');

    const batchHandler = vi.fn();
    bus.on('state:batch', batchHandler);

    appState.batch({ uiMode: 'view' }); // no change
    expect(batchHandler).not.toHaveBeenCalled();
  });

  // ── snapshot ─────────────────────────────────────────

  it('should return a snapshot of all state', () => {
    appState.set('currentUser', 'user1');
    appState.set('uiMode', 'edit');

    const snap = appState.snapshot();
    expect(snap).toEqual({ currentUser: 'user1', uiMode: 'edit' });
  });

  // ── clear ────────────────────────────────────────────

  it('should reset all state on clear()', () => {
    appState.set('currentUser', 'user1');
    appState.set('uiMode', 'edit');

    const clearedHandler = vi.fn();
    bus.on('state:cleared', clearedHandler);

    appState.clear();

    expect(appState.get('currentUser')).toBeUndefined();
    expect(appState.get('uiMode')).toBeUndefined();
    expect(clearedHandler).toHaveBeenCalledOnce();
  });

  // ── Error isolation ──────────────────────────────────

  it('should not break other subscribers if one throws', () => {
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();

    appState.subscribe('test', bad);
    appState.subscribe('test', good);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    appState.set('test', 'value');
    consoleSpy.mockRestore();

    expect(good).toHaveBeenCalledWith('value', undefined);
  });
});
