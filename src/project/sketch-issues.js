/**
 * Pure issue detection and statistics for sketch data.
 *
 * Issue types:
 * 1. Missing coordinates — node without surveyX/surveyY
 * 2. Missing measurement on תקין node — node with maintenanceStatus === 1
 *    where a connected edge is missing tail_measurement (node is tail)
 *    or head_measurement (node is head)
 * 3. Long edge — edge whose ITM length exceeds 70m
 * 4. Not last manhole — manhole with only inbound edges (head) and no outbound (tail)
 * 4b. Merge candidate — two nearby stubs in different connected components
 * 5. Negative gradient — pipe where head is deeper than tail (uphill flow)
 */

/**
 * @typedef {{ type: 'missing_coords' | 'missing_pipe_data' | 'long_edge' | 'not_last_manhole' | 'merge_candidate' | 'negative_gradient', nodeId?: string|number, edgeId?: string|number, side?: 'tail'|'head', worldX: number, worldY: number, lengthM?: number, gradient?: number, mergeNodeId?: string|number, distanceM?: number, mergeWorldX?: number, mergeWorldY?: number }} Issue
 * @typedef {{ totalKm: number, issueCount: number, missingCoordsCount: number, missingPipeDataCount: number }} SketchStats
 */

const LONG_EDGE_THRESHOLD_M = 70;
const MERGE_DISTANCE_THRESHOLD_M = 40;

// accuracyLevel codes: 0 = Engineering, 1 = Schematic
const SCHEMATIC_ACCURACY = 1;

/**
 * Find connected components in an undirected graph.
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {Map<string, number>} nodeId → componentId
 */
function findConnectedComponents(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(String(n.id), []);
  for (const e of edges) {
    const t = String(e.tail);
    const h = String(e.head);
    if (adj.has(t) && adj.has(h)) {
      adj.get(t).push(h);
      adj.get(h).push(t);
    }
  }
  const comp = new Map();
  let compId = 0;
  for (const [nodeId] of adj) {
    if (comp.has(nodeId)) continue;
    const queue = [nodeId];
    comp.set(nodeId, compId);
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const nb of adj.get(cur) || []) {
        if (!comp.has(nb)) {
          comp.set(nb, compId);
          queue.push(nb);
        }
      }
    }
    compId++;
  }
  return comp;
}

/**
 * Check if a node has no measurements on any of its connected edges.
 * @param {string} nodeId
 * @param {Array} edges
 * @returns {boolean}
 */
function nodeHasNoMeasurements(nodeId, edges) {
  const id = String(nodeId);
  for (const e of edges) {
    if (String(e.tail) === id && (e.tail_measurement || e.tail_measurement === 0)) return false;
    if (String(e.head) === id && (e.head_measurement || e.head_measurement === 0)) return false;
  }
  return true;
}

/**
 * Count edges connected to a node.
 * @param {string} nodeId
 * @param {Array} edges
 * @returns {number}
 */
function countNodeEdges(nodeId, edges) {
  const id = String(nodeId);
  let count = 0;
  for (const e of edges) {
    if (String(e.tail) === id || String(e.head) === id) count++;
  }
  return count;
}

/**
 * Compute issues and statistics for a single sketch.
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {{ issues: Issue[], stats: SketchStats }}
 */
