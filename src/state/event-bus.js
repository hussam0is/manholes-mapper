/**
 * event-bus.js — Lightweight publish/subscribe event bus
 *
 * Decouples cross-module communication.  Any module can emit or listen
 * for named events without importing the producer directly.
 *
 * Usage:
 *   import { bus } from '../state/event-bus.js';
 *   const off = bus.on('sketch:saved', (payload) => { ... });
 *   bus.emit('sketch:saved', { id: '123' });
 *   off();  // unsubscribe
 *
 * Features:
 *   • Wildcard listener via bus.on('*', (eventName, payload) => {})
 *   • One-shot listener via bus.once(event, handler)
 *   • Typed JSDoc for IDE completion
 *   • No dependencies, < 60 lines
 */

/** @typedef {(...args: any[]) => void} EventHandler */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<EventHandler>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.  Returns an unsubscribe function.
   * @param {string} event — event name (or '*' for all events)
   * @param {EventHandler} handler
   * @returns {() => void} unsubscribe
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Subscribe to an event — fires once then auto-unsubscribes.
   * @param {string} event
   * @param {EventHandler} handler
   * @returns {() => void} unsubscribe (in case you want to cancel early)
   */
  once(event, handler) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      handler(...args);
    };
    return this.on(event, wrapped);
  }

  /**
   * Remove a specific handler from an event.
   * @param {string} event
   * @param {EventHandler} handler
   */
  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this._listeners.delete(event);
    }
  }

  /**
   * Emit an event with optional payload.
   * @param {string} event
   * @param {*} [payload]
   */
  emit(event, payload) {
    // Specific listeners
    const set = this._listeners.get(event);
    if (set) {
      for (const fn of set) {
        try { fn(payload); } catch (e) { console.error(`[EventBus] handler error on "${event}":`, e); }
      }
    }
    // Wildcard listeners
    const wild = this._listeners.get('*');
    if (wild) {
      for (const fn of wild) {
        try { fn(event, payload); } catch (e) { console.error('[EventBus] wildcard handler error:', e); }
      }
    }
  }

  /**
   * Remove all listeners (useful for testing / teardown).
   */
  clear() {
    this._listeners.clear();
  }

  /**
   * Debug helper: list all registered event names and listener counts.
   * @returns {Record<string, number>}
   */
  debug() {
    const out = {};
    for (const [k, v] of this._listeners) out[k] = v.size;
    return out;
  }
}

/** Singleton event bus for the application */
export const bus = new EventBus();

// Expose for debugging in DevTools
if (typeof window !== 'undefined') {
  window.__bus = bus;
}

export { EventBus };
