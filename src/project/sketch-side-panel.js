/**
 * Collapsible side panel that lists sketches in project-canvas mode.
 *
 * Features:
 * - Eye icon toggles visibility per sketch
 * - Click sketch name to switch active sketch
 * - Active sketch highlighted
 * - Toggle button in canvas toolbar (layers icon)
 * - Per-sketch statistics (km, issue count)
 * - Issues sub-panel with navigation (go to issue, center between)
 */

/** @type {(key: string, ...args: any[]) => string} */
const t = (key, ...args) => (typeof window.t === 'function' ? window.t(key, ...args) : key);

import {
  getAllSketches,
  setSketchVisibility,
  switchActiveSketch,
  onProjectCanvasChange,
} from './project-canvas-state.js';

import { computeSketchIssues, computeProjectTotals } from './sketch-issues.js';
import { startIssueHighlight } from './issue-highlight.js';
import { getLastEditPosition } from './last-edit-tracker.js';

let panelEl = null;
let listEl = null;
let _unsub = null;

/** Current view: 'list' or 'issues' */
let _currentView = 'list';
/** Sketch ID whose issues are being viewed */
let _issuesSketchId = null;

/** Cached per-sketch stats (recomputed on render) */
let _sketchStats = new Map();

/**
 * Initialize the side panel. Call once after DOM is ready.
 */
export function initSketchSidePanel() {
  panelEl = document.getElementById('sketchSidePanel');
  if (!panelEl) return;

  listEl = panelEl.querySelector('.sketch-side-panel__list');

  // Toggle button
  const toggleBtn = document.getElementById('sketchSidePanelToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      panelEl.classList.toggle('open');
    });
  }

  // Close button
  const closeBtn = panelEl.querySelector('.sketch-side-panel__close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panelEl.classList.remove('open');
    });
  }

  // Subscribe to state changes
  _unsub = onProjectCanvasChange((changeType) => {
    if (changeType !== 'data') {
      _currentView = 'list';
      _issuesSketchId = null;
    }
    render();
  });
}

/**
 * Show the side panel (when entering project-canvas mode).
 */
export function showSketchSidePanel() {
  if (!panelEl) return;
  panelEl.style.display = '';
  panelEl.classList.add('open');
  _currentView = 'list';
  _issuesSketchId = null;
  const toggleBtn = document.getElementById('sketchSidePanelToggle');
  if (toggleBtn) toggleBtn.style.display = '';
  render();
}

/**
 * Hide the side panel (when leaving project-canvas mode).
 */
export function hideSketchSidePanel() {
  if (!panelEl) return;
  panelEl.style.display = 'none';
  panelEl.classList.remove('open');
  _currentView = 'list';
  _issuesSketchId = null;
  const toggleBtn = document.getElementById('sketchSidePanelToggle');
  if (toggleBtn) toggleBtn.style.display = 'none';
}

/**
 * Main render dispatcher.
 */
function render() {
  if (_currentView === 'issues' && _issuesSketchId) {
    renderIssuesView();
  } else {
    renderListView();
  }
}

/**
 * Render the sketch list with stats.
 */
