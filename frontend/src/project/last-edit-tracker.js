/**
 * Tracks the world-space position of the last edited node or edge.
 * Used by "center between" navigation to find the midpoint between
 * the user's working area and an issue location.
 */

let _lastX = null;
let _lastY = null;

/**
 * Record the world position of the last edited element.
 * @param {number} worldX
 * @param {number} worldY
 */
export function setLastEditPosition(worldX, worldY) {
  _lastX = worldX;
  _lastY = worldY;
}

/**
 * Get the last edit position, or null if none recorded.
 * @returns {{ x: number, y: number } | null}
 */
export function getLastEditPosition() {
  if (_lastX == null || _lastY == null) return null;
  return { x: _lastX, y: _lastY };
}

// Expose on window for cross-module access from legacy code
window.__setLastEditPosition = setLastEditPosition;
