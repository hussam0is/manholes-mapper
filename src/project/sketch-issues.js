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
 */

/**
 * @typedef {{ type: 'missing_coords' | 'missing_measurement' | 'long_edge' | 'not_last_manhole', nodeId?: string|number, edgeId?: string|number, side?: 'tail'|'head', worldX: number, worldY: number, lengthM?: number }} Issue
 * @typedef {{ totalKm: number, issueCount: number }} SketchStats
 */

const LONG_EDGE_THRESHOLD_M = 70;

// accuracyLevel codes: 0 = Engineering, 1 = Schematic
const SCHEMATIC_ACCURACY = 1;

/**
 * Compute issues and statistics for a single sketch.
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {{ issues: Issue[], stats: SketchStats }}
 */
export function computeSketchIssues(nodes, edges) {
  if (!nodes || !edges) return { issues: [], stats: { totalKm: 0, issueCount: 0 } };

  const nodeMap = new Map();
  for (const n of nodes) nodeMap.set(String(n.id), n);

  const issues = [];

  // 1. Missing coordinates — skip schematic nodes and home connections
  for (const node of nodes) {
    if (node.surveyX == null || node.surveyY == null) {
      // Schematic nodes intentionally lack precise coords
      if (node.accuracyLevel === SCHEMATIC_ACCURACY) continue;
      // Home connections don't require RTK coords
      if (node.nodeType === 'Home') continue;
      issues.push({
        type: 'missing_coords',
        nodeId: node.id,
        worldX: node.x || 0,
        worldY: node.y || 0,
      });
    }
  }

  // 2. Missing measurements on תקין (maintenanceStatus === 1) nodes
  for (const edge of edges) {
    const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : null;

    // Check tail side
    if (tailNode && tailNode.maintenanceStatus === 1) {
      if (!edge.tail_measurement && edge.tail_measurement !== 0) {
        issues.push({
          type: 'missing_measurement',
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
          type: 'missing_measurement',
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

  // Sort: missing_coords first, then missing_measurement, then long_edge, then not_last_manhole; within each by id
  const typeOrder = { missing_coords: 0, missing_measurement: 1, long_edge: 2, not_last_manhole: 3 };
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

  return {
    issues,
    stats: {
      totalKm: totalMeters / 1000,
      issueCount: issues.length,
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
  for (const s of statsArray) {
    totalKm += s.totalKm;
    issueCount += s.issueCount;
  }
  return { totalKm, issueCount };
}
