/**
 * Node Issue List Panel
 *
 * A side panel showing all nodes with admin-created issues in the current sketch.
 * Supports two sorting modes:
 * - By node proximity: nearest-neighbor chain starting from min-ID node
 * - By user location: distance from user's current GPS position
 */

import {
  getNodesWithIssues,
  getNodesPendingReview,
  sortByNodeProximity,
  sortByUserLocation,
  hasActiveIssue,
} from './node-issue-tracker.js';

/** @type {(key: string, ...args: any[]) => string} */
const t = (key, ...args) => (typeof window.t === 'function' ? window.t(key, ...args) : key);
const esc = (str) => (typeof window.escapeHtml === 'function' ? window.escapeHtml(str) : String(str || ''));

let panelEl = null;
let listEl = null;
let countEl = null;
let toggleBtn = null;
let badgeEl = null;
let _currentSort = 'node'; // 'node' | 'location'

/**
 * Initialize the node issue panel. Call once after DOM is ready.
 */
export function initNodeIssuePanel() {
  panelEl = document.getElementById('nodeIssuePanel');
  toggleBtn = document.getElementById('nodeIssuePanelToggle');
  if (!panelEl || !toggleBtn) return;

  listEl = panelEl.querySelector('.node-issue-panel__list');
  countEl = panelEl.querySelector('.node-issue-panel__count');
  badgeEl = toggleBtn.querySelector('.node-issue-panel-toggle__badge');

  // Toggle button
  toggleBtn.addEventListener('click', () => {
    if (panelEl.style.display === 'none') {
      openPanel();
    } else {
      closePanel();
    }
  });

  // Close button
  const closeBtn = panelEl.querySelector('.node-issue-panel__close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }

  // Sort buttons
  const sortBtns = panelEl.querySelectorAll('.node-issue-panel__sort-btn');
  sortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sort = btn.dataset.sort;
      if (sort === _currentSort) return;
      _currentSort = sort;
      // Update active class
      sortBtns.forEach(b => b.classList.remove('node-issue-panel__sort-btn--active'));
      btn.classList.add('node-issue-panel__sort-btn--active');
      renderIssueList();
    });
  });
}

function openPanel() {
  if (!panelEl) return;
  panelEl.style.display = '';
  renderIssueList();
}

function closePanel() {
  if (!panelEl) return;
  panelEl.style.display = 'none';
}

/**
 * Get the user's current position in canvas world coordinates.
 * Uses the GNSS state if available.
 * @returns {{ x: number, y: number } | null}
 */
function getUserWorldPosition() {
  // Try to get user position from gnssState
  if (window.__gnssState) {
    const state = window.__gnssState;
    if (state.position && state.position.lat != null && state.position.lon != null) {
      // Convert GPS to canvas coords — we need the projection functions
      // This requires ITM conversion which happens in the map module
      // For simplicity, use the raw lat/lon and compare with node survey coords
      // Actually, nodes have canvas x/y coords. If there's a user location marker,
      // we can get its canvas position.
    }
  }

  // Fallback: use the last known GPS marker position if available
  // The gnss-marker.js renders at a position that's stored in gnssState
  // We can access it through window globals
  if (typeof window.__getUserCanvasPosition === 'function') {
    return window.__getUserCanvasPosition();
  }

  return null;
}

/**
 * Render the issue list based on current nodes and sort mode.
 */
