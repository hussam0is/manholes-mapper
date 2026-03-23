import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bridgedProperty, hydrateStore, S } from '../../src/legacy/shared-state.js';
import { store } from '../../src/state/app-store.js';

describe('shared-state bridge', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('bridgedProperty', () => {
    it('should create a getter that delegates to provided function', () => {
      let val = 42;
      const desc = bridgedProperty('test', () => val, (v) => { val = v; });
      const obj: Record<string, any> = {};
      Object.defineProperty(obj, 'test', desc);
      expect(obj.test).toBe(42);
    });

    it('should create a setter that calls both original setter and store', () => {
      let val = 0;
      const desc = bridgedProperty('myProp', () => val, (v) => { val = v; });
      const obj: Record<string, any> = {};
      Object.defineProperty(obj, 'myProp', desc);
      obj.myProp = 99;
      expect(val).toBe(99); // local var updated
      expect(store.get('myProp')).toBe(99); // store updated
    });

    it('should create read-only property when setter is null', () => {
      const desc = bridgedProperty('ro', () => 'fixed', null);
      const obj: Record<string, any> = {};
      Object.defineProperty(obj, 'ro', desc);
      expect(obj.ro).toBe('fixed');
      // No setter — writing should be silently ignored or throw in strict mode
      expect(desc.set).toBeUndefined();
    });

    it('should notify store subscribers when writing through bridged setter', () => {
      let val = 0;
      const desc = bridgedProperty('observed', () => val, (v) => { val = v; });
      const obj: Record<string, any> = {};
      Object.defineProperty(obj, 'observed', desc);

      const handler = vi.fn();
      store.subscribe('observed', handler);
      obj.observed = 5;
      expect(handler).toHaveBeenCalledWith(5, undefined);
    });
  });

  describe('hydrateStore', () => {
    it('should populate store from S proxy keys', () => {
      // S is the real singleton; add a test property
      const desc = bridgedProperty('_hydTest', () => 'hello', (v) => {});
      Object.defineProperty(S, '_hydTest', desc);

      hydrateStore();
      expect(store.get('_hydTest')).toBe('hello');

      // Cleanup
      delete (S as any)._hydTest;
    });
  });
});
