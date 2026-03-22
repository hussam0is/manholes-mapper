import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, bus } from '../../src/state/event-bus.js';

describe('EventBus', () => {
  let testBus: InstanceType<typeof EventBus>;

  beforeEach(() => {
    testBus = new EventBus();
  });

  describe('on / emit', () => {
    it('calls listener when event is emitted', () => {
      const cb = vi.fn();
      testBus.on('test', cb);
      testBus.emit('test', { value: 42 });
      expect(cb).toHaveBeenCalledWith({ value: 42 });
    });

    it('supports multiple listeners on the same event', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      testBus.on('test', cb1);
      testBus.on('test', cb2);
      testBus.emit('test', 'data');
      expect(cb1).toHaveBeenCalledWith('data');
      expect(cb2).toHaveBeenCalledWith('data');
    });

    it('does not call listeners for other events', () => {
      const cb = vi.fn();
      testBus.on('a', cb);
      testBus.emit('b', 'data');
      expect(cb).not.toHaveBeenCalled();
    });

    it('passes undefined when no data is provided', () => {
      const cb = vi.fn();
      testBus.on('test', cb);
      testBus.emit('test');
      expect(cb).toHaveBeenCalledWith(undefined);
    });
  });

  describe('off / unsubscribe', () => {
    it('removes a listener via off()', () => {
      const cb = vi.fn();
      testBus.on('test', cb);
      testBus.off('test', cb);
      testBus.emit('test');
      expect(cb).not.toHaveBeenCalled();
    });

    it('removes a listener via the returned unsubscribe function', () => {
      const cb = vi.fn();
      const unsub = testBus.on('test', cb);
      unsub();
      testBus.emit('test');
      expect(cb).not.toHaveBeenCalled();
    });

    it('does not throw when removing a non-existent listener', () => {
      expect(() => testBus.off('nonexistent', vi.fn())).not.toThrow();
    });
  });

  describe('once', () => {
    it('calls the listener only once', () => {
      const cb = vi.fn();
      testBus.once('test', cb);
      testBus.emit('test', 'first');
      testBus.emit('test', 'second');
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('first');
    });

    it('can be unsubscribed before firing', () => {
      const cb = vi.fn();
      const unsub = testBus.once('test', cb);
      unsub();
      testBus.emit('test');
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('onAny (namespace)', () => {
    it('fires for events matching the prefix', () => {
      const cb = vi.fn();
      testBus.onAny('gnss:', cb);
      testBus.emit('gnss:position', { lat: 1 });
      testBus.emit('gnss:connection', 'connected');
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenCalledWith('gnss:position', { lat: 1 });
      expect(cb).toHaveBeenCalledWith('gnss:connection', 'connected');
    });

    it('does not fire for non-matching events', () => {
      const cb = vi.fn();
      testBus.onAny('gnss:', cb);
      testBus.emit('auth:stateChanged', {});
      expect(cb).not.toHaveBeenCalled();
    });

    it('can be unsubscribed', () => {
      const cb = vi.fn();
      const unsub = testBus.onAny('gnss:', cb);
      unsub();
      testBus.emit('gnss:position', {});
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('removes all listeners', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      testBus.on('a', cb1);
      testBus.once('b', cb2);
      testBus.clear();
      testBus.emit('a');
      testBus.emit('b');
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('does not break other listeners if one throws', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const thrower = vi.fn(() => { throw new Error('boom'); });
      const safe = vi.fn();
      testBus.on('test', thrower);
      testBus.on('test', safe);
      testBus.emit('test', 'data');
      expect(thrower).toHaveBeenCalled();
      expect(safe).toHaveBeenCalledWith('data');
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });
  });

  describe('singleton bus', () => {
    it('exports a singleton bus instance', () => {
      expect(bus).toBeInstanceOf(EventBus);
    });
  });
});
