/**
 * Pure issue detection and statistics for sketch data.
 *
 * Issue types:
 * 1. Missing coordinates — node without surveyX/surveyY
 * 2. Missing measurement on תקין node — node with maintenanceStatus === 1
 *    where a connected edge is missing tail_measurement (node is tail)
 *    or head_measurement (node is head)
 */

/**
 * @typedef {{ type: 'missing_coords' | 'missing_measurement', nodeId: string|number, edgeId?: string|number, side?: 'tail'|'head', worldX: number, worldY: number }} Issue
 * @typedef {{ totalKm: number, issueCount: number }} SketchStats
 */

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

  // 1. Missing coordinates
  for (const node of nodes) {
    if (node.surveyX == null || node.surveyY == null) {
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

  // Sort issues by nodeId (numeric)
  issues.sort((a, b) => {
    const na = parseInt(a.nodeId, 10);
    const nb = parseInt(b.nodeId, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a.nodeId).localeCompare(String(b.nodeId));
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
