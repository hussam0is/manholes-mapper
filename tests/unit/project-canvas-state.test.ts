/**
 * Unit tests for src/project/project-canvas-state.js
 *
 * Tests the exported project-canvas state management functions
 * with mocked fetch and window globals.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadProjectSketches,
  isProjectCanvasMode,
  getCurrentProjectId,
  clearProjectCanvas,
  getBackgroundSketches,
  setSketchVisibility,
  switchActiveSketch,
} from '../../src/project/project-canvas-state.js';

// ── Mock data ───────────────────────────────────────────────────────────────

const mockSketches = [
  {
    id: 'sketch-1',
    name: 'Sketch A',
    nodes: [{ id: '1', x: 10, y: 20 }, { id: '2', x: 30, y: 40 }],
    edges: [{ tail: '1', head: '2' }],
    adminConfig: { field: 'value' },
    snapshotInputFlowConfig: {},
  },
  {
    id: 'sketch-2',
    name: 'Sketch B',
    nodes: [{ id: '3', x: 50, y: 60 }],
    edges: [],
    adminConfig: {},
    snapshotInputFlowConfig: {},
  },
  {
    id: 'sketch-3',
    name: 'Sketch C',
    nodes: [],
    edges: [],
    adminConfig: {},
    snapshotInputFlowConfig: {},
  },
];

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset module state by clearing any loaded project
  clearProjectCanvas();

  // Mock window globals
  window.__setActiveSketchData = vi.fn();
  window.__getActiveSketchData = vi.fn(() => ({
    nodes: [{ id: '1', x: 10, y: 20 }],
    edges: [],
  }));
  window.__scheduleDraw = vi.fn();
  window.showToast = vi.fn();
  window.t = vi.fn((key: string) => key);

  // Mock fetch
  globalThis.fetch = vi.fn();
});

function mockFetchSuccess(data: any) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status = 500) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('project-canvas-state', () => {
  describe('loadProjectSketches()', () => {
    it('fetches from correct URL', async () => {
      mockFetchSuccess({ sketches: mockSketches });
      await loadProjectSketches('proj-123');
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/projects/proj-123?fullSketches=true');
    });

    it('returns sketches array', async () => {
      mockFetchSuccess({ sketches: mockSketches });
      const result = await loadProjectSketches('proj-123');
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('sketch-1');
    });

    it('sets active sketch to first and enters project-canvas mode', async () => {
      mockFetchSuccess({ sketches: mockSketches });
      await loadProjectSketches('proj-123');
      expect(isProjectCanvasMode()).toBe(true);
      expect(window.__setActiveSketchData).toHaveBeenCalledOnce();
      expect(window.__setActiveSketchData).toHaveBeenCalledWith(
        expect.objectContaining({
          sketchId: 'sketch-1',
          sketchName: 'Sketch A',
          projectId: 'proj-123',
        })
      );
    });

    it('throws on API error', async () => {
      mockFetchError(500);
      await expect(loadProjectSketches('proj-bad')).rejects.toThrow(
        'Failed to load project sketches: 500'
      );
    });
  });

  describe('isProjectCanvasMode() + getCurrentProjectId()', () => {
    it('returns false/null before any load', () => {
      expect(isProjectCanvasMode()).toBe(false);
      expect(getCurrentProjectId()).toBeNull();
    });

    it('returns true/projectId after loadProjectSketches', async () => {
      mockFetchSuccess({ sketches: mockSketches });
      await loadProjectSketches('proj-456');
      expect(isProjectCanvasMode()).toBe(true);
      expect(getCurrentProjectId()).toBe('proj-456');
    });
  });

  describe('clearProjectCanvas()', () => {
    it('clears mode after load', async () => {
      mockFetchSuccess({ sketches: mockSketches });
      await loadProjectSketches('proj-123');
      expect(isProjectCanvasMode()).toBe(true);

      clearProjectCanvas();
      expect(isProjectCanvasMode()).toBe(false);
      expect(getCurrentProjectId()).toBeNull();
    });

    it('snapshots active sketch before clearing', async () => {
      mockFetchSuccess({ sketches: mockSketches });
      await loadProjectSketches('proj-123');

      clearProjectCanvas();
      expect(window.__getActiveSketchData).toHaveBeenCalled();
    });
  });

  describe('getBackgroundSketches() + setSketchVisibility()', () => {
    beforeEach(async () => {
      mockFetchSuccess({ sketches: mockSketches });
      await loadProjectSketches('proj-123');
    });

    it('excludes active sketch from background', () => {
      const bg = getBackgroundSketches();
      const bgIds = bg.map((s: any) => s.id);
      expect(bgIds).not.toContain('sketch-1'); // active sketch
      expect(bgIds).toContain('sketch-2');
      expect(bgIds).toContain('sketch-3');
    });

    it('hiding a sketch removes it from background', () => {
      setSketchVisibility('sketch-2', false);
      const bg = getBackgroundSketches();
      const bgIds = bg.map((s: any) => s.id);
      expect(bgIds).not.toContain('sketch-2');
      expect(bgIds).toContain('sketch-3');
    });
  });

  describe('switchActiveSketch()', () => {
    beforeEach(async () => {
      mockFetchSuccess({ sketches: mockSketches });
      await loadProjectSketches('proj-123');
      // Reset the mock after initial load
      (window.__setActiveSketchData as ReturnType<typeof vi.fn>).mockClear();
    });

    it('switches active and calls __setActiveSketchData', () => {
      switchActiveSketch('sketch-2');
      expect(window.__setActiveSketchData).toHaveBeenCalledWith(
        expect.objectContaining({
          sketchId: 'sketch-2',
          sketchName: 'Sketch B',
        })
      );
    });

    it('no-op when switching to already active sketch', () => {
      switchActiveSketch('sketch-1');
      expect(window.__setActiveSketchData).not.toHaveBeenCalled();
    });
  });
});
