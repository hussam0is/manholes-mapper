/**
 * Unit tests for Action Rail — Zone C of the Cockpit layout
 *
 * Tests mode switching, button delegation, more menu open/close,
 * collapsible groups, toggle syncing, and keyboard navigation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initActionRail } from '../../src/cockpit/action-rail.js';

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
 * Build a minimal Action Rail DOM for testing
 */
function buildActionRailDOM() {
  document.body.innerHTML = `
    <div id="actionRail">
      <!-- Mode buttons -->
      <button class="action-rail__btn action-rail__btn--mode" data-mode="node" aria-pressed="false">
        <span class="material-icons">radio_button_unchecked</span>
      </button>
      <button class="action-rail__btn action-rail__btn--mode" data-mode="edge" aria-pressed="false">
        <span class="material-icons">timeline</span>
      </button>
      <button class="action-rail__btn action-rail__btn--mode" data-mode="home" aria-pressed="false">
        <span class="material-icons">home</span>
      </button>
      <button class="action-rail__btn action-rail__btn--mode" data-mode="drainage" aria-pressed="false">
        <span class="material-icons">water_drop</span>
      </button>

      <!-- GPS -->
      <button class="action-rail__btn action-rail__btn--gps" id="railGpsBtn">
        <span class="material-icons">gps_fixed</span>
      </button>

      <!-- TSC3 -->
      <button class="action-rail__btn action-rail__btn--tsc3" id="railTsc3Btn">
        <span class="material-icons">precision_manufacturing</span>
        <span class="action-rail__tsc3-indicator" id="tsc3Indicator"></span>
      </button>

      <!-- Undo/Redo -->
      <button class="action-rail__btn" id="railUndoBtn" disabled>
        <span class="material-icons">undo</span>
      </button>
      <button class="action-rail__btn" id="railRedoBtn" disabled>
        <span class="material-icons">redo</span>
      </button>

      <!-- Zoom -->
      <button class="action-rail__btn" id="railZoomInBtn"></button>
      <button class="action-rail__btn" id="railZoomOutBtn"></button>
      <button class="action-rail__btn" id="railFitBtn"></button>

      <!-- 3D -->
      <button class="action-rail__btn action-rail__btn--3d" id="rail3DBtn"></button>

      <!-- Heatmap -->
      <button class="action-rail__btn action-rail__btn--heatmap" id="railHeatmapBtn" aria-pressed="false">
        <span class="material-icons">thermostat</span>
      </button>

      <!-- Collapse -->
      <button class="action-rail__btn action-rail__btn--collapse" id="railCollapseBtn">
        <span class="material-icons">chevron_right</span>
      </button>

      <!-- More -->
      <button class="action-rail__btn" id="railMoreBtn" aria-expanded="false">
        <span class="material-icons">more_vert</span>
      </button>
    </div>

    <!-- More menu -->
    <div class="action-rail__more-menu" id="railMoreMenu">
      <button class="action-rail__more-item action-rail__more-item--primary" data-action="save">
        <span class="material-icons">save</span><span>Save</span>
      </button>
      <button class="action-rail__more-item" data-action="mySketches">
        <span class="material-icons">description</span><span>My Sketches</span>
      </button>
      <button class="action-rail__more-item" data-action="languageChange">
        <span class="material-icons">language</span><span>EN / HE</span>
      </button>

      <!-- Collapsible group -->
      <div class="action-rail__more-group" data-more-group="settings">
        <button class="action-rail__more-group-header" data-more-group-toggle="settings" type="button" aria-expanded="false">
          <span class="material-icons">settings</span>
          <span>Settings</span>
          <span class="material-icons action-rail__more-chevron">expand_more</span>
        </button>
        <div class="action-rail__more-group-items" data-more-group-items="settings" style="display:none">
          <label class="action-rail__more-toggle">
            <input type="checkbox" id="railAutosaveToggle" data-action="toggleAutosave" />
            <span>Autosave</span>
          </label>
          <button class="action-rail__more-item" data-action="help">
            <span class="material-icons">help_outline</span><span>Help</span>
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="action-rail__more-search">
        <input id="railSearchNodeInput" type="text" placeholder="Search nodes" />
      </div>

      <!-- Map type -->
      <select id="railMapTypeSelect" class="action-rail__more-inline-select">
        <option value="orthophoto">Orthophoto</option>
        <option value="street">Street</option>
      </select>

      <!-- Scale controls -->
      <button class="action-rail__more-scale-btn" data-action="scaleIncrease">+</button>
      <button class="action-rail__more-scale-btn" data-action="scaleDecrease">−</button>
      <span id="railScaleValueDisplay" class="action-rail__more-scale-value">1:100</span>

      <!-- Toggles -->
      <label class="action-rail__more-toggle">
        <input type="checkbox" id="railCoordinatesToggle" data-action="toggleCoordinates" />
        <span>Coordinates</span>
      </label>
      <label class="action-rail__more-toggle">
        <input type="checkbox" id="railMapLayerToggle" data-action="toggleMapLayer" />
        <span>Map Layer</span>
      </label>
    </div>

    <!-- Original buttons that action rail delegates to -->
    <button id="nodeModeBtn" class="active"></button>
    <button id="edgeModeBtn"></button>
    <button id="homeNodeModeBtn"></button>
    <button id="drainageNodeModeBtn"></button>
    <button id="gpsQuickCaptureBtn"></button>
    <button id="undoBtn" disabled></button>
    <button id="redoBtn" disabled></button>
    <button id="canvasZoomInBtn"></button>
    <button id="canvasZoomOutBtn"></button>
    <button id="zoomToFitBtn"></button>
    <button id="threeDViewBtn"></button>
    <button id="saveBtn"></button>
    <button id="mySketchesBtn"></button>
    <button id="helpBtn"></button>
    <select id="langSelect"><option value="en">EN</option><option value="he">HE</option></select>
    <input type="checkbox" id="coordinatesToggle" />
    <input type="checkbox" id="autosaveToggle" />
    <input type="checkbox" id="mapLayerToggle" />
    <span id="scaleValueDisplay">1:100</span>

    <!-- Intel strip for collapse test -->
    <aside class="intel-strip" id="intelStrip"></aside>
    <div class="cockpit"></div>

    <!-- Condensed status -->
    <span class="action-rail__status-dot" id="railGpsDot"></span>
    <span class="action-rail__status-health" id="railHealthPct">0%</span>
    <span class="action-rail__status-icon" id="railSyncIcon"><span class="material-icons">cloud_done</span></span>
  `;
}

