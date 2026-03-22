/**
 * Tests for the EventBus — lightweight pub/sub event system.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../src/state/event-bus.js';

describe('EventBus', () => {
  let bus: InstanceType<typeof EventBus>;

  beforeEach(() => {
    bus = new EventBus();
  });

  // ── on / emit ────────────────────────────────────────────

  it('should call listener when event is emitted', () => {
    const handler = vi.fn();
    bus.on('test:event', handler);
    bus.emit('test:event', { value: 42 });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('should support multiple listeners for the same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('multi', h1);
    bus.on('multi', h2);
    bus.emit('multi', 'data');

    expect(h1).toHaveBeenCalledWith('data');
    expect(h2).toHaveBeenCalledWith('data');
  });

  it('should not call listener for a different event', () => {
    const handler = vi.fn();
    bus.on('a', handler);
    bus.emit('b', 'data');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle emit with no listeners gracefully', () => {
    expect(() => bus.emit('nonexistent', 'data')).not.toThrow();
  });

  // ── off ──────────────────────────────────────────────────

  it('should remove listener via off()', () => {
    const handler = vi.fn();
    bus.on('test', handler);
    bus.off('test', handler);
    bus.emit('test', 'data');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should return unsubscribe function from on()', () => {
    const handler = vi.fn();
    const unsub = bus.on('test', handler);

    bus.emit('test', 'first');
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    bus.emit('test', 'second');
    expect(handler).toHaveBeenCalledOnce(); // still 1
  });

  // ── once ─────────────────────────────────────────────────

  it('should fire once-listener only once', () => {
    const handler = vi.fn();
    bus.once('test', handler);

    bus.emit('test', 'first');
    bus.emit('test', 'second');

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('first');
  });

  it('should return unsubscribe from once()', () => {
    const handler = vi.fn();
    const unsub = bus.once('test', handler);
    unsub();

    bus.emit('test', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  // ── onAny (namespace wildcard) ───────────────────────────

  it('should fire namespace listener for matching prefix', () => {
    const handler = vi.fn();
    bus.onAny('gnss:', handler);

    bus.emit('gnss:position', { lat: 32 });
    bus.emit('gnss:connection', 'connected');
    bus.emit('sync:stateChange', 'idle');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith('gnss:position', { lat: 32 });
    expect(handler).toHaveBeenCalledWith('gnss:connection', 'connected');
  });

  it('should support unsubscribe from onAny', () => {
    const handler = vi.fn();
    const unsub = bus.onAny('auth:', handler);
    unsub();

    bus.emit('auth:stateChanged', {});
    expect(handler).not.toHaveBeenCalled();
  });

  // ── clear ────────────────────────────────────────────────

  it('should remove all listeners on clear()', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const h3 = vi.fn();

    bus.on('a', h1);
    bus.once('b', h2);
    bus.onAny('c:', h3);

    bus.clear();

    bus.emit('a', 1);
    bus.emit('b', 2);
    bus.emit('c:test', 3);

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
    expect(h3).not.toHaveBeenCalled();
  });

  // ── Error handling ───────────────────────────────────────

  it('should not break other listeners if one throws', () => {
    const bad = vi.fn(() => { throw new Error('oops'); });
    const good = vi.fn();

    bus.on('test', bad);
    bus.on('test', good);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.emit('test', 'data');
    consoleSpy.mockRestore();

    expect(good).toHaveBeenCalledWith('data');
  });

  // ── Edge cases ───────────────────────────────────────────

  it('should handle emitting undefined data', () => {
    const handler = vi.fn();
    bus.on('test', handler);
    bus.emit('test');

    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('should handle off() for non-existent listener gracefully', () => {
    expect(() => bus.off('nonexistent', () => {})).not.toThrow();
  });
});