function renderListView() {
  if (!listEl) return;

  const sketches = getAllSketches();

  // Remove any existing totals footer before re-rendering
  const existingTotals = panelEl?.querySelector('.sketch-side-panel__totals');
  if (existingTotals) existingTotals.remove();

  if (sketches.length === 0) {
    listEl.innerHTML = `<div class="sketch-side-panel__empty">
      <span class="material-icons">inbox</span>
      <span>${t('projects.canvas.noSketches') || 'No sketches'}</span>
    </div>`;
    return;
  }

  // Update header sketch count
  const countEl = panelEl?.querySelector('.sketch-side-panel__count');
  if (countEl) countEl.textContent = `(${sketches.length})`;

  // Compute stats for all sketches
  _sketchStats.clear();
  const allStats = [];
  for (const sketch of sketches) {
    const result = computeSketchIssues(sketch.nodes || [], sketch.edges || []);
    _sketchStats.set(sketch.id, result);
    allStats.push(result.stats);
  }
  const totals = computeProjectTotals(allStats);

  listEl.innerHTML = '';

  for (const sketch of sketches) {
    const item = document.createElement('div');
    item.className = 'sketch-side-panel__item' + (sketch.isActive ? ' active' : '');
    item.dataset.sketchId = sketch.id;

    const nodeCount = (sketch.nodes || []).length;
    const displayName = (sketch.name && sketch.name.trim()) || sketch.id.slice(-6);
    const sketchData = _sketchStats.get(sketch.id);
    const km = sketchData ? sketchData.stats.totalKm.toFixed(2) : '0.00';
    const issues = sketchData ? sketchData.stats.issueCount : 0;

    const issuesBadge = issues > 0
      ? `<button class="sketch-side-panel__issues-btn" data-sketch-issues="${sketch.id}" title="${t('projects.canvas.workingStatus') || 'Working Status'}">
           <span class="material-icons">warning</span>${issues}
         </button>`
      : `<span class="sketch-side-panel__no-issues" title="${t('projects.canvas.noIssues') || 'OK'}">
           <span class="material-icons">check_circle</span>
         </span>`;

    item.innerHTML = `
      <button class="sketch-side-panel__eye" title="${sketch.isVisible ? t('projects.canvas.hide') || 'Hide' : t('projects.canvas.show') || 'Show'}">
        <span class="material-icons">${sketch.isVisible ? 'visibility' : 'visibility_off'}</span>
      </button>
      <div class="sketch-side-panel__info">
        <span class="sketch-side-panel__name">${displayName}</span>
        <span class="sketch-side-panel__badge">${nodeCount}</span>
      </div>
      <div class="sketch-side-panel__stats">
        <span class="sketch-side-panel__km">${km} ${t('projects.canvas.totalKm') || 'km'}</span>
        ${issuesBadge}
        <button class="sketch-side-panel__recenter-btn" data-sketch-recenter="${sketch.id}" title="${t('projects.canvas.recenterToSketch') || 'Recenter to sketch'}">
          <span class="material-icons">center_focus_strong</span>
        </button>
      </div>
      ${sketch.isActive ? '<span class="material-icons sketch-side-panel__active-icon">edit</span>' : ''}
    `;

    // Eye toggle
    const eyeBtn = item.querySelector('.sketch-side-panel__eye');
    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setSketchVisibility(sketch.id, !sketch.isVisible);
    });

    // Issues badge click → open issues sub-panel
    const issuesBtn = item.querySelector('.sketch-side-panel__issues-btn');
    if (issuesBtn) {
      issuesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _issuesSketchId = sketch.id;
        _currentView = 'issues';
        render();
      });
    }

    // Recenter to sketch
    const recenterBtn = item.querySelector('.sketch-side-panel__recenter-btn');
    if (recenterBtn) {
      recenterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        recenterToSketch(sketch);
      });
    }

    // Click to switch active
    item.addEventListener('click', () => {
      if (!sketch.isActive) {
        switchActiveSketch(sketch.id);
      }
    });

    listEl.appendChild(item);
  }

  // Add totals footer
  const totalsEl = document.createElement('div');
  totalsEl.className = 'sketch-side-panel__totals';
  const issuesClass = totals.issueCount > 0 ? 'sketch-side-panel__totals-issues--warn' : 'sketch-side-panel__totals-issues--ok';
  const issuesIcon = totals.issueCount > 0 ? 'warning' : 'check_circle';
  totalsEl.innerHTML = `
    <span class="sketch-side-panel__totals-km">${totals.totalKm.toFixed(2)} ${t('projects.canvas.totalKm') || 'km'}</span>
    <span class="sketch-side-panel__totals-issues ${issuesClass}">
      <span class="material-icons">${issuesIcon}</span>
      ${totals.issueCount} ${t('projects.canvas.issues') || 'Issues'}
    </span>
  `;
  // Insert after listEl (inside panelEl)
  listEl.parentNode.insertBefore(totalsEl, listEl.nextSibling);
}

/**
 * Render the issues sub-panel for a specific sketch.
 */
