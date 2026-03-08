/**
 * Issue navigation state.
 *
 * Tracks which sketch's issues are being navigated and the current index.
 * Shared between the sketch side panel and the node/edge detail panel so
 * that prev/next buttons work across both UIs.
 */

import { computeSketchIssues } from './sketch-issues.js';
import { startIssueHighlight } from './issue-highlight.js';

/** @type {string|null} */
let _sketchId = null;

/** @type {Array} */
let _issues = [];

/** @type {number} */
let _currentIndex = -1;

/** @type {Set<(state: object) => void>} */
const _listeners = new Set();

/**
 * Set the issue list for a sketch and reset the index.
 * @param {string} sketchId
 * @param {Array} nodes
 * @param {Array} edges
 */
export function setIssueContext(sketchId, nodes, edges) {
  _sketchId = sketchId;
  const result = computeSketchIssues(nodes, edges);
  _issues = result.issues;
  _currentIndex = _issues.length > 0 ? 0 : -1;
  _notify();
}

/**
 * Refresh the issue list (e.g., after a fix was applied) without resetting index.
 * If the current index is beyond the new list length, clamp it.
 * @param {Array} nodes
 * @param {Array} edges
 */
export function refreshIssues(nodes, edges) {
  const result = computeSketchIssues(nodes, edges);
  _issues = result.issues;
  if (_currentIndex >= _issues.length) {
    _currentIndex = _issues.length > 0 ? _issues.length - 1 : -1;
  }
  _notify();
}

/**
 * Set the current issue index explicitly.
 * @param {number} index
 */
export function setCurrentIndex(index) {
  if (index >= 0 && index < _issues.length) {
    _currentIndex = index;
    _notify();
  }
}

/**
 * Move to the next issue. Wraps around to 0.
 * @returns {object|null} The new current issue, or null if no issues.
 */
export function nextIssue() {
  if (_issues.length === 0) return null;
  _currentIndex = (_currentIndex + 1) % _issues.length;
  _notify();
  return _issues[_currentIndex];
}

/**
 * Move to the previous issue. Wraps around to last.
 * @returns {object|null} The new current issue, or null if no issues.
 */
export function prevIssue() {
  if (_issues.length === 0) return null;
  _currentIndex = (_currentIndex - 1 + _issues.length) % _issues.length;
  _notify();
  return _issues[_currentIndex];
}

/**
 * Get the current navigation state.
 * @returns {{ sketchId: string|null, issues: Array, currentIndex: number, current: object|null, total: number }}
 */
export function getNavState() {
  return {
    sketchId: _sketchId,
    issues: _issues,
    currentIndex: _currentIndex,
    current: _currentIndex >= 0 && _currentIndex < _issues.length ? _issues[_currentIndex] : null,
    total: _issues.length,
  };
}

/**
 * Navigate the canvas to the current issue.
 * Pans/zooms to the issue location and starts the pulsing highlight.
 */
export function navigateToCurrentIssue() {
  const issue = getNavState().current;
  if (!issue) return;

  const canvas = document.getElementById('graphCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  const targetScale = 0.21;
  const stretchX = window.__getStretch?.()?.x || 0.6;
  const stretchY = window.__getStretch?.()?.y || 1;
  const tx = rect.width / 2 - targetScale * stretchX * issue.worldX;
  const ty = rect.height / 2 - targetScale * stretchY * issue.worldY;
  window.__setViewState?.(targetScale, tx, ty);
  startIssueHighlight(issue.worldX, issue.worldY, 2000);
  window.__scheduleDraw?.();
}

/**
 * Navigate to next issue and pan canvas to it.
 * @returns {object|null} The new current issue.
 */
export function goToNextIssue() {
  const issue = nextIssue();
  if (issue) navigateToCurrentIssue();
  return issue;
}

/**
 * Navigate to previous issue and pan canvas to it.
 * @returns {object|null} The new current issue.
 */
export function goToPrevIssue() {
  const issue = prevIssue();
  if (issue) navigateToCurrentIssue();
  return issue;
}

/**
 * Clear navigation state.
 */
export function clearNavState() {
  _sketchId = null;
  _issues = [];
  _currentIndex = -1;
  _notify();
}

/**
 * Subscribe to navigation state changes.
 * @param {(state: object) => void} listener
 * @returns {() => void} unsubscribe function
 */
export function onNavStateChange(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function _notify() {
  const state = getNavState();
  for (const fn of _listeners) {
    try { fn(state); } catch (e) { console.warn('[IssueNavState] Listener error:', e); }
  }
}

// Expose on window for cross-module access (legacy main.js)
window.__issueNav = {
  setIssueContext,
  refreshIssues,
  setCurrentIndex,
  nextIssue,
  prevIssue,
  getNavState,
  navigateToCurrentIssue,
  goToNextIssue,
  goToPrevIssue,
  clearNavState,
  onNavStateChange,
};
