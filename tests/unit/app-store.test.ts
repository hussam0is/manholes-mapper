import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppStore, store } from '../../src/state/app-store.js';
import { bus } from '../../src/state/event-bus.js';

describe('AppStore', () => {
  let s: InstanceType<typeof AppStore>;

  beforeEach(() => {
    s = new AppStore();
    bus.clear(); // isolate bus events
  });

  describe('get / set', () => {
    it('should store and retrieve values', () => {
      s.set('nodes', [1, 2, 3]);
      expect(s.get('nodes')).toEqual([1, 2, 3]);
    });

    it('should return undefined for unset keys', () => {
      expect(s.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      s.set('x', 1);
      s.set('x', 2);
      expect(s.get('x')).toBe(2);
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      s.set('a', null);
      expect(s.has('a')).toBe(true);
    });

    it('should return false for missing keys', () => {
      expect(s.has('b')).toBe(false);
    });
  });

  describe('init', () => {
    it('should bulk-initialize state without firing subscribers', () => {
      const handler = vi.fn();
      s.subscribe('x', handler);
      s.init({ x: 10, y: 20 });
      expect(s.get('x')).toBe(10);
      expect(s.get('y')).toBe(20);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('should notify on value change', () => {
      const handler = vi.fn();
      s.subscribe('count', handler);
      s.set('count', 5);
      expect(handler).toHaveBeenCalledWith(5, undefined);
    });

    it('should provide old and new values', () => {
      s.set('count', 1);
      const handler = vi.fn();
      s.subscribe('count', handler);
      s.set('count', 2);
      expect(handler).toHaveBeenCalledWith(2, 1);
    });

    it('should not fire on identical reference assignment', () => {
      const arr = [1, 2];
      s.set('items', arr);
      const handler = vi.fn();
      s.subscribe('items', handler);
      s.set('items', arr); // same ref
      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow unsubscription via returned function', () => {
      const handler = vi.fn();
      const unsub = s.subscribe('x', handler);
      unsub();
      s.set('x', 99);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      s.subscribe('x', h1);
      s.subscribe('x', h2);
      s.set('x', 42);
      expect(h1).toHaveBeenCalledWith(42, undefined);
      expect(h2).toHaveBeenCalledWith(42, undefined);
    });
  });

  describe('batch', () => {
    it('should coalesce notifications to one per key', () => {
      const handler = vi.fn();
      s.subscribe('x', handler);
      s.batch(() => {
        s.set('x', 1);
        s.set('x', 2);
        s.set('x', 3);
      });
      // Should fire once with first old value and final new value
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(3, undefined);
    });

    it('should notify for each changed key after batch', () => {
      const hx = vi.fn();
      const hy = vi.fn();
      s.subscribe('x', hx);
      s.subscribe('y', hy);
      s.batch(() => {
        s.set('x', 10);
        s.set('y', 20);
      });
      expect(hx).toHaveBeenCalledTimes(1);
      expect(hy).toHaveBeenCalledTimes(1);
    });

    it('should handle nested batches gracefully', () => {
      const handler = vi.fn();
      s.subscribe('x', handler);
      s.batch(() => {
        s.set('x', 1);
        s.batch(() => {
          s.set('x', 2);
        });
      });
      // Nested batch runs inline, outer batch flushes
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should flush even if fn throws', () => {
      const handler = vi.fn();
      s.subscribe('x', handler);
      try {
        s.batch(() => {
          s.set('x', 1);
          throw new Error('boom');
        });
      } catch (_) {}
      expect(handler).toHaveBeenCalledWith(1, undefined);
    });
  });

  describe('snapshot', () => {
    it('should return a plain object copy of state', () => {
      s.set('a', 1);
      s.set('b', 'hello');
      const snap = s.snapshot();
      expect(snap).toEqual({ a: 1, b: 'hello' });
      // Should be a copy, not live
      s.set('a', 999);
      expect(snap.a).toBe(1);
    });
  });

  describe('keys', () => {
    it('should return all key names', () => {
      s.set('a', 1);
      s.set('b', 2);
      expect(s.keys().sort()).toEqual(['a', 'b']);
    });
  });

  describe('clear', () => {
    it('should remove all state and subscribers', () => {
      const handler = vi.fn();
      s.set('a', 1);
      s.subscribe('a', handler);
      s.clear();
      expect(s.get('a')).toBeUndefined();
      expect(s.keys()).toEqual([]);
    });
  });

  describe('bus integration', () => {
    it('should emit store:key events on the bus', () => {
      const handler = vi.fn();
      bus.on('store:count', handler);
      s.set('count', 42);
      expect(handler).toHaveBeenCalledWith({
        key: 'count',
        value: 42,
        prev: undefined,
      });
    });
  });

  describe('error handling', () => {
    it('should not break other subscribers if one throws', () => {
      const bad = vi.fn(() => { throw new Error('oops'); });
      const good = vi.fn();
      s.subscribe('x', bad);
      s.subscribe('x', good);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      s.set('x', 1);
      expect(good).toHaveBeenCalledWith(1, undefined);
      consoleSpy.mockRestore();
    });
  });

  describe('debug', () => {
    it('should return type info for each key', () => {
      s.set('num', 42);
      s.set('str', 'hello');
      s.set('arr', [1, 2]);
      s.set('nil', null);
      const dbg = s.debug();
      expect(dbg.num).toBe('number');
      expect(dbg.str).toBe('string');
      expect(dbg.arr).toBe('array(2)');
      expect(dbg.nil).toBe('null');
    });
  });

  describe('singleton', () => {
    it('should export a singleton store instance', () => {
      expect(store).toBeInstanceOf(AppStore);
    });
  });
});