function renderIssueList() {
  if (!listEl) return;

  // Access nodes from the global sketch state
  const nodes = window.__getSketchNodes ? window.__getSketchNodes() : [];
  const nodesWithIssues = getNodesWithIssues(nodes);

  // Update count
  if (countEl) {
    countEl.textContent = nodesWithIssues.length > 0 ? `(${nodesWithIssues.length})` : '';
  }

  if (nodesWithIssues.length === 0) {
    listEl.innerHTML = `<div class="node-issue-panel__empty">
      <span class="material-icons" style="font-size:32px;opacity:0.3">check_circle</span>
      <div>${esc(t('nodeIssues.noIssues'))}</div>
    </div>`;
    return;
  }

  // Sort nodes
  let sorted;
  if (_currentSort === 'location') {
    const userPos = getUserWorldPosition();
    if (userPos) {
      sorted = sortByUserLocation(nodesWithIssues, userPos.x, userPos.y);
    } else {
      // Fallback to node proximity if no user location
      sorted = sortByNodeProximity(nodesWithIssues);
    }
  } else {
    sorted = sortByNodeProximity(nodesWithIssues);
  }

  const userRole = window.permissionsService?.getUserRole?.();
  const isAdminUser = userRole?.isAdmin === true;

  let html = '';
  sorted.forEach((node, idx) => {
    const issue = node.issue;
    const statusClass = issue.status === 'open' ? 'issue-status--open'
      : issue.status === 'fix_submitted' ? 'issue-status--pending' : 'issue-status--resolved';
    const statusIcon = issue.status === 'open' ? 'error_outline'
      : issue.status === 'fix_submitted' ? 'hourglass_top' : 'check_circle';
    const statusLabel = issue.status === 'open' ? t('nodeIssues.statusOpen')
      : issue.status === 'fix_submitted' ? t('nodeIssues.statusFixSubmitted') : t('nodeIssues.statusResolved');

    html += `
      <div class="node-issue-panel__item" data-node-id="${esc(String(node.id))}" data-index="${idx}">
        <div class="node-issue-panel__item-header">
          <span class="node-issue-panel__item-id">#${esc(String(node.id))}</span>
          <span class="node-issue-panel__item-status ${statusClass}">
            <span class="material-icons" style="font-size:14px">${statusIcon}</span>
            ${esc(statusLabel)}
          </span>
        </div>
        <div class="node-issue-panel__item-desc">${esc(issue.description)}</div>
        ${issue.status === 'fix_submitted' && issue.fix ? `
          <div class="node-issue-panel__item-fix">
            <span class="material-icons" style="font-size:13px;color:var(--color-success,#22c55e)">build</span>
            ${esc(issue.fix.description)}
            <span class="node-issue-panel__item-fix-by">&mdash; ${esc(issue.fix.submittedBy)}</span>
          </div>` : ''}
        <div class="node-issue-panel__item-actions">
          <button class="node-issue-panel__goto-btn" title="Go to node">
            <span class="material-icons" style="font-size:18px">my_location</span>
          </button>
        </div>
      </div>`;
  });

  listEl.innerHTML = html;

  // Attach event listeners
  listEl.querySelectorAll('.node-issue-panel__item').forEach(item => {
    const nodeId = item.dataset.nodeId;

    // Click on item: select node
    item.addEventListener('click', (e) => {
      if (e.target.closest('.node-issue-panel__goto-btn')) return;
      window.__selectNodeById?.(nodeId);
    });

    // Go to button: navigate to node and highlight
    const gotoBtn = item.querySelector('.node-issue-panel__goto-btn');
    if (gotoBtn) {
      gotoBtn.addEventListener('click', () => {
        const node = nodes.find(n => String(n.id) === nodeId);
        if (!node) return;
        // Navigate to the node
        window.__selectNodeById?.(nodeId);
        // Center view on the node
        if (window.__setViewState && window.__getStretch) {
          const stretch = window.__getStretch();
          const canvas = document.getElementById('graphCanvas');
          if (canvas) {
            const scale = 0.5; // moderate zoom
            const tx = (canvas.offsetWidth / 2) - (node.x * stretch.x * scale);
            const ty = (canvas.offsetHeight / 2) - (node.y * stretch.y * scale);
            window.__setViewState(scale, tx, ty);
          }
        }
        // Highlight
        if (window.__issueHighlight) {
          window.__issueHighlight.start(node.x, node.y, 2000);
        }
        window.__scheduleDraw?.();
      });
    }
  });
}

/**
 * Update the toggle button visibility and badge count.
 * Call this whenever nodes change.
 * @param {Array} nodes - Current nodes array
 */
export function updateIssuePanelBadge(nodes) {
  if (!toggleBtn || !badgeEl) return;

  const nodesWithIssues = getNodesWithIssues(nodes);
  const count = nodesWithIssues.length;

  if (count > 0) {
    toggleBtn.style.display = '';
    badgeEl.textContent = String(count);
    badgeEl.style.display = '';
  } else {
    toggleBtn.style.display = 'none';
    badgeEl.style.display = 'none';
    // Close panel if open
    if (panelEl && panelEl.style.display !== 'none') {
      closePanel();
    }
  }

  // If panel is open, refresh the list
  if (panelEl && panelEl.style.display !== 'none') {
    renderIssueList();
  }
}

// Expose on window for legacy code
if (typeof window !== 'undefined') {
  window.__nodeIssuePanel = {
    initNodeIssuePanel,
    updateIssuePanelBadge,
  };

  // Expose a function to get sketch nodes for the panel
  // This will be overridden by main.js which has access to the nodes array
  if (!window.__getSketchNodes) {
    window.__getSketchNodes = () => [];
  }
}
