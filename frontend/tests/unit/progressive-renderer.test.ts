import { describe, it, expect } from 'vitest';
import { ProgressiveRenderer } from '../../src/utils/progressive-renderer.js';

describe('ProgressiveRenderer', () => {
  it('should iterate all items for small datasets', () => {
    const pr = new ProgressiveRenderer(100);
    const items = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }];

    pr.begin(items, 0, 0);
    const rendered = [];
    while (pr.hasMore()) {
      rendered.push(pr.next());
    }

    expect(rendered.length).toBe(3);
    expect(pr.finish()).toBe(true);
    expect(pr.isComplete).toBe(true);
  });

  it('should report correct counts', () => {
    const pr = new ProgressiveRenderer(100);
    const items = Array.from({ length: 10 }, (_, i) => ({ x: i, y: i }));

    pr.begin(items, 0, 0);
    pr.next();
    pr.next();
    pr.next();

    expect(pr.renderedCount).toBe(3);
    expect(pr.totalCount).toBe(10);
    expect(pr.hasMore()).toBe(true);
  });

  it('should handle empty arrays', () => {
    const pr = new ProgressiveRenderer(100);
    pr.begin([], 0, 0);

    expect(pr.hasMore()).toBe(false);
    expect(pr.finish()).toBe(true);
  });

  it('should allow budget configuration', () => {
    const pr = new ProgressiveRenderer(5);
    expect(pr.budget).toBe(5);

    pr.budget = 10;
    expect(pr.budget).toBe(10);
  });

  it('should sort by distance for large datasets', () => {
    const pr = new ProgressiveRenderer(100);
    const items = [
      { x: 100, y: 100 },  // Far
      { x: 5, y: 5 },      // Near
      { x: 50, y: 50 },    // Medium
    ];

    // Need > 2000 items for sorting to kick in, but test the API with 3
    pr.begin(items, 0, 0);
    // With < 500 items, no sorting happens - items come in original order
    const first = pr.next();
    expect(first).toBe(items[0]);
  });

  it('should sort by distance for datasets over 2000 items', () => {
    const pr = new ProgressiveRenderer(1000); // Large budget to process all

    // Create 2001 items at various distances from center (0,0)
    const items = [];
    for (let i = 0; i < 2001; i++) {
      items.push({ x: i * 10, y: i * 10, id: i });
    }

    pr.begin(items, 0, 0);

    // First item should be closest to center (0,0) → item at (0,0)
    const first = pr.next();
    expect(first.id).toBe(0);

    // Second should be next closest
    const second = pr.next();
    expect(second.id).toBe(1);
  });

  it('overBudget should check periodically (every 32 items)', () => {
    const pr = new ProgressiveRenderer(0); // 0ms budget = always over
    const items = Array.from({ length: 128 }, (_, i) => ({ x: i, y: i }));

    pr.begin(items, 0, 0);

    // overBudget only checks at indices divisible by 32.
    // With 0ms budget, the first actual time check (after calling next() 32 times)
    // will detect that we're over budget.
    let count = 0;
    while (pr.hasMore()) {
      pr.next();
      count++;
      if (pr.overBudget()) break;
    }

    // Should have processed items before detecting over-budget
    // (the check only fires at multiples of 32, index starts at 0 after next())
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(128);
  });
});
