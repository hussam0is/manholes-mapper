/**
 * Spatial Grid — lightweight spatial index for fast viewport culling.
 *
 * Divides world space into uniform cells. Items are inserted into every cell
 * that overlaps their bounding box. Viewport queries return only candidates
 * from overlapping cells, reducing per-frame iteration from O(N) to O(visible).
 *
 * Cell size should roughly match the typical viewport extent at the most
 * common zoom level — a 200-unit cell works well for the Manholes Mapper
 * coordinate system where NODE_RADIUS = 20 and typical views span ~400-1200 units.
 */

/** @template T */
export class SpatialGrid {
  /**
   * @param {number} cellSize - World-unit size of each grid cell
   */
  constructor(cellSize = 200) {
    /** @type {number} */
    this.cellSize = cellSize;
    /** @type {Map<string, T[]>} */
    this._cells = new Map();
    /** @type {number} */
    this._count = 0;
  }

  /** Number of items in the grid */
  get size() { return this._count; }

  /** Generate a cell key from cell coordinates */
  _key(cx, cy) { return `${cx},${cy}`; }

  /** Convert a world coordinate to a cell index */
  _cellIndex(v) { return Math.floor(v / this.cellSize); }

  /**
   * Insert an item with a bounding box.
   * @param {T} item
   * @param {number} minX
   * @param {number} minY
   * @param {number} maxX
   * @param {number} maxY
   */
  insert(item, minX, minY, maxX, maxY) {
    const cx0 = this._cellIndex(minX);
    const cy0 = this._cellIndex(minY);
    const cx1 = this._cellIndex(maxX);
    const cy1 = this._cellIndex(maxY);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = this._key(cx, cy);
        let cell = this._cells.get(key);
        if (!cell) { cell = []; this._cells.set(key, cell); }
        cell.push(item);
      }
    }
    this._count++;
  }

  /**
   * Query all items whose cells overlap the given viewport rectangle.
   * Returns a Set to eliminate duplicates (items spanning multiple cells).
   * @param {number} minX
   * @param {number} minY
   * @param {number} maxX
   * @param {number} maxY
   * @returns {Set<T>}
   */
  query(minX, minY, maxX, maxY) {
    const result = new Set();
    const cx0 = this._cellIndex(minX);
    const cy0 = this._cellIndex(minY);
    const cx1 = this._cellIndex(maxX);
    const cy1 = this._cellIndex(maxY);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = this._cells.get(this._key(cx, cy));
        if (cell) {
          for (let i = 0; i < cell.length; i++) result.add(cell[i]);
        }
      }
    }
    return result;
  }

  /**
   * Query all items whose cells overlap the viewport.
   * Returns an array (faster iteration than Set when duplicates don't matter
   * or the caller can handle them).
   * @param {number} minX
   * @param {number} minY
   * @param {number} maxX
   * @param {number} maxY
   * @returns {T[]}
   */
  queryArray(minX, minY, maxX, maxY) {
    const seen = new Set();
    const result = [];
    const cx0 = this._cellIndex(minX);
    const cy0 = this._cellIndex(minY);
    const cx1 = this._cellIndex(maxX);
    const cy1 = this._cellIndex(maxY);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = this._cells.get(this._key(cx, cy));
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            const item = cell[i];
            if (!seen.has(item)) {
              seen.add(item);
              result.push(item);
            }
          }
        }
      }
    }
    return result;
  }

  /** Clear all data */
  clear() {
    this._cells.clear();
    this._count = 0;
  }
}

/**
 * Build a spatial grid for nodes.
 * @param {Array<{x: number, y: number}>} nodes
 * @param {number} radius - Node radius for bounding box expansion
 * @param {number} stretchX
 * @param {number} stretchY
 * @param {number} [cellSize=200]
 * @returns {SpatialGrid}
 */
export function buildNodeGrid(nodes, radius, stretchX = 1, stretchY = 1, cellSize = 200) {
  const grid = new SpatialGrid(cellSize);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node._hidden) continue;
    const sx = node.x * stretchX;
    const sy = node.y * stretchY;
    grid.insert(node, sx - radius, sy - radius, sx + radius, sy + radius);
  }
  return grid;
}

/**
 * Build a spatial grid for edges.
 * Requires a nodeMap for endpoint lookups.
 * @param {Array} edges
 * @param {Map} nodeMap
 * @param {number} stretchX
 * @param {number} stretchY
 * @param {number} [cellSize=200]
 * @returns {SpatialGrid}
 */
export function buildEdgeGrid(edges, nodeMap, stretchX = 1, stretchY = 1, cellSize = 200) {
  const grid = new SpatialGrid(cellSize);
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const tn = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const hn = edge.head != null ? nodeMap.get(String(edge.head)) : null;

    let x1, y1, x2, y2;
    if (tn && hn) {
      x1 = tn.x * stretchX; y1 = tn.y * stretchY;
      x2 = hn.x * stretchX; y2 = hn.y * stretchY;
    } else if (tn && edge.danglingEndpoint) {
      x1 = tn.x * stretchX; y1 = tn.y * stretchY;
      x2 = edge.danglingEndpoint.x * stretchX; y2 = edge.danglingEndpoint.y * stretchY;
    } else if (hn && edge.tailPosition) {
      x1 = edge.tailPosition.x * stretchX; y1 = edge.tailPosition.y * stretchY;
      x2 = hn.x * stretchX; y2 = hn.y * stretchY;
    } else {
      continue;
    }

    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);
    grid.insert(edge, minX, minY, maxX, maxY);
  }
  return grid;
}
