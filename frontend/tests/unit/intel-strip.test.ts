/**
 * Unit tests for Intel Strip — Zone A of the Cockpit layout
 *
 * Tests GPS status display, completion ring, health stats,
 * sync status, stale GPS detection, and issue list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need fresh module imports because intel-strip has module-level state
// (_gnssEverConnected, staleTimer, lastPositionTime)
let initIntelStrip: Function;
let updateIntelStrip: Function;
let destroyIntelStrip: Function;

async function freshImport() {
  vi.resetModules();
  const mod = await import('../../src/cockpit/intel-strip.js');
  initIntelStrip = mod.initIntelStrip;
  updateIntelStrip = mod.updateIntelStrip;
  destroyIntelStrip = mod.destroyIntelStrip;
  return mod;
}

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

/**
 * Build the Intel Strip DOM structure for testing
 */
function buildIntelStripDOM() {
  document.body.innerHTML = `
    <!-- GPS Card -->
    <div class="intel-card intel-gps" id="intelGps">
      <span class="intel-gps__dot" id="gpsDot"></span>
      <span class="intel-gps__label" id="gpsLabel">--</span>
      <div class="intel-gps__accuracy" id="gpsAccuracy">--</div>
      <span id="gpsSatCount">0</span>
    </div>

    <!-- Completion Ring -->
    <div class="completion-ring" id="completionRing">
      <svg class="completion-ring__svg" viewBox="0 0 36 36">
        <circle class="completion-ring__fill" id="completionFill"
          cx="18" cy="18" r="15.5"
          stroke-dasharray="97.4"
          stroke-dashoffset="97.4"
          data-level="low">
        </circle>
      </svg>
      <span class="completion-ring__text" id="completionText">0%</span>
    </div>

    <!-- Health Stats -->
    <div class="intel-health__stats" id="healthStats">--</div>
    <div class="intel-health__issues" id="healthIssues" style="display:none;">
      <span class="material-icons">warning_amber</span>
      <span id="issueCount">0</span>
    </div>
    <div class="intel-health__issue-list" id="healthIssueList" style="display:none;"></div>

    <!-- Sync Status -->
    <div class="intel-card intel-sync intel-sync--synced" id="intelSync">
      <span class="material-icons intel-sync__icon" id="syncIcon">cloud_done</span>
      <div class="intel-sync__label" id="syncLabel">Synced</div>
      <div class="intel-sync__pending" id="syncPending" style="display:none;"></div>
    </div>

    <!-- Condensed status in action rail -->
    <span class="action-rail__status-dot" id="railGpsDot"></span>
    <span class="action-rail__status-health" id="railHealthPct">0%</span>
    <span class="action-rail__status-icon" id="railSyncIcon">
      <span class="material-icons">cloud_done</span>
    </span>
  `;
}

function makeCompletion(overrides: Record<string, unknown> = {}) {
  return {
    percentage: 0,
    coordsPct: 0,
    measurePct: 0,
    issuesPct: 100,
    fieldsPct: 0,
    nodeCount: 0,
    edgeCount: 0,
    totalKm: 0,
    issueCount: 0,
    ...overrides,
  };
}

