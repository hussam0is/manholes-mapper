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
  toggleSketchSelected,
  selectAllSketches,
  areAllSketchesSelected,
  toggleMultiSelect,
  refreshActiveSketchData,
  getCurrentProjectId,
  loadProjectSketches,
} from './project-canvas-state.js';

import { computeSketchIssues, computeProjectTotals } from './sketch-issues.js';
import { startIssueHighlight } from './issue-highlight.js';
import { getLastEditPosition } from './last-edit-tracker.js';
import { setIssueContext, setCurrentIndex, getNavState, onNavStateChange } from './issue-nav-state.js';
import { setMergeMode, isMergeModeEnabled, getCrossMergeIssues, onMergeModeChange, refreshMergeMode, MERGE_RADIUS_M } from './merge-mode.js';

/** Escape HTML special characters to prevent XSS */
const esc = (str) => (typeof window.escapeHtml === 'function' ? window.escapeHtml(str) : String(str || ''));

/** Format sketch display name — name > date > shortened ID (never raw sk_ IDs) */
function formatSketchName(sketch) {
  if (sketch.name && sketch.name.trim()) return sketch.name;
  try {
    const d = new Date(sketch.createdAt || sketch.creationDate);
    const lang = document.documentElement.lang || 'he';
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    }
  } catch (_) {}
  return sketch.id ? sketch.id.replace('sk_', '#') : 'Sketch';
}

/** Detect if text is primarily LTR (Latin/digits) — used for BiDi wrapping */
function isLtrText(str) {
  if (!str) return false;
  // Count Latin letters + digits vs Hebrew/Arabic chars
  const ltr = (str.match(/[A-Za-z0-9_\-.]/g) || []).length;
  const rtl = (str.match(/[\u0590-\u05FF\u0600-\u06FF]/g) || []).length;
  return ltr > rtl;
}

let panelEl = null;
let listEl = null;
let _unsub = null;
let _unsubMerge = null;

/** Current view: 'list' | 'issues' | 'merge' */
let _currentView = 'list';
/** Sketch ID whose issues are being viewed */
let _issuesSketchId = null;
/** Unsubscribe for nav state changes */
let _unsubNav = null;

