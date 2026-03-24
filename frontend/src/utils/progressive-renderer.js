/**
 * Progressive Renderer — time-budgeted rendering for large datasets.
 *
 * When there are many visible elements, rendering all of them in a single
 * frame can exceed the 16ms budget and cause jank. This module provides
 * a chunked rendering approach that draws elements in priority order
 * (closest to viewport center first) and defers the rest to subsequent frames.
 *
 * Usage:
 *   const pr = new ProgressiveRenderer(8); // 8ms budget
 *   pr.begin(visibleNodes, viewCenterX, viewCenterY);
 *   while (pr.hasMore()) {
 *     const node = pr.next();
 *     drawNode(node);
 *     if (pr.overBudget()) break; // defer remaining to next frame
 *   }
 *   if (pr.hasMore()) scheduleDraw(); // continue next frame
 */

export class ProgressiveRenderer {
  /**
   * @param {number} budgetMs - Maximum time to spend rendering (ms)
   */
  constructor(budgetMs = 8) {
    this._budgetMs = budgetMs;
    this._items = [];
    this._index = 0;
    this._startTime = 0;
    this._complete = true;
  }

  /** Whether the budget has been configured */
  get budget() { return this._budgetMs; }
  set budget(ms) { this._budgetMs = ms; }

  /**
   * Begin a new progressive render pass.
   * Items are sorted by distance to viewport center (nearest first).
   * @param {Array} items - Elements to render
   * @param {number} centerX - Viewport center X (world coords)
   * @param {number} centerY - Viewport center Y (world coords)
   * @param {(item: any) => {x: number, y: number}} [getPos] - Position extractor
   */
  begin(items, centerX, centerY, getPos) {
    this._startTime = performance.now();
    this._index = 0;
    this._complete = false;

    if (items.length <= 500) {
      // Small dataset: render all without sorting overhead
      this._items = items;
      return;
    }

    // For large datasets, prioritize by distance to center.
    // Use a sampling strategy for very large arrays to avoid
    // sorting overhead exceeding the rendering savings.
    if (items.length > 2000) {
      // Pre-compute distance-squared for each item and sort
      const scored = new Array(items.length);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const pos = getPos ? getPos(item) : item;
        const dx = (pos.x || 0) - centerX;
        const dy = (pos.y || 0) - centerY;
        scored[i] = { item, dist: dx * dx + dy * dy };
      }
      scored.sort((a, b) => a.dist - b.dist);
      this._items = scored.map(s => s.item);
    } else {
      this._items = items;
    }
  }

  /** Check if there are more items to render */
  hasMore() { return this._index < this._items.length; }

  /** Get the next item to render */
  next() { return this._items[this._index++]; }

  /** Check if we've exceeded the time budget */
  overBudget() {
    // Check every 32 items to amortize the cost of performance.now()
    if ((this._index & 31) !== 0) return false;
    return (performance.now() - this._startTime) > this._budgetMs;
  }

  /** Mark the current pass as complete */
  finish() {
    this._complete = this._index >= this._items.length;
    return this._complete;
  }

  /** Whether the last pass rendered all items */
  get isComplete() { return this._complete; }

  /** Number of items rendered in the current pass */
  get renderedCount() { return this._index; }

  /** Total items */
  get totalCount() { return this._items.length; }
}

/** Singleton for the main rendering pipeline — budget set at module load */
export const progressiveRenderer = new ProgressiveRenderer(10);

/**
 * Adapt the progressive renderer budget to the current device tier.
 * Call once during app init after device detection has run.
 * @param {number} budgetMs - Frame budget in milliseconds
 */
export function setRenderBudget(budgetMs) {
  progressiveRenderer.budget = budgetMs;
}
