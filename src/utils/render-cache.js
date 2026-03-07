/**
 * Off-Screen Canvas Layer Cache
 *
 * Caches expensive, infrequently-changing canvas layers (grid, background
 * sketches, reference layers) into off-screen canvases. When the view
 * transform hasn't changed since the last render, the cached bitmap is
 * drawn in a single `drawImage()` call instead of re-running thousands
 * of canvas operations.
 *
 * Each layer tracks the parameters that would invalidate its cache
 * (viewScale, viewTranslate, stretch, data version). When any parameter
 * changes, the layer is re-rendered into the off-screen canvas.
 */

export class RenderCache {
  constructor() {
    /** @type {Map<string, {canvas: OffscreenCanvas|HTMLCanvasElement, ctx: CanvasRenderingContext2D, params: object, version: number}>} */
    this._layers = new Map();
  }

  /**
   * Get or create an off-screen canvas for a named layer.
   * @param {string} name - Layer name (e.g. 'grid', 'background', 'refLayers')
   * @param {number} width - Canvas width in pixels
   * @param {number} height - Canvas height in pixels
   * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}}
   */
  _getLayer(name, width, height) {
    let layer = this._layers.get(name);
    if (!layer || layer.canvas.width !== width || layer.canvas.height !== height) {
      // Prefer OffscreenCanvas for potential perf gains, fall back to HTMLCanvasElement
      let canvas;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(width, height);
      } else {
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Canvas not supported (e.g. jsdom test environment) — return a no-op layer
        return { canvas: null, ctx: null, params: {}, version: -1 };
      }
      layer = { canvas, ctx, params: {}, version: -1 };
      this._layers.set(name, layer);
    }
    return layer;
  }

  /**
   * Check if a layer's cache is still valid.
   * @param {string} name - Layer name
   * @param {object} params - Current render parameters to compare
   * @param {number} dataVersion - Data version counter (incremented on data change)
   * @returns {boolean} true if cache is valid and can be reused
   */
  isValid(name, params, dataVersion) {
    const layer = this._layers.get(name);
    if (!layer) return false;
    if (layer.version !== dataVersion) return false;
    // Shallow compare params
    const cached = layer.params;
    for (const key of Object.keys(params)) {
      if (cached[key] !== params[key]) return false;
    }
    return true;
  }

  /**
   * Render a layer into its off-screen canvas if the cache is invalid.
   * @param {string} name - Layer name
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {object} params - Render parameters for cache invalidation
   * @param {number} dataVersion - Data version counter
   * @param {(ctx: CanvasRenderingContext2D) => void} renderFn - Function that draws the layer
   * @returns {{canvas: HTMLCanvasElement|OffscreenCanvas, wasCached: boolean}}
   */
  render(name, width, height, params, dataVersion, renderFn) {
    if (this.isValid(name, params, dataVersion)) {
      return { canvas: this._layers.get(name).canvas, wasCached: true };
    }

    const layer = this._getLayer(name, width, height);
    if (!layer.ctx) {
      // Canvas not available — render directly without caching
      return { canvas: null, wasCached: false };
    }
    layer.ctx.clearRect(0, 0, width, height);
    renderFn(layer.ctx);
    layer.params = { ...params };
    layer.version = dataVersion;
    return { canvas: layer.canvas, wasCached: false };
  }

  /**
   * Invalidate a specific layer's cache.
   * @param {string} name
   */
  invalidate(name) {
    const layer = this._layers.get(name);
    if (layer) layer.version = -1;
  }

  /** Invalidate all layer caches */
  invalidateAll() {
    for (const layer of this._layers.values()) {
      layer.version = -1;
    }
  }

  /** Clear all cached canvases and free memory */
  clear() {
    this._layers.clear();
  }
}

/** Singleton instance for the app */
export const renderCache = new RenderCache();
