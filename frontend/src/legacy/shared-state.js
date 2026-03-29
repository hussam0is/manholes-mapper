/**
 * shared-state.js
 *
 * Shared state proxy and function registry for incremental modularization
 * of src/legacy/main.js.
 *
 * S — State proxy: main.js populates this with Object.defineProperties()
 *     (getters/setters) immediately after declaring its local variables.
 *     Extracted modules import S and read/write state via S.nodes, S.edges, etc.
 *
 * F — Function registry: main.js assigns function references here after all
 *     function definitions are complete (inside init()). Extracted modules call
 *     cross-module functions via F.scheduleDraw(), F.renderDetails(), etc.
 *
 * ES module singleton semantics guarantee that S and F are the same object
 * in every importing module.
 *
 * ─── Migration bridge ───
 * S now delegates to AppStore internally.  When a property is written via S.foo = x,
 * the setter writes to both the local variable (for main.js compat) AND the AppStore.
 * New code can subscribe to changes via:
 *   import { appState } from '../state/app-state.js';
 *   appState.subscribe('nodes', (newVal, oldVal) => { ... });
 *
 * F remains unchanged — it's a simple function registry that will be
 * replaced by direct imports once circular dependency chains are broken.
 */

import { store } from '../state/app-store.js';

/** @type {Record<string, any>} */
export const S = {};

/** @type {Record<string, Function>} */
export const F = {};

/**
 * Bridge helper: wraps a property definition to also sync with AppStore.
 * Used by main.js _initStateProxy().
 *
 * @param {string} name — property name
 * @param {() => any} getter — original getter
 * @param {((v: any) => void)|null} setter — original setter (null for read-only)
 * @returns {{ get: () => any, set?: (v: any) => void, enumerable: boolean, configurable: boolean }}
 */
export function bridgedProperty(name, getter, setter) {
  const desc = {
    get() {
      return getter();
    },
    enumerable: true,
    configurable: true,
  };
  if (setter) {
    desc.set = (v) => {
      setter(v);
      // Mirror into AppStore so subscribers get notified
      store.set(name, v);
    };
  }
  return desc;
}

/**
 * Hydrate the AppStore with current S proxy values.
 * Call once after _initStateProxy() in main.js to seed the store.
 */
export function hydrateStore() {
  for (const key of Object.keys(S)) {
    try { store.set(key, S[key]); } catch (_) { /* skip getter-only failures */ }
  }
}
