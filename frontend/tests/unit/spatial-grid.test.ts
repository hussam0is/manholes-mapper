import { describe, it, expect } from 'vitest';
import { SpatialGrid, buildNodeGrid, buildEdgeGrid } from '../../src/utils/spatial-grid.js';

describe('SpatialGrid', () => {
  it('should create an empty grid', () => {
    const grid = new SpatialGrid(100);
    expect(grid.size).toBe(0);
  });

  it('should insert and query items', () => {
    const grid = new SpatialGrid(100);
    const item1 = { id: 1 };
    const item2 = { id: 2 };

    grid.insert(item1, 50, 50, 60, 60);
    grid.insert(item2, 250, 250, 260, 260);

    expect(grid.size).toBe(2);

    // Query viewport that only includes item1
    const result1 = grid.query(0, 0, 100, 100);
    expect(result1.has(item1)).toBe(true);
    expect(result1.has(item2)).toBe(false);

    // Query viewport that includes both
    const result2 = grid.query(0, 0, 300, 300);
    expect(result2.has(item1)).toBe(true);
    expect(result2.has(item2)).toBe(true);
  });

  it('should return empty set for empty regions', () => {
    const grid = new SpatialGrid(100);
    grid.insert({ id: 1 }, 50, 50, 60, 60);

    const result = grid.query(500, 500, 600, 600);
    expect(result.size).toBe(0);
  });

  it('should handle items spanning multiple cells', () => {
    const grid = new SpatialGrid(100);
    const item = { id: 'big' };
    // Item spans from cell (0,0) to cell (2,2)
    grid.insert(item, 10, 10, 250, 250);

    // Query any overlapping cell should find it
    const r1 = grid.query(0, 0, 50, 50);
    expect(r1.has(item)).toBe(true);

    const r2 = grid.query(200, 200, 260, 260);
    expect(r2.has(item)).toBe(true);
  });

  it('queryArray should deduplicate items spanning multiple cells', () => {
    const grid = new SpatialGrid(100);
    const item = { id: 'big' };
    grid.insert(item, 10, 10, 250, 250);

    // Query that covers multiple cells the item is in
    const result = grid.queryArray(0, 0, 300, 300);
    // Should appear exactly once
    expect(result.filter(i => i === item).length).toBe(1);
  });

  it('should clear all data', () => {
    const grid = new SpatialGrid(100);
    grid.insert({ id: 1 }, 50, 50, 60, 60);
    grid.insert({ id: 2 }, 150, 150, 160, 160);
    expect(grid.size).toBe(2);

    grid.clear();
    expect(grid.size).toBe(0);
    expect(grid.query(0, 0, 200, 200).size).toBe(0);
  });

  it('should handle negative coordinates', () => {
    const grid = new SpatialGrid(100);
    const item = { id: 'neg' };
    grid.insert(item, -150, -150, -50, -50);

    const result = grid.query(-200, -200, 0, 0);
    expect(result.has(item)).toBe(true);

    const empty = grid.query(100, 100, 200, 200);
    expect(empty.has(item)).toBe(false);
  });
});

describe('buildNodeGrid', () => {
  it('should build grid from nodes', () => {
    const nodes = [
      { x: 50, y: 50, id: 1 },
      { x: 250, y: 250, id: 2 },
      { x: 500, y: 500, id: 3, _hidden: true },
    ];

    const grid = buildNodeGrid(nodes, 20, 1, 1, 200);
    // Hidden node should be skipped
    expect(grid.size).toBe(2);

    // Query around first node
    const near1 = grid.queryArray(20, 20, 80, 80);
    expect(near1.some(n => n.id === 1)).toBe(true);
    expect(near1.some(n => n.id === 2)).toBe(false);
  });

  it('should apply stretch factors', () => {
    const nodes = [{ x: 100, y: 100, id: 1 }];
    const grid = buildNodeGrid(nodes, 20, 2, 3, 200);

    // Stretched position: (200, 300)
    const result = grid.queryArray(180, 280, 220, 320);
    expect(result.length).toBe(1);

    // Original unscaled position shouldn't find it
    const empty = grid.queryArray(80, 80, 120, 120);
    expect(empty.length).toBe(0);
  });
});

describe('buildEdgeGrid', () => {
  it('should build grid from edges with node endpoints', () => {
    const nodeMap = new Map([
      ['1', { x: 50, y: 50 }],
      ['2', { x: 250, y: 250 }],
      ['3', { x: 500, y: 50 }],
    ]);
    const edges = [
      { id: 'e1', tail: 1, head: 2 },
      { id: 'e2', tail: 2, head: 3 },
    ];

    const grid = buildEdgeGrid(edges, nodeMap, 1, 1, 200);
    expect(grid.size).toBe(2);

    // Query that includes edge e1 but not e2
    const near = grid.queryArray(0, 0, 100, 100);
    expect(near.some(e => e.id === 'e1')).toBe(true);
  });

  it('should handle dangling edges', () => {
    const nodeMap = new Map([
      ['1', { x: 50, y: 50 }],
    ]);
    const edges = [
      { id: 'e1', tail: 1, head: null, danglingEndpoint: { x: 200, y: 200 } },
    ];

    const grid = buildEdgeGrid(edges, nodeMap, 1, 1, 200);
    expect(grid.size).toBe(1);
  });

  it('should skip edges with no resolvable endpoints', () => {
    const nodeMap = new Map();
    const edges = [
      { id: 'e1', tail: 99, head: 100 },
    ];

    const grid = buildEdgeGrid(edges, nodeMap, 1, 1, 200);
    expect(grid.size).toBe(0);
  });
});
