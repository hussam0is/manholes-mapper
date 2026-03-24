/**
 * Web Worker for offloading heavy data processing from the main thread.
 *
 * Handles:
 * - Edge label position computation
 * - Spatial grid construction
 * - Issue detection on large datasets
 * - Sketch data validation
 *
 * Communication: postMessage with { type, id, payload }.
 * Responses: postMessage with { type: 'result', id, payload } or { type: 'error', id, error }.
 */

/* eslint-disable no-restricted-globals */

self.onmessage = function (e) {
  const { type, id, payload } = e.data;

  try {
    let result;
    switch (type) {
      case 'computeEdgeLabels':
        result = computeEdgeLabels(payload);
        break;
      case 'buildSpatialIndex':
        result = buildSpatialIndex(payload);
        break;
      case 'computeBounds':
        result = computeDataBounds(payload);
        break;
      case 'validateSketchData':
        result = validateSketchData(payload);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ type: 'result', id, payload: result });
  } catch (err) {
    self.postMessage({ type: 'error', id, error: err.message });
  }
};

/**
 * Compute edge label positions off the main thread.
 * This mirrors the logic in main.js draw() but without canvas dependencies.
 */
function computeEdgeLabels({ edges, nodeMap, stretchX, stretchY, sizeScale, viewScale }) {
  const labels = [];
  const sizeVS = viewScale;
  const offset = 6 * sizeScale / sizeVS;
  const fontSize = Math.round(14 * sizeScale / sizeVS);

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const tailNode = edge.tail != null ? nodeMap[String(edge.tail)] : undefined;
    const headNode = edge.head != null ? nodeMap[String(edge.head)] : undefined;

    let x1, y1, x2, y2;
    if (tailNode && headNode) {
      x1 = tailNode.x * stretchX; y1 = tailNode.y * stretchY;
      x2 = headNode.x * stretchX; y2 = headNode.y * stretchY;
    } else if (tailNode && !headNode && edge.danglingEndpoint) {
      x1 = tailNode.x * stretchX; y1 = tailNode.y * stretchY;
      x2 = edge.danglingEndpoint.x * stretchX; y2 = edge.danglingEndpoint.y * stretchY;
    } else if (!tailNode && headNode && edge.tailPosition) {
      x1 = edge.tailPosition.x * stretchX; y1 = edge.tailPosition.y * stretchY;
      x2 = headNode.x * stretchX; y2 = headNode.y * stretchY;
    } else {
      continue;
    }

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= 0) continue;

    const normX = dx / length;
    const normY = dy / length;

    if (edge.tail_measurement) {
      const ratio = 0.25;
      const px = x1 + dx * ratio;
      const py = y1 + dy * ratio;
      labels.push({
        text: String(edge.tail_measurement),
        x: px + (-normY * offset),
        y: py + (normX * offset),
        fontSize,
      });
    }

    if (edge.head_measurement) {
      const ratio = 0.75;
      const px = x1 + dx * ratio;
      const py = y1 + dy * ratio;
      labels.push({
        text: String(edge.head_measurement),
        x: px + (-normY * offset),
        y: py + (normX * offset),
        fontSize,
      });
    }
  }

  return labels;
}

/**
 * Build a flat spatial index (cell-based) from node/edge data.
 * Returns cell membership arrays that can be used on the main thread.
 */
function buildSpatialIndex({ nodes, stretchX, stretchY, cellSize, radius }) {
  const cells = {};

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node._hidden) continue;
    const sx = node.x * stretchX;
    const sy = node.y * stretchY;
    const cx0 = Math.floor((sx - radius) / cellSize);
    const cy0 = Math.floor((sy - radius) / cellSize);
    const cx1 = Math.floor((sx + radius) / cellSize);
    const cy1 = Math.floor((sy + radius) / cellSize);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = `${cx},${cy}`;
        if (!cells[key]) cells[key] = [];
        cells[key].push(i); // Store index instead of object
      }
    }
  }

  return { cells, cellSize };
}

/**
 * Compute bounding box for all nodes and edges.
 */
function computeDataBounds({ nodes, stretchX, stretchY }) {
  if (nodes.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node._hidden) continue;
    const sx = node.x * stretchX;
    const sy = node.y * stretchY;
    if (sx < minX) minX = sx;
    if (sy < minY) minY = sy;
    if (sx > maxX) maxX = sx;
    if (sy > maxY) maxY = sy;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Validate sketch data and count potential issues.
 */
function validateSketchData({ nodes, edges }) {
  const issues = [];
  const nodeIds = new Set(nodes.map(n => String(n.id)));

  for (const edge of edges) {
    if (edge.tail != null && !nodeIds.has(String(edge.tail))) {
      issues.push({ type: 'orphanEdge', edgeId: edge.id, missingNode: edge.tail });
    }
    if (edge.head != null && !nodeIds.has(String(edge.head))) {
      issues.push({ type: 'orphanEdge', edgeId: edge.id, missingNode: edge.head });
    }
  }

  return { issues, nodeCount: nodes.length, edgeCount: edges.length };
}
