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
 * - Merge mode toggle (active sketch): shows nearby cross-sketch nodes
 *   and flags duplicate manholes with suggested merge fix
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
import { setIssueContext, setCurrentIndex, getNavState, onNavStateChange } from './issue-nav-state.js';
import { setMergeMode, isMergeModeEnabled, getCrossMergeIssues, onMergeModeChange, refreshMergeMode, MERGE_RADIUS_M } from './merge-mode.js';

/** Escape HTML special characters to prevent XSS */
const esc = (str) => (typeof window.escapeHtml === 'function' ? window.escapeHtml(str) : String(str || ''));

let panelEl = null;
let listEl = null;
let _unsub = null;
let _unsubMerge = null;

/** Current view: 'list' | 'issues' | 'merge' */
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

  // Subscribe to project canvas state changes
  _unsub = onProjectCanvasChange((changeType) => {
    if (changeType !== 'data') {
      _currentView = 'list';
      _issuesSketchId = null;
    }
    // If merge mode is on and sketch data changed, refresh the nearby nodes
    if (changeType === 'data' && isMergeModeEnabled()) {
      _refreshMergeModeData();
    }
    render();
  });

  // Subscribe to merge mode changes (re-render when nearby nodes update)
  _unsubMerge = onMergeModeChange(() => {
    if (_currentView === 'merge') render();
    else window.__scheduleDraw?.();
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
 * Also disables merge mode to stop the canvas overlay.
 */
export function hideSketchSidePanel() {
  if (!panelEl) return;
  panelEl.style.display = 'none';
  panelEl.classList.remove('open');
  _currentView = 'list';
  _issuesSketchId = null;
  // Disable merge mode — clear overlay and state
  if (isMergeModeEnabled()) {
    setMergeMode(false);
    window.__scheduleDraw?.();
  }
  const toggleBtn = document.getElementById('sketchSidePanelToggle');
  if (toggleBtn) toggleBtn.style.display = 'none';
}

/**
 * Main render dispatcher.
 */
function render() {
  if (_currentView === 'issues' && _issuesSketchId) {
    renderIssuesView();
  } else if (_currentView === 'merge') {
    renderMergeView();
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
      <span class="material-icons" style="font-size:36px;opacity:0.5">inbox</span>
      <span>${t('projects.canvas.noSketches') || 'No sketches'}</span>
      <span class="sketch-side-panel__empty-hint">${t('projects.canvas.noSketchesHint') || 'Create a sketch and assign it to this project.'}</span>
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

    // Color-code badge by severity: >100 red, 50-100 orange, <50 yellow
    const severityClass = issues > 100
      ? 'sketch-side-panel__issues-btn--high'
      : issues > 50
        ? 'sketch-side-panel__issues-btn--medium'
        : 'sketch-side-panel__issues-btn--low';

    const missingCoords = sketchData ? (sketchData.stats.missingCoordsCount || 0) : 0;
    const missingPipeData = sketchData ? (sketchData.stats.missingPipeDataCount || 0) : 0;

    // Build tooltip with issue type breakdown
    let issueTooltip = t('projects.canvas.workingStatus') || 'Working Status';
    if (issues > 0) {
      const parts = [];
      if (missingCoords > 0) parts.push(t('projects.canvas.issueBreakdownCoords', missingCoords));
      if (missingPipeData > 0) parts.push(t('projects.canvas.issueBreakdownPipeData', missingPipeData));
      if (parts.length > 0) issueTooltip = parts.join(' · ');
    }

    const issuesBadge = issues > 0
      ? `<button class="sketch-side-panel__issues-btn ${severityClass}" data-sketch-issues="${sketch.id}" title="${esc(issueTooltip)}">
           <span class="material-icons">warning</span>${issues}
         </button>`
      : `<span class="sketch-side-panel__no-issues" title="${t('projects.canvas.noIssues') || 'OK'}">
           <span class="material-icons">check_circle</span>
         </span>`;

    // Merge mode button only shown for the active sketch
    const mergeModeActive = isMergeModeEnabled();
    const mergeModeBtn = sketch.isActive
      ? `<button class="sketch-side-panel__merge-btn${mergeModeActive ? ' active' : ''}"
           data-sketch-merge="${sketch.id}"
           title="${t('projects.canvas.mergeMode') || 'Merge Mode'} (${MERGE_RADIUS_M}m)">
           <span class="material-icons">call_merge</span>
         </button>`
      : '';

    item.innerHTML = `
      <button class="sketch-side-panel__eye" title="${sketch.isVisible ? t('projects.canvas.hide') || 'Hide' : t('projects.canvas.show') || 'Show'}">
        <span class="material-icons">${sketch.isVisible ? 'visibility' : 'visibility_off'}</span>
      </button>
      <div class="sketch-side-panel__info">
        <span class="sketch-side-panel__name">${esc(displayName)}</span>
        <span class="sketch-side-panel__badge">${nodeCount}</span>
      </div>
      <div class="sketch-side-panel__stats">
        <span class="sketch-side-panel__km">${km} ${t('projects.canvas.totalKm') || 'km'}</span>
        ${issuesBadge}
        ${mergeModeBtn}
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

    // Merge mode toggle button (only on active sketch)
    const mergeBtnEl = item.querySelector('.sketch-side-panel__merge-btn');
    if (mergeBtnEl) {
      mergeBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleMergeMode(sketch);
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
        // If switching away from the active sketch while merge mode is on, disable it
        if (isMergeModeEnabled()) {
          setMergeMode(false);
          window.__scheduleDraw?.();
        }
        switchActiveSketch(sketch.id);
      }
    });

    listEl.appendChild(item);
  }

  // Add totals footer with issue type breakdown
  const totalsEl = document.createElement('div');
  totalsEl.className = 'sketch-side-panel__totals';
  const issuesClass = totals.issueCount > 0 ? 'sketch-side-panel__totals-issues--warn' : 'sketch-side-panel__totals-issues--ok';
  const issuesIcon = totals.issueCount > 0 ? 'warning' : 'check_circle';

  // Build breakdown text for totals
  let breakdownHtml = '';
  if (totals.issueCount > 0) {
    const breakdownParts = [];
    if (totals.missingCoordsCount > 0) {
      breakdownParts.push(`<span class="sketch-side-panel__totals-breakdown-item">
        <span class="material-icons" style="font-size:13px;vertical-align:middle">location_off</span>
        ${totals.missingCoordsCount} ${t('projects.canvas.missingCoords') || 'missing coords'}
      </span>`);
    }
    if (totals.missingPipeDataCount > 0) {
      breakdownParts.push(`<span class="sketch-side-panel__totals-breakdown-item">
        <span class="material-icons" style="font-size:13px;vertical-align:middle">rule</span>
        ${totals.missingPipeDataCount} ${t('projects.canvas.missingPipeData') || 'missing pipe data'}
      </span>`);
    }
    if (breakdownParts.length > 0) {
      breakdownHtml = `<div class="sketch-side-panel__totals-breakdown">${breakdownParts.join('')}</div>`;
    }
  }

  totalsEl.innerHTML = `
    <span class="sketch-side-panel__totals-km">${totals.totalKm.toFixed(2)} ${t('projects.canvas.totalKm') || 'km'}</span>
    <span class="sketch-side-panel__totals-issues ${issuesClass}">
      <span class="material-icons">${issuesIcon}</span>
      ${totals.issueCount} ${t('projects.canvas.issues') || 'Issues'}
    </span>
    ${breakdownHtml}
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

  // Set the issue navigation context so prev/next buttons in the detail panel work
  setIssueContext(sketch.id, sketch.nodes || [], sketch.edges || []);

  listEl.innerHTML = '';

  // Get current nav state for highlighting
  const navState = getNavState();

  // Back button
  const backEl = document.createElement('div');
  backEl.className = 'sketch-side-panel__issues-back';
  backEl.innerHTML = `
    <span class="material-icons">arrow_back</span>
    <span>${esc(displayName)} — ${t('projects.canvas.workingStatus') || 'Working Status'}</span>
  `;
  backEl.addEventListener('click', () => {
    _currentView = 'list';
    _issuesSketchId = null;
    render();
  });
  listEl.appendChild(backEl);

  // Summary bar with issue counter
  const summaryEl = document.createElement('div');
  summaryEl.className = 'sketch-side-panel__issues-summary';
  const counterHtml = navState.currentIndex >= 0
    ? `<span class="sketch-side-panel__issues-counter">${t('fixes.issueCounter', navState.currentIndex + 1, navState.total)}</span>`
    : '';
  summaryEl.innerHTML = `
    <span>${stats.totalKm.toFixed(2)} ${t('projects.canvas.totalKm') || 'km'}</span>
    <span>${stats.issueCount} ${t('projects.canvas.issues') || 'Issues'}</span>
    ${counterHtml}
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
  for (let idx = 0; idx < issues.length; idx++) {
    const issue = issues[idx];
    const row = document.createElement('div');
    const isActive = navState.currentIndex === idx;
    row.className = 'sketch-side-panel__issue-row' + (isActive ? ' sketch-side-panel__issue-row--active' : '');
    row.dataset.issueIndex = idx;

    let icon, typeText, nodeLabel;
    if (issue.type === 'missing_coords') {
      icon = 'location_off';
      typeText = t('projects.canvas.missingCoords') || 'Missing coordinates';
      nodeLabel = `#${issue.nodeId}`;
    } else if (issue.type === 'missing_pipe_data') {
      icon = 'rule';
      typeText = t('projects.canvas.missingPipeData') || 'Missing pipe data';
      nodeLabel = `#${issue.nodeId}`;
    } else if (issue.type === 'long_edge') {
      icon = 'straighten';
      typeText = `${t('projects.canvas.longPipe') || 'Long pipe'} (${issue.lengthM}m)`;
      nodeLabel = `#${issue.tailId}→#${issue.headId}`;
    } else if (issue.type === 'not_last_manhole') {
      icon = 'last_page';
      typeText = t('projects.canvas.notLastManhole') || 'Not last manhole';
      nodeLabel = `#${issue.nodeId}`;
    } else if (issue.type === 'merge_candidate') {
      icon = 'call_merge';
      typeText = `${t('projects.canvas.mergeCandidate') || 'Merge suggestion'} (#${issue.mergeNodeId}, ${issue.distanceM}m)`;
      nodeLabel = `#${issue.nodeId}`;
    } else if (issue.type === 'negative_gradient') {
      icon = 'trending_down';
      typeText = `${t('projects.canvas.negativeGradient') || 'Negative gradient'} (${issue.gradient}m)`;
      nodeLabel = `#${issue.tailId}→#${issue.headId}`;
    } else {
      icon = 'rule';
      typeText = t('projects.canvas.missingMeasurement') || 'Missing measurement';
      nodeLabel = `#${issue.nodeId}`;
    }

    row.innerHTML = `
      <div class="sketch-side-panel__issue-info">
        <span class="sketch-side-panel__issue-icon"><span class="material-icons">${icon}</span></span>
        <span class="sketch-side-panel__issue-node">${esc(nodeLabel)}</span>
        <span class="sketch-side-panel__issue-type">${esc(typeText)}</span>
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

    // Go to issue — also updates nav state index
    const gotoBtn = row.querySelector('.sketch-side-panel__issue-goto');
    gotoBtn.addEventListener('click', () => {
      setCurrentIndex(idx);
      _highlightActiveIssueRow(idx);
      navigateToIssue(issue, sketch, 'goto');
    });

    // Center between — also updates nav state index
    const centerBtn = row.querySelector('.sketch-side-panel__issue-center');
    centerBtn.addEventListener('click', () => {
      setCurrentIndex(idx);
      _highlightActiveIssueRow(idx);
      navigateToIssue(issue, sketch, 'center_between');
    });

    listEl.appendChild(row);
  }
}

/**
 * Highlight the active issue row in the side panel list and scroll it into view.
 * @param {number} activeIdx
 */
function _highlightActiveIssueRow(activeIdx) {
  if (!listEl) return;
  const rows = listEl.querySelectorAll('.sketch-side-panel__issue-row');
  rows.forEach((row, i) => {
    row.classList.toggle('sketch-side-panel__issue-row--active', i === activeIdx);
  });
  // Scroll the active row into view
  const activeRow = listEl.querySelector('.sketch-side-panel__issue-row--active');
  if (activeRow) {
    activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── Merge mode helpers ────────────────────────────────────────────────────

/**
 * Gather the active sketch nodes and all visible other-sketch data, then
 * enable/disable merge mode accordingly.
 */
function _toggleMergeMode(activeSketch) {
  if (isMergeModeEnabled()) {
    setMergeMode(false);
    window.__scheduleDraw?.();
    render();
    return;
  }

  const sketches = getAllSketches();
  const otherSketches = sketches
    .filter(s => !s.isActive && s.isVisible)
    .map(s => ({ id: s.id, name: s.name, nodes: s.nodes || [] }));

  setMergeMode(true, {
    activeNodes: activeSketch.nodes || [],
    otherSketches,
  });

  const crossIssues = getCrossMergeIssues();
  window.__scheduleDraw?.();

  // Switch to merge view if there are cross-sketch duplicates, otherwise just
  // show a toast so the user knows overlay is active.
  if (crossIssues.length > 0) {
    _currentView = 'merge';
    render();
  } else {
    const msg = t('projects.canvas.mergeModeActive') || 'Merge mode active';
    window.showToast?.(msg);
    render(); // re-render to show active state on button
  }
}

/**
 * Refresh merge mode data from current canvas state.
 * Called when active sketch data changes while merge mode is on.
 */
function _refreshMergeModeData() {
  const sketches = getAllSketches();
  const active = sketches.find(s => s.isActive);
  if (!active) return;
  const otherSketches = sketches
    .filter(s => !s.isActive && s.isVisible)
    .map(s => ({ id: s.id, name: s.name, nodes: s.nodes || [] }));
  refreshMergeMode(active.nodes || [], otherSketches);
}

/**
 * Render the merge mode sub-panel showing cross-sketch duplicate issues.
 */
function renderMergeView() {
  if (!listEl) return;

  const sketches = getAllSketches();
  const activeSketch = sketches.find(s => s.isActive);

  // Remove totals footer
  const existingTotals = panelEl?.querySelector('.sketch-side-panel__totals');
  if (existingTotals) existingTotals.remove();

  listEl.innerHTML = '';

  // Back button
  const backEl = document.createElement('div');
  backEl.className = 'sketch-side-panel__issues-back';
  backEl.innerHTML = `
    <span class="material-icons">arrow_back</span>
    <span>${t('projects.canvas.mergeMode') || 'Merge Mode'}</span>
  `;
  backEl.addEventListener('click', () => {
    _currentView = 'list';
    render();
  });
  listEl.appendChild(backEl);

  const crossIssues = getCrossMergeIssues();

  // Info bar
  const infoEl = document.createElement('div');
  infoEl.className = 'sketch-side-panel__merge-info';
  infoEl.innerHTML = `
    <span class="material-icons" style="font-size:16px;color:var(--color-warning,#f59e0b)">call_merge</span>
    <span>${t('projects.canvas.mergeModeRadius', MERGE_RADIUS_M) || `Radius: ${MERGE_RADIUS_M}m`}</span>
    <span class="sketch-side-panel__merge-info-count">${crossIssues.length} ${t('projects.canvas.duplicates') || 'duplicates'}</span>
  `;
  listEl.appendChild(infoEl);

  if (crossIssues.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'sketch-side-panel__empty';
    emptyEl.innerHTML = `
      <span class="material-icons" style="color:var(--color-success,#22c55e)">check_circle</span>
      <span>${t('projects.canvas.noDuplicates') || 'No duplicates found'}</span>
      <span class="sketch-side-panel__empty-hint">${t('projects.canvas.noDuplicatesHint') || 'Nearby nodes are shown on the canvas as amber circles.'}</span>
    `;
    listEl.appendChild(emptyEl);
    return;
  }

  // Group issues by nearby sketch for clarity
  /** @type {Map<string, typeof crossIssues>} */
  const bySketch = new Map();
  for (const issue of crossIssues) {
    const key = issue.nearbySketchId;
    if (!bySketch.has(key)) bySketch.set(key, []);
    bySketch.get(key).push(issue);
  }

  for (const [, issues] of bySketch) {
    const sketchName = issues[0].nearbySketchName;

    // Sketch group header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'sketch-side-panel__merge-group';
    groupHeader.innerHTML = `
      <span class="material-icons" style="font-size:14px">layers</span>
      <span>${esc(sketchName)}</span>
      <span class="sketch-side-panel__merge-group-count">${issues.length}</span>
    `;
    listEl.appendChild(groupHeader);

    for (const issue of issues) {
      const row = document.createElement('div');
      row.className = 'sketch-side-panel__issue-row sketch-side-panel__merge-row';

      row.innerHTML = `
        <div class="sketch-side-panel__issue-info">
          <span class="sketch-side-panel__issue-icon sketch-side-panel__merge-icon">
            <span class="material-icons">merge_type</span>
          </span>
          <div class="sketch-side-panel__merge-pair">
            <span class="sketch-side-panel__merge-pair-label">
              #${esc(String(issue.activeNodeId))} ↔ #${esc(String(issue.nearbyNodeId))}
            </span>
            <span class="sketch-side-panel__merge-pair-dist">${issue.distanceM}m</span>
          </div>
        </div>
        <div class="sketch-side-panel__issue-actions">
          <button class="sketch-side-panel__issue-goto" title="${t('projects.canvas.goToIssue') || 'Go to issue'}">
            <span class="material-icons">my_location</span>
          </button>
          <button class="sketch-side-panel__merge-apply-btn" title="${t('projects.canvas.applyMerge') || 'Apply merge fix'}">
            <span class="material-icons">call_merge</span>
          </button>
        </div>
      `;

      // Navigate to the active node location on canvas
      const gotoBtn = row.querySelector('.sketch-side-panel__issue-goto');
      gotoBtn.addEventListener('click', () => {
        _navigateToMergeIssue(issue, activeSketch);
      });

      // Apply cross-sketch merge fix
      const applyBtn = row.querySelector('.sketch-side-panel__merge-apply-btn');
      applyBtn.addEventListener('click', () => {
        _applyCrossSketchMerge(issue, activeSketch, sketches);
      });

      listEl.appendChild(row);
    }
  }
}

/**
 * Navigate to the active node of a cross-sketch merge issue.
 */
function _navigateToMergeIssue(issue, _activeSketch) {
  const canvas = document.getElementById('graphCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const stretchX = window.__getStretch?.()?.x || 0.6;
  const stretchY = window.__getStretch?.()?.y || 1;

  // Show both nodes: center between them with zoom to fit
  const midX = (issue.worldX + issue.nearbyWorldX) / 2;
  const midY = (issue.worldY + issue.nearbyWorldY) / 2;
  const dx = Math.abs(issue.worldX - issue.nearbyWorldX) * stretchX;
  const dy = Math.abs(issue.worldY - issue.nearbyWorldY) * stretchY;
  let targetScale;
  if (dx < 1 && dy < 1) {
    targetScale = 5; // nodes are essentially on top of each other
  } else {
    const padding = 0.4;
    const scaleX = dx > 0 ? (rect.width * padding) / dx : 10;
    const scaleY = dy > 0 ? (rect.height * padding) / dy : 10;
    targetScale = Math.min(scaleX, scaleY, 8);
  }

  const tx = rect.width / 2 - targetScale * stretchX * midX;
  const ty = rect.height / 2 - targetScale * stretchY * midY;
  window.__setViewState?.(targetScale, tx, ty);
  startIssueHighlight(issue.worldX, issue.worldY, 2500);
  window.__scheduleDraw?.();
}

/**
 * Apply a cross-sketch merge fix:
 *   - The nearby node (from the other sketch) is the duplicate that gets merged
 *     into the active-sketch node.
 *   - All edges connected to the nearby node in the other sketch are re-pointed
 *     to the active-sketch node (inserted into the active sketch).
 *   - The nearby node is removed from its source sketch.
 *   - The active sketch is saved so the fix persists.
 *
 * @param {object} issue - CrossMergeIssue
 * @param {object} activeSketch - the active sketch object
 * @param {object[]} allSketches - all loaded sketches
 */
function _applyCrossSketchMerge(issue, activeSketch, allSketches) {
  const confirmMsg = t('confirms.crossSketchMerge',
    issue.activeNodeId, issue.nearbyNodeId, issue.nearbySketchName, issue.distanceM)
    || `Merge node #${issue.activeNodeId} in the active sketch with node #${issue.nearbyNodeId} from "${issue.nearbySketchName}" (${issue.distanceM}m away)?

The nearby node will be removed and its connections will be transferred to the active sketch.`;

  if (!confirm(confirmMsg)) return;

  // Find the source sketch
  const sourceSketch = allSketches.find(s => s.id === issue.nearbySketchId);
  if (!sourceSketch) {
    window.showToast?.(t('projects.canvas.mergeErrorSourceNotFound') || 'Source sketch not found');
    return;
  }

  const activeNodes = activeSketch.nodes || [];
  const activeEdges = activeSketch.edges || [];
  const sourceNodes = sourceSketch.nodes || [];
  const sourceEdges = sourceSketch.edges || [];

  const activeNodeId = String(issue.activeNodeId);
  const nearbyNodeId = String(issue.nearbyNodeId);

  const nearbyNode = sourceNodes.find(n => String(n.id) === nearbyNodeId);
  if (!nearbyNode) {
    window.showToast?.(t('projects.canvas.mergeErrorNodeNotFound') || 'Nearby node not found');
    return;
  }

  // Collect all edges connected to the nearby node in the source sketch
  const connectedEdges = sourceEdges.filter(
    e => String(e.tail) === nearbyNodeId || String(e.head) === nearbyNodeId
  );

  if (connectedEdges.length > 0) {
    // Generate a new unique edge ID base for the active sketch
    const maxEdgeId = activeEdges.reduce((max, e) => {
      const n = parseInt(e.id, 10);
      return !isNaN(n) && n > max ? n : max;
    }, 0);

    let edgeIdCounter = maxEdgeId + 1;

    for (const srcEdge of connectedEdges) {
      // Determine which end connects to the nearby node (nearbyNodeId)
      // and which end connects to the "other" node in the source sketch.
      const isTailNearby = String(srcEdge.tail) === nearbyNodeId;
      const otherEndId = isTailNearby ? String(srcEdge.head) : String(srcEdge.tail);

      // The "other" node from the source sketch — we need to bring it too
      // if it doesn't already exist in the active sketch.
      const otherNodeInSource = sourceNodes.find(n => String(n.id) === otherEndId);

      // Check if a node with the same survey coordinates already exists
      // in the active sketch (may have been previously imported).
      let targetOtherNodeId = null;
      if (otherNodeInSource) {
        // Look for an existing node in active sketch at same coords (within 1m)
        const otherItmX = otherNodeInSource.surveyX;
        const otherItmY = otherNodeInSource.surveyY;
        if (otherItmX != null && otherItmY != null) {
          const match = activeNodes.find(an => {
            if (an.surveyX == null) return false;
            const d = Math.sqrt((an.surveyX - otherItmX) ** 2 + (an.surveyY - otherItmY) ** 2);
            return d < 1;
          });
          if (match) targetOtherNodeId = String(match.id);
        }

        if (!targetOtherNodeId) {
          // Import the other node into the active sketch with a new ID
          const maxNodeId = activeNodes.reduce((max, n) => {
            const id = parseInt(n.id, 10);
            return !isNaN(id) && id > max ? id : max;
          }, 0);
          const newNodeId = maxNodeId + 1;
          const importedNode = {
            ...otherNodeInSource,
            id: newNodeId,
            _importedFromSketch: issue.nearbySketchId,
            _importedOriginalId: otherNodeInSource.id,
          };
          activeNodes.push(importedNode);
          targetOtherNodeId = String(newNodeId);
        }
      }

      if (!targetOtherNodeId) continue; // cannot reconnect without other endpoint

      // Create the edge in the active sketch
      const newEdge = {
        ...srcEdge,
        id: edgeIdCounter++,
        tail: isTailNearby ? parseInt(activeNodeId, 10) : parseInt(targetOtherNodeId, 10),
        head: isTailNearby ? parseInt(targetOtherNodeId, 10) : parseInt(activeNodeId, 10),
        _importedFromSketch: issue.nearbySketchId,
      };
      activeEdges.push(newEdge);

      // Remove this edge from the source sketch
      const srcIdx = sourceEdges.indexOf(srcEdge);
      if (srcIdx !== -1) sourceEdges.splice(srcIdx, 1);
    }
  }

  // Remove the nearby node from its source sketch
  const nearbyIdx = sourceNodes.indexOf(nearbyNode);
  if (nearbyIdx !== -1) sourceNodes.splice(nearbyIdx, 1);

  // Commit the active sketch changes back through the canvas state
  window.__setActiveSketchData?.({
    nodes: activeNodes,
    edges: activeEdges,
    nextNodeId: activeNodes.reduce((max, n) => {
      const id = parseInt(n.id, 10);
      return !isNaN(id) && id > max ? id : max;
    }, 0) + 1,
    sketchId: activeSketch.id,
    sketchName: activeSketch.name,
    projectId: activeSketch.projectId,
    adminConfig: activeSketch.adminConfig || {},
    inputFlowConfig: activeSketch.snapshotInputFlowConfig || {},
  });

  // Trigger save of the active sketch
  window.__scheduleDraw?.();
  if (typeof window.saveToStorage === 'function') {
    window.saveToStorage();
  }

  // Refresh merge mode data with updated state
  _refreshMergeModeData();
  window.__scheduleDraw?.();

  window.showToast?.(t('fixes.applied') || 'Fix applied');

  // Re-render the panel
  render();
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

  // Auto-select the node or edge associated with the issue so the details
  // panel opens immediately — the user can then modify fields to fix the issue.
  // Use a short delay to let the viewport animation settle first.
  setTimeout(() => {
    if (issue.nodeId != null) {
      window.__selectNodeById?.(issue.nodeId);
    } else if (issue.edgeId != null) {
      window.__selectEdgeById?.(issue.edgeId);
    }
  }, 150);
}
