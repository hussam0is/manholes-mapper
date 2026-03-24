/**
 * Rendering Performance Monitor
 *
 * Tracks frame times, cache hit rates, and element counts to help identify
 * performance bottlenecks. Data is exposed via window.__renderPerf for
 * console inspection and via an optional on-screen overlay.
 *
 * Usage:
 *   import { renderPerf } from './render-perf.js';
 *   renderPerf.frameStart();
 *   // ... draw ...
 *   renderPerf.frameEnd();
 *   renderPerf.record('nodes', visibleCount);
 */

const HISTORY_SIZE = 120; // ~2 seconds at 60fps

class RenderPerf {
  constructor() {
    this._frameTimes = new Float64Array(HISTORY_SIZE);
    this._frameIdx = 0;
    this._frameStart = 0;
    this._stats = {};
    this._cacheHits = 0;
    this._cacheMisses = 0;
    this._enabled = false;
    this._overlayEl = null;
    this._overlayInterval = null;
  }

  /** Enable performance tracking */
  enable() {
    this._enabled = true;
    // Expose for console debugging
    window.__renderPerf = this;
  }

  /** Disable performance tracking */
  disable() {
    this._enabled = false;
    this.hideOverlay();
    delete window.__renderPerf;
  }

  /** Mark the start of a frame */
  frameStart() {
    if (!this._enabled) return;
    this._frameStart = performance.now();
  }

  /** Mark the end of a frame and record frame time */
  frameEnd() {
    if (!this._enabled || !this._frameStart) return;
    const dt = performance.now() - this._frameStart;
    this._frameTimes[this._frameIdx % HISTORY_SIZE] = dt;
    this._frameIdx++;
    this._frameStart = 0;
  }

  /**
   * Record a named statistic for the current frame.
   * @param {string} name - Stat name (e.g. 'visibleNodes', 'visibleEdges')
   * @param {number} value
   */
  record(name, value) {
    if (!this._enabled) return;
    this._stats[name] = value;
  }

  /** Record a cache hit */
  cacheHit() { if (this._enabled) this._cacheHits++; }

  /** Record a cache miss */
  cacheMiss() { if (this._enabled) this._cacheMisses++; }

  /** Get average frame time over recent history (ms) */
  get avgFrameTime() {
    const count = Math.min(this._frameIdx, HISTORY_SIZE);
    if (count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < count; i++) sum += this._frameTimes[i];
    return sum / count;
  }

  /** Get max frame time over recent history (ms) */
  get maxFrameTime() {
    const count = Math.min(this._frameIdx, HISTORY_SIZE);
    if (count === 0) return 0;
    let max = 0;
    for (let i = 0; i < count; i++) {
      if (this._frameTimes[i] > max) max = this._frameTimes[i];
    }
    return max;
  }

  /** Get estimated FPS */
  get fps() {
    const avg = this.avgFrameTime;
    return avg > 0 ? Math.round(1000 / avg) : 0;
  }

  /** Get cache hit rate (0-1) */
  get cacheHitRate() {
    const total = this._cacheHits + this._cacheMisses;
    return total > 0 ? this._cacheHits / total : 0;
  }

  /** Get a snapshot of all current stats */
  getSnapshot() {
    return {
      fps: this.fps,
      avgFrameTime: Math.round(this.avgFrameTime * 100) / 100,
      maxFrameTime: Math.round(this.maxFrameTime * 100) / 100,
      cacheHitRate: Math.round(this.cacheHitRate * 100),
      ...this._stats,
    };
  }

  /** Show an on-screen performance overlay */
  showOverlay() {
    if (this._overlayEl) return;
    this._enabled = true;
    window.__renderPerf = this;

    const el = document.createElement('div');
    el.id = 'renderPerfOverlay';
    el.style.cssText = `
      position: fixed; top: 4px; right: 4px; z-index: 99999;
      background: rgba(0,0,0,0.75); color: #0f0; font: 11px monospace;
      padding: 4px 8px; border-radius: 4px; pointer-events: none;
      white-space: pre; line-height: 1.4;
    `;
    document.body.appendChild(el);
    this._overlayEl = el;

    this._overlayInterval = setInterval(() => {
      const s = this.getSnapshot();
      const lines = [
        `FPS: ${s.fps}  avg: ${s.avgFrameTime}ms  max: ${s.maxFrameTime}ms`,
        `cache: ${s.cacheHitRate}%`,
      ];
      if (s.visibleNodes != null) lines.push(`nodes: ${s.visibleNodes}  edges: ${s.visibleEdges || 0}`);
      if (s.totalNodes != null) lines.push(`total: ${s.totalNodes} nodes  ${s.totalEdges || 0} edges`);
      if (s.gridCulled != null) lines.push(`culled by grid: ${s.gridCulled}`);
      el.textContent = lines.join('\n');
    }, 250);
  }

  /** Hide the on-screen overlay */
  hideOverlay() {
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
    if (this._overlayInterval) {
      clearInterval(this._overlayInterval);
      this._overlayInterval = null;
    }
  }

  /** Reset all counters */
  reset() {
    this._frameTimes.fill(0);
    this._frameIdx = 0;
    this._stats = {};
    this._cacheHits = 0;
    this._cacheMisses = 0;
  }
}

/** Singleton instance */
export const renderPerf = new RenderPerf();
