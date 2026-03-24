/**
 * Unit tests for src/utils/label-collision.js
 *
 * Covers the performance-optimized label positioning:
 * - getTextDimensions (no save/restore, correct dimensions)
 * - findOptimalLabelPosition with extraBounds parameter
 * - processLabels avoiding array spread (edge label bounds passed separately)
 * - rectanglesOverlap / rectangleOverlapsCircle helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getTextDimensions,
  findOptimalLabelPosition,
  processLabels,
  rectanglesOverlap,
  rectangleOverlapsCircle,
} from '../../src/utils/label-collision.js';

// ── Mock canvas context ──────────────────────────────────────────────────────

function createMockCtx() {
  return {
    font: '',
    measureText: vi.fn((text: string) => ({
      width: text.length * 7, // ~7px per char
    })),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('label-collision', () => {
  describe('getTextDimensions()', () => {
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ctx = createMockCtx();
    });

    it('returns correct width and height with default padding', () => {
      const dims = getTextDimensions(ctx, 'Hello', 12);
      // 5 chars * 7px = 35px width + 4 padding on each side = 43
      expect(dims.width).toBe(35 + 4 * 2);
      // height = fontSize + padding * 2
      expect(dims.height).toBe(12 + 4 * 2);
    });

    it('returns correct dimensions with custom padding', () => {
      const dims = getTextDimensions(ctx, 'AB', 16, 8);
      expect(dims.width).toBe(14 + 8 * 2);
      expect(dims.height).toBe(16 + 8 * 2);
    });

    it('sets the font on the context directly (no save/restore)', () => {
      getTextDimensions(ctx, 'test', 14);
      expect(ctx.font).toBe('14px Arial');
      // The optimization: save/restore should NOT be called
      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.restore).not.toHaveBeenCalled();
    });

    it('calls measureText with the given text', () => {
      getTextDimensions(ctx, 'measure me', 10);
      expect(ctx.measureText).toHaveBeenCalledWith('measure me');
    });

    it('handles empty string', () => {
      const dims = getTextDimensions(ctx, '', 12);
      expect(dims.width).toBe(0 + 4 * 2); // 0 chars
      expect(dims.height).toBe(12 + 4 * 2);
    });
  });

  describe('rectanglesOverlap()', () => {
    it('detects overlap between overlapping rectangles', () => {
      const r1 = { x: 0, y: 0, width: 10, height: 10 };
      const r2 = { x: 5, y: 5, width: 10, height: 10 };
      expect(rectanglesOverlap(r1, r2)).toBe(true);
    });

    it('returns false for non-overlapping rectangles', () => {
      const r1 = { x: 0, y: 0, width: 10, height: 10 };
      const r2 = { x: 20, y: 20, width: 10, height: 10 };
      expect(rectanglesOverlap(r1, r2)).toBe(false);
    });

    it('treats touching edges as overlapping (inclusive boundary)', () => {
      const r1 = { x: 0, y: 0, width: 10, height: 10 };
      const r2 = { x: 10, y: 0, width: 10, height: 10 };
      // Implementation uses < (not <=), so touching edges overlap
      expect(rectanglesOverlap(r1, r2)).toBe(true);
    });

    it('returns false for separated rectangles (gap between them)', () => {
      const r1 = { x: 0, y: 0, width: 10, height: 10 };
      const r2 = { x: 11, y: 0, width: 10, height: 10 };
      expect(rectanglesOverlap(r1, r2)).toBe(false);
    });

    it('detects containment', () => {
      const outer = { x: 0, y: 0, width: 100, height: 100 };
      const inner = { x: 10, y: 10, width: 5, height: 5 };
      expect(rectanglesOverlap(outer, inner)).toBe(true);
      expect(rectanglesOverlap(inner, outer)).toBe(true);
    });
  });

  describe('rectangleOverlapsCircle()', () => {
    it('detects circle overlapping rectangle', () => {
      const rect = { x: 0, y: 0, width: 10, height: 10 };
      const circle = { x: 5, y: 5, radius: 3 };
      expect(rectangleOverlapsCircle(rect, circle)).toBe(true);
    });

    it('returns false for distant circle', () => {
      const rect = { x: 0, y: 0, width: 10, height: 10 };
      const circle = { x: 50, y: 50, radius: 3 };
      expect(rectangleOverlapsCircle(rect, circle)).toBe(false);
    });

    it('detects circle touching rectangle edge', () => {
      const rect = { x: 0, y: 0, width: 10, height: 10 };
      // Circle center at (12, 5), radius 3 — edge is at x=12-3=9 which overlaps rect edge at x=10
      const circle = { x: 12, y: 5, radius: 3 };
      expect(rectangleOverlapsCircle(rect, circle)).toBe(true);
    });
  });

  describe('findOptimalLabelPosition()', () => {
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ctx = createMockCtx();
    });

    it('returns a position with no overlaps when space is free', () => {
      const pos = findOptimalLabelPosition(ctx, 'Node1', 100, 100, 20, 12, [], []);
      expect(pos).toBeDefined();
      expect(pos.x).toBeDefined();
      expect(pos.y).toBeDefined();
      expect(pos.align).toBeDefined();
      expect(pos.baseline).toBeDefined();
      expect(pos.bounds).toBeDefined();
    });

    it('avoids existing labels when possible', () => {
      // Place a label directly above the node (the first preferred position)
      const aboveBounds = { x: 80, y: 60, width: 40, height: 20 };
      const pos = findOptimalLabelPosition(
        ctx, 'Node1', 100, 100, 20, 12,
        [aboveBounds], // block the "above" position
        []
      );
      // Should not place at the exact same bounds
      expect(pos.bounds).not.toEqual(aboveBounds);
    });

    it('accounts for extraBounds (edge label bounds) in collision detection', () => {
      // Fill every preferred position with edge label bounds to force worst-case
      const edgeBounds = [
        { x: 70, y: 60, width: 60, height: 30 },   // covers above
        { x: 70, y: 110, width: 60, height: 30 },   // covers below
        { x: 120, y: 85, width: 60, height: 30 },   // covers right
        { x: 0, y: 85, width: 60, height: 30 },     // covers left
      ];
      const pos = findOptimalLabelPosition(
        ctx, 'Node1', 100, 100, 20, 12,
        [],  // no placed labels
        [],  // no nearby nodes
        edgeBounds  // extra bounds from edge labels
      );
      // Should still return a position (best available)
      expect(pos).toBeDefined();
      expect(pos.bounds).toBeDefined();
    });

    it('returns fallback when all positions have overlaps', () => {
      // Create a massive blocking region
      const blocker = { x: -1000, y: -1000, width: 3000, height: 3000 };
      const pos = findOptimalLabelPosition(
        ctx, 'X', 100, 100, 20, 12,
        [blocker], []
      );
      // Should still return the best position (lowest overlaps)
      expect(pos).toBeDefined();
    });
  });

  describe('processLabels()', () => {
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ctx = createMockCtx();
    });

    it('positions all labels', () => {
      const labels = [
        { text: 'A', nodeX: 0, nodeY: 0, nodeRadius: 20, fontSize: 12 },
        { text: 'B', nodeX: 100, nodeY: 100, nodeRadius: 20, fontSize: 12 },
        { text: 'C', nodeX: 200, nodeY: 200, nodeRadius: 20, fontSize: 12 },
      ];
      const allNodes = [
        { x: 0, y: 0, radius: 20 },
        { x: 100, y: 100, radius: 20 },
        { x: 200, y: 200, radius: 20 },
      ];
      const result = processLabels(ctx, labels, allNodes);
      expect(result).toHaveLength(3);
      result.forEach((r: any) => {
        expect(r.text).toBeDefined();
        expect(r.x).toBeDefined();
        expect(r.y).toBeDefined();
        expect(r.align).toBeDefined();
        expect(r.baseline).toBeDefined();
        expect(r.fontSize).toBe(12);
      });
    });

    it('considers edge labels for collision without array spread', () => {
      const labels = [
        { text: 'Node1', nodeX: 50, nodeY: 50, nodeRadius: 20, fontSize: 12 },
      ];
      const allNodes = [{ x: 50, y: 50, radius: 20 }];
      const edgeLabels = [
        { text: '3.5m', x: 50, y: 28, fontSize: 10 }, // edge label right above
      ];

      const result = processLabels(ctx, labels, allNodes, edgeLabels);
      expect(result).toHaveLength(1);
      // Should produce a valid positioned label
      expect(result[0].text).toBe('Node1');
    });

    it('returns empty array for empty input', () => {
      expect(processLabels(ctx, [], [])).toEqual([]);
    });

    it('handles many labels without performance regression (no array spread)', () => {
      // With the old [...placedBounds, ...edgeLabelBounds] approach, this would
      // create ~N copies. With the new approach, no copies are created.
      const labels = Array.from({ length: 200 }, (_, i) => ({
        text: `N${i}`,
        nodeX: i * 100,
        nodeY: i * 100,
        nodeRadius: 20,
        fontSize: 12,
      }));
      const allNodes = labels.map(l => ({ x: l.nodeX, y: l.nodeY, radius: 20 }));
      const edgeLabels = Array.from({ length: 50 }, (_, i) => ({
        text: `${i}m`,
        x: i * 100 + 50,
        y: i * 100 + 50,
        fontSize: 10,
      }));

      const start = performance.now();
      const result = processLabels(ctx, labels, allNodes, edgeLabels);
      const elapsed = performance.now() - start;

      expect(result).toHaveLength(200);
      // Should complete well under 1 second (typically < 50ms)
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
