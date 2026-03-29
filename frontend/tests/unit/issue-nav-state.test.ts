/**
 * Unit tests for Issue Navigation State
 *
 * Tests the pure state machine for navigating through sketch issues:
 * setIssueContext, next/prev, wraparound, listeners, clear.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use dynamic imports with vi.resetModules() to get fresh module-level state per test
async function freshModule() {
  vi.resetModules();
  return await import('../../src/project/issue-nav-state.js');
}

function makeNode(id: string, overrides: Record<string, unknown> = {}) {
  return { id, x: 100, y: 100, ...overrides };
}

function makeEdge(id: string, tail: string, head: string, overrides: Record<string, unknown> = {}) {
  return { id, tail, head, ...overrides };
}

describe('Issue Navigation State', () => {
  beforeEach(() => {
    // Mock window globals that navigateToCurrentIssue uses
    (window as any).__getStretch = () => ({ x: 0.6, y: 1 });
    (window as any).__setViewState = vi.fn();
    (window as any).__scheduleDraw = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setIssueContext', () => {
    it('should populate issues from nodes and edges', async () => {
      const mod = await freshModule();
      const nodes = [makeNode('1'), makeNode('2')]; // missing coords
      mod.setIssueContext('sk1', nodes, []);
      const state = mod.getNavState();
      expect(state.sketchId).toBe('sk1');
      expect(state.total).toBeGreaterThan(0);
      expect(state.currentIndex).toBe(0);
    });

    it('should set currentIndex to -1 when no issues', async () => {
      const mod = await freshModule();
      // Node needs surveyX/Y AND tl to avoid missing_tl issue
      const nodes = [makeNode('1', { surveyX: 1, surveyY: 2, tl: '1.5' })];
      mod.setIssueContext('sk1', nodes, []);
      const state = mod.getNavState();
      expect(state.total).toBe(0);
      expect(state.currentIndex).toBe(-1);
      expect(state.current).toBeNull();
    });
  });

  describe('nextIssue / prevIssue', () => {
    it('should advance to next issue', async () => {
      const mod = await freshModule();
      const nodes = [makeNode('1'), makeNode('2'), makeNode('3')];
      mod.setIssueContext('sk1', nodes, []);
      expect(mod.getNavState().currentIndex).toBe(0);

      mod.nextIssue();
      expect(mod.getNavState().currentIndex).toBe(1);
    });

    it('should wrap around from last to first', async () => {
      const mod = await freshModule();
      const nodes = [makeNode('1'), makeNode('2')];
      mod.setIssueContext('sk1', nodes, []);
      const total = mod.getNavState().total;

      // Advance to last
      for (let i = 0; i < total - 1; i++) mod.nextIssue();
      expect(mod.getNavState().currentIndex).toBe(total - 1);

      // Next should wrap to 0
      mod.nextIssue();
      expect(mod.getNavState().currentIndex).toBe(0);
    });

    it('should go backwards with prevIssue', async () => {
      const mod = await freshModule();
      const nodes = [makeNode('1'), makeNode('2'), makeNode('3')];
      mod.setIssueContext('sk1', nodes, []);

      mod.nextIssue(); // index 1
      mod.prevIssue(); // back to 0
      expect(mod.getNavState().currentIndex).toBe(0);
    });

    it('should wrap prevIssue from first to last', async () => {
      const mod = await freshModule();
      const nodes = [makeNode('1'), makeNode('2')];
      mod.setIssueContext('sk1', nodes, []);
      expect(mod.getNavState().currentIndex).toBe(0);

      mod.prevIssue();
      expect(mod.getNavState().currentIndex).toBe(mod.getNavState().total - 1);
    });

    it('should return null when no issues', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1', { surveyX: 1, surveyY: 2, tl: '1.5' })], []);
      expect(mod.nextIssue()).toBeNull();
      expect(mod.prevIssue()).toBeNull();
    });

    it('should return the new current issue', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1'), makeNode('2')], []);
      const issue = mod.nextIssue();
      expect(issue).not.toBeNull();
      expect(issue).toBe(mod.getNavState().current);
    });
  });

  describe('setCurrentIndex', () => {
    it('should set index to valid value', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1'), makeNode('2'), makeNode('3')], []);
      mod.setCurrentIndex(2);
      expect(mod.getNavState().currentIndex).toBe(2);
    });

    it('should ignore out-of-bounds index', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1')], []);
      mod.setCurrentIndex(5);
      expect(mod.getNavState().currentIndex).toBe(0); // unchanged
    });

    it('should ignore negative index', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1')], []);
      mod.setCurrentIndex(-1);
      expect(mod.getNavState().currentIndex).toBe(0);
    });
  });

  describe('refreshIssues', () => {
    it('should update issue list without resetting index', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1'), makeNode('2'), makeNode('3')], []);
      mod.setCurrentIndex(2);

      // Refresh with same issues
      mod.refreshIssues([makeNode('1'), makeNode('2'), makeNode('3')], []);
      expect(mod.getNavState().currentIndex).toBe(2);
    });

    it('should clamp index if issues shrink', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1'), makeNode('2'), makeNode('3')], []);
      mod.setCurrentIndex(2);

      // Refresh with fewer issues (node '1' fully resolved with tl)
      mod.refreshIssues([makeNode('1', { surveyX: 1, surveyY: 2, tl: '1.5' }), makeNode('2')], []);
      // Only 1 issue now, index should clamp to 0
      expect(mod.getNavState().currentIndex).toBeLessThan(2);
    });

    it('should set index to -1 if all issues resolved', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1')], []);
      expect(mod.getNavState().currentIndex).toBe(0);

      // Node needs surveyX/Y AND tl to have zero issues
      mod.refreshIssues([makeNode('1', { surveyX: 1, surveyY: 2, tl: '1.5' })], []);
      expect(mod.getNavState().currentIndex).toBe(-1);
      expect(mod.getNavState().total).toBe(0);
    });
  });

  describe('clearNavState', () => {
    it('should reset all state', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1')], []);
      mod.clearNavState();
      const state = mod.getNavState();
      expect(state.sketchId).toBeNull();
      expect(state.issues).toEqual([]);
      expect(state.currentIndex).toBe(-1);
      expect(state.total).toBe(0);
    });
  });

  describe('onNavStateChange', () => {
    it('should notify listeners on state change', async () => {
      const mod = await freshModule();
      const listener = vi.fn();
      mod.onNavStateChange(listener);
      mod.setIssueContext('sk1', [makeNode('1')], []);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        sketchId: 'sk1',
        total: expect.any(Number),
      }));
    });

    it('should return unsubscribe function', async () => {
      const mod = await freshModule();
      const listener = vi.fn();
      const unsub = mod.onNavStateChange(listener);
      mod.setIssueContext('sk1', [makeNode('1')], []);
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      mod.clearNavState();
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });

    it('should notify on next/prev', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1'), makeNode('2')], []);
      const listener = vi.fn();
      mod.onNavStateChange(listener);

      mod.nextIssue();
      expect(listener).toHaveBeenCalledTimes(1);

      mod.prevIssue();
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('getNavState', () => {
    it('should return current issue in state', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1'), makeNode('2')], []);
      const state = mod.getNavState();
      expect(state.current).not.toBeNull();
      expect(state.current!.type).toBe('missing_coords');
    });

    it('should return null current when no issues', async () => {
      const mod = await freshModule();
      const state = mod.getNavState();
      expect(state.current).toBeNull();
    });
  });
});