describe('Intel Strip', () => {
  let menuEvents: ReturnType<typeof createMockEventEmitter>;
  let gnssState: ReturnType<typeof createMockEventEmitter> & {
    position?: Record<string, unknown>;
    connectionState?: string;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    buildIntelStripDOM();
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });

    menuEvents = createMockEventEmitter();
    gnssState = Object.assign(createMockEventEmitter(), {
      position: undefined as Record<string, unknown> | undefined,
      connectionState: 'disconnected',
    });

    (window as any).menuEvents = menuEvents;
    (window as any).__gnssState = gnssState;
    // Provide a translator that returns null for unknown keys so fallback English labels are used
    (window as any).t = (key: string) => null;
    (window as any).__issueNav = undefined;

    // Fresh import to reset module-level state (_gnssEverConnected, staleTimer, etc.)
    await freshImport();
  });

  afterEach(() => {
    destroyIntelStrip();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    (window as any).menuEvents = undefined;
    (window as any).__gnssState = undefined;
    (window as any).t = undefined;
    (window as any).__issueNav = undefined;
  });

  describe('initIntelStrip', () => {
    it('should not throw when called', () => {
      expect(() => initIntelStrip()).not.toThrow();
    });

    it('should register GNSS position listener', () => {
      initIntelStrip();
      expect(gnssState._handlers['position']).toHaveLength(1);
    });

    it('should register GNSS connection listener', () => {
      initIntelStrip();
      expect(gnssState._handlers['connection']).toHaveLength(1);
    });

    it('should register sync:stateChange listener', () => {
      initIntelStrip();
      expect(menuEvents._handlers['sync:stateChange']).toHaveLength(1);
    });

    it('should start stale GPS check interval', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      initIntelStrip();
      const staleChecks = setIntervalSpy.mock.calls.filter(c => c[1] === 3000);
      expect(staleChecks.length).toBe(1);
    });

    it('should handle missing gnssState', () => {
      (window as any).__gnssState = undefined;
      expect(() => initIntelStrip()).not.toThrow();
    });

    it('should handle missing menuEvents', () => {
      (window as any).menuEvents = undefined;
      expect(() => initIntelStrip()).not.toThrow();
    });
  });

  describe('destroyIntelStrip', () => {
    it('should clear stale timer', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      initIntelStrip();
      destroyIntelStrip();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should handle double destroy', () => {
      initIntelStrip();
      destroyIntelStrip();
      expect(() => destroyIntelStrip()).not.toThrow();
    });
  });

  describe('GPS display', () => {
    it('should show "No Fix" when disconnected', () => {
      initIntelStrip();
      gnssState.connectionState = 'disconnected';
      gnssState.position = undefined;
      gnssState.emit('position');

      const label = document.getElementById('gpsLabel');
      expect(label?.textContent).toBe('No Fix');
    });

    it('should show "No Fix" when connected but no valid position', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: false };
      gnssState.emit('position');

      const label = document.getElementById('gpsLabel');
      expect(label?.textContent).toBe('No Fix');
    });

    it('should show RTK Fixed for fixQuality 4', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 4, hdop: 0.5, satellites: 12 };
      gnssState.emit('position');

      const label = document.getElementById('gpsLabel');
      expect(label?.textContent).toBe('RTK Fixed');
      const dot = document.getElementById('gpsDot');
      expect(dot?.className).toContain('rtk-fixed');
      expect(dot?.classList.contains('pulse')).toBe(true);
    });

    it('should show RTK Float for fixQuality 5', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 5, satellites: 8 };
      gnssState.emit('position');

      const label = document.getElementById('gpsLabel');
      expect(label?.textContent).toBe('RTK Float');
    });

    it('should show DGPS for fixQuality 2', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 2, satellites: 6 };
      gnssState.emit('position');

      expect(document.getElementById('gpsLabel')?.textContent).toBe('DGPS');
    });

    it('should show GPS for fixQuality 1', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 1, satellites: 4 };
      gnssState.emit('position');

      expect(document.getElementById('gpsLabel')?.textContent).toBe('GPS');
    });

    it('should format accuracy in cm when < 1m', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 4, hdop: 0.05, satellites: 12 };
      gnssState.emit('position');

      expect(document.getElementById('gpsAccuracy')?.textContent).toBe('5cm');
    });

    it('should format accuracy in m when >= 1m', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 1, hdop: 2.5, satellites: 4 };
      gnssState.emit('position');

      expect(document.getElementById('gpsAccuracy')?.textContent).toBe('2.5m');
    });

    it('should show -- for accuracy when hdop is null', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 1, hdop: null, satellites: 4 };
      gnssState.emit('position');

      expect(document.getElementById('gpsAccuracy')?.textContent).toBe('--');
    });

    it('should update satellite count', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 4, satellites: 15 };
      gnssState.emit('position');

      expect(document.getElementById('gpsSatCount')?.textContent).toBe('15');
    });

    it('should show 0 satellites when not available', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 1 };
      gnssState.emit('position');

      expect(document.getElementById('gpsSatCount')?.textContent).toBe('0');
    });

    it('should minimize GPS card when never connected', () => {
      initIntelStrip();
      gnssState.connectionState = 'disconnected';
      gnssState.position = undefined;
      gnssState.emit('position');

      const card = document.getElementById('intelGps');
      expect(card?.classList.contains('intel-gps--minimized')).toBe(true);
    });

    it('should not minimize GPS card after connecting once', () => {
      initIntelStrip();

      // First connect
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 1, satellites: 4 };
      gnssState.emit('position');

      // Then disconnect
      gnssState.connectionState = 'disconnected';
      gnssState.position = undefined;
      gnssState.emit('connection');

      const card = document.getElementById('intelGps');
      expect(card?.classList.contains('intel-gps--minimized')).toBe(false);
    });
  });

  describe('stale GPS detection', () => {
    it('should add stale class when no update for > 3s', () => {
      initIntelStrip();

      // Trigger a position to set lastPositionTime
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 1, satellites: 4 };
      gnssState.emit('position');

      // Advance past stale threshold (interval fires every 3s, need >3s since last position)
      // At t=3000 the interval fires but diff is exactly 3000 (not > 3000)
      // At t=6000 the interval fires and diff is 6000 > 3000
      vi.advanceTimersByTime(7000);

      const card = document.getElementById('intelGps');
      expect(card?.classList.contains('intel-gps__stale')).toBe(true);
    });

    it('should remove stale class on fresh position', () => {
      initIntelStrip();

      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 1, satellites: 4 };
      gnssState.emit('position');

      vi.advanceTimersByTime(4000); // Trigger stale

      // Fresh update
      gnssState.emit('position');

      const card = document.getElementById('intelGps');
      expect(card?.classList.contains('intel-gps__stale')).toBe(false);
    });

    it('should skip stale check when document is hidden', () => {
      initIntelStrip();

      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 1, satellites: 4 };
      gnssState.emit('position');

      Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
      vi.advanceTimersByTime(4000);

      const card = document.getElementById('intelGps');
      // Should NOT be stale because check was skipped
      expect(card?.classList.contains('intel-gps__stale')).toBe(false);
    });
  });

  describe('completion ring', () => {
    it('should show "--" for empty sketch', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 0, edgeCount: 0, percentage: 0 }));

      expect(document.getElementById('completionText')?.textContent).toBe('--');
    });

    it('should show percentage for non-empty sketch', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 5, edgeCount: 3, percentage: 65 }));

      expect(document.getElementById('completionText')?.textContent).toBe('65%');
    });

    it('should set data-level to low for < 25%', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 1, percentage: 10 }));

      expect(document.getElementById('completionFill')?.getAttribute('data-level')).toBe('low');
    });

    it('should set data-level to mid for 25-75%', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 5, percentage: 50 }));

      expect(document.getElementById('completionFill')?.getAttribute('data-level')).toBe('mid');
    });

    it('should set data-level to high for 75-85%', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 5, percentage: 80 }));

      expect(document.getElementById('completionFill')?.getAttribute('data-level')).toBe('high');
    });

    it('should set data-level to complete for >= 85%', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 5, percentage: 90 }));

      expect(document.getElementById('completionFill')?.getAttribute('data-level')).toBe('complete');
    });

    it('should add complete class at 100%', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 5, edgeCount: 2, percentage: 100 }));

      const ring = document.getElementById('completionRing');
      expect(ring?.classList.contains('completion-ring--complete')).toBe(true);
    });

    it('should remove complete class when below 100%', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 5, edgeCount: 2, percentage: 100 }));
      updateIntelStrip(makeCompletion({ nodeCount: 5, edgeCount: 2, percentage: 80 }));

      const ring = document.getElementById('completionRing');
      expect(ring?.classList.contains('completion-ring--complete')).toBe(false);
    });

    it('should update stroke-dashoffset based on percentage', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 5, percentage: 50 }));

      const fill = document.getElementById('completionFill');
      const offset = parseFloat(fill?.style.strokeDashoffset || '0');
      // 50% of 97.4 circumference → offset should be ~48.7
      expect(offset).toBeCloseTo(48.7, 0);
    });
  });

  describe('health stats', () => {
    it('should show empty sketch message when no nodes or edges', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 0, edgeCount: 0 }));

      const stats = document.getElementById('healthStats');
      expect(stats?.textContent).toContain('Start drawing');
    });

    it('should show node and edge counts', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 10, edgeCount: 7 }));

      const stats = document.getElementById('healthStats');
      expect(stats?.textContent).toContain('10');
      expect(stats?.textContent).toContain('7');
    });

    it('should show issue count when issues exist', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ issueCount: 3 }));

      const issuesEl = document.getElementById('healthIssues');
      expect(issuesEl?.style.display).not.toBe('none');
      expect(document.getElementById('issueCount')?.textContent).toBe('3');
    });

    it('should hide issue count when no issues', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ issueCount: 0 }));

      const issuesEl = document.getElementById('healthIssues');
      expect(issuesEl?.style.display).toBe('none');
    });

    it('should use translations when available', () => {
      (window as any).t = (key: string) => {
        if (key === 'cockpit.nodes') return 'נקודות';
        if (key === 'cockpit.edges') return 'קווים';
        return key;
      };
      initIntelStrip();
      updateIntelStrip(makeCompletion({ nodeCount: 5, edgeCount: 3 }));

      const stats = document.getElementById('healthStats');
      expect(stats?.textContent).toContain('נקודות');
      expect(stats?.textContent).toContain('קווים');
    });
  });

  describe('sync status', () => {
    it('should show synced state by default', () => {
      initIntelStrip();

      // Trigger sync state
      menuEvents.emit('sync:stateChange', { isSyncing: false, isOnline: true });

      const icon = document.getElementById('syncIcon');
      const label = document.getElementById('syncLabel');
      expect(icon?.textContent).toBe('cloud_done');
      expect(label?.textContent).toBe('Synced');
    });

    it('should show syncing state', () => {
      initIntelStrip();
      menuEvents.emit('sync:stateChange', { isSyncing: true });

      const icon = document.getElementById('syncIcon');
      const label = document.getElementById('syncLabel');
      const card = document.getElementById('intelSync');

      expect(icon?.textContent).toBe('sync');
      expect(label?.textContent).toContain('Syncing');
      expect(card?.classList.contains('intel-sync--syncing')).toBe(true);
    });

    it('should show offline state', () => {
      initIntelStrip();
      menuEvents.emit('sync:stateChange', { isOnline: false });

      const icon = document.getElementById('syncIcon');
      const label = document.getElementById('syncLabel');
      const card = document.getElementById('intelSync');

      expect(icon?.textContent).toBe('cloud_off');
      expect(label?.textContent).toContain('Offline');
      expect(card?.classList.contains('intel-sync--offline')).toBe(true);
    });

    it('should show error state', () => {
      initIntelStrip();
      menuEvents.emit('sync:stateChange', { error: true });

      const icon = document.getElementById('syncIcon');
      const card = document.getElementById('intelSync');

      expect(icon?.textContent).toBe('cloud_off');
      expect(card?.classList.contains('intel-sync--error')).toBe(true);
    });

    it('should show pending changes count', () => {
      initIntelStrip();
      menuEvents.emit('sync:stateChange', { isSyncing: false, pendingChanges: 5 });

      const pending = document.getElementById('syncPending');
      expect(pending?.style.display).not.toBe('none');
      expect(pending?.textContent).toContain('5');
    });

    it('should hide pending when count is 0', () => {
      initIntelStrip();
      menuEvents.emit('sync:stateChange', { isSyncing: false, pendingChanges: 0 });

      const pending = document.getElementById('syncPending');
      expect(pending?.style.display).toBe('none');
    });
  });

  describe('condensed status', () => {
    it('should update health percentage in action rail', () => {
      initIntelStrip();
      updateIntelStrip(makeCompletion({ percentage: 42 }));

      expect(document.getElementById('railHealthPct')?.textContent).toBe('42%');
    });

    it('should update condensed GPS dot', () => {
      initIntelStrip();
      gnssState.connectionState = 'connected';
      gnssState.position = { isValid: true, fixQuality: 4, satellites: 12 };
      gnssState.emit('position');

      const dot = document.getElementById('railGpsDot');
      expect(dot?.className).toContain('rtk-fixed');
    });

    it('should not update condensed dot when disconnected (no valid position)', () => {
      initIntelStrip();
      gnssState.connectionState = 'disconnected';
      gnssState.position = undefined;
      gnssState.emit('position');

      // updateCondensedGpsDot is only called for valid positions,
      // so the condensed dot retains its initial class
      const dot = document.getElementById('railGpsDot');
      expect(dot?.className).toBe('action-rail__status-dot');
    });
  });

  describe('issue list interaction', () => {
    it('should toggle issue list visibility on click', () => {
      // Provide mock issue nav with issues so populateIssueList doesn't hide the list
      (window as any).__issueNav = {
        goToNextIssue: vi.fn(),
        getNavState: () => ({
          issues: [
            { type: 'missingCoords', nodeLabel: 'MH-1' },
          ],
        }),
      };

      initIntelStrip();
      const issuesEl = document.getElementById('healthIssues')!;
      const issueList = document.getElementById('healthIssueList')!;

      // Initially hidden
      expect(issueList.style.display).toBe('none');

      // Click to show
      issuesEl.click();
      expect(issueList.style.display).toBe('');

      // Click to hide
      issuesEl.click();
      expect(issueList.style.display).toBe('none');
    });

    it('should call goToNextIssue on click when available', () => {
      const goToNextIssue = vi.fn();
      (window as any).__issueNav = { goToNextIssue };

      initIntelStrip();
      const issuesEl = document.getElementById('healthIssues')!;
      issuesEl.click();

      expect(goToNextIssue).toHaveBeenCalled();
    });
  });
});
