/**
 * Unit tests for Session Tracker
 *
 * Tests session duration tracking, node/edge deltas, and streak calculation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initSessionTracker, getSessionStats, _resetForTesting } from '../../src/cockpit/session-tracker.js';

function mockSketchData(nodes: unknown[], edges: unknown[]) {
  (window as any).__getActiveSketchData = vi.fn(() => ({ nodes, edges }));
}

function mockDOM() {
  // Create minimal DOM elements the session tracker looks for.
  // sessionNodes/sessionEdges need to be inside .intel-session__row parents
  // so that closest('.intel-session__row') works for show/hide logic.
  for (const id of ['sessionDuration', 'sessionStreak', 'streakCount']) {
    if (!document.getElementById(id)) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
  }
  for (const id of ['sessionNodes', 'sessionEdges']) {
    if (!document.getElementById(id)) {
      const row = document.createElement('div');
      row.className = 'intel-session__row';
      const el = document.createElement('span');
      el.id = id;
      row.appendChild(el);
      document.body.appendChild(row);
    }
  }
}

function cleanupDOM() {
  for (const id of ['sessionDuration', 'sessionStreak', 'streakCount']) {
    document.getElementById(id)?.remove();
  }
  // Remove the row parents for sessionNodes/sessionEdges
  for (const id of ['sessionNodes', 'sessionEdges']) {
    const el = document.getElementById(id);
    const row = el?.closest('.intel-session__row');
    if (row) row.remove();
    else el?.remove();
  }
}

describe('Session Tracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mockDOM();
    (window as any).__getActiveSketchData = undefined;
    (window as any).__getSketchStats = undefined;
    // Mock document.hidden to false so timer callbacks execute in test environment
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
    // Reset module state so each test starts fresh
    _resetForTesting();
  });

  afterEach(() => {
    _resetForTesting();
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanupDOM();
  });

  describe('initSessionTracker', () => {
    it('should capture initial node and edge counts', () => {
      mockSketchData(
        [{ id: '1' }, { id: '2' }],
        [{ id: 'e1' }]
      );
      initSessionTracker();
      const stats = getSessionStats();
      expect(stats.nodesPlaced).toBe(0);
      expect(stats.edgesDrawn).toBe(0);
    });

    it('should handle missing sketch data gracefully', () => {
      initSessionTracker();
      const stats = getSessionStats();
      expect(stats.nodesPlaced).toBe(0);
      expect(stats.edgesDrawn).toBe(0);
    });

    it('should mark today as active in localStorage', () => {
      mockSketchData([], []);
      initSessionTracker();
      const stored = JSON.parse(localStorage.getItem('cockpit_streak') || '{}');
      const today = new Date().toISOString().slice(0, 10);
      expect(stored.days).toContain(today);
    });
  });

  describe('getSessionStats', () => {
    it('should track elapsed seconds', () => {
      mockSketchData([], []);
      initSessionTracker();
      vi.advanceTimersByTime(5000);
      const stats = getSessionStats();
      expect(stats.durationSeconds).toBe(5);
    });

    it('should calculate node delta from init', () => {
      mockSketchData([{ id: '1' }], []);
      initSessionTracker();
      // Simulate adding nodes
      mockSketchData([{ id: '1' }, { id: '2' }, { id: '3' }], []);
      const stats = getSessionStats();
      expect(stats.nodesPlaced).toBe(2);
    });

    it('should calculate edge delta from init', () => {
      mockSketchData([], [{ id: 'e1' }]);
      initSessionTracker();
      mockSketchData([], [{ id: 'e1' }, { id: 'e2' }]);
      const stats = getSessionStats();
      expect(stats.edgesDrawn).toBe(1);
    });

    it('should handle negative deltas (nodes removed)', () => {
      mockSketchData([{ id: '1' }, { id: '2' }], []);
      initSessionTracker();
      mockSketchData([{ id: '1' }], []);
      const stats = getSessionStats();
      expect(stats.nodesPlaced).toBe(-1);
    });
  });

  describe('streak calculation', () => {
    it('should return streak of 1 for today only', () => {
      mockSketchData([], []);
      initSessionTracker();
      const stats = getSessionStats();
      expect(stats.streak).toBe(1);
    });

    it('should count consecutive days', () => {
      const today = new Date();
      const days = [];
      for (let i = 2; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }
      localStorage.setItem('cockpit_streak', JSON.stringify({ days }));
      mockSketchData([], []);
      initSessionTracker();
      const stats = getSessionStats();
      expect(stats.streak).toBe(3);
    });

    it('should allow one freeze day (gap of 1)', () => {
      const today = new Date();
      const days = [];
      // Today, skip yesterday, day before yesterday
      days.push(today.toISOString().slice(0, 10));
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      days.push(twoDaysAgo.toISOString().slice(0, 10));
      localStorage.setItem('cockpit_streak', JSON.stringify({ days }));
      mockSketchData([], []);
      initSessionTracker();
      const stats = getSessionStats();
      // Today (1) + freeze (skip) + 2 days ago (1) = streak of 2
      expect(stats.streak).toBe(2);
    });

    it('should break streak on double gap', () => {
      const today = new Date();
      const days = [];
      days.push(today.toISOString().slice(0, 10));
      // 3 days ago (two day gap)
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      days.push(threeDaysAgo.toISOString().slice(0, 10));
      localStorage.setItem('cockpit_streak', JSON.stringify({ days }));
      mockSketchData([], []);
      initSessionTracker();
      const stats = getSessionStats();
      // Only today counts, streak freeze used on day-1, day-2 breaks it
      expect(stats.streak).toBe(1);
    });

    it('should return 0 with no streak data', () => {
      mockSketchData([], []);
      // Don't initialize — getSessionStats still reads streak
      initSessionTracker();
      // Clear the streak data that init just wrote
      localStorage.removeItem('cockpit_streak');
      const stats = getSessionStats();
      expect(stats.streak).toBe(0);
    });

    it('should limit stored days to 60', () => {
      const days = [];
      const today = new Date();
      // Exclude today (i >= 1) so markDayActive adds it and triggers the trim
      for (let i = 70; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }
      localStorage.setItem('cockpit_streak', JSON.stringify({ days }));
      mockSketchData([], []);
      initSessionTracker();
      const stored = JSON.parse(localStorage.getItem('cockpit_streak') || '{}');
      expect(stored.days.length).toBeLessThanOrEqual(60);
    });
  });

  describe('display update', () => {
    it('should update duration display each second', () => {
      mockSketchData([], []);
      initSessionTracker();
      vi.advanceTimersByTime(65000); // 65 seconds
      const el = document.getElementById('sessionDuration');
      expect(el?.textContent).toBe('1:05');
    });

    it('should show node delta in display', () => {
      mockSketchData([{ id: '1' }], []);
      initSessionTracker();
      // Simulate adding a node after 61 seconds (past "New session" phase)
      vi.advanceTimersByTime(61000);
      mockSketchData([{ id: '1' }, { id: '2' }], []);
      vi.advanceTimersByTime(1000); // Trigger another display update
      const el = document.getElementById('sessionNodes');
      // Current code shows String(nodeDiff) without "+" prefix
      expect(el?.textContent).toBe('1');
    });
  });
});