export function computeSketchIssues(nodes, edges) {
  if (!nodes || !edges) return { issues: [], stats: { totalKm: 0, issueCount: 0, missingCoordsCount: 0, missingPipeDataCount: 0 } };

  const nodeMap = new Map();
  for (const n of nodes) nodeMap.set(String(n.id), n);

  const issues = [];

  // 1. Missing coordinates — skip schematic nodes, home connections, and locked nodes
  for (const node of nodes) {
    if (node.surveyX == null || node.surveyY == null) {
      // Schematic nodes intentionally lack precise coords
      if (node.accuracyLevel === SCHEMATIC_ACCURACY) continue;
      // Home connections don't require RTK coords
      if (node.nodeType === 'Home') continue;
      // Position-locked nodes have been intentionally placed (manual coordinates)
      if (node.positionLocked) continue;
      issues.push({
        type: 'missing_coords',
        nodeId: node.id,
        worldX: node.x || 0,
        worldY: node.y || 0,
      });
    }
  }

  // 2. Missing pipe data (depth measurements) on תקין (maintenanceStatus === 1) nodes.
  //    These are nodes that have GPS coordinates but are missing edge depth/measurement data.
  for (const edge of edges) {
    const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : null;

    // Check tail side
    if (tailNode && tailNode.maintenanceStatus === 1) {
      if (!edge.tail_measurement && edge.tail_measurement !== 0) {
        issues.push({
          type: 'missing_pipe_data',
          nodeId: tailNode.id,
          edgeId: edge.id,
          side: 'tail',
          worldX: tailNode.x || 0,
          worldY: tailNode.y || 0,
        });
      }
    }

    // Check head side
    if (headNode && headNode.maintenanceStatus === 1) {
      if (!edge.head_measurement && edge.head_measurement !== 0) {
        issues.push({
          type: 'missing_pipe_data',
          nodeId: headNode.id,
          edgeId: edge.id,
          side: 'head',
          worldX: headNode.x || 0,
          worldY: headNode.y || 0,
        });
      }
    }
  }

  // 3. Long edges — edges whose real-world length exceeds threshold
  for (const edge of edges) {
    const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : null;
    if (!tailNode || !headNode) continue;
    if (tailNode.surveyX == null || headNode.surveyX == null) continue;

    const dx = headNode.surveyX - tailNode.surveyX;
    const dy = headNode.surveyY - tailNode.surveyY;
    const lengthM = Math.sqrt(dx * dx + dy * dy);

    if (lengthM > LONG_EDGE_THRESHOLD_M) {
      issues.push({
        type: 'long_edge',
        edgeId: edge.id,
        tailId: tailNode.id,
        headId: headNode.id,
        worldX: (tailNode.x + headNode.x) / 2,
        worldY: (tailNode.y + headNode.y) / 2,
        lengthM: Math.round(lengthM),
      });
    }
  }

  // 4. Not last manhole — nodes with only inbound edges (head) and no outbound (tail)
  //    Excludes Home connections (naturally terminal)
  const tailSet = new Set();
  const headSet = new Set();
  for (const edge of edges) {
    if (edge.tail != null) tailSet.add(String(edge.tail));
    if (edge.head != null) headSet.add(String(edge.head));
  }
  for (const node of nodes) {
    if (node.nodeType === 'Home') continue;
    const id = String(node.id);
    // Must have at least one inbound edge and zero outbound edges
    if (headSet.has(id) && !tailSet.has(id)) {
      issues.push({
        type: 'not_last_manhole',
        nodeId: node.id,
        worldX: node.x || 0,
        worldY: node.y || 0,
      });
    }
  }

  // 4b. Merge candidate — nearby stubs in different connected components
  const components = findConnectedComponents(nodes, edges);
  const notLastManholeIssues = issues.filter(i => i.type === 'not_last_manhole');
  const mergedNodeIds = new Set(); // track nodes already paired
  for (const nlm of notLastManholeIssues) {
    const nodeA = nodeMap.get(String(nlm.nodeId));
    if (!nodeA) continue;
    if (countNodeEdges(nodeA.id, edges) !== 1) continue;
    if (!nodeHasNoMeasurements(nodeA.id, edges)) continue;
    const compA = components.get(String(nodeA.id));

    // Get nodeA position in meters (surveyX/Y if available, else canvas/50)
    const aX = nodeA.surveyX != null ? nodeA.surveyX : (nodeA.x || 0) / 50;
    const aY = nodeA.surveyY != null ? nodeA.surveyY : (nodeA.y || 0) / 50;

    let bestNode = null;
    let bestDist = Infinity;

    for (const nodeB of nodes) {
      if (nodeB === nodeA) continue;
      if (nodeB.nodeType === 'Home') continue;
      if (mergedNodeIds.has(String(nodeB.id))) continue;
      if (components.get(String(nodeB.id)) === compA) continue;
      if (countNodeEdges(nodeB.id, edges) !== 1) continue;
      if (!nodeHasNoMeasurements(nodeB.id, edges)) continue;

      const bX = nodeB.surveyX != null ? nodeB.surveyX : (nodeB.x || 0) / 50;
      const bY = nodeB.surveyY != null ? nodeB.surveyY : (nodeB.y || 0) / 50;
      const dist = Math.sqrt((aX - bX) ** 2 + (aY - bY) ** 2);

      if (dist < MERGE_DISTANCE_THRESHOLD_M && dist < bestDist) {
        bestDist = dist;
        bestNode = nodeB;
      }
    }

    if (bestNode) {
      mergedNodeIds.add(String(nodeA.id));
      mergedNodeIds.add(String(bestNode.id));
      // Replace the not_last_manhole issue with a merge_candidate
      const idx = issues.indexOf(nlm);
      issues[idx] = {
        type: 'merge_candidate',
        nodeId: nodeA.id,
        mergeNodeId: bestNode.id,
        distanceM: Math.round(bestDist),
        worldX: nodeA.x || 0,
        worldY: nodeA.y || 0,
        mergeWorldX: bestNode.x || 0,
        mergeWorldY: bestNode.y || 0,
      };
      // Also remove any not_last_manhole issue for bestNode (if it exists)
      const bestNlmIdx = issues.findIndex(i => i.type === 'not_last_manhole' && String(i.nodeId) === String(bestNode.id));
      if (bestNlmIdx !== -1) issues.splice(bestNlmIdx, 1);
    }
  }

  // 5. Negative gradient — pipe where head is deeper than tail (uphill flow)
  for (const edge of edges) {
    const tailMeas = parseFloat(edge.tail_measurement);
    const headMeas = parseFloat(edge.head_measurement);
    if (isNaN(tailMeas) || isNaN(headMeas)) continue;
    if (tailMeas <= 0 || headMeas <= 0) continue;

    // head deeper than tail = pipe slopes uphill from tail→head = bad
    if (headMeas > tailMeas) {
      const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
      const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : null;
      issues.push({
        type: 'negative_gradient',
        edgeId: edge.id,
        tailId: edge.tail,
        headId: edge.head,
        gradient: +(headMeas - tailMeas).toFixed(3),
        worldX: tailNode && headNode ? (tailNode.x + headNode.x) / 2 : 0,
        worldY: tailNode && headNode ? (tailNode.y + headNode.y) / 2 : 0,
      });
    }
  }

  // Sort: missing_coords first, then missing_pipe_data, then long_edge, then not_last_manhole, then negative_gradient; within each by id
  const typeOrder = { missing_coords: 0, missing_pipe_data: 1, long_edge: 2, not_last_manhole: 3, merge_candidate: 3.5, negative_gradient: 4 };
  issues.sort((a, b) => {
    const tDiff = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
    if (tDiff !== 0) return tDiff;
    const na = parseInt(a.nodeId ?? a.tailId, 10);
    const nb = parseInt(b.nodeId ?? b.tailId, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return 0;
  });

  // Compute total km from edges where both endpoints have survey coordinates
  let totalMeters = 0;
  for (const edge of edges) {
    const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : null;
    if (tailNode && headNode && tailNode.surveyX != null && tailNode.surveyY != null && headNode.surveyX != null && headNode.surveyY != null) {
      const dx = headNode.surveyX - tailNode.surveyX;
      const dy = headNode.surveyY - tailNode.surveyY;
      totalMeters += Math.sqrt(dx * dx + dy * dy);
    }
  }

  // Count issues by category for the breakdown display
  let missingCoordsCount = 0;
  let missingPipeDataCount = 0;
  for (const issue of issues) {
    if (issue.type === 'missing_coords') missingCoordsCount++;
    else if (issue.type === 'missing_pipe_data') missingPipeDataCount++;
  }

  return {
    issues,
    stats: {
      totalKm: totalMeters / 1000,
      issueCount: issues.length,
      missingCoordsCount,
      missingPipeDataCount,
    },
  };
}

/**
 * Compute aggregated totals from an array of per-sketch stats.
 * @param {SketchStats[]} statsArray
 * @returns {SketchStats}
 */
export function computeProjectTotals(statsArray) {
  let totalKm = 0;
  let issueCount = 0;
  let missingCoordsCount = 0;
  let missingPipeDataCount = 0;
  for (const s of statsArray) {
    totalKm += s.totalKm;
    issueCount += s.issueCount;
    missingCoordsCount += s.missingCoordsCount || 0;
    missingPipeDataCount += s.missingPipeDataCount || 0;
  }
  return { totalKm, issueCount, missingCoordsCount, missingPipeDataCount };
}
