/**
 * Unit tests for FC Gesture Support (fc-gestures.js)
 *
 * Tests edge-swipe detection for opening panels:
 *   - Right edge swipe → open right panel
 *   - Left edge swipe → open left panel
 *   - Bottom swipe up → open bottom panel
 *   - RTL support
 *   - Threshold enforcement
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function freshImport() {
  vi.resetModules();
  return await import('../../src/field-commander/fc-gestures.js');
}

function createMockPanelManager() {
  return {
    open: vi.fn(),
    close: vi.fn(),
    closeAll: vi.fn(),
    toggle: vi.fn(),
    isOpen: vi.fn(() => false),
  };
}

function simulatePointerDown(x: number, y: number, target?: HTMLElement) {
  const el = target || document.body;
  const event = new PointerEvent('pointerdown', {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  el.dispatchEvent(event);
}

function simulatePointerUp(x: number, y: number) {
  const event = new PointerEvent('pointerup', {
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  document.body.dispatchEvent(event);
}

describe('FC Gesture Support', () => {
  let panelManager: ReturnType<typeof createMockPanelManager>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.dir = '';
    document.documentElement.dir = '';

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true, configurable: true });

    panelManager = createMockPanelManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initPanelGestures()', () => {
    it('should not throw when panelManager is null', async () => {
      const { initPanelGestures } = await freshImport();
      expect(() => initPanelGestures(null)).not.toThrow();
    });

    it('should register event listeners', async () => {
      const { initPanelGestures } = await freshImport();
      const addSpy = vi.spyOn(document, 'addEventListener');
      initPanelGestures(panelManager);

      const eventNames = addSpy.mock.calls.map(c => c[0]);
      expect(eventNames).toContain('pointerdown');
      expect(eventNames).toContain('pointerup');
      expect(eventNames).toContain('pointercancel');
    });
  });

  describe('Left edge swipe (LTR)', () => {
    it('should open left panel on swipe from left edge', async () => {
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      // Start at left edge (x <= 24)
      simulatePointerDown(10, 400);
      // Swipe right past threshold (60px)
      simulatePointerUp(80, 400);

      expect(panelManager.open).toHaveBeenCalledWith('left');
    });

    it('should not open left panel if swipe is too short', async () => {
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      simulatePointerDown(10, 400);
      simulatePointerUp(50, 400); // Only 40px, threshold is 60

      expect(panelManager.open).not.toHaveBeenCalled();
    });
  });

  describe('Right edge swipe (LTR)', () => {
    it('should open right panel on swipe from right edge', async () => {
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      // Start at right edge (x >= innerWidth - 24 = 376)
      simulatePointerDown(390, 400);
      // Swipe left past threshold
      simulatePointerUp(320, 400);

      expect(panelManager.open).toHaveBeenCalledWith('right');
    });
  });

  describe('Bottom swipe up', () => {
    it('should open bottom panel on upward swipe from bottom', async () => {
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      // Start at bottom zone (y >= innerHeight - 80 = 720)
      simulatePointerDown(200, 750);
      // Swipe up past threshold
      simulatePointerUp(200, 680);

      expect(panelManager.open).toHaveBeenCalledWith('bottom');
    });

    it('should not open bottom panel on insufficient swipe', async () => {
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      simulatePointerDown(200, 750);
      simulatePointerUp(200, 720); // Only 30px up, threshold is 60

      expect(panelManager.open).not.toHaveBeenCalled();
    });
  });

  describe('RTL support', () => {
    it('should swap left/right edges in RTL mode', async () => {
      document.dir = 'rtl';
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      // Left edge in RTL → should map to 'right' panel
      simulatePointerDown(10, 400);
      simulatePointerUp(80, 400);

      expect(panelManager.open).toHaveBeenCalledWith('right');
    });

    it('should swap right edge in RTL mode', async () => {
      document.documentElement.dir = 'rtl';
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      // Right edge in RTL → maps to 'left' edge name
      // In RTL, right edge swipe inward direction check is: dx > SWIPE_THRESHOLD
      // So we swipe leftward (dx negative) which won't work — actually let's check the code:
      // edge='left' (RTL maps right physical edge to 'left')
      // For edge === 'left': swipeInward = isRTL ? dx < -SWIPE_THRESHOLD : dx > SWIPE_THRESHOLD
      // In RTL, swipeInward for 'left' edge requires dx < -60
      simulatePointerDown(390, 400);
      simulatePointerUp(320, 400); // dx = -70, which is < -60

      expect(panelManager.open).toHaveBeenCalledWith('left');
    });
  });

  describe('Edge cases', () => {
    it('should not trigger if touch starts in middle of screen', async () => {
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      simulatePointerDown(200, 400);
      simulatePointerUp(300, 400);

      expect(panelManager.open).not.toHaveBeenCalled();
    });

    it('should not trigger if a panel is already open', async () => {
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      // Add a panel element with open class
      const panel = document.createElement('div');
      panel.className = 'fc-panel fc-panel--open';
      document.body.appendChild(panel);

      simulatePointerDown(10, 400);
      simulatePointerUp(80, 400);

      expect(panelManager.open).not.toHaveBeenCalled();
    });

    it('should not trigger if touching action bar', async () => {
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      const actionBar = document.createElement('div');
      actionBar.className = 'fc-action-bar';
      document.body.appendChild(actionBar);

      // Create event targeting the action bar
      const downEvent = new PointerEvent('pointerdown', {
        clientX: 10,
        clientY: 400,
        bubbles: true,
      });
      Object.defineProperty(downEvent, 'target', { value: actionBar });
      document.dispatchEvent(downEvent);

      simulatePointerUp(80, 400);

      expect(panelManager.open).not.toHaveBeenCalled();
    });

    it('should cancel tracking on pointercancel', async () => {
      const { initPanelGestures } = await freshImport();
      initPanelGestures(panelManager);

      simulatePointerDown(10, 400);
      document.body.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
      simulatePointerUp(80, 400);

      expect(panelManager.open).not.toHaveBeenCalled();
    });
  });
});
