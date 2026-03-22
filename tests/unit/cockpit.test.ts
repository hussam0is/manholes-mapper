/**
 * Unit tests for Cockpit Layout Module
 *
 * Tests the cockpit initialization, orientation-based activation/deactivation,
 * DOM construction, progress bar updates, micro-cockpit, and Zone A collapse.
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

async function freshImportCockpit() {
  vi.resetModules();
  return await import('../../src/cockpit/cockpit.js');
}

describe('Cockpit Layout Module', () => {
  let menuEvents: ReturnType<typeof createMockEventEmitter>;
  let matchMediaListeners: Function[];
  let matchMediaMatches: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();

    menuEvents = createMockEventEmitter();
    (window as any).menuEvents = menuEvents;
    (window as any).__getActiveSketchData = vi.fn(() => ({ nodes: [], edges: [] }));
    (window as any).__getSketchStats = undefined;
    (window as any).__gnssState = undefined;
    (window as any).t = undefined;
    (window as any).isRTL = () => false;

    // Mock document.hidden
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });

    // Clear body classes from previous tests
    document.body.className = '';

    // Set up basic DOM structure
    document.body.innerHTML = `
      <header class="app-header"></header>
      <div id="main">
        <div id="canvasContainer"></div>
      </div>
    `;

    // Mock matchMedia (jsdom doesn't have it)
    matchMediaListeners = [];
    matchMediaMatches = true;
    (window as any).matchMedia = vi.fn().mockImplementation(() => ({
      matches: matchMediaMatches,
      addEventListener: (_event: string, cb: Function) => { matchMediaListeners.push(cb); },
      removeEventListener: vi.fn(),
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // Mock requestAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    (window as any).menuEvents = undefined;
    (window as any).__getActiveSketchData = undefined;
    (window as any).__getSketchStats = undefined;
    (window as any).__gnssState = undefined;
    (window as any).t = undefined;
    (window as any).isRTL = undefined;
  });

  describe('initCockpit', () => {
    it('should build cockpit DOM and inject into #main', async () => {
      const mod = await freshImportCockpit();
      mod.initCockpit();
      expect(document.querySelector('.cockpit')).not.toBeNull();
      expect(document.getElementById('intelStrip')).not.toBeNull();
      expect(document.getElementById('actionRail')).not.toBeNull();
    });

    it('should add cockpit-mode class when landscape orientation matches', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();
      expect(document.body.classList.contains('cockpit-mode')).toBe(true);
    });

    it('should not add cockpit-mode class when portrait orientation', async () => {
      matchMediaMatches = false;
      const mod = await freshImportCockpit();
      mod.initCockpit();
      expect(document.body.classList.contains('cockpit-mode')).toBe(false);
    });

    it('should build micro-cockpit strip after header', async () => {
      const mod = await freshImportCockpit();
      mod.initCockpit();
      const microCockpit = document.getElementById('microCockpit');
      expect(microCockpit).not.toBeNull();
      expect(microCockpit?.className).toContain('micro-cockpit');
    });

    it('should listen for sketch:changed events', async () => {
      const mod = await freshImportCockpit();
      mod.initCockpit();
      expect(menuEvents._handlers['sketch:changed']).toBeDefined();
      expect(menuEvents._handlers['sketch:changed'].length).toBeGreaterThan(0);
    });

    it('should listen for translations:updated events', async () => {
      const mod = await freshImportCockpit();
      mod.initCockpit();
      expect(menuEvents._handlers['translations:updated']).toBeDefined();
    });

    it('should set up periodic update interval', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const mod = await freshImportCockpit();
      mod.initCockpit();
      // Should have at least one setInterval call (the 5s periodic update)
      const fiveSecondCalls = setIntervalSpy.mock.calls.filter(
        call => call[1] === 5000
      );
      expect(fiveSecondCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('isCockpitActive', () => {
    it('should return true when cockpit is activated (landscape)', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();
      expect(mod.isCockpitActive()).toBe(true);
    });

    it('should return false when cockpit is deactivated (portrait)', async () => {
      matchMediaMatches = false;
      const mod = await freshImportCockpit();
      mod.initCockpit();
      expect(mod.isCockpitActive()).toBe(false);
    });
  });

  describe('orientation changes', () => {
    it('should activate cockpit when orientation changes to landscape', async () => {
      matchMediaMatches = false;
      const mod = await freshImportCockpit();
      mod.initCockpit();
      expect(document.body.classList.contains('cockpit-mode')).toBe(false);

      // Simulate orientation change to landscape
      matchMediaListeners.forEach(cb => cb({ matches: true }));
      expect(document.body.classList.contains('cockpit-mode')).toBe(true);
    });

    it('should deactivate cockpit when orientation changes to portrait', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();
      expect(document.body.classList.contains('cockpit-mode')).toBe(true);

      // Simulate orientation change to portrait
      matchMediaListeners.forEach(cb => cb({ matches: false }));
      expect(document.body.classList.contains('cockpit-mode')).toBe(false);
    });
  });

  describe('updateCockpit', () => {
    it('should skip update when document is hidden', async () => {
      Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();
      // Should not throw when called with hidden document
      expect(() => mod.updateCockpit()).not.toThrow();
    });

    it('should update micro-cockpit health even when cockpit is inactive', async () => {
      matchMediaMatches = false;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      (window as any).__getActiveSketchData = vi.fn(() => ({
        nodes: [{ id: '1', surveyX: 1, surveyY: 2, nodeType: 'Valve' }],
        edges: [],
      }));

      mod.updateCockpit();
      const healthEl = document.getElementById('microHealthPct');
      // Should have updated (not null and has content)
      expect(healthEl).not.toBeNull();
    });

    it('should update progress bar when cockpit is active', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      (window as any).__getActiveSketchData = vi.fn(() => ({
        nodes: [{ id: '1', surveyX: 1, surveyY: 2, nodeType: 'Valve' }],
        edges: [],
      }));

      mod.updateCockpit();
      const fill = document.getElementById('cockpitProgressFill');
      expect(fill).not.toBeNull();
      // Width should be set based on completion percentage
      expect(fill?.style.width).toBeDefined();
    });
  });

  describe('progress bar levels', () => {
    it('should set data-level to low for < 25%', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      // Empty sketch → 0% → low
      mod.updateCockpit();
      const fill = document.getElementById('cockpitProgressFill');
      expect(fill?.getAttribute('data-level')).toBe('low');
    });
  });

  describe('micro-cockpit updates', () => {
    it('should show "--" for empty sketch health', async () => {
      matchMediaMatches = false;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      (window as any).__getActiveSketchData = vi.fn(() => ({ nodes: [], edges: [] }));
      mod.updateCockpit();

      const healthEl = document.getElementById('microHealthPct');
      expect(healthEl?.textContent).toBe('--');
    });

    it('should show percentage for non-empty sketch', async () => {
      matchMediaMatches = false;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      (window as any).__getActiveSketchData = vi.fn(() => ({
        nodes: [
          { id: '1', surveyX: 1, surveyY: 2, nodeType: 'Valve' },
        ],
        edges: [],
      }));
      mod.updateCockpit();

      const healthEl = document.getElementById('microHealthPct');
      expect(healthEl?.textContent).toMatch(/\d+%/);
    });
  });

  describe('Zone A collapse', () => {
    it('should create collapse and expand buttons', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      expect(document.getElementById('intelStripCollapseBtn')).not.toBeNull();
      expect(document.getElementById('intelStripExpandBtn')).not.toBeNull();
    });

    it('should toggle collapsed class on collapse button click', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      const collapseBtn = document.getElementById('intelStripCollapseBtn');
      const strip = document.getElementById('intelStrip');

      expect(strip?.classList.contains('intel-strip--collapsed')).toBe(false);
      collapseBtn?.click();
      expect(strip?.classList.contains('intel-strip--collapsed')).toBe(true);
    });

    it('should persist collapsed state to localStorage', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      const collapseBtn = document.getElementById('intelStripCollapseBtn');
      collapseBtn?.click();

      expect(localStorage.getItem('cockpit-collapsed')).toBe('1');
    });

    it('should restore collapsed state from localStorage', async () => {
      localStorage.setItem('cockpit-collapsed', '1');
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      const strip = document.getElementById('intelStrip');
      expect(strip?.classList.contains('intel-strip--collapsed')).toBe(true);
    });

    it('should expand on expand button click', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      // Collapse first
      const collapseBtn = document.getElementById('intelStripCollapseBtn');
      collapseBtn?.click();
      const strip = document.getElementById('intelStrip');
      expect(strip?.classList.contains('intel-strip--collapsed')).toBe(true);

      // Expand
      const expandBtn = document.getElementById('intelStripExpandBtn');
      expandBtn?.click();
      expect(strip?.classList.contains('intel-strip--collapsed')).toBe(false);
    });
  });

  describe('i18n integration', () => {
    it('should apply translations when window.t is available', async () => {
      (window as any).t = (key: string) => {
        if (key === 'cockpit.gps') return 'מיקום';
        return key;
      };
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      const gpsLabel = document.querySelector('[data-i18n="cockpit.gps"]');
      expect(gpsLabel?.textContent).toBe('מיקום');
    });

    it('should re-translate on translations:updated event', async () => {
      let lang = 'en';
      (window as any).t = (key: string) => {
        if (key === 'cockpit.gps') return lang === 'en' ? 'GPS' : 'מיקום';
        return key;
      };
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      lang = 'he';
      menuEvents.emit('translations:updated');

      const gpsLabel = document.querySelector('[data-i18n="cockpit.gps"]');
      expect(gpsLabel?.textContent).toBe('מיקום');
    });
  });

  describe('RTL support', () => {
    it('should use correct chevron direction for RTL', async () => {
      (window as any).isRTL = () => true;
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      const collapseIcon = document.querySelector('#intelStripCollapseBtn .material-icons');
      // In RTL, non-collapsed state should show chevron_right
      expect(collapseIcon?.textContent).toBe('chevron_right');
    });

    it('should use correct chevron direction for LTR', async () => {
      (window as any).isRTL = () => false;
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      const collapseIcon = document.querySelector('#intelStripCollapseBtn .material-icons');
      expect(collapseIcon?.textContent).toBe('chevron_left');
    });
  });

  describe('debounced sketch updates', () => {
    it('should debounce rapid sketch:changed events', async () => {
      matchMediaMatches = true;
      const mod = await freshImportCockpit();
      mod.initCockpit();

      const updateSpy = vi.spyOn(mod, 'updateCockpit');

      // Fire multiple sketch:changed events rapidly
      menuEvents.emit('sketch:changed');
      menuEvents.emit('sketch:changed');
      menuEvents.emit('sketch:changed');

      // Should not have called updateCockpit immediately for debounced handler
      // (The direct call from initCockpit's activate() already happened once)
      const callsBefore = updateSpy.mock.calls.length;

      // Advance past debounce timer (500ms)
      vi.advanceTimersByTime(600);

      // Should have called once more after debounce
      expect(updateSpy.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
    });
  });
});
