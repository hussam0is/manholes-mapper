/**
 * Unit tests for src/legacy/undo-redo.js
 *
 * Tests the undo/redo stack operations, deep copy, data-value checks,
 * and shared delete helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shared-state before importing the module under test
vi.mock('../../src/legacy/shared-state.js', () => {
  const S: Record<string, any> = {
    undoStack: [],
    redoStack: [],
    undoBtn: null,
    redoBtn: null,
    nodes: [],
    edges: [],
    selectedNode: null,
    selectedEdge: null,
    _nodeMapDirty: false,
    _spatialGridDirty: false,
    _dataVersion: 0,
  };
  const F: Record<string, any> = {
    t: vi.fn((key: string) => key),
    renderDetails: vi.fn(),
    computeNodeTypes: vi.fn(),
    saveToStorage: vi.fn(),
    updateCanvasEmptyState: vi.fn(),
    scheduleDraw: vi.fn(),
    showToast: vi.fn(),
    findIncompleteEdges: vi.fn(() => []),
  };
  return { S, F };
});

import {
  pushUndo,
  performUndo,
  performRedo,
  deepCopyObj,
  nodeHasValuableData,
  edgeHasValuableData,
  deleteNodeShared,
  deleteEdgeShared,
  clearUndoStack,
} from '../../src/legacy/undo-redo.js';
import { S, F } from '../../src/legacy/shared-state.js';

beforeEach(() => {
  S.undoStack = [];
  S.redoStack = [];
  S.undoBtn = null;
  S.redoBtn = null;
  S.nodes = [];
  S.edges = [];
  S.selectedNode = null;
  S.selectedEdge = null;
  S._nodeMapDirty = false;
  S._spatialGridDirty = false;
  S._dataVersion = 0;
  vi.clearAllMocks();
  // Stub confirm to always return true
  vi.stubGlobal('confirm', vi.fn(() => true));
});

// ── deepCopyObj ──────────────────────────────────────────────────────────────

describe('deepCopyObj', () => {
  it('should deep-copy a plain object', () => {
    const orig = { id: 1, nested: { x: 10 } };
    const copy = deepCopyObj(orig);
    expect(copy).toEqual(orig);
    expect(copy).not.toBe(orig);
    expect(copy.nested).not.toBe(orig.nested);
  });

  it('should deep-copy arrays inside objects', () => {
    const orig = { tags: ['a', 'b'] };
    const copy = deepCopyObj(orig);
    expect(copy.tags).toEqual(['a', 'b']);
    copy.tags.push('c');
    expect(orig.tags).toHaveLength(2);
  });

  it('should handle empty object', () => {
    expect(deepCopyObj({})).toEqual({});
  });
});

// ── nodeHasValuableData ──────────────────────────────────────────────────────

describe('nodeHasValuableData', () => {
  it('should return true for gnssFixQuality 4 (Fixed)', () => {
    expect(nodeHasValuableData({ gnssFixQuality: 4 })).toBe(true);
  });

  it('should return true for gnssFixQuality 5 (Device Float)', () => {
    expect(nodeHasValuableData({ gnssFixQuality: 5 })).toBe(true);
  });

  it('should return false for other gnssFixQuality values', () => {
    expect(nodeHasValuableData({ gnssFixQuality: 0 })).toBe(false);
    expect(nodeHasValuableData({ gnssFixQuality: 1 })).toBe(false);
    expect(nodeHasValuableData({ gnssFixQuality: 3 })).toBe(false);
  });

  it('should return falsy for null/undefined node', () => {
    expect(nodeHasValuableData(null)).toBeFalsy();
    expect(nodeHasValuableData(undefined)).toBeFalsy();
  });

  it('should return false for node without gnssFixQuality', () => {
    expect(nodeHasValuableData({ id: 1 })).toBe(false);
  });
});

// ── edgeHasValuableData ──────────────────────────────────────────────────────

describe('edgeHasValuableData', () => {
  it('should return true when tail_measurement is set', () => {
    expect(edgeHasValuableData({ tail_measurement: '1.5' })).toBe(true);
  });

  it('should return true when head_measurement is set', () => {
    expect(edgeHasValuableData({ head_measurement: '2.0' })).toBe(true);
  });

  it('should return falsy when both measurements are empty strings', () => {
    expect(edgeHasValuableData({ tail_measurement: '', head_measurement: '' })).toBeFalsy();
  });

  it('should return false when measurements are whitespace-only', () => {
    expect(edgeHasValuableData({ tail_measurement: '  ', head_measurement: '  ' })).toBe(false);
  });

  it('should return falsy for null/undefined edge', () => {
    expect(edgeHasValuableData(null)).toBeFalsy();
    expect(edgeHasValuableData(undefined)).toBeFalsy();
  });

  it('should return falsy for edge without measurement fields', () => {
    expect(edgeHasValuableData({ id: 'e1' })).toBeFalsy();
  });
});

// ── pushUndo ─────────────────────────────────────────────────────────────────

describe('pushUndo', () => {
  it('should push action onto undoStack', () => {
    pushUndo({ type: 'nodeCreate', nodeId: '1' });
    expect(S.undoStack).toHaveLength(1);
    expect(S.undoStack[0].type).toBe('nodeCreate');
  });

  it('should clear redoStack when new action is pushed', () => {
    S.redoStack.push({ type: 'someRedo' });
    pushUndo({ type: 'nodeCreate', nodeId: '1' });
    expect(S.redoStack).toHaveLength(0);
  });

  it('should cap undoStack at 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      pushUndo({ type: 'nodeCreate', nodeId: String(i) });
    }
    expect(S.undoStack).toHaveLength(50);
    // The first 5 should have been shifted off
    expect(S.undoStack[0].nodeId).toBe('5');
  });

  it('should update undo/redo buttons when available', () => {
    S.undoBtn = { disabled: true };
    S.redoBtn = { disabled: false };
    pushUndo({ type: 'test' });
    expect(S.undoBtn.disabled).toBe(false);
    expect(S.redoBtn.disabled).toBe(true);
  });
});

// ── clearUndoStack ───────────────────────────────────────────────────────────

describe('clearUndoStack', () => {
  it('should clear both stacks', () => {
    S.undoStack.push({ type: 'a' });
    S.redoStack.push({ type: 'b' });
    clearUndoStack();
    expect(S.undoStack).toHaveLength(0);
    expect(S.redoStack).toHaveLength(0);
  });
});

// ── deleteNodeShared ─────────────────────────────────────────────────────────

describe('deleteNodeShared', () => {
  it('should delete a node with no connected edges', () => {
    const node = { id: '1', x: 10, y: 20 };
    S.nodes = [node];
    S.edges = [];

    const result = deleteNodeShared(node, true, true);

    expect(result).toBe(true);
    expect(S.nodes).toHaveLength(0);
    expect(S.undoStack).toHaveLength(1);
    expect(S.undoStack[0].type).toBe('nodeDelete');
    expect(F.computeNodeTypes).toHaveBeenCalled();
    expect(F.saveToStorage).toHaveBeenCalled();
  });

  it('should convert connected edges to dangling instead of removing them', () => {
    const node = { id: '1', x: 10, y: 20 };
    const otherNode = { id: '2', x: 50, y: 60 };
    const edge = { id: 'e1', tail: '1', head: '2' };
    S.nodes = [node, otherNode];
    S.edges = [edge];

    deleteNodeShared(node, true, true);

    // Edge should still exist but be dangling
    expect(S.edges).toHaveLength(1);
    expect(S.edges[0].isDangling).toBe(true);
    expect(S.edges[0].tail).toBeNull();
    expect(S.edges[0].tailPosition).toEqual({ x: 10, y: 20 });
  });

  it('should remove edge entirely when both ends would be null', () => {
    const node = { id: '1', x: 10, y: 20 };
    const edge = { id: 'e1', tail: '1', head: null };
    S.nodes = [node];
    S.edges = [edge];

    deleteNodeShared(node, true, true);

    expect(S.edges).toHaveLength(0);
  });

  it('should return false when user cancels confirmation', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const node = { id: '1', x: 10, y: 20 };
    S.nodes = [node];
    S.edges = [];

    const result = deleteNodeShared(node, true, false);
    expect(result).toBe(false);
    expect(S.nodes).toHaveLength(1);
  });

  it('should clear selection if deleted node was selected', () => {
    const node = { id: '1', x: 10, y: 20 };
    S.nodes = [node];
    S.edges = [];
    S.selectedNode = node;

    deleteNodeShared(node, true, true);

    expect(S.selectedNode).toBeNull();
    expect(F.renderDetails).toHaveBeenCalled();
  });

  it('should not push undo when pushToUndo is false', () => {
    const node = { id: '1', x: 10, y: 20 };
    S.nodes = [node];
    S.edges = [];

    deleteNodeShared(node, false, true);

    expect(S.undoStack).toHaveLength(0);
  });
});

// ── deleteEdgeShared ─────────────────────────────────────────────────────────

describe('deleteEdgeShared', () => {
  it('should delete an edge and push undo', () => {
    const edge = { id: 'e1', tail: '1', head: '2' };
    S.edges = [edge];

    const result = deleteEdgeShared(edge, true, true);

    expect(result).toBe(true);
    expect(S.edges).toHaveLength(0);
    expect(S.undoStack).toHaveLength(1);
    expect(S.undoStack[0].type).toBe('edgeDelete');
    expect(F.showToast).toHaveBeenCalled();
  });

  it('should return false when user cancels', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const edge = { id: 'e1', tail: '1', head: '2' };
    S.edges = [edge];

    const result = deleteEdgeShared(edge, true, false);
    expect(result).toBe(false);
    expect(S.edges).toHaveLength(1);
  });

  it('should clear selection if deleted edge was selected', () => {
    const edge = { id: 'e1', tail: '1', head: '2' };
    S.edges = [edge];
    S.selectedEdge = edge;

    deleteEdgeShared(edge, true, true);

    expect(S.selectedEdge).toBeNull();
    expect(F.renderDetails).toHaveBeenCalled();
  });
});

// ── performUndo ──────────────────────────────────────────────────────────────

describe('performUndo', () => {
  it('should show toast when undo stack is empty', () => {
    performUndo();
    expect(F.showToast).toHaveBeenCalledWith('toasts.undoEmpty');
  });

  it('should undo nodeCreate by removing the node', () => {
    const node = { id: '1', x: 10, y: 20 };
    S.nodes = [node];
    S.edges = [];
    S.undoStack = [{ type: 'nodeCreate', nodeId: '1' }];

    performUndo();

    expect(S.nodes).toHaveLength(0);
    expect(S.undoStack).toHaveLength(0);
    expect(S.redoStack).toHaveLength(1);
    expect(S.redoStack[0].type).toBe('nodeRestore');
  });

  it('should undo edgeCreate by removing the edge', () => {
    const edge = { id: 'e1', tail: '1', head: '2' };
    S.edges = [edge];
    S.undoStack = [{ type: 'edgeCreate', edgeId: 'e1' }];

    performUndo();

    expect(S.edges).toHaveLength(0);
    expect(S.redoStack).toHaveLength(1);
    expect(S.redoStack[0].type).toBe('edgeRestore');
  });

  it('should undo nodeMove by restoring old position', () => {
    const node = { id: '1', x: 50, y: 60 };
    S.nodes = [node];
    S.undoStack = [{
      type: 'nodeMove',
      nodeId: '1',
      oldX: 10,
      oldY: 20,
    }];
    (F as any).updateNodeTimestamp = vi.fn();

    performUndo();

    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
    expect(S.redoStack).toHaveLength(1);
    expect(S.redoStack[0].type).toBe('nodeMove');
    expect(S.redoStack[0].oldX).toBe(50);
  });

  it('should undo nodeDelete by restoring node and edges', () => {
    S.nodes = [];
    S.edges = [];
    S.undoStack = [{
      type: 'nodeDelete',
      node: { id: '1', x: 10, y: 20 },
      removedEdges: [{ id: 'e1', tail: '1', head: '2' }],
      convertedEdges: [],
    }];

    performUndo();

    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].id).toBe('1');
    expect(S.edges).toHaveLength(1);
    expect(S.redoStack).toHaveLength(1);
  });

  it('should undo edgeDelete by restoring the edge', () => {
    S.edges = [];
    S.undoStack = [{
      type: 'edgeDelete',
      edge: { id: 'e1', tail: '1', head: '2' },
    }];

    performUndo();

    expect(S.edges).toHaveLength(1);
    expect(S.edges[0].id).toBe('e1');
  });

  it('should skip stale nodeCreate undo when node not found', () => {
    S.nodes = [];
    S.undoStack = [{ type: 'nodeCreate', nodeId: '999' }];

    performUndo();

    expect(S.undoStack).toHaveLength(0);
  });
});

// ── performRedo ──────────────────────────────────────────────────────────────

describe('performRedo', () => {
  it('should show toast when redo stack is empty', () => {
    performRedo();
    expect(F.showToast).toHaveBeenCalledWith('toasts.redoEmpty');
  });

  it('should redo nodeRestore by re-adding node and edges', () => {
    S.nodes = [];
    S.edges = [];
    S.redoStack = [{
      type: 'nodeRestore',
      node: { id: '1', x: 10, y: 20 },
      edges: [{ id: 'e1', tail: '1', head: '2' }],
    }];

    performRedo();

    expect(S.nodes).toHaveLength(1);
    expect(S.edges).toHaveLength(1);
    expect(S.undoStack).toHaveLength(1);
    expect(S.undoStack[0].type).toBe('nodeCreate');
  });

  it('should redo edgeRestore by re-adding edge', () => {
    S.edges = [];
    S.redoStack = [{
      type: 'edgeRestore',
      edge: { id: 'e1', tail: '1', head: '2' },
    }];

    performRedo();

    expect(S.edges).toHaveLength(1);
    expect(S.undoStack).toHaveLength(1);
    expect(S.undoStack[0].type).toBe('edgeCreate');
  });

  it('should redo nodeMove by moving to redo position', () => {
    const node = { id: '1', x: 10, y: 20 };
    S.nodes = [node];
    S.redoStack = [{
      type: 'nodeMove',
      nodeId: '1',
      oldX: 50,
      oldY: 60,
    }];
    (F as any).updateNodeTimestamp = vi.fn();

    performRedo();

    expect(node.x).toBe(50);
    expect(node.y).toBe(60);
    expect(S.undoStack).toHaveLength(1);
  });

  it('should redo edgeDelete by re-removing the edge', () => {
    const edge = { id: 'e1', tail: '1', head: '2' };
    S.edges = [edge];
    S.redoStack = [{
      type: 'edgeDelete',
      edge: { id: 'e1', tail: '1', head: '2' },
    }];

    performRedo();

    expect(S.edges).toHaveLength(0);
    expect(S.undoStack).toHaveLength(1);
  });
});