describe('Action Rail', () => {
  let menuEvents: ReturnType<typeof createMockEventEmitter>;

  beforeEach(() => {
    localStorage.clear();
    menuEvents = createMockEventEmitter();
    (window as any).menuEvents = menuEvents;
    (window as any).__gnssState = undefined;
    (window as any).__isFeatureVisible = () => true;
    buildActionRailDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    (window as any).menuEvents = undefined;
    (window as any).__gnssState = undefined;
    (window as any).__isFeatureVisible = undefined;
  });

  describe('initActionRail', () => {
    it('should not throw when called', () => {
      expect(() => initActionRail()).not.toThrow();
    });

    it('should not throw when actionRail element is missing', () => {
      document.body.innerHTML = '';
      expect(() => initActionRail()).not.toThrow();
    });
  });

  describe('mode switching', () => {
    it('should delegate node mode click to original button', () => {
      initActionRail();
      const origBtn = document.getElementById('nodeModeBtn')!;
      const clickSpy = vi.spyOn(origBtn, 'click');

      const nodeBtn = document.querySelector('[data-mode="node"]') as HTMLElement;
      nodeBtn.click();

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should delegate edge mode click to original button', () => {
      initActionRail();
      const origBtn = document.getElementById('edgeModeBtn')!;
      const clickSpy = vi.spyOn(origBtn, 'click');

      const edgeBtn = document.querySelector('[data-mode="edge"]') as HTMLElement;
      edgeBtn.click();

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should update active state on mode button click', () => {
      initActionRail();
      const edgeBtn = document.querySelector('[data-mode="edge"]') as HTMLElement;
      edgeBtn.click();

      expect(edgeBtn.classList.contains('active')).toBe(true);
      expect(edgeBtn.getAttribute('aria-pressed')).toBe('true');

      const nodeBtn = document.querySelector('[data-mode="node"]') as HTMLElement;
      expect(nodeBtn.classList.contains('active')).toBe(false);
      expect(nodeBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('should update body mode class on mode switch', () => {
      initActionRail();
      const edgeBtn = document.querySelector('[data-mode="edge"]') as HTMLElement;
      edgeBtn.click();
      expect(document.body.classList.contains('mode-edge')).toBe(true);
      expect(document.body.classList.contains('mode-node')).toBe(false);
    });

    it('should set mode-node class for home mode', () => {
      initActionRail();
      const homeBtn = document.querySelector('[data-mode="home"]') as HTMLElement;
      homeBtn.click();
      expect(document.body.classList.contains('mode-node')).toBe(true);
    });

    it('should set mode-node class for drainage mode', () => {
      initActionRail();
      const drainBtn = document.querySelector('[data-mode="drainage"]') as HTMLElement;
      drainBtn.click();
      expect(document.body.classList.contains('mode-node')).toBe(true);
    });

    it('should sync active mode from original toolbar on init', () => {
      // nodeModeBtn has class "active" from DOM setup
      initActionRail();
      const nodeBtn = document.querySelector('[data-mode="node"]') as HTMLElement;
      expect(nodeBtn.classList.contains('active')).toBe(true);
    });

    it('should respond to mode:changed events', () => {
      initActionRail();
      menuEvents.emit('mode:changed', 'edge');

      const edgeBtn = document.querySelector('[data-mode="edge"]') as HTMLElement;
      expect(edgeBtn.classList.contains('active')).toBe(true);
    });
  });

  describe('GPS button', () => {
    it('should delegate GPS click to original GPS button', () => {
      initActionRail();
      const origBtn = document.getElementById('gpsQuickCaptureBtn')!;
      const clickSpy = vi.spyOn(origBtn, 'click');

      document.getElementById('railGpsBtn')?.click();
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('undo/redo', () => {
    it('should delegate undo click to original button', () => {
      // Enable original button so initActionRail syncs enabled state to rail button
      (document.getElementById('undoBtn') as HTMLButtonElement).disabled = false;
      initActionRail();
      const origUndo = document.getElementById('undoBtn')!;
      const clickSpy = vi.spyOn(origUndo, 'click');

      document.getElementById('railUndoBtn')?.click();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should delegate redo click to original button', () => {
      (document.getElementById('redoBtn') as HTMLButtonElement).disabled = false;
      initActionRail();
      const origRedo = document.getElementById('redoBtn')!;
      const clickSpy = vi.spyOn(origRedo, 'click');

      document.getElementById('railRedoBtn')?.click();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should sync disabled state from original undo button', () => {
      initActionRail();
      const railUndo = document.getElementById('railUndoBtn') as HTMLButtonElement;
      expect(railUndo.disabled).toBe(true);
    });
  });

  describe('zoom buttons', () => {
    it('should delegate zoom-in to original', () => {
      initActionRail();
      const orig = document.getElementById('canvasZoomInBtn')!;
      const clickSpy = vi.spyOn(orig, 'click');
      document.getElementById('railZoomInBtn')?.click();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should delegate zoom-out to original', () => {
      initActionRail();
      const orig = document.getElementById('canvasZoomOutBtn')!;
      const clickSpy = vi.spyOn(orig, 'click');
      document.getElementById('railZoomOutBtn')?.click();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should delegate fit to original', () => {
      initActionRail();
      const orig = document.getElementById('zoomToFitBtn')!;
      const clickSpy = vi.spyOn(orig, 'click');
      document.getElementById('railFitBtn')?.click();
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('heatmap toggle', () => {
    it('should toggle active class and aria-pressed', () => {
      initActionRail();
      const heatBtn = document.getElementById('railHeatmapBtn')!;

      heatBtn.click();
      expect(heatBtn.classList.contains('active')).toBe(true);
      expect(heatBtn.getAttribute('aria-pressed')).toBe('true');

      heatBtn.click();
      expect(heatBtn.classList.contains('active')).toBe(false);
      expect(heatBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('should toggle heatmap-active class on body', () => {
      initActionRail();
      const heatBtn = document.getElementById('railHeatmapBtn')!;

      heatBtn.click();
      expect(document.body.classList.contains('heatmap-active')).toBe(true);

      heatBtn.click();
      expect(document.body.classList.contains('heatmap-active')).toBe(false);
    });

    it('should emit heatmap:toggle event', () => {
      initActionRail();
      let emittedValue: unknown;
      menuEvents.on('heatmap:toggle', (v: unknown) => { emittedValue = v; });

      document.getElementById('railHeatmapBtn')?.click();
      expect(emittedValue).toBe(true);
    });
  });

  describe('more menu', () => {
    it('should open and close more menu on button click', () => {
      initActionRail();
      const moreBtn = document.getElementById('railMoreBtn')!;
      const moreMenu = document.getElementById('railMoreMenu')!;

      moreBtn.click();
      expect(moreMenu.classList.contains('open')).toBe(true);
      expect(moreBtn.getAttribute('aria-expanded')).toBe('true');

      moreBtn.click();
      expect(moreMenu.classList.contains('open')).toBe(false);
      expect(moreBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should close on outside click', () => {
      initActionRail();
      const moreBtn = document.getElementById('railMoreBtn')!;

      moreBtn.click(); // Open
      expect(document.getElementById('railMoreMenu')?.classList.contains('open')).toBe(true);

      // Click outside
      document.body.click();
      expect(document.getElementById('railMoreMenu')?.classList.contains('open')).toBe(false);
    });

    it('should close on Escape key', () => {
      initActionRail();
      const moreBtn = document.getElementById('railMoreBtn')!;
      moreBtn.click(); // Open

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.getElementById('railMoreMenu')?.classList.contains('open')).toBe(false);
    });

    it('should delegate save action to original save button', () => {
      initActionRail();
      const saveBtn = document.getElementById('saveBtn')!;
      const clickSpy = vi.spyOn(saveBtn, 'click');

      // Open menu first
      document.getElementById('railMoreBtn')?.click();

      const saveItem = document.querySelector('[data-action="save"]') as HTMLElement;
      saveItem.click();

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should close menu after action that is not keepOpen', () => {
      initActionRail();
      document.getElementById('railMoreBtn')?.click();

      const saveItem = document.querySelector('[data-action="save"]') as HTMLElement;
      saveItem.click();

      expect(document.getElementById('railMoreMenu')?.classList.contains('open')).toBe(false);
    });

    it('should toggle language on languageChange action', () => {
      initActionRail();
      const langSelect = document.getElementById('langSelect') as HTMLSelectElement;
      const changeSpy = vi.fn();
      langSelect.addEventListener('change', changeSpy);

      document.getElementById('railMoreBtn')?.click();
      const langItem = document.querySelector('[data-action="languageChange"]') as HTMLElement;
      langItem.click();

      // Should have changed from 'en' to 'he'
      expect(langSelect.value).toBe('he');
      expect(changeSpy).toHaveBeenCalled();
    });
  });

  describe('collapsible groups', () => {
    it('should toggle group items visibility on header click', () => {
      initActionRail();
      const header = document.querySelector('[data-more-group-toggle="settings"]') as HTMLElement;
      const items = document.querySelector('[data-more-group-items="settings"]') as HTMLElement;

      // Settings is in DEFAULT_EXPANDED so it should be visible
      // (Note: actual default depends on localStorage state)
      // Click to toggle
      header.click();
      const wasExpanded = header.getAttribute('aria-expanded') === 'true';

      // Click again to toggle back
      header.click();
      const isExpanded = header.getAttribute('aria-expanded') === 'true';
      expect(isExpanded).toBe(!wasExpanded);
    });

    it('should persist group collapsed state to localStorage', () => {
      initActionRail();
      const header = document.querySelector('[data-more-group-toggle="settings"]') as HTMLElement;

      header.click(); // Toggle
      header.click(); // Toggle back

      const stored = localStorage.getItem('cockpitMoreCollapsed');
      expect(stored).not.toBeNull();
      expect(() => JSON.parse(stored!)).not.toThrow();
    });
  });

  describe('toggle syncing', () => {
    it('should sync rail toggle to original toggle', () => {
      initActionRail();
      const railToggle = document.getElementById('railCoordinatesToggle') as HTMLInputElement;
      const origToggle = document.getElementById('coordinatesToggle') as HTMLInputElement;

      railToggle.checked = true;
      railToggle.dispatchEvent(new Event('change'));

      expect(origToggle.checked).toBe(true);
    });

    it('should sync original toggle back to rail toggle', () => {
      initActionRail();
      const railToggle = document.getElementById('railCoordinatesToggle') as HTMLInputElement;
      const origToggle = document.getElementById('coordinatesToggle') as HTMLInputElement;

      origToggle.checked = true;
      origToggle.dispatchEvent(new Event('change'));

      expect(railToggle.checked).toBe(true);
    });
  });

  describe('map type select', () => {
    it('should sync rail map type to original', () => {
      // Add original map type select
      const orig = document.createElement('select');
      orig.id = 'mapTypeSelect';
      orig.innerHTML = '<option value="orthophoto">Ortho</option><option value="street">Street</option>';
      document.body.appendChild(orig);

      initActionRail();
      const railSelect = document.getElementById('railMapTypeSelect') as HTMLSelectElement;

      railSelect.value = 'street';
      railSelect.dispatchEvent(new Event('change'));

      expect(orig.value).toBe('street');
    });
  });

  describe('Zone A collapse from rail', () => {
    it('should toggle intel-strip collapsed class', () => {
      initActionRail();
      const collapseBtn = document.getElementById('railCollapseBtn')!;
      const strip = document.getElementById('intelStrip')!;

      collapseBtn.click();
      expect(strip.classList.contains('intel-strip--collapsed')).toBe(true);

      collapseBtn.click();
      expect(strip.classList.contains('intel-strip--collapsed')).toBe(false);
    });

    it('should toggle zone-a-collapsed class on body', () => {
      initActionRail();
      const collapseBtn = document.getElementById('railCollapseBtn')!;

      collapseBtn.click();
      expect(document.body.classList.contains('zone-a-collapsed')).toBe(true);
    });
  });

  describe('progressive disclosure', () => {
    it('should hide heatmap button when feature is not visible', () => {
      (window as any).__isFeatureVisible = (f: string) => f !== 'heatmap';
      initActionRail();

      const heatBtn = document.getElementById('railHeatmapBtn');
      expect(heatBtn?.style.display).toBe('none');
    });

    it('should hide TSC3 button when feature is not visible', () => {
      (window as any).__isFeatureVisible = (f: string) => f !== 'tsc3';
      initActionRail();

      const tsc3Btn = document.getElementById('railTsc3Btn');
      expect(tsc3Btn?.style.display).toBe('none');
    });

    it('should show all buttons when features are visible', () => {
      (window as any).__isFeatureVisible = () => true;
      initActionRail();

      expect(document.getElementById('railHeatmapBtn')?.style.display).not.toBe('none');
      expect(document.getElementById('railTsc3Btn')?.style.display).not.toBe('none');
    });
  });

  describe('TSC3 indicator', () => {
    it('should add connected class on tsc3:connected event', () => {
      initActionRail();
      const indicator = document.getElementById('tsc3Indicator')!;

      menuEvents.emit('tsc3:connected');
      expect(indicator.classList.contains('connected')).toBe(true);
    });

    it('should remove connected class on tsc3:disconnected event', () => {
      initActionRail();
      const indicator = document.getElementById('tsc3Indicator')!;

      menuEvents.emit('tsc3:connected');
      menuEvents.emit('tsc3:disconnected');
      expect(indicator.classList.contains('connected')).toBe(false);
    });
  });

  describe('search input', () => {
    it('should delegate search to original input on Enter', () => {
      const origSearch = document.createElement('input');
      origSearch.id = 'searchNodeInput';
      document.body.appendChild(origSearch);
      const inputSpy = vi.fn();
      origSearch.addEventListener('input', inputSpy);

      initActionRail();
      const railSearch = document.getElementById('railSearchNodeInput') as HTMLInputElement;
      railSearch.value = 'MH-5';
      railSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(origSearch.value).toBe('MH-5');
      expect(inputSpy).toHaveBeenCalled();
    });

    it('should clear and close menu after search', () => {
      const origSearch = document.createElement('input');
      origSearch.id = 'searchNodeInput';
      document.body.appendChild(origSearch);

      initActionRail();
      // Open menu
      document.getElementById('railMoreBtn')?.click();

      const railSearch = document.getElementById('railSearchNodeInput') as HTMLInputElement;
      railSearch.value = 'MH-5';
      railSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(railSearch.value).toBe('');
      expect(document.getElementById('railMoreMenu')?.classList.contains('open')).toBe(false);
    });

    it('should not search on empty input', () => {
      const origSearch = document.createElement('input');
      origSearch.id = 'searchNodeInput';
      document.body.appendChild(origSearch);
      const inputSpy = vi.fn();
      origSearch.addEventListener('input', inputSpy);

      initActionRail();
      const railSearch = document.getElementById('railSearchNodeInput') as HTMLInputElement;
      railSearch.value = '';
      railSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(inputSpy).not.toHaveBeenCalled();
    });
  });
});
