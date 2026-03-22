/**
 * Unit tests for FC Territory Overlay (fc-territory.js)
 *
 * Tests the territory overlay drawing logic:
 *   - Green glow for GPS-captured nodes
 *   - Red ring for nodes missing coordinates
 *   - Skipped nodes (Home, ForLater, schematic)
 *   - FC mode gating
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function freshImport() {
  vi.resetModules();
  return await import('../../src/field-commander/fc-territory.js');
}

describe('FC Territory Overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    (window as any).__getActiveSketchData = undefined;
    (window as any).__getSketchStats = undefined;
    (window as any).__fcTerritoryOverlay = undefined;
  });

  afterEach(() => {
    delete (window as any).__getActiveSketchData;
    delete (window as any).__getSketchStats;
    delete (window as any).__fcTerritoryOverlay;
  });

  describe('initFCTerritory()', () => {
    it('should register __fcTerritoryOverlay on window', async () => {
      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      expect(typeof (window as any).__fcTerritoryOverlay).toBe('function');
    });
  });

  describe('drawTerritoryOverlay()', () => {
    function createMockCtx() {
      return {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        setLineDash: vi.fn(),
        createRadialGradient: vi.fn(() => ({
          addColorStop: vi.fn(),
        })),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
      };
    }

    it('should not draw when FC mode is off', async () => {
      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      // body does NOT have fc-mode class
      (window as any).__fcTerritoryOverlay(ctx, 1, { x: 0, y: 0 }, 1, 1);

      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('should not draw when no nodes are available', async () => {
      document.body.classList.add('fc-mode');

      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      (window as any).__getActiveSketchData = vi.fn(() => ({ nodes: [], edges: [] }));

      (window as any).__fcTerritoryOverlay(ctx, 1, { x: 0, y: 0 }, 1, 1);

      // save is called but then immediately returns due to empty nodes
      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it('should draw green glow for nodes with survey coordinates', async () => {
      document.body.classList.add('fc-mode');

      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      (window as any).__getActiveSketchData = vi.fn(() => ({
        nodes: [
          { id: 1, x: 100, y: 100, nodeType: 'Manhole', surveyX: 200, surveyY: 300 },
        ],
        edges: [],
      }));

      (window as any).__fcTerritoryOverlay(ctx, 1, { x: 0, y: 0 }, 1, 1);

      expect(ctx.createRadialGradient).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('should draw red ring for nodes without survey coordinates', async () => {
      document.body.classList.add('fc-mode');

      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      (window as any).__getActiveSketchData = vi.fn(() => ({
        nodes: [
          { id: 1, x: 100, y: 100, nodeType: 'Manhole' },
        ],
        edges: [],
      }));

      (window as any).__fcTerritoryOverlay(ctx, 1, { x: 0, y: 0 }, 1, 1);

      expect(ctx.stroke).toHaveBeenCalled();
      expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    });

    it('should skip Home-type nodes', async () => {
      document.body.classList.add('fc-mode');

      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      (window as any).__getActiveSketchData = vi.fn(() => ({
        nodes: [
          { id: 1, x: 100, y: 100, nodeType: 'Home' },
        ],
        edges: [],
      }));

      (window as any).__fcTerritoryOverlay(ctx, 1, { x: 0, y: 0 }, 1, 1);

      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it('should skip ForLater-type nodes', async () => {
      document.body.classList.add('fc-mode');

      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      (window as any).__getActiveSketchData = vi.fn(() => ({
        nodes: [
          { id: 1, x: 100, y: 100, nodeType: 'ForLater' },
        ],
        edges: [],
      }));

      (window as any).__fcTerritoryOverlay(ctx, 1, { x: 0, y: 0 }, 1, 1);

      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it('should skip schematic nodes (accuracyLevel === 1)', async () => {
      document.body.classList.add('fc-mode');

      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      (window as any).__getActiveSketchData = vi.fn(() => ({
        nodes: [
          { id: 1, x: 100, y: 100, nodeType: 'Manhole', accuracyLevel: 1 },
        ],
        edges: [],
      }));

      (window as any).__fcTerritoryOverlay(ctx, 1, { x: 0, y: 0 }, 1, 1);

      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it('should use __getSketchStats if available', async () => {
      document.body.classList.add('fc-mode');

      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      (window as any).__getSketchStats = vi.fn(() => ({
        nodes: [
          { id: 1, x: 100, y: 100, nodeType: 'Manhole', surveyX: 10, surveyY: 20 },
        ],
      }));

      (window as any).__fcTerritoryOverlay(ctx, 1, { x: 0, y: 0 }, 1, 1);

      expect((window as any).__getSketchStats).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('should apply viewScale and viewTranslate correctly', async () => {
      document.body.classList.add('fc-mode');

      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      (window as any).__getActiveSketchData = vi.fn(() => ({
        nodes: [
          { id: 1, x: 100, y: 200, nodeType: 'Manhole', surveyX: 10, surveyY: 20 },
        ],
        edges: [],
      }));

      const viewScale = 2;
      const viewTranslate = { x: 50, y: 100 };
      const stretchX = 1;
      const stretchY = 1;

      (window as any).__fcTerritoryOverlay(ctx, viewScale, viewTranslate, stretchX, stretchY);

      // The gradient should be created at the correct screen position
      expect(ctx.createRadialGradient).toHaveBeenCalled();
      const gradientCall = ctx.createRadialGradient.mock.calls[0];
      // screenX = node.x * stretchX * viewScale + viewTranslate.x = 100 * 1 * 2 + 50 = 250
      // screenY = node.y * stretchY * viewScale + viewTranslate.y = 200 * 1 * 2 + 100 = 500
      expect(gradientCall[0]).toBe(250);
      expect(gradientCall[1]).toBe(500);
    });

    it('should handle errors in data retrieval gracefully', async () => {
      document.body.classList.add('fc-mode');

      const { initFCTerritory } = await freshImport();
      initFCTerritory();

      const ctx = createMockCtx();
      (window as any).__getSketchStats = vi.fn(() => { throw new Error('fail'); });
      (window as any).__getActiveSketchData = undefined;

      // Should not throw
      expect(() => {
        (window as any).__fcTerritoryOverlay(ctx, 1, { x: 0, y: 0 }, 1, 1);
      }).not.toThrow();
    });
  });
});
