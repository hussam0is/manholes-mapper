/**
 * Unit tests for src/legacy/finish-workday.js
 *
 * Tests getDanglingEdges and resolveDanglingEdges functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all deep dependencies
vi.mock('../../src/db.js', () => ({
  saveBackup: vi.fn(),
  getBackups: vi.fn(),
  clearBackupsByType: vi.fn(),
  deleteBackup: vi.fn(),
  loadCurrentSketch: vi.fn(),
  getAllSketches: vi.fn(),
  saveCurrentSketch: vi.fn(),
  saveSketch: vi.fn(),
  deleteSketch: vi.fn(),
}));

vi.mock('../../src/utils/backup-manager.js', () => ({
  clearHourlyBackups: vi.fn(),
  saveDailyBackup: vi.fn(),
}));

vi.mock('../../src/legacy/shared-state.js', () => ({
  S: {
    nodes: [],
    edges: [],
  },
  F: {
    t: (...args: any[]) => args[0],
    showToast: () => {},
    computeNodeTypes: () => {},
    saveToStorage: () => {},
    scheduleDraw: () => {},
    createNode: () => ({}),
    hidePanelAnimated: () => {},
  },
}));

import { getDanglingEdges, resolveDanglingEdges } from '../../src/legacy/finish-workday.js';
import { S, F } from '../../src/legacy/shared-state.js';

beforeEach(() => {
  (S as any).nodes = [];
  (S as any).edges = [];
  (F as any).showToast = vi.fn();
  (F as any).computeNodeTypes = vi.fn();
  (F as any).saveToStorage = vi.fn();
  (F as any).scheduleDraw = vi.fn();
  (F as any).createNode = vi.fn(() => ({ id: 'new1' }));
});

// ── getDanglingEdges ─────────────────────────────────────────────────────────

describe('getDanglingEdges', () => {
  it('should return edges with head === null', () => {
    (S as any).edges = [
      { id: 'e1', tail: '1', head: null },
      { id: 'e2', tail: '1', head: '2' },
      { id: 'e3', tail: '2', head: null },
    ];

    const result = getDanglingEdges();
    expect(result).toHaveLength(2);
    expect(result.map((e: any) => e.id)).toEqual(['e1', 'e3']);
  });

  it('should return edges with isDangling === true', () => {
    (S as any).edges = [
      { id: 'e1', tail: '1', head: '2', isDangling: true },
      { id: 'e2', tail: '1', head: '2', isDangling: false },
    ];

    const result = getDanglingEdges();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('should return edges matching either condition (head null OR isDangling)', () => {
    (S as any).edges = [
      { id: 'e1', tail: '1', head: null, isDangling: true },
      { id: 'e2', tail: '1', head: null, isDangling: false },
      { id: 'e3', tail: '1', head: '2', isDangling: true },
    ];

    const result = getDanglingEdges();
    expect(result).toHaveLength(3);
  });

  it('should return empty array when no dangling edges exist', () => {
    (S as any).edges = [
      { id: 'e1', tail: '1', head: '2' },
      { id: 'e2', tail: '2', head: '3' },
    ];

    expect(getDanglingEdges()).toHaveLength(0);
  });

  it('should return empty array when edges list is empty', () => {
    (S as any).edges = [];
    expect(getDanglingEdges()).toHaveLength(0);
  });

  it('should not include edges where head is defined and isDangling is falsy', () => {
    (S as any).edges = [
      { id: 'e1', tail: '1', head: '2', isDangling: false },
      { id: 'e2', tail: '1', head: '2' },
    ];

    expect(getDanglingEdges()).toHaveLength(0);
  });

  it('should handle edges with head === undefined as non-dangling', () => {
    (S as any).edges = [
      { id: 'e1', tail: '1' }, // head is undefined, not null
    ];

    expect(getDanglingEdges()).toHaveLength(0);
  });
});

// ── resolveDanglingEdges ─────────────────────────────────────────────────────
// Note: resolveDanglingEdges captures `danglingEdgesListEl` at module load time.
// In the test env, the DOM element doesn't exist → selects = [].
// With no selects, validation passes, forEach skips (select[i] undefined).

describe('resolveDanglingEdges', () => {
  it('should return true with no DOM selects (no validation triggers)', () => {
    (S as any).edges = [{ id: 'e1', tail: '1', head: null }];
    (S as any).nodes = [{ id: '1', x: 10, y: 20 }];

    const result = resolveDanglingEdges();
    expect(result).toBe(true);
  });

  it('should call computeNodeTypes and saveToStorage', () => {
    (S as any).edges = [{ id: 'e1', tail: '1', head: null }];
    (S as any).nodes = [{ id: '1', x: 10, y: 20 }];

    resolveDanglingEdges();

    expect((F as any).computeNodeTypes).toHaveBeenCalled();
    expect((F as any).saveToStorage).toHaveBeenCalled();
    expect((F as any).scheduleDraw).toHaveBeenCalled();
  });

  it('should not call createNode when no DOM selects are available', () => {
    (S as any).edges = [{ id: 'e1', tail: '1', head: null }];
    (S as any).nodes = [{ id: '1', x: 10, y: 20 }];

    resolveDanglingEdges();

    expect((F as any).createNode).not.toHaveBeenCalled();
  });
});
