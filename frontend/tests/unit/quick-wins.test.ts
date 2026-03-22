/**
 * Unit tests for Quick-Win Notification System
 *
 * Tests milestone detection, cooldown enforcement, message localization,
 * and localStorage state management.
 *
 * Uses vi.resetModules() + dynamic import to get fresh module state per test,
 * since quick-wins.js uses module-level variables (cooldown timer, counters).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// EventEmitter mock
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

async function freshInitQuickWins() {
  vi.resetModules();
  const mod = await import('../../src/cockpit/quick-wins.js');
  mod.initQuickWins();
  return mod;
}

describe('Quick Wins', () => {
  let menuEvents: ReturnType<typeof createMockEventEmitter>;
  let gnssState: ReturnType<typeof createMockEventEmitter>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();

    menuEvents = createMockEventEmitter();
    gnssState = createMockEventEmitter();

    (window as any).menuEvents = menuEvents;
    (window as any).__gnssState = gnssState;
    (window as any).t = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    (window as any).menuEvents = undefined;
    (window as any).__gnssState = undefined;
    document.querySelectorAll('.quick-win-toast').forEach(el => el.remove());
  });

  describe('initQuickWins', () => {
    it('should register event listeners on menuEvents', async () => {
      await freshInitQuickWins();
      expect(menuEvents._handlers['node:added']).toHaveLength(1);
      expect(menuEvents._handlers['sketch:complete']).toHaveLength(1);
      expect(menuEvents._handlers['issues:allResolved']).toHaveLength(1);
    });

    it('should register RTK position listener on gnssState', async () => {
      await freshInitQuickWins();
      expect(gnssState._handlers['position']).toHaveLength(1);
    });

    it('should handle missing menuEvents gracefully', async () => {
      (window as any).menuEvents = undefined;
      await expect(freshInitQuickWins()).resolves.not.toThrow();
    });

    it('should handle missing gnssState gracefully', async () => {
      (window as any).__gnssState = undefined;
      await expect(freshInitQuickWins()).resolves.not.toThrow();
    });
  });

  describe('node milestones', () => {
    it('should show toast at 10-node milestone', async () => {
      await freshInitQuickWins();
      for (let i = 0; i < 10; i++) {
        menuEvents.emit('node:added');
      }
      const toasts = document.querySelectorAll('.quick-win-toast');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toContain('10');
    });

    it('should not show toast before milestone', async () => {
      await freshInitQuickWins();
      for (let i = 0; i < 9; i++) {
        menuEvents.emit('node:added');
      }
      expect(document.querySelectorAll('.quick-win-toast').length).toBe(0);
    });

    it('should respect 5-minute cooldown between milestones', async () => {
      await freshInitQuickWins();
      let totalToastsCreated = 0;
      const origAppendChild = document.body.appendChild.bind(document.body);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => {
        if ((node as Element).classList?.contains('quick-win-toast')) totalToastsCreated++;
        return origAppendChild(node);
      });

      // Hit 10-node milestone
      for (let i = 0; i < 10; i++) {
        menuEvents.emit('node:added');
      }
      expect(totalToastsCreated).toBe(1);

      // Try to hit 25-node milestone within cooldown
      for (let i = 0; i < 15; i++) {
        menuEvents.emit('node:added');
      }
      expect(totalToastsCreated).toBe(1); // Still 1 — cooldown blocked it

      // Advance past cooldown
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Hit 50 milestone
      for (let i = 0; i < 25; i++) {
        menuEvents.emit('node:added');
      }
      expect(totalToastsCreated).toBe(2); // Now a second toast was created
    });
  });

  describe('sketch:complete event', () => {
    it('should show toast on sketch complete', async () => {
      await freshInitQuickWins();
      menuEvents.emit('sketch:complete');
      const toasts = document.querySelectorAll('.quick-win-toast');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toContain('complete');
    });
  });

  describe('issues:allResolved event', () => {
    it('should show toast when all issues resolved', async () => {
      await freshInitQuickWins();
      menuEvents.emit('issues:allResolved');
      const toasts = document.querySelectorAll('.quick-win-toast');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toContain('resolved');
    });
  });

  describe('RTK notification', () => {
    it('should show toast on first RTK fixed position', async () => {
      await freshInitQuickWins();
      gnssState.emit('position', { fixQuality: 4 });
      const toasts = document.querySelectorAll('.quick-win-toast');
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toContain('RTK');
    });

    it('should not show toast for non-RTK positions', async () => {
      await freshInitQuickWins();
      gnssState.emit('position', { fixQuality: 1 });
      expect(document.querySelectorAll('.quick-win-toast').length).toBe(0);
    });

    it('should only show RTK toast once per day', async () => {
      await freshInitQuickWins();
      let totalToastsCreated = 0;
      const origAppendChild = document.body.appendChild.bind(document.body);
      vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => {
        if ((node as Element).classList?.contains('quick-win-toast')) totalToastsCreated++;
        return origAppendChild(node);
      });

      gnssState.emit('position', { fixQuality: 4 });
      expect(totalToastsCreated).toBe(1);

      // Advance past cooldown
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Second RTK fix same day — firstRtkToday flag prevents it
      gnssState.emit('position', { fixQuality: 4 });
      expect(totalToastsCreated).toBe(1); // Still only 1
    });

    it('should persist shown state in localStorage', async () => {
      await freshInitQuickWins();
      gnssState.emit('position', { fixQuality: 4 });
      const stored = JSON.parse(localStorage.getItem('cockpit_quickwins_shown') || '{}');
      const today = new Date().toISOString().slice(0, 10);
      expect(stored.date).toBe(today);
      expect(stored.items.length).toBeGreaterThan(0);
    });
  });

  describe('toast cleanup', () => {
    it('should auto-remove toast after timeout', async () => {
      await freshInitQuickWins();
      menuEvents.emit('sketch:complete');
      expect(document.querySelectorAll('.quick-win-toast').length).toBe(1);

      // 4s display + 400ms fade
      vi.advanceTimersByTime(4500);
      expect(document.querySelectorAll('.quick-win-toast').length).toBe(0);
    });
  });

  describe('XSS protection', () => {
    it('should escape HTML in toast content', async () => {
      (window as any).t = () => '<script>alert("xss")</script>';
      await freshInitQuickWins();
      menuEvents.emit('sketch:complete');
      const toast = document.querySelector('.quick-win-toast');
      expect(toast).not.toBeNull();
      expect(toast!.innerHTML).not.toContain('<script>');
      expect(toast!.innerHTML).toContain('&lt;script&gt;');
    });
  });

  describe('fallback messages', () => {
    it('should use English fallbacks when no translator', async () => {
      (window as any).t = undefined;
      await freshInitQuickWins();
      menuEvents.emit('sketch:complete');
      const toast = document.querySelector('.quick-win-toast');
      expect(toast).not.toBeNull();
      expect(toast!.textContent).toContain('Sketch complete');
    });

    it('should use fallback when translator returns key unchanged', async () => {
      (window as any).t = (key: string) => key;
      await freshInitQuickWins();
      menuEvents.emit('issues:allResolved');
      const toast = document.querySelector('.quick-win-toast');
      expect(toast).not.toBeNull();
      expect(toast!.textContent).toContain('All issues resolved');
    });
  });
});