function renderIssuesView() {
  if (!listEl || !_issuesSketchId) return;

  const sketches = getAllSketches();
  const sketch = sketches.find(s => s.id === _issuesSketchId);
  if (!sketch) {
    _currentView = 'list';
    renderListView();
    return;
  }

  // Remove totals footer in issues view
  const existingTotals = panelEl?.querySelector('.sketch-side-panel__totals');
  if (existingTotals) existingTotals.remove();

  const displayName = (sketch.name && sketch.name.trim()) || sketch.id.slice(-6);
  const { issues, stats } = computeSketchIssues(sketch.nodes || [], sketch.edges || []);

  listEl.innerHTML = '';

  // Back button
  const backEl = document.createElement('div');
  backEl.className = 'sketch-side-panel__issues-back';
  backEl.innerHTML = `
    <span class="material-icons">arrow_back</span>
    <span>${displayName} — ${t('projects.canvas.workingStatus') || 'Working Status'}</span>
  `;
  backEl.addEventListener('click', () => {
    _currentView = 'list';
    _issuesSketchId = null;
    render();
  });
  listEl.appendChild(backEl);

  // Summary bar
  const summaryEl = document.createElement('div');
  summaryEl.className = 'sketch-side-panel__issues-summary';
  summaryEl.innerHTML = `
    <span>${stats.totalKm.toFixed(2)} ${t('projects.canvas.totalKm') || 'km'}</span>
    <span>${stats.issueCount} ${t('projects.canvas.issues') || 'Issues'}</span>
  `;
  listEl.appendChild(summaryEl);

  if (issues.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'sketch-side-panel__empty';
    emptyEl.innerHTML = `
      <span class="material-icons" style="color: var(--color-success)">check_circle</span>
      <span>${t('projects.canvas.noIssues') || 'OK'}</span>
    `;
    listEl.appendChild(emptyEl);
    return;
  }

  // Issue rows
  for (const issue of issues) {
    const row = document.createElement('div');
    row.className = 'sketch-side-panel__issue-row';

    let icon, typeText, nodeLabel;
    if (issue.type === 'missing_coords') {
      icon = 'location_off';
      typeText = t('projects.canvas.missingCoords') || 'Missing coordinates';
      nodeLabel = `#${issue.nodeId}`;
    } else if (issue.type === 'long_edge') {
      icon = 'straighten';
      typeText = `${t('projects.canvas.longPipe') || 'Long pipe'} (${issue.lengthM}m)`;
      nodeLabel = `#${issue.tailId}→#${issue.headId}`;
    } else {
      icon = 'rule';
      typeText = t('projects.canvas.missingMeasurement') || 'Missing measurement';
      nodeLabel = `#${issue.nodeId}`;
    }

    row.innerHTML = `
      <div class="sketch-side-panel__issue-info">
        <span class="sketch-side-panel__issue-icon"><span class="material-icons">${icon}</span></span>
        <span class="sketch-side-panel__issue-node">${nodeLabel}</span>
        <span class="sketch-side-panel__issue-type">${typeText}</span>
      </div>
      <div class="sketch-side-panel__issue-actions">
        <button class="sketch-side-panel__issue-goto" title="${t('projects.canvas.goToIssue') || 'Go to issue'}">
          <span class="material-icons">my_location</span>
        </button>
        <button class="sketch-side-panel__issue-center" title="${t('projects.canvas.centerBetween') || 'Center between'}">
          <span class="material-icons">swap_horiz</span>
        </button>
      </div>
    `;

    // Go to issue
    const gotoBtn = row.querySelector('.sketch-side-panel__issue-goto');
    gotoBtn.addEventListener('click', () => {
      navigateToIssue(issue, sketch, 'goto');
    });

    // Center between
    const centerBtn = row.querySelector('.sketch-side-panel__issue-center');
    centerBtn.addEventListener('click', () => {
      navigateToIssue(issue, sketch, 'center_between');
    });

    listEl.appendChild(row);
  }
}

/**
 * Recenter the canvas view to fit all nodes of a sketch.
 * @param {object} sketch - The sketch to recenter on
 */
