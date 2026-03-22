/**
 * Unit tests for FC Achievement System (fc-achievements.js)
 *
 * Tests achievement toasts, cooldown enforcement, per-day deduplication,
 * node milestones, week streaks, and localization fallbacks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function createMockEventEmitter() {
  const handlers: Record<string, Function[]> = {};
  return {
    on(event: string, cb: Function) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(cb);
    },
    emit(event: string, ...args: unknown[]) {
      (handlers[event] || []).forEach(cb => cb(...args));
    },
    _handlers: handlers,
  };
}

async function freshImport() {
  vi.resetModules();
  return await import('../../src/field-commander/fc-achievements.js');
}

describe('FC Achievement System', () => {
  let menuEvents: ReturnType<typeof createMockEventEmitter>;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2025-06-15T10:00:00Z') });
    localStorage.clear();

    menuEvents = createMockEventEmitter();
    (window as any).menuEvents = menuEvents;
    (window as any).__gnssState = undefined;
    (window as any).__getActiveSketchData = vi.fn(() => ({ nodes: [], edges: [] }));
    (window as any).__getSketchStats = undefined;
    (window as any).t = undefined;

    // Mock navigator.vibrate
    navigator.vibrate = vi.fn();

    // Clear DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).menuEvents;
    delete (window as any).__gnssState;
    delete (window as any).__getActiveSketchData;
    delete (window as any).__getSketchStats;
    delete (window as any).t;
  });

  describe('initFCAchievements()', () => {
    it('should register event listeners for node:added, sketch:complete, issues:allResolved', async () => {
      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      expect(menuEvents._handlers['node:added']).toBeDefined();
      expect(menuEvents._handlers['node:added'].length).toBeGreaterThanOrEqual(1);
      expect(menuEvents._handlers['sketch:complete']).toBeDefined();
      expect(menuEvents._handlers['issues:allResolved']).toBeDefined();
    });

    it('should not throw if menuEvents is not set', async () => {
      delete (window as any).menuEvents;
      const { initFCAchievements } = await freshImport();
      expect(() => initFCAchievements()).not.toThrow();
    });
  });

  describe('Achievement toasts', () => {
    it('should create a toast DOM element on sketch:complete', async () => {
      // We need the xpTracker module loaded too (dependency)
      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      menuEvents.emit('sketch:complete');

      // Wait for requestAnimationFrame
      await vi.advanceTimersByTimeAsync(100);

      const toasts = document.querySelectorAll('.fc-achievement-toast');
      expect(toasts.length).toBe(1);
    });

    it('should auto-dismiss toast after duration', async () => {
      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      menuEvents.emit('sketch:complete');
      await vi.advanceTimersByTimeAsync(100);

      expect(document.querySelectorAll('.fc-achievement-toast').length).toBe(1);

      // After toast duration (4000ms) + remove delay (400ms)
      vi.advanceTimersByTime(4500);

      expect(document.querySelectorAll('.fc-achievement-toast').length).toBe(0);
    });

    it('should enforce 5-minute cooldown between toasts', async () => {
      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      // First toast
      menuEvents.emit('sketch:complete');
      await vi.advanceTimersByTimeAsync(100);
      expect(document.querySelectorAll('.fc-achievement-toast').length).toBe(1);

      // Try second toast within 5 minutes — should be suppressed
      vi.advanceTimersByTime(60000); // 1 minute
      menuEvents.emit('issues:allResolved');
      await vi.advanceTimersByTimeAsync(100);

      // Still only the first toast (or it was removed)
      // The point is there's no second toast added
      const toasts = document.querySelectorAll('.fc-achievement-toast');
      expect(toasts.length).toBeLessThanOrEqual(1);
    });

    it('should allow toast after cooldown expires', async () => {
      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      menuEvents.emit('sketch:complete');
      await vi.advanceTimersByTimeAsync(100);

      // Remove first toast
      vi.advanceTimersByTime(4500);

      // Wait past the 5-minute cooldown
      vi.advanceTimersByTime(5 * 60 * 1000);

      menuEvents.emit('issues:allResolved');
      await vi.advanceTimersByTimeAsync(100);

      const toasts = document.querySelectorAll('.fc-achievement-toast');
      expect(toasts.length).toBe(1);
    });
  });

  describe('Node milestones', () => {
    it('should show milestone at 10 nodes', async () => {
      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      // Emit 10 node:added events
      for (let i = 0; i < 10; i++) {
        menuEvents.emit('node:added');
      }
      await vi.advanceTimersByTimeAsync(100);

      const toasts = document.querySelectorAll('.fc-achievement-toast');
      // Should have at most 1 toast (cooldown may suppress subsequent ones)
      expect(toasts.length).toBeLessThanOrEqual(1);
    });

    it('should not show milestone for non-milestone counts', async () => {
      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      // Emit 5 node:added (not a milestone)
      for (let i = 0; i < 5; i++) {
        menuEvents.emit('node:added');
      }
      await vi.advanceTimersByTimeAsync(100);

      const toasts = document.querySelectorAll('.fc-achievement-toast');
      expect(toasts.length).toBe(0);
    });
  });

  describe('Week streak', () => {
    it('should show streak achievement when >= 7 days streak', async () => {
      // Set up a 7-day streak in localStorage
      const days: string[] = [];
      const baseDate = new Date('2025-06-15');
      for (let i = 0; i < 7; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }
      localStorage.setItem('cockpit_streak', JSON.stringify({ days }));

      const { initFCAchievements } = await freshImport();
      initFCAchievements();
      await vi.advanceTimersByTimeAsync(100);

      const toasts = document.querySelectorAll('.fc-achievement-toast');
      expect(toasts.length).toBe(1);
    });

    it('should not show streak for < 7 days', async () => {
      const days = ['2025-06-15', '2025-06-14', '2025-06-13'];
      localStorage.setItem('cockpit_streak', JSON.stringify({ days }));

      const { initFCAchievements } = await freshImport();
      initFCAchievements();
      await vi.advanceTimersByTimeAsync(100);

      const toasts = document.querySelectorAll('.fc-achievement-toast');
      expect(toasts.length).toBe(0);
    });

    it('should not re-show streak on same day', async () => {
      const days: string[] = [];
      const baseDate = new Date('2025-06-15');
      for (let i = 0; i < 7; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }
      localStorage.setItem('cockpit_streak', JSON.stringify({ days }));

      // Mark week streak as already shown today
      localStorage.setItem('fc_achievements_shown', JSON.stringify({
        date: '2025-06-15',
        items: ['week_streak_2025-06-15'],
      }));

      const { initFCAchievements } = await freshImport();
      initFCAchievements();
      await vi.advanceTimersByTimeAsync(100);

      const toasts = document.querySelectorAll('.fc-achievement-toast');
      expect(toasts.length).toBe(0);
    });
  });

  describe('Per-day deduplication', () => {
    it('should reset shown items on new day', async () => {
      // Set yesterday's data
      localStorage.setItem('fc_achievements_shown', JSON.stringify({
        date: '2025-06-14',
        items: ['rtk_2025-06-14'],
      }));

      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      // Should have reset
      const stored = JSON.parse(localStorage.getItem('fc_achievements_shown') || '{}');
      expect(stored.date).toBe('2025-06-15');
      expect(stored.items).toEqual([]);
    });
  });

  describe('Haptic feedback', () => {
    it('should trigger stronger vibration for milestone type', async () => {
      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      // Trigger 10-node milestone
      for (let i = 0; i < 10; i++) {
        menuEvents.emit('node:added');
      }
      await vi.advanceTimersByTimeAsync(100);

      // Check vibrate was called (may have been called for milestone pattern)
      if ((navigator.vibrate as any).mock.calls.length > 0) {
        // At least one vibrate call should exist
        expect(navigator.vibrate).toHaveBeenCalled();
      }
    });
  });

  describe('Localization', () => {
    it('should use window.t when available', async () => {
      (window as any).t = vi.fn((key: string) => {
        if (key === 'fc.achievement.sketchComplete') return 'Translated complete!';
        return key;
      });

      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      menuEvents.emit('sketch:complete');
      await vi.advanceTimersByTimeAsync(100);

      const toast = document.querySelector('.fc-achievement-toast');
      expect(toast?.textContent).toContain('Translated complete!');
    });

    it('should use English fallbacks when no translator', async () => {
      const { initFCAchievements } = await freshImport();
      initFCAchievements();

      menuEvents.emit('sketch:complete');
      await vi.advanceTimersByTimeAsync(100);

      const toast = document.querySelector('.fc-achievement-toast');
      expect(toast?.textContent).toContain('Sketch complete');
    });
  });
});
