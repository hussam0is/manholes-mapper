/**
 * Unit tests for src/legacy/field-history.js
 *
 * Tests field history persistence (localStorage), diameter-to-color mapping,
 * usage tracking, and sorted option retrieval.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shared-state
vi.mock('../../src/legacy/shared-state.js', () => ({
  S: { currentLang: 'en' },
  F: { t: vi.fn((key: string) => key) },
}));

// Mock persistence module for STORAGE_KEYS
vi.mock('../../src/state/persistence.js', () => ({
  STORAGE_KEYS: {
    fieldHistory: 'graphSketch.fieldHistory',
  },
}));

// Mock library-manager
vi.mock('../../src/legacy/library-manager.js', () => ({
  getLibrary: vi.fn(() => []),
}));

import {
  loadFieldHistory,
  saveFieldHistory,
  diameterToColor,
  trackFieldUsage,
  getSortedOptions,
} from '../../src/legacy/field-history.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// ── loadFieldHistory ─────────────────────────────────────────────────────────

describe('loadFieldHistory', () => {
  it('should return default empty structure when nothing stored', () => {
    const result = loadFieldHistory();
    expect(result).toEqual({ nodes: {}, edges: {} });
  });

  it('should return parsed data from localStorage', () => {
    const data = { nodes: { material: { PVC: 3 } }, edges: {} };
    localStorage.setItem('graphSketch.fieldHistory', JSON.stringify(data));

    const result = loadFieldHistory();
    expect(result).toEqual(data);
  });

  it('should return default on invalid JSON', () => {
    localStorage.setItem('graphSketch.fieldHistory', '{bad json');

    const result = loadFieldHistory();
    expect(result).toEqual({ nodes: {}, edges: {} });
  });
});

// ── saveFieldHistory ─────────────────────────────────────────────────────────

describe('saveFieldHistory', () => {
  it('should persist data to localStorage', () => {
    const data = { nodes: { material: { PVC: 5 } }, edges: {} };
    saveFieldHistory(data);

    const stored = JSON.parse(localStorage.getItem('graphSketch.fieldHistory')!);
    expect(stored).toEqual(data);
  });

  it('should handle save errors gracefully', () => {
    // Simulate storage quota exceeded
    const orig = localStorage.setItem;
    localStorage.setItem = vi.fn(() => { throw new Error('QuotaExceeded'); });

    expect(() => saveFieldHistory({ nodes: {}, edges: {} })).not.toThrow();

    localStorage.setItem = orig;
  });
});

// ── diameterToColor ──────────────────────────────────────────────────────────

describe('diameterToColor', () => {
  it('should return null for non-positive diameters', () => {
    expect(diameterToColor(0)).toBeNull();
    expect(diameterToColor(-10)).toBeNull();
    expect(diameterToColor(NaN)).toBeNull();
    expect(diameterToColor('')).toBeNull();
    expect(diameterToColor(null)).toBeNull();
    expect(diameterToColor(undefined)).toBeNull();
  });

  it('should return an rgb() color string for valid diameters', () => {
    const color = diameterToColor(500);
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it('should return blue-ish for small diameters (near 0mm)', () => {
    const color = diameterToColor(1);
    // t ≈ 0.0005, in first segment: r=0, g≈0, b≈220
    expect(color).toMatch(/^rgb\(0,\d+,\d+\)$/);
  });

  it('should return red-ish for large diameters (near/above 2000mm)', () => {
    const color = diameterToColor(2000);
    // t = 1.0, last segment s=1: r=230, g=0, b=0
    expect(color).toBe('rgb(230,0,0)');
  });

  it('should clamp diameters above 2000mm to max', () => {
    const at2000 = diameterToColor(2000);
    const at3000 = diameterToColor(3000);
    expect(at2000).toBe(at3000);
  });

  it('should return green-ish for mid-range diameters (around 1000mm)', () => {
    const color = diameterToColor(1000);
    // t = 0.5, third segment start: r=0, g=200, b=0
    expect(color).toBe('rgb(0,200,0)');
  });

  it('should accept string diameters', () => {
    const color = diameterToColor('500');
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });
});

// ── trackFieldUsage ──────────────────────────────────────────────────────────

describe('trackFieldUsage', () => {
  it('should increment usage count for a value', () => {
    trackFieldUsage('nodes', 'material', 'PVC');
    trackFieldUsage('nodes', 'material', 'PVC');
    trackFieldUsage('nodes', 'material', 'Steel');

    const history = loadFieldHistory();
    expect(history.nodes.material.PVC).toBe(2);
    expect(history.nodes.material.Steel).toBe(1);
  });

  it('should ignore null, undefined, and empty string values', () => {
    trackFieldUsage('nodes', 'material', null);
    trackFieldUsage('nodes', 'material', undefined);
    trackFieldUsage('nodes', 'material', '');

    const history = loadFieldHistory();
    expect(history).toEqual({ nodes: {}, edges: {} });
  });

  it('should work for edge scope', () => {
    trackFieldUsage('edges', 'line_diameter', '200');

    const history = loadFieldHistory();
    expect(history.edges.line_diameter['200']).toBe(1);
  });

  it('should convert numeric values to strings as keys', () => {
    trackFieldUsage('nodes', 'access', 1);
    trackFieldUsage('nodes', 'access', 1);

    const history = loadFieldHistory();
    expect(history.nodes.access['1']).toBe(2);
  });
});

// ── getSortedOptions ─────────────────────────────────────────────────────────

describe('getSortedOptions', () => {
  it('should return options sorted by usage count (descending)', () => {
    // Set up history: B used 3 times, A used 1 time, C unused
    trackFieldUsage('nodes', 'material', 'B');
    trackFieldUsage('nodes', 'material', 'B');
    trackFieldUsage('nodes', 'material', 'B');
    trackFieldUsage('nodes', 'material', 'A');

    const options = ['A', 'B', 'C'];
    const sorted = getSortedOptions('nodes', 'material', options);

    expect(sorted[0]).toBe('B');
    expect(sorted[1]).toBe('A');
    expect(sorted[2]).toBe('C');
  });

  it('should preserve original order for items with equal usage', () => {
    const options = ['X', 'Y', 'Z'];
    const sorted = getSortedOptions('nodes', 'material', options);
    // No history → all have count 0, original order preserved
    expect(sorted).toEqual(['X', 'Y', 'Z']);
  });

  it('should handle options with code/label properties', () => {
    trackFieldUsage('edges', 'edge_type', 'sewer');
    trackFieldUsage('edges', 'edge_type', 'sewer');
    trackFieldUsage('edges', 'edge_type', 'water');

    const options = [
      { code: 'water', label: 'Water' },
      { code: 'sewer', label: 'Sewer' },
      { code: 'drain', label: 'Drain' },
    ];

    const sorted = getSortedOptions('edges', 'edge_type', options);
    expect(sorted[0].code).toBe('sewer');
    expect(sorted[1].code).toBe('water');
    expect(sorted[2].code).toBe('drain');
  });

  it('should not mutate the original options array', () => {
    const options = ['C', 'B', 'A'];
    trackFieldUsage('nodes', 'test', 'A');

    getSortedOptions('nodes', 'test', options);
    expect(options).toEqual(['C', 'B', 'A']);
  });

  it('should handle empty options array', () => {
    const sorted = getSortedOptions('nodes', 'material', []);
    expect(sorted).toEqual([]);
  });

  it('should handle missing field history gracefully', () => {
    const options = ['A', 'B'];
    const sorted = getSortedOptions('nonexistent', 'field', options);
    expect(sorted).toEqual(['A', 'B']);
  });
});
