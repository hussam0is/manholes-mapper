/**
 * Unit tests for FC XP Tracker (fc-xp.js)
 *
 * Tests XP award calculations, combo multiplier, storage persistence,
 * display updates, and event wiring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to create a mock event emitter
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
  return await import('../../src/field-commander/fc-xp.js');
}

describe('XP Tracker', () => {
  let menuEvents: ReturnType<typeof createMockEventEmitter>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();

    menuEvents = createMockEventEmitter();
    (window as any).menuEvents = menuEvents;
    (window as any).__gnssState = undefined;
    (window as any).__createNodeFromMeasurement = undefined;
    (window as any).t = undefined;

    // Remove any existing XP badge from previous tests
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).menuEvents;
    delete (window as any).__gnssState;
    delete (window as any).__createNodeFromMeasurement;
    delete (window as any).t;
  });

  describe('xpTracker.award()', () => {
    it('should award base XP for known actions (no combo)', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();

      // Test each action independently with time gaps to avoid combo
      expect(xpTracker.award('node_placed')).toBe(10);
      vi.advanceTimersByTime(31000);
      expect(xpTracker.award('edge_drawn')).toBe(5);
      vi.advanceTimersByTime(31000);
      expect(xpTracker.award('gps_capture')).toBe(25);
      vi.advanceTimersByTime(31000);
      expect(xpTracker.award('rtk_capture')).toBe(50);
      vi.advanceTimersByTime(31000);
      expect(xpTracker.award('measurement_filled')).toBe(15);
      vi.advanceTimersByTime(31000);
      expect(xpTracker.award('issue_resolved')).toBe(30);
    });

    it('should return 0 for unknown actions', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();

      expect(xpTracker.award('nonexistent_action')).toBe(0);
      expect(xpTracker.sessionXP).toBe(0);
    });

    it('should award 200 XP for sketch_complete', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();

      // Need to advance time to avoid combo from any prior action
      vi.advanceTimersByTime(31000);
      expect(xpTracker.award('sketch_complete')).toBe(200);
    });

    it('should accumulate session XP', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();

      xpTracker.award('node_placed'); // 10
      vi.advanceTimersByTime(31000); // reset combo
      xpTracker.award('edge_drawn'); // 5
      vi.advanceTimersByTime(31000);
      expect(xpTracker.sessionXP).toBe(15);
    });

    it('should accumulate total XP across init calls', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();
      xpTracker.award('node_placed'); // 10
      vi.advanceTimersByTime(31000);
      xpTracker.save();

      // Re-init (simulates new session)
      xpTracker.init();
      expect(xpTracker.totalXP).toBe(10);
      expect(xpTracker.sessionXP).toBe(0);

      xpTracker.award('node_placed'); // 10
      expect(xpTracker.totalXP).toBe(20);
    });
  });

  describe('Combo multiplier', () => {
    it('should increase combo for rapid actions within 30s', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();

      // First action — no combo
      const xp1 = xpTracker.award('node_placed'); // 10 * 1.0 = 10
      expect(xp1).toBe(10);
      expect(xpTracker.comboCount).toBe(0);

      // Second action within 30s — combo starts
      vi.advanceTimersByTime(5000);
      const xp2 = xpTracker.award('node_placed'); // 10 * 1.2 = 12
      expect(xp2).toBe(12);
      expect(xpTracker.comboCount).toBe(1);

      // Third action within 30s
      vi.advanceTimersByTime(5000);
      const xp3 = xpTracker.award('node_placed'); // 10 * 1.4 = 14
      expect(xp3).toBe(14);
      expect(xpTracker.comboCount).toBe(2);
    });

    it('should cap combo at 5 (2x multiplier)', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();

      // Rapid-fire 7 actions
      for (let i = 0; i < 7; i++) {
        xpTracker.award('node_placed');
        vi.advanceTimersByTime(1000);
      }

      expect(xpTracker.comboCount).toBe(5);
      expect(xpTracker.getComboMultiplier()).toBe(2.0);
    });

    it('should reset combo after 30s gap', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();

      xpTracker.award('node_placed');
      vi.advanceTimersByTime(5000);
      xpTracker.award('node_placed');
      expect(xpTracker.comboCount).toBe(1);

      // Wait > 30s
      vi.advanceTimersByTime(31000);
      xpTracker.award('node_placed');
      expect(xpTracker.comboCount).toBe(0);
      expect(xpTracker.getComboMultiplier()).toBe(1.0);
    });
  });

  describe('getComboMultiplier()', () => {
    it('should return 1.0 at combo 0', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.comboCount = 0;
      expect(xpTracker.getComboMultiplier()).toBe(1.0);
    });

    it('should return correct multiplier for each combo level', async () => {
      const { xpTracker } = await freshImport();

      xpTracker.comboCount = 1;
      expect(xpTracker.getComboMultiplier()).toBeCloseTo(1.2);

      xpTracker.comboCount = 3;
      expect(xpTracker.getComboMultiplier()).toBeCloseTo(1.6);

      xpTracker.comboCount = 5;
      expect(xpTracker.getComboMultiplier()).toBeCloseTo(2.0);
    });
  });

  describe('getStats()', () => {
    it('should return current stats', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();

      xpTracker.award('node_placed');
      const stats = xpTracker.getStats();

      expect(stats).toEqual({
        sessionXP: 10,
        totalXP: 10,
        comboCount: 0,
        multiplier: 1.0,
      });
    });
  });

  describe('save() and init()', () => {
    it('should persist totalXP to localStorage', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();
      xpTracker.award('node_placed');
      xpTracker.save();

      expect(localStorage.getItem('fc_total_xp')).toBe('10');
    });

    it('should load totalXP from localStorage on init', async () => {
      localStorage.setItem('fc_total_xp', '500');

      const { xpTracker } = await freshImport();
      xpTracker.init();

      expect(xpTracker.totalXP).toBe(500);
      expect(xpTracker.sessionXP).toBe(0);
    });

    it('should handle corrupt localStorage gracefully', async () => {
      localStorage.setItem('fc_total_xp', 'not-a-number');

      const { xpTracker } = await freshImport();
      xpTracker.init();

      // parseInt('not-a-number') returns NaN
      expect(xpTracker.totalXP).toBeNaN();
    });
  });

  describe('updateDisplay()', () => {
    it('should update XP badge element if present', async () => {
      document.body.innerHTML = '<span id="fcXpBadge">0 XP</span>';

      const { xpTracker } = await freshImport();
      xpTracker.init();
      xpTracker.award('node_placed');

      const badge = document.getElementById('fcXpBadge')!;
      expect(badge.textContent).toBe('10 XP');
    });

    it('should add fc-xp-bump class when XP > 0', async () => {
      document.body.innerHTML = '<span id="fcXpBadge">0 XP</span>';

      const { xpTracker } = await freshImport();
      xpTracker.init();
      xpTracker.award('node_placed');

      const badge = document.getElementById('fcXpBadge')!;
      expect(badge.classList.contains('fc-xp-bump')).toBe(true);
    });

    it('should not throw if badge element is missing', async () => {
      const { xpTracker } = await freshImport();
      xpTracker.init();

      expect(() => xpTracker.award('node_placed')).not.toThrow();
    });
  });

  describe('initXPTracker() — event wiring', () => {
    it('should wire node:added to award node_placed XP', async () => {
      document.body.innerHTML = '<span id="fcXpBadge">0 XP</span>';
      // Mock vibrate
      navigator.vibrate = vi.fn();

      const { initXPTracker, xpTracker } = await freshImport();
      initXPTracker();

      menuEvents.emit('node:added');
      expect(xpTracker.sessionXP).toBe(10);
    });

    it('should wire edge:added to award edge_drawn XP', async () => {
      const { initXPTracker, xpTracker } = await freshImport();
      initXPTracker();

      vi.advanceTimersByTime(31000); // avoid combo
      menuEvents.emit('edge:added');
      expect(xpTracker.sessionXP).toBeGreaterThanOrEqual(5);
    });

    it('should wire sketch:complete to award sketch_complete XP', async () => {
      const { initXPTracker, xpTracker } = await freshImport();
      initXPTracker();

      vi.advanceTimersByTime(31000);
      menuEvents.emit('sketch:complete');
      expect(xpTracker.sessionXP).toBeGreaterThanOrEqual(200);
    });

    it('should wire measurement:filled to award measurement_filled XP', async () => {
      const { initXPTracker, xpTracker } = await freshImport();
      initXPTracker();

      vi.advanceTimersByTime(31000);
      menuEvents.emit('measurement:filled');
      expect(xpTracker.sessionXP).toBeGreaterThanOrEqual(15);
    });
  });
});
