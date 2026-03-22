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
 */

/** @type {Record<string, any>} */
export const S = {};

/** @type {Record<string, Function>} */
export const F = {};
