/**
 * Unit tests for Field Commander Shell (fc-shell.js)
 *
 * Tests the FC mode feature flag, isFCMode/setFCMode,
 * status bar construction, action bar, GPS chip, and mode delegation.
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
  return await import('../../src/field-commander/fc-shell.js');
}

describe('Field Commander Shell', () => {
  let menuEvents: ReturnType<typeof createMockEventEmitter>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();

    menuEvents = createMockEventEmitter();
    (window as any).menuEvents = menuEvents;
    (window as any).__gnssState = undefined;
    (window as any).__getActiveSketchData = vi.fn(() => ({ nodes: [], edges: [] }));
    (window as any).__getSketchStats = undefined;
    (window as any).t = undefined;
    (window as any).isRTL = () => false;
    (window as any).__startPrecisionMeasure = undefined;

    navigator.vibrate = vi.fn();

    // Mock matchMedia
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    // Set up basic DOM
    document.body.innerHTML = `
      <header class="app-header"></header>
      <div id="main">
        <div id="canvasContainer"></div>
      </div>
    `;
    document.body.className = '';

    // Mock document.hidden
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as any).menuEvents;
    delete (window as any).__gnssState;
    delete (window as any).__getActiveSketchData;
    delete (window as any).__getSketchStats;
    delete (window as any).t;
    delete (window as any).isRTL;
    delete (window as any).__startPrecisionMeasure;
    delete (window as any).__fcShell;
  });

  describe('isFCMode()', () => {
    it('should return false when body does not have fc-mode class', async () => {
      const { isFCMode } = await freshImport();
      expect(isFCMode()).toBe(false);
    });

    it('should return true when body has fc-mode class', async () => {
      document.body.classList.add('fc-mode');
      const { isFCMode } = await freshImport();
      expect(isFCMode()).toBe(true);
    });
  });

  describe('setFCMode()', () => {
    it('should set localStorage fc_mode to "1" when enabled', async () => {
      // Mock location.reload to prevent actual reload
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadMock },
        writable: true,
        configurable: true,
      });

      const { setFCMode } = await freshImport();
      setFCMode(true);

      expect(localStorage.getItem('fc_mode')).toBe('1');
      expect(reloadMock).toHaveBeenCalled();
    });

    it('should remove localStorage fc_mode when disabled', async () => {
      localStorage.setItem('fc_mode', '1');

      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadMock },
        writable: true,
        configurable: true,
      });

      const { setFCMode } = await freshImport();
      setFCMode(false);

      expect(localStorage.getItem('fc_mode')).toBeNull();
      expect(reloadMock).toHaveBeenCalled();
    });
  });

  describe('initFieldCommander()', () => {
    it('should not activate when fc_mode is not set in localStorage', async () => {
      const { initFieldCommander, isFCMode } = await freshImport();
      initFieldCommander();

      expect(isFCMode()).toBe(false);
      expect(document.getElementById('fcStatusBar')).toBeNull();
      expect(document.getElementById('fcActionBar')).toBeNull();
    });

    it('should activate and build UI when fc_mode is "1"', async () => {
      localStorage.setItem('fc_mode', '1');

      const { initFieldCommander, isFCMode } = await freshImport();
      initFieldCommander();

      expect(isFCMode()).toBe(true);
      expect(document.body.classList.contains('fc-mode')).toBe(true);
      expect(document.getElementById('fcStatusBar')).not.toBeNull();
      expect(document.getElementById('fcActionBar')).not.toBeNull();
    });

    it('should expose __fcShell on window when activated', async () => {
      localStorage.setItem('fc_mode', '1');

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      expect((window as any).__fcShell).toBeDefined();
      expect(typeof (window as any).__fcShell.isFCMode).toBe('function');
      expect(typeof (window as any).__fcShell.setFCMode).toBe('function');
    });
  });

  describe('Status Bar', () => {
    it('should contain sketch name, sync icon, GPS chip, and menu button', async () => {
      localStorage.setItem('fc_mode', '1');

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      expect(document.getElementById('fcSketchName')).not.toBeNull();
      expect(document.getElementById('fcSyncIconText')).not.toBeNull();
      expect(document.getElementById('fcGpsChip')).not.toBeNull();
      expect(document.getElementById('fcMenuBtn')).not.toBeNull();
    });

    it('should contain progress line', async () => {
      localStorage.setItem('fc_mode', '1');

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      expect(document.getElementById('fcProgressLine')).not.toBeNull();
      expect(document.getElementById('fcProgressFill')).not.toBeNull();
    });
  });

  describe('Action Bar', () => {
    it('should contain mode buttons and action buttons', async () => {
      localStorage.setItem('fc_mode', '1');

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      expect(document.querySelector('[data-fc-mode="node"]')).not.toBeNull();
      expect(document.querySelector('[data-fc-mode="edge"]')).not.toBeNull();
      expect(document.getElementById('fcCaptureBtn')).not.toBeNull();
      expect(document.getElementById('fcUndoBtn')).not.toBeNull();
      expect(document.getElementById('fcMoreBtn')).not.toBeNull();
    });

    it('should contain XP badge', async () => {
      localStorage.setItem('fc_mode', '1');

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      expect(document.getElementById('fcXpBadge')).not.toBeNull();
    });

    it('should delegate capture button to precision measure when available', async () => {
      localStorage.setItem('fc_mode', '1');
      const measureFn = vi.fn();
      (window as any).__startPrecisionMeasure = measureFn;

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      const captureBtn = document.getElementById('fcCaptureBtn');
      captureBtn?.click();

      expect(measureFn).toHaveBeenCalled();
    });

    it('should delegate undo to original undo button', async () => {
      localStorage.setItem('fc_mode', '1');

      // Add original undo button
      const origUndo = document.createElement('button');
      origUndo.id = 'undoBtn';
      const undoSpy = vi.fn();
      origUndo.addEventListener('click', undoSpy);
      document.body.appendChild(origUndo);

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      const fcUndo = document.getElementById('fcUndoBtn') as HTMLButtonElement;
      fcUndo?.click();

      expect(undoSpy).toHaveBeenCalled();
    });
  });

  describe('GPS Chip updates', () => {
    it('should update GPS chip on position event', async () => {
      localStorage.setItem('fc_mode', '1');

      const gnssState = createMockEventEmitter();
      (gnssState as any).position = null;
      (gnssState as any).connectionState = 'connected';
      (window as any).__gnssState = gnssState;

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      gnssState.emit('position', {
        isValid: true,
        fixQuality: 4,
        hdop: 0.5,
        satellites: 12,
      });

      const label = document.getElementById('fcGpsLabel');
      expect(label?.textContent).toBe('50cm');
    });

    it('should show "--" for invalid position', async () => {
      localStorage.setItem('fc_mode', '1');

      const gnssState = createMockEventEmitter();
      (gnssState as any).position = null;
      (gnssState as any).connectionState = 'connected';
      (window as any).__gnssState = gnssState;

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      gnssState.emit('position', { isValid: false });

      const label = document.getElementById('fcGpsLabel');
      expect(label?.textContent).toBe('--');
    });
  });

  describe('Sync status', () => {
    it('should update sync icon on sync:stateChange', async () => {
      localStorage.setItem('fc_mode', '1');

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      menuEvents.emit('sync:stateChange', { isSyncing: true });

      const icon = document.getElementById('fcSyncIconText');
      expect(icon?.textContent).toBe('sync');
    });

    it('should show cloud_off when offline', async () => {
      localStorage.setItem('fc_mode', '1');

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      menuEvents.emit('sync:stateChange', { isOnline: false });

      const icon = document.getElementById('fcSyncIconText');
      expect(icon?.textContent).toBe('cloud_off');
    });
  });

  describe('Translation updates', () => {
    it('should update button labels on translations:updated event', async () => {
      localStorage.setItem('fc_mode', '1');
      (window as any).t = (key: string) => {
        const map: Record<string, string> = {
          'fc.node': 'نقطة',
          'fc.edge': 'קו',
          'fc.undo': 'בטל',
          'fc.more': 'עוד',
        };
        return map[key] || key;
      };

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      menuEvents.emit('translations:updated');

      const nodeLabel = document.querySelector('[data-fc-mode="node"] .fc-action-btn__label');
      expect(nodeLabel?.textContent).toBe('نقطة');
    });
  });

  describe('Undo sync', () => {
    it('should sync undo button disabled state', async () => {
      localStorage.setItem('fc_mode', '1');

      const origUndo = document.createElement('button');
      origUndo.id = 'undoBtn';
      origUndo.disabled = true;
      document.body.appendChild(origUndo);

      const { initFieldCommander } = await freshImport();
      initFieldCommander();

      const fcUndo = document.getElementById('fcUndoBtn') as HTMLButtonElement;
      expect(fcUndo?.disabled).toBe(true);

      // Enable original undo
      origUndo.disabled = false;
      // MutationObserver fires asynchronously
      await vi.advanceTimersByTimeAsync(10);

      // The observer should have updated fc undo
      expect(fcUndo?.disabled).toBe(false);
    });
  });
});
