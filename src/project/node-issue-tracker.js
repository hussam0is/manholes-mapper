/**
 * Node Issue Tracker
 *
 * Manages admin-created issues on individual nodes.
 * Issues are stored directly on node objects as `node.issue`.
 * Supports: admin add/remove issue, user submit fix, admin confirm/reject fix.
 *
 * Issue lifecycle: open -> fix_submitted -> resolved (or back to open if rejected)
 */

/**
 * Create a new issue object for a node.
 * @param {string} description - Issue description
 * @param {string} createdBy - Username of admin who created the issue
 * @returns {Object} Issue object
 */
export function createIssue(description, createdBy) {
  return {
    id: crypto.randomUUID(),
    description: description.trim(),
    status: 'open', // 'open' | 'fix_submitted' | 'resolved'
    createdBy,
    createdAt: new Date().toISOString(),
    fix: null, // { description, submittedBy, submittedAt }
    resolvedBy: null,
    resolvedAt: null,
  };
}

/**
 * Add an issue to a node.
 * @param {Object} node - The node object
 * @param {string} description - Issue description
 * @param {string} createdBy - Admin username
 * @returns {Object} The created issue
 */
export function addIssueToNode(node, description, createdBy) {
  const issue = createIssue(description, createdBy);
  node.issue = issue;
  return issue;
}

/**
 * Remove an issue from a node (admin only).
 * @param {Object} node - The node object
 */
export function removeIssueFromNode(node) {
  node.issue = null;
}

/**
 * Submit a fix for a node's issue (user action).
 * @param {Object} node - The node object
 * @param {string} fixDescription - Description of the fix
 * @param {string} submittedBy - Username of the user submitting the fix
 * @returns {boolean} True if fix was submitted
 */
export function submitFix(node, fixDescription, submittedBy) {
  if (!node.issue || node.issue.status !== 'open') return false;
  node.issue.status = 'fix_submitted';
  node.issue.fix = {
    description: fixDescription.trim(),
    submittedBy,
    submittedAt: new Date().toISOString(),
  };
  return true;
}

/**
 * Confirm a fix (admin action) - marks issue as resolved.
 * @param {Object} node - The node object
 * @param {string} resolvedBy - Admin username
 * @returns {boolean} True if fix was confirmed
 */
export function confirmFix(node, resolvedBy) {
  if (!node.issue || node.issue.status !== 'fix_submitted') return false;
  node.issue.status = 'resolved';
  node.issue.resolvedBy = resolvedBy;
  node.issue.resolvedAt = new Date().toISOString();
  return true;
}

/**
 * Reject a fix (admin action) - returns issue to open status.
 * @param {Object} node - The node object
 * @returns {boolean} True if fix was rejected
 */
export function rejectFix(node) {
  if (!node.issue || node.issue.status !== 'fix_submitted') return false;
  node.issue.status = 'open';
  node.issue.fix = null;
  return true;
}

/**
 * Check if a node has an active (non-resolved) issue.
 * @param {Object} node
 * @returns {boolean}
 */
export function hasActiveIssue(node) {
  return node.issue != null && node.issue.status !== 'resolved';
}

/**
 * Get all nodes with active issues from a nodes array.
 * @param {Array} nodes
 * @returns {Array} Nodes with active issues
 */
export function getNodesWithIssues(nodes) {
  return nodes.filter(n => hasActiveIssue(n));
}

/**
 * Get nodes with issues pending admin review (fix_submitted).
 * @param {Array} nodes
 * @returns {Array} Nodes with pending fixes
 */
export function getNodesPendingReview(nodes) {
  return nodes.filter(n => n.issue && n.issue.status === 'fix_submitted');
}

/**
 * Sort nodes with issues by node ID proximity (nearest-neighbor chain).
 * Starts with the node with the minimum numeric ID, then picks the closest
 * unvisited node each time.
 * @param {Array} nodesWithIssues - Nodes that have active issues
 * @returns {Array} Sorted array of nodes
 */
export function sortByNodeProximity(nodesWithIssues) {
  if (nodesWithIssues.length <= 1) return [...nodesWithIssues];

  // Find the node with the minimum numeric ID
  const sorted = [...nodesWithIssues];
  sorted.sort((a, b) => {
    const aNum = parseInt(String(a.id), 10);
    const bNum = parseInt(String(b.id), 10);
    const aValid = Number.isFinite(aNum);
    const bValid = Number.isFinite(bNum);
    if (aValid && bValid) return aNum - bNum;
    if (aValid) return -1;
    if (bValid) return 1;
    return String(a.id).localeCompare(String(b.id));
  });

  // Nearest-neighbor chain starting from min-ID node
  const result = [sorted[0]];
  const remaining = new Set(sorted.slice(1));

  while (remaining.size > 0) {
    const current = result[result.length - 1];
    let closest = null;
    let closestDist = Infinity;

    for (const node of remaining) {
      const dx = node.x - current.x;
      const dy = node.y - current.y;
      const dist = dx * dx + dy * dy; // squared distance is fine for comparison
      if (dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }

    if (closest) {
      result.push(closest);
      remaining.delete(closest);
    }
  }

  return result;
}

/**
 * Sort nodes with issues by distance from user's current location.
 * @param {Array} nodesWithIssues - Nodes that have active issues
 * @param {number} userX - User's X coordinate (canvas world space)
 * @param {number} userY - User's Y coordinate (canvas world space)
 * @returns {Array} Sorted array of nodes (closest first)
 */
export function sortByUserLocation(nodesWithIssues, userX, userY) {
  if (nodesWithIssues.length <= 1) return [...nodesWithIssues];

  return [...nodesWithIssues].sort((a, b) => {
    const dxA = a.x - userX;
    const dyA = a.y - userY;
    const distA = dxA * dxA + dyA * dyA;
    const dxB = b.x - userX;
    const dyB = b.y - userY;
    const distB = dxB * dxB + dyB * dyB;
    return distA - distB;
  });
}

// Expose on window for legacy main.js access
if (typeof window !== 'undefined') {
  window.__nodeIssueTracker = {
    createIssue,
    addIssueToNode,
    removeIssueFromNode,
    submitFix,
    confirmFix,
    rejectFix,
    hasActiveIssue,
    getNodesWithIssues,
    getNodesPendingReview,
    sortByNodeProximity,
    sortByUserLocation,
  };
}
