import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, bus } from '../../src/state/event-bus.js';

describe('EventBus', () => {
  let eb: InstanceType<typeof EventBus>;

  beforeEach(() => {
    eb = new EventBus();
  });

  describe('on / emit', () => {
    it('should call handler when event is emitted', () => {
      const handler = vi.fn();
      eb.on('test', handler);
      eb.emit('test', { a: 1 });
      expect(handler).toHaveBeenCalledWith({ a: 1 });
    });

    it('should support multiple handlers for the same event', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      eb.on('test', h1);
      eb.on('test', h2);
      eb.emit('test', 'data');
      expect(h1).toHaveBeenCalledWith('data');
      expect(h2).toHaveBeenCalledWith('data');
    });

    it('should not call handlers for different events', () => {
      const handler = vi.fn();
      eb.on('test', handler);
      eb.emit('other', 'data');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should work with no payload', () => {
      const handler = vi.fn();
      eb.on('test', handler);
      eb.emit('test');
      expect(handler).toHaveBeenCalledWith(undefined);
    });
  });

  describe('off / unsubscribe', () => {
    it('should remove handler via off()', () => {
      const handler = vi.fn();
      eb.on('test', handler);
      eb.off('test', handler);
      eb.emit('test', 'data');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should remove handler via returned function', () => {
      const handler = vi.fn();
      const unsub = eb.on('test', handler);
      unsub();
      eb.emit('test', 'data');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should not throw when removing non-existent handler', () => {
      expect(() => eb.off('nonexistent', () => {})).not.toThrow();
    });
  });

  describe('once', () => {
    it('should fire handler only once', () => {
      const handler = vi.fn();
      eb.once('test', handler);
      eb.emit('test', 'first');
      eb.emit('test', 'second');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('should allow early unsubscription', () => {
      const handler = vi.fn();
      const unsub = eb.once('test', handler);
      unsub();
      eb.emit('test', 'data');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('wildcard', () => {
    it('should call wildcard handler for all events', () => {
      const handler = vi.fn();
      eb.on('*', handler);
      eb.emit('foo', 1);
      eb.emit('bar', 2);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith('foo', 1);
      expect(handler).toHaveBeenCalledWith('bar', 2);
    });
  });

  describe('error handling', () => {
    it('should not break other handlers if one throws', () => {
      const bad = vi.fn(() => { throw new Error('oops'); });
      const good = vi.fn();
      eb.on('test', bad);
      eb.on('test', good);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      eb.emit('test', 'data');
      expect(good).toHaveBeenCalledWith('data');
      consoleSpy.mockRestore();
    });
  });

  describe('clear', () => {
    it('should remove all listeners', () => {
      const handler = vi.fn();
      eb.on('a', handler);
      eb.on('b', handler);
      eb.clear();
      eb.emit('a', 'x');
      eb.emit('b', 'x');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('should return listener counts per event', () => {
      eb.on('a', () => {});
      eb.on('a', () => {});
      eb.on('b', () => {});
      expect(eb.debug()).toEqual({ a: 2, b: 1 });
    });
  });

  describe('singleton', () => {
    it('should export a singleton bus instance', () => {
      expect(bus).toBeInstanceOf(EventBus);
    });
  });
});
