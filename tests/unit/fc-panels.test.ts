/**
 * Unit tests for FC Panel Manager (fc-panels.js)
 *
 * Tests the FCPanelManager class: register, open, close, toggle,
 * scrim behavior, keyboard escape, and panel building.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function freshImport() {
  vi.resetModules();
  return await import('../../src/field-commander/fc-panels.js');
}

describe('FCPanelManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '';
    document.body.className = '';

    (window as any).menuEvents = undefined;
    (window as any).__gnssState = undefined;
    (window as any).__getActiveSketchData = vi.fn(() => ({ nodes: [], edges: [] }));
    (window as any).__getSketchStats = undefined;
    (window as any).t = undefined;

    // Mock navigator.vibrate
    navigator.vibrate = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as any).menuEvents;
    delete (window as any).__gnssState;
    delete (window as any).__getActiveSketchData;
    delete (window as any).__getSketchStats;
    delete (window as any).t;
  });

  describe('fcPanels (FCPanelManager instance)', () => {
    it('should register and retrieve panels', async () => {
      const { fcPanels } = await freshImport();
      const el = document.createElement('div');
      fcPanels.register('test', el);

      expect(fcPanels.isOpen('test')).toBe(false);
    });

    it('should open a registered panel', async () => {
      const { fcPanels } = await freshImport();
      const el = document.createElement('div');
      el.className = 'fc-panel';
      document.body.appendChild(el);
      fcPanels.register('test', el);

      // Set up scrim
      const scrim = document.createElement('div');
      scrim.className = 'fc-scrim';
      fcPanels.scrim = scrim;

      fcPanels.open('test');

      expect(el.classList.contains('fc-panel--open')).toBe(true);
      expect(el.getAttribute('aria-hidden')).toBe('false');
      expect(fcPanels.isOpen('test')).toBe(true);
    });

    it('should close a panel', async () => {
      const { fcPanels } = await freshImport();
      const el = document.createElement('div');
      el.className = 'fc-panel fc-panel--open';
      document.body.appendChild(el);
      fcPanels.register('test', el);

      fcPanels.close('test');

      expect(el.classList.contains('fc-panel--open')).toBe(false);
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });

    it('should toggle a panel', async () => {
      const { fcPanels } = await freshImport();
      const el = document.createElement('div');
      el.className = 'fc-panel';
      document.body.appendChild(el);
      fcPanels.register('test', el);

      const scrim = document.createElement('div');
      scrim.className = 'fc-scrim';
      fcPanels.scrim = scrim;

      fcPanels.toggle('test');
      expect(fcPanels.isOpen('test')).toBe(true);

      fcPanels.toggle('test');
      expect(fcPanels.isOpen('test')).toBe(false);
    });

    it('should close other panels when opening a new one', async () => {
      const { fcPanels } = await freshImport();
      const el1 = document.createElement('div');
      el1.className = 'fc-panel';
      const el2 = document.createElement('div');
      el2.className = 'fc-panel';
      document.body.appendChild(el1);
      document.body.appendChild(el2);
      fcPanels.register('first', el1);
      fcPanels.register('second', el2);

      const scrim = document.createElement('div');
      scrim.className = 'fc-scrim';
      fcPanels.scrim = scrim;

      fcPanels.open('first');
      expect(fcPanels.isOpen('first')).toBe(true);

      fcPanels.open('second');
      expect(fcPanels.isOpen('first')).toBe(false);
      expect(fcPanels.isOpen('second')).toBe(true);
    });

    it('should close all panels', async () => {
      const { fcPanels } = await freshImport();
      const el1 = document.createElement('div');
      el1.className = 'fc-panel';
      const el2 = document.createElement('div');
      el2.className = 'fc-panel';
      document.body.appendChild(el1);
      document.body.appendChild(el2);
      fcPanels.register('first', el1);
      fcPanels.register('second', el2);

      const scrim = document.createElement('div');
      scrim.className = 'fc-scrim';
      fcPanels.scrim = scrim;

      fcPanels.open('first');
      fcPanels.open('second');
      fcPanels.closeAll();

      expect(fcPanels.isOpen('first')).toBe(false);
      expect(fcPanels.isOpen('second')).toBe(false);
    });

    it('should show scrim on panel open', async () => {
      const { fcPanels } = await freshImport();
      const scrim = document.createElement('div');
      scrim.className = 'fc-scrim';
      fcPanels.scrim = scrim;

      const el = document.createElement('div');
      el.className = 'fc-panel';
      fcPanels.register('test', el);

      fcPanels.open('test');
      expect(scrim.classList.contains('fc-scrim--visible')).toBe(true);
    });

    it('should hide scrim when all panels closed', async () => {
      const { fcPanels } = await freshImport();
      const scrim = document.createElement('div');
      scrim.className = 'fc-scrim fc-scrim--visible';
      fcPanels.scrim = scrim;

      const el = document.createElement('div');
      el.className = 'fc-panel fc-panel--open';
      fcPanels.register('test', el);

      fcPanels.close('test');
      expect(scrim.classList.contains('fc-scrim--visible')).toBe(false);
    });

    it('should not throw for non-existent panel names', async () => {
      const { fcPanels } = await freshImport();

      expect(() => fcPanels.open('nonexistent')).not.toThrow();
      expect(() => fcPanels.close('nonexistent')).not.toThrow();
      expect(() => fcPanels.toggle('nonexistent')).not.toThrow();
      expect(fcPanels.isOpen('nonexistent')).toBe(false);
    });

    it('should trigger vibration on panel open', async () => {
      const { fcPanels } = await freshImport();
      const el = document.createElement('div');
      el.className = 'fc-panel';
      fcPanels.register('test', el);

      const scrim = document.createElement('div');
      fcPanels.scrim = scrim;

      fcPanels.open('test');
      expect(navigator.vibrate).toHaveBeenCalledWith([10]);
    });
  });

  describe('initFCPanels()', () => {
    it('should create scrim, right, left, and bottom panels', async () => {
      // Need sidebar for right panel reparenting
      document.body.innerHTML = '<div id="sidebar"></div>';
      (window as any).__getActiveSketchData = vi.fn(() => ({ nodes: [], edges: [] }));

      const { initFCPanels } = await freshImport();
      initFCPanels();

      expect(document.getElementById('fcScrim')).not.toBeNull();
      expect(document.getElementById('fcPanelRight')).not.toBeNull();
      expect(document.getElementById('fcPanelLeft')).not.toBeNull();
      expect(document.getElementById('fcPanelBottom')).not.toBeNull();
    });

    it('should close all panels on Escape key', async () => {
      const { initFCPanels, fcPanels } = await freshImport();
      initFCPanels();

      const el = document.getElementById('fcPanelRight');
      if (el) el.classList.add('fc-panel--open');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      // All panels should be closed
      expect(fcPanels.isOpen('right')).toBe(false);
    });

    it('should close right panel via close button', async () => {
      document.body.innerHTML = '<div id="sidebar"></div>';
      const { initFCPanels, fcPanels } = await freshImport();
      initFCPanels();

      fcPanels.open('right');
      expect(fcPanels.isOpen('right')).toBe(true);

      const closeBtn = document.querySelector('#fcPanelRight .fc-panel__close') as HTMLButtonElement;
      closeBtn?.click();

      expect(fcPanels.isOpen('right')).toBe(false);
    });

    it('should close left panel via close button', async () => {
      const { initFCPanels, fcPanels } = await freshImport();
      initFCPanels();

      fcPanels.open('left');
      const closeBtn = document.querySelector('#fcPanelLeft .fc-panel__close') as HTMLButtonElement;
      closeBtn?.click();

      expect(fcPanels.isOpen('left')).toBe(false);
    });

    it('should close all panels when scrim is clicked', async () => {
      const { initFCPanels, fcPanels } = await freshImport();
      initFCPanels();

      fcPanels.open('left');
      const scrim = document.getElementById('fcScrim');
      scrim?.click();

      expect(fcPanels.isOpen('left')).toBe(false);
    });
  });

  describe('Bottom panel tool delegation', () => {
    it('should delegate click to original button via data-fc-delegate', async () => {
      // Add a target button
      const targetBtn = document.createElement('button');
      targetBtn.id = 'canvasZoomInBtn';
      const clickSpy = vi.fn();
      targetBtn.addEventListener('click', clickSpy);
      document.body.appendChild(targetBtn);

      const { initFCPanels, fcPanels } = await freshImport();
      initFCPanels();

      fcPanels.open('bottom');

      const delegateBtn = document.querySelector('[data-fc-delegate="canvasZoomInBtn"]') as HTMLButtonElement;
      delegateBtn?.click();

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should emit event via data-fc-action-emit', async () => {
      const emitSpy = vi.fn();
      (window as any).menuEvents = { emit: emitSpy, on: vi.fn() };

      const { initFCPanels, fcPanels } = await freshImport();
      initFCPanels();

      fcPanels.open('bottom');

      const emitBtn = document.querySelector('[data-fc-action-emit="importSketch"]') as HTMLButtonElement;
      emitBtn?.click();

      expect(emitSpy).toHaveBeenCalledWith('importSketch', expect.any(Object));
    });

    it('should navigate via data-fc-navigate', async () => {
      const { initFCPanels, fcPanels } = await freshImport();
      initFCPanels();

      fcPanels.open('bottom');

      const navBtn = document.querySelector('[data-fc-navigate="#/"]') as HTMLButtonElement;
      navBtn?.click();

      expect(window.location.hash).toBe('#/');
    });
  });
});