function recenterToSketch(sketch) {
  const nodes = sketch.nodes || [];
  if (nodes.length === 0) return;

  // Switch to this sketch if not active
  const sketches = getAllSketches();
  const current = sketches.find(s => s.isActive);
  if (!current || current.id !== sketch.id) {
    switchActiveSketch(sketch.id);
  }

  // Compute bounding box of all nodes in world coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  const canvas = document.getElementById('graphCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  const stretchX = window.__getStretch?.()?.x || 0.6;
  const stretchY = window.__getStretch?.()?.y || 1;

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Single-node case: just center on it at a reasonable zoom
  if (nodes.length === 1 || (maxX - minX < 1 && maxY - minY < 1)) {
    const targetScale = 3;
    const tx = rect.width / 2 - targetScale * stretchX * midX;
    const ty = rect.height / 2 - targetScale * stretchY * midY;
    window.__setViewState?.(targetScale, tx, ty);
    window.__scheduleDraw?.();
    return;
  }

  // Fit bounding box with padding
  const dx = (maxX - minX) * stretchX;
  const dy = (maxY - minY) * stretchY;
  const padding = 0.7;
  const scaleX = dx > 0 ? (rect.width * padding) / dx : 10;
  const scaleY = dy > 0 ? (rect.height * padding) / dy : 10;
  const targetScale = Math.min(scaleX, scaleY, 10);

  const tx = rect.width / 2 - targetScale * stretchX * midX;
  const ty = rect.height / 2 - targetScale * stretchY * midY;
  window.__setViewState?.(targetScale, tx, ty);
  window.__scheduleDraw?.();
}

/**
 * Navigate to an issue location on the canvas.
 * @param {object} issue - The issue object with worldX, worldY
 * @param {object} sketch - The sketch containing the issue
 * @param {'goto'|'center_between'} mode
 */
function navigateToIssue(issue, sketch, mode) {
  // Switch to the sketch if not active
  const sketches = getAllSketches();
  const current = sketches.find(s => s.isActive);
  if (!current || current.id !== sketch.id) {
    switchActiveSketch(sketch.id);
  }

  // Get canvas rect for computing viewTranslate
  const canvas = document.getElementById('graphCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  if (mode === 'goto') {
    // Zoom to the issue location (21% — overview level for project canvas)
    const targetScale = 0.21;
    const stretchX = window.__getStretch?.()?.x || 0.6;
    const stretchY = window.__getStretch?.()?.y || 1;
    const tx = rect.width / 2 - targetScale * stretchX * issue.worldX;
    const ty = rect.height / 2 - targetScale * stretchY * issue.worldY;
    window.__setViewState?.(targetScale, tx, ty);
    startIssueHighlight(issue.worldX, issue.worldY, 2000);
    window.__scheduleDraw?.();
  } else if (mode === 'center_between') {
    const lastEdit = getLastEditPosition();
    if (!lastEdit) {
      // Fall back to goto if no last edit position
      navigateToIssue(issue, sketch, 'goto');
      return;
    }
    // Compute midpoint
    const midX = (lastEdit.x + issue.worldX) / 2;
    const midY = (lastEdit.y + issue.worldY) / 2;
    // Compute zoom to fit both points
    const stretchX = window.__getStretch?.()?.x || 0.6;
    const stretchY = window.__getStretch?.()?.y || 1;
    const dx = Math.abs(lastEdit.x - issue.worldX) * stretchX;
    const dy = Math.abs(lastEdit.y - issue.worldY) * stretchY;
    const padding = 0.6;
    const scaleX = dx > 0 ? (rect.width * padding) / dx : 10;
    const scaleY = dy > 0 ? (rect.height * padding) / dy : 10;
    const targetScale = Math.min(scaleX, scaleY, 5);
    const tx = rect.width / 2 - targetScale * stretchX * midX;
    const ty = rect.height / 2 - targetScale * stretchY * midY;
    window.__setViewState?.(targetScale, tx, ty);
    startIssueHighlight(issue.worldX, issue.worldY, 2000);
    window.__scheduleDraw?.();
  }
}