/** Cached per-sketch stats (recomputed on render) */
let _sketchStats = new Map();
/** Cache keys to detect actual data changes (avoids recomputing all issues on every render) */
let _sketchCacheKeys = new Map();

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
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panelEl.classList.remove('open');
    });
    // Also handle touch for mobile/landscape where click may not fire
    closeBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
  }

  // Project switcher
  const switcherEl = document.getElementById('projectSwitcher');
  const switcherSelect = document.getElementById('projectSwitcherSelect');
  if (switcherSelect) {
    switcherSelect.addEventListener('change', async (e) => {
      const newProjectId = e.target.value;
      if (!newProjectId || newProjectId === getCurrentProjectId()) return;
      switcherSelect.disabled = true;
      try {
        await loadProjectSketches(newProjectId);
        // Update URL hash to reflect the new project
        window.location.hash = `#/project/${newProjectId}`;
        window.showToast?.(t('projects.canvas.projectSwitched') || 'Project switched');
      } catch (err) {
        console.error('[ProjectSwitcher] Failed to switch:', err);
        window.showToast?.(t('projects.canvas.projectSwitchError') || 'Failed to switch project');
        // Revert selection
        switcherSelect.value = getCurrentProjectId() || '';
      } finally {
        switcherSelect.disabled = false;
      }
    });
  }

  // Subscribe to project canvas state changes
  _unsub = onProjectCanvasChange((changeType) => {
    // changeType logged in dev only
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

  // Subscribe to issue nav state changes (highlight active issue row when nav changes)
  _unsubNav = onNavStateChange((navState) => {
    if (_currentView === 'issues' && _issuesSketchId) {
      _highlightActiveIssueRow(navState.currentIndex);
    }
  });

  // Subscribe to merge mode changes (re-render when nearby nodes update)
  _unsubMerge = onMergeModeChange(() => {
    if (_currentView === 'merge') render();
    else window.__scheduleDraw?.();
  });
}

/**
 * Show the side panel (when entering project-canvas mode).
 * Auto-enables "View All" so all project sketches are visible on canvas.
 */
export function showSketchSidePanel() {
  if (!panelEl) return;
  panelEl.style.display = '';
  panelEl.classList.add('open');
  _currentView = 'list';
  _issuesSketchId = null;
  const toggleBtn = document.getElementById('sketchSidePanelToggle');
  if (toggleBtn) toggleBtn.style.display = '';
  // Auto-enable View All so users see all project sketches immediately
  const sketches = getAllSketches();
  if (sketches.length > 0 && !areAllSketchesSelected()) {
    selectAllSketches();
  }
  // Populate project switcher
  _loadProjectSwitcher();
  render();
}

/** Fetch all projects and populate the switcher dropdown */
async function _loadProjectSwitcher() {
  const switcherEl = document.getElementById('projectSwitcher');
  const selectEl = document.getElementById('projectSwitcherSelect');
  if (!switcherEl || !selectEl) return;

  try {
    const res = await fetch('/api/projects', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const projects = data.projects || [];

    const currentId = getCurrentProjectId();
    selectEl.innerHTML = projects.map(p =>
      `<option value="${p.id}"${p.id === currentId ? ' selected' : ''}>${p.name || p.id} (${p.sketchCount || 0})</option>`
    ).join('');

    switcherEl.style.display = '';
  } catch (err) {
    console.warn('[ProjectSwitcher] Failed to load projects:', err);
    switcherEl.style.display = 'none';
  }
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
  _sketchStats.clear();
  _sketchCacheKeys.clear();
  // Disable merge mode — clear overlay and state
  if (isMergeModeEnabled()) {
    setMergeMode(false);
    window.__scheduleDraw?.();
  }
  const toggleBtn = document.getElementById('sketchSidePanelToggle');
  if (toggleBtn) toggleBtn.style.display = 'none';
  const switcherEl = document.getElementById('projectSwitcher');
  if (switcherEl) switcherEl.style.display = 'none';
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

  // Remove any existing toolbar before re-rendering
  const existingToolbar = panelEl?.querySelector('.sketch-side-panel__toolbar');
  if (existingToolbar) existingToolbar.remove();

  // Add toolbar row with View All button
  const allSelected = areAllSketchesSelected();
  const toolbarEl = document.createElement('div');
  toolbarEl.className = 'sketch-side-panel__toolbar';
  const viewAllLabel = allSelected
    ? (t('projects.canvas.viewAllActive') || 'Viewing All')
    : (t('projects.canvas.viewAll') || 'View All');
  toolbarEl.innerHTML = `
    <button class="sketch-side-panel__view-all-btn${allSelected ? ' active' : ''}" title="${esc(viewAllLabel)}">
      <span class="material-icons">visibility</span>
      <span>${esc(viewAllLabel)}</span>
    </button>
  `;
  const viewAllBtn = toolbarEl.querySelector('.sketch-side-panel__view-all-btn');
  viewAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (allSelected) {
      // Toggle back to single-sketch mode
      toggleMultiSelect(false);
      window.showToast?.(t('projects.canvas.viewAllOff') || 'View All off');
    } else {
      selectAllSketches();
      // Zoom to fit all sketches so the user can see them
      const info = _zoomToFitAllSketches();
      if (info) {
        window.showToast?.(`${info.sketchCount} ${t('projects.canvas.sketches') || 'sketches'}, ${info.totalNodes} ${t('projects.canvas.nodes') || 'nodes'}`);
      } else {
        window.showToast?.(t('projects.canvas.viewAllOn') || 'Viewing all sketches');
      }
    }
  });
  // Insert toolbar before the list element
  listEl.parentNode.insertBefore(toolbarEl, listEl);

  // Compute stats for sketches (with cache to avoid redundant recomputation)
  const allStats = [];
  let cacheHits = 0, cacheMisses = 0;
  for (const sketch of sketches) {
    const nodesArr = sketch.nodes || [];
    const edgesArr = sketch.edges || [];
    const cacheKey = `${nodesArr.length}:${edgesArr.length}:${sketch.updatedAt || ''}`;
    if (_sketchCacheKeys.get(sketch.id) !== cacheKey || !_sketchStats.has(sketch.id)) {
      const result = computeSketchIssues(nodesArr, edgesArr);
      _sketchStats.set(sketch.id, result);
      _sketchCacheKeys.set(sketch.id, cacheKey);
      cacheMisses++;
    } else {
      cacheHits++;
    }
    allStats.push(_sketchStats.get(sketch.id).stats);
  }
  const totals = computeProjectTotals(allStats);

  listEl.innerHTML = '';

  for (const sketch of sketches) {
    const isSelected = sketch.isActive || sketch.isSelected;
    const selectionClass = sketch.isActive ? ' active' : isSelected ? ' selected' : ' unselected';
    const item = document.createElement('div');
    item.className = 'sketch-side-panel__item' + selectionClass;
    item.dataset.sketchId = sketch.id;
    // Tooltip replaces the old floating "double-click to edit" hint text
    if (!sketch.isActive) {
      item.title = t('projects.canvas.multiSelectHint') || 'Double-click to edit';
    }

    const nodeCount = (sketch.nodes || []).length;
    const displayName = formatSketchName(sketch);
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

    const editingBadge = sketch.isActive
      ? `<span class="sketch-side-panel__editing-badge">
           <span class="material-icons">edit</span>${t('projects.canvas.editing') || 'Editing'}
         </span>`
      : '';

    const selectIcon = isSelected ? 'check_box' : 'check_box_outline_blank';
    const selectTitle = isSelected
      ? (t('projects.canvas.deselectSketch') || 'Deselect')
      : (t('projects.canvas.selectSketch') || 'Select');

    // BiDi fix: wrap LTR names (English filenames like "me_rakat 2026-01-22") in dir="ltr" span
    const nameDir = isLtrText(displayName) ? ' dir="ltr"' : '';

    item.innerHTML = `
      <div class="sketch-card__row1">
        <div class="sketch-card__title-group">
          <span class="sketch-side-panel__select-indicator" title="${esc(selectTitle)}">
            <span class="material-icons">${selectIcon}</span>
          </span>
          <span class="sketch-card__name"${nameDir}>${esc(displayName)}</span>
          ${editingBadge}
        </div>
        <button class="sketch-side-panel__eye" title="${sketch.isVisible ? t('projects.canvas.hide') || 'Hide' : t('projects.canvas.show') || 'Show'}">
          <span class="material-icons">${sketch.isVisible ? 'visibility' : 'visibility_off'}</span>
        </button>
      </div>
      <div class="sketch-card__row2">
        <span class="sketch-card__meta">
          <span class="material-icons">straighten</span>${km} ${t('projects.canvas.totalKm') || 'km'}
        </span>
        <span class="sketch-side-panel__badge">${nodeCount}</span>
      </div>
      <div class="sketch-card__row3">
        <div class="sketch-card__alerts">
          ${issuesBadge}
        </div>
        <div class="sketch-card__actions">
          ${mergeModeBtn}
          <button class="sketch-side-panel__recenter-btn" data-sketch-recenter="${sketch.id}" title="${t('projects.canvas.recenterToSketch') || 'Recenter to sketch'}">
            <span class="material-icons">center_focus_strong</span>
          </button>
        </div>
      </div>
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

    // Select indicator click — toggle selection
    const selectIndicator = item.querySelector('.sketch-side-panel__select-indicator');
    if (selectIndicator) {
      selectIndicator.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!sketch.isActive) {
          toggleSketchSelected(sketch.id);
        }
      });
    }

    // Single click on row — toggle selection (not switch active)
    item.addEventListener('click', () => {
      if (!sketch.isActive) {
        toggleSketchSelected(sketch.id);
      }
    });

    // Double click on row — switch active sketch
    item.addEventListener('dblclick', () => {
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

  // (breakdown is now integrated into the totals chips below)

  totalsEl.innerHTML = `
    <div class="sketch-side-panel__totals-chips">
      <span class="sketch-side-panel__totals-chip sketch-side-panel__totals-chip--issues ${issuesClass}">
        <span class="material-icons">${issuesIcon}</span>
        ${totals.issueCount} ${t('projects.canvas.issues') || 'Issues'}
      </span>
      <span class="sketch-side-panel__totals-chip sketch-side-panel__totals-chip--km">
        <span class="material-icons">straighten</span>
        ${totals.totalKm.toFixed(2)} ${t('projects.canvas.totalKm') || 'km'}
      </span>
      ${totals.missingCoordsCount > 0 ? `
        <span class="sketch-side-panel__totals-chip sketch-side-panel__totals-chip--coords">
          <span class="material-icons">location_off</span>
          ${totals.missingCoordsCount} ${t('projects.canvas.missingCoords') || 'missing coords'}
        </span>
      ` : ''}
      ${totals.missingPipeDataCount > 0 ? `
        <span class="sketch-side-panel__totals-chip sketch-side-panel__totals-chip--pipes">
          <span class="material-icons">plumbing</span>
          ${totals.missingPipeDataCount} ${t('projects.canvas.missingPipeData') || 'missing pipe data'}
        </span>
      ` : ''}
    </div>
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

  const displayName = formatSketchName(sketch);
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
 * Zoom the canvas to fit ALL loaded sketches (all visible nodes across every sketch).
 * @returns {{ sketchCount: number, totalNodes: number } | null}
 */
function _zoomToFitAllSketches() {
  // Sync active sketch canvas data back to the map so bounding box is accurate
  refreshActiveSketchData();
  const sketches = getAllSketches();
  if (sketches.length === 0) return null;

  // --- Step 1: Compute per-sketch centroids (skip empty sketches) ---
  const sketchCentroids = [];
  for (const sketch of sketches) {
    const nodes = sketch.nodes || [];
    if (nodes.length === 0) continue;
    let sumX = 0, sumY = 0;
    for (const n of nodes) {
      sumX += n.x;
      sumY += n.y;
    }
    sketchCentroids.push({
      sketch,
      cx: sumX / nodes.length,
      cy: sumY / nodes.length,
      nodeCount: nodes.length,
    });
  }

  if (sketchCentroids.length === 0) return { sketchCount: sketches.length, totalNodes: 0 };

  // --- Step 2: Outlier detection using Median Absolute Deviation (MAD) ---
  // Only meaningful with 3+ sketches; with fewer, use all
  let filteredCentroids = sketchCentroids;
  const MAD_THRESHOLD = 3;

  if (sketchCentroids.length >= 3) {
    const median = (arr) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const centroidXs = sketchCentroids.map(c => c.cx);
    const centroidYs = sketchCentroids.map(c => c.cy);

    const medianX = median(centroidXs);
    const medianY = median(centroidYs);

    // MAD = median of absolute deviations from the median
    const madX = median(centroidXs.map(x => Math.abs(x - medianX)));
    const madY = median(centroidYs.map(y => Math.abs(y - medianY)));

    // Use scaled MAD as threshold; if MAD is 0 (all same position), use a fallback
    // The constant 1.4826 scales MAD to be consistent with standard deviation for normal distributions
    const scaledMadX = madX * 1.4826;
    const scaledMadY = madY * 1.4826;

    // Minimum threshold to avoid filtering tightly clustered sketches: 10,000 canvas units
    const thresholdX = Math.max(scaledMadX * MAD_THRESHOLD, 10000);
    const thresholdY = Math.max(scaledMadY * MAD_THRESHOLD, 10000);

    const inliers = sketchCentroids.filter(c => {
      const devX = Math.abs(c.cx - medianX);
      const devY = Math.abs(c.cy - medianY);
      return devX <= thresholdX && devY <= thresholdY;
    });

    const outliers = sketchCentroids.filter(c => {
      const devX = Math.abs(c.cx - medianX);
      const devY = Math.abs(c.cy - medianY);
      return devX > thresholdX || devY > thresholdY;
    });

    // Only exclude outliers if at least 1 sketch remains
    if (inliers.length >= 1 && outliers.length > 0) {
      filteredCentroids = inliers;
      for (const o of outliers) {
        const name = o.sketch.name || o.sketch.id || '(unnamed)';
        console.warn(
          `[ViewAll] Excluded outlier sketch "${name}" — centroid (${o.cx.toFixed(0)}, ${o.cy.toFixed(0)}), ` +
          `median (${medianX.toFixed(0)}, ${medianY.toFixed(0)}), ` +
          `thresholds (${thresholdX.toFixed(0)}, ${thresholdY.toFixed(0)})`
        );
      }
      console.log(`[ViewAll] Outlier filter: ${inliers.length} kept, ${outliers.length} excluded`);
    }
  }

  // --- Step 3: Compute bounding box from filtered (non-outlier) sketches ---
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let totalNodes = 0;
  const filteredSketchSet = new Set(filteredCentroids.map(c => c.sketch));
  for (const sketch of sketches) {
    if (!filteredSketchSet.has(sketch)) continue;
    for (const n of (sketch.nodes || [])) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
      totalNodes++;
    }
  }

  const sketchCount = filteredSketchSet.size;
  console.log(`[ViewAll] ${sketchCount}/${sketches.length} sketches, ${totalNodes} total nodes, bbox: (${minX.toFixed(0)},${minY.toFixed(0)})→(${maxX.toFixed(0)},${maxY.toFixed(0)})`);

  if (totalNodes === 0) return { sketchCount, totalNodes: 0 };

  const canvas = document.getElementById('graphCanvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const stretchX = window.__getStretch?.()?.x || 0.6;
  const stretchY = window.__getStretch?.()?.y || 1;

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Single-node or very tight cluster: use a moderate zoom
  if (totalNodes === 1 || (maxX - minX < 1 && maxY - minY < 1)) {
    const targetScale = 2;
    const tx = rect.width / 2 - targetScale * stretchX * midX;
    const ty = rect.height / 2 - targetScale * stretchY * midY;
    window.__setViewState?.(targetScale, tx, ty);
    window.__scheduleDraw?.();
    return { sketchCount, totalNodes };
  }

  // Fit bounding box with generous padding
  const dx = (maxX - minX) * stretchX;
  const dy = (maxY - minY) * stretchY;
  const padding = 0.7;
  const scaleX = dx > 0 ? (rect.width * padding) / dx : 10;
  const scaleY = dy > 0 ? (rect.height * padding) / dy : 10;
  const MIN_SCALE = 0.005;
  const targetScale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY));

  console.log(`[ViewAll] targetScale=${targetScale.toFixed(4)}, dx=${dx.toFixed(0)}, dy=${dy.toFixed(0)}, canvas=${rect.width}x${rect.height}`);

  const tx = rect.width / 2 - targetScale * stretchX * midX;
  const ty = rect.height / 2 - targetScale * stretchY * midY;
  window.__setViewState?.(targetScale, tx, ty);
  window.__scheduleDraw?.();
  return { sketchCount, totalNodes };
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
