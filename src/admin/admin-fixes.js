/**
 * Admin Issues & Fixes Tab
 *
 * Aggregates issues from all sketches accessible to the admin,
 * and surfaces actionable fix suggestions for review.
 *
 * Issue types: missing_coords, missing_pipe_data, long_edge,
 *              not_last_manhole, merge_candidate, negative_gradient
 */

import { computeSketchIssues } from '../project/sketch-issues.js';
import { getFixSuggestions } from '../project/fix-suggestions.js';

function escapeHtml(str) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Severity order for sorting (lower = more severe)
const SEVERITY = {
  missing_coords: 0,
  missing_pipe_data: 1,
  long_edge: 2,
  not_last_manhole: 3,
  merge_candidate: 4,
  negative_gradient: 5,
};

const ISSUE_ICONS = {
  missing_coords: 'location_off',
  missing_pipe_data: 'straighten',
  long_edge: 'straighten',
  not_last_manhole: 'warning',
  merge_candidate: 'call_merge',
  negative_gradient: 'trending_down',
};

export class AdminFixes {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.t
   * @param {Function} options.showToast
   */
  constructor({ container, t, showToast }) {
    this.container = container;
    this.t = t;
    this.showToast = showToast;
    this._sketchIssues = []; // [{ sketch, issues, nodes, edges }]
    this._filterType = 'all';
    this._sortBy = 'severity';
    this._loading = false;
  }

  async render() {
    this.container.innerHTML = `
      <div class="ap-section">
        <div class="ap-toolbar ap-toolbar--wrap">
          <button class="btn btn-primary" id="apFixesRefreshBtn" type="button">
            <span class="material-icons">refresh</span>
            ${escapeHtml(this.t('adminPanel.fixes.refresh'))}
          </button>
          <div class="ap-filter-group">
            <label class="ap-field-label">${escapeHtml(this.t('adminPanel.fixes.filterLabel'))}</label>
            <select class="ap-select" id="apFixesFilter">
              <option value="all">${escapeHtml(this.t('adminPanel.fixes.filterAll'))}</option>
              <option value="missing_coords">${escapeHtml(this.t('adminPanel.fixes.types.missing_coords'))}</option>
              <option value="missing_pipe_data">${escapeHtml(this.t('adminPanel.fixes.types.missing_pipe_data'))}</option>
              <option value="long_edge">${escapeHtml(this.t('adminPanel.fixes.types.long_edge'))}</option>
              <option value="not_last_manhole">${escapeHtml(this.t('adminPanel.fixes.types.not_last_manhole'))}</option>
              <option value="merge_candidate">${escapeHtml(this.t('adminPanel.fixes.types.merge_candidate'))}</option>
              <option value="negative_gradient">${escapeHtml(this.t('adminPanel.fixes.types.negative_gradient'))}</option>
            </select>
          </div>
          <div class="ap-filter-group">
            <label class="ap-field-label">${escapeHtml(this.t('adminPanel.fixes.sortLabel'))}</label>
            <select class="ap-select" id="apFixesSort">
              <option value="severity">${escapeHtml(this.t('adminPanel.fixes.sortSeverity'))}</option>
              <option value="sketch">${escapeHtml(this.t('adminPanel.fixes.sortSketch'))}</option>
              <option value="count">${escapeHtml(this.t('adminPanel.fixes.sortCount'))}</option>
            </select>
          </div>
        </div>
        <div id="apFixesSummary" class="ap-fixes-summary" style="display:none;"></div>
        <div id="apFixesList" class="ap-fixes-list" aria-live="polite">
          <p class="ap-empty">${escapeHtml(this.t('adminPanel.fixes.pressRefresh'))}</p>
        </div>
      </div>
    `;

    this.container.querySelector('#apFixesRefreshBtn').addEventListener('click', () => this._loadIssues());

    this.container.querySelector('#apFixesFilter').addEventListener('change', (e) => {
      this._filterType = e.target.value;
      this._renderList();
    });

    this.container.querySelector('#apFixesSort').addEventListener('change', (e) => {
      this._sortBy = e.target.value;
      this._renderList();
    });
  }

  async _loadIssues() {
    if (this._loading) return;
    this._loading = true;

    const listEl = this.container.querySelector('#apFixesList');
    const summaryEl = this.container.querySelector('#apFixesSummary');
    if (listEl) listEl.innerHTML = `<div class="ap-spinner"><span class="material-icons ap-spin">sync</span></div>`;
    if (summaryEl) summaryEl.style.display = 'none';

    try {
      // Fetch all sketches with full data
      const res = await fetch('/api/sketches?limit=200', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const sketches = Array.isArray(json) ? json : (json.sketches || []);

      this._sketchIssues = [];

      for (const sketch of sketches) {
        // Fetch full sketch data if not included
        let nodes = sketch.nodes || [];
        let edges = sketch.edges || [];

        if (nodes.length === 0 && sketch.id) {
          try {
            const sRes = await fetch(`/api/sketches/${encodeURIComponent(sketch.id)}`, { credentials: 'include' });
            if (sRes.ok) {
              const sJson = await sRes.json();
              nodes = sJson.nodes || [];
              edges = sJson.edges || [];
            }
          } catch (e) { console.warn('[AdminFixes] Failed to fetch sketch data:', e); }
        }

        const { issues } = computeSketchIssues(nodes, edges);

        if (issues.length > 0) {
          this._sketchIssues.push({ sketch, issues, nodes, edges });
        }
      }
    } catch (err) {
      console.error('[AdminFixes] load error', err);
      if (listEl) {
        listEl.innerHTML = `<p class="ap-empty ap-empty--error">${escapeHtml(this.t('adminPanel.fixes.loadError'))}</p>`;
      }
      this._loading = false;
      return;
    }

    this._loading = false;
    this._renderSummary();
    this._renderList();
  }

  _renderSummary() {
    const summaryEl = this.container.querySelector('#apFixesSummary');
    if (!summaryEl) return;

    const totalSketches = this._sketchIssues.length;
    const totalIssues = this._sketchIssues.reduce((acc, s) => acc + s.issues.length, 0);
    const byType = {};
    for (const { issues } of this._sketchIssues) {
      for (const iss of issues) {
        byType[iss.type] = (byType[iss.type] || 0) + 1;
      }
    }

    const typeChips = Object.entries(byType)
      .sort(([a], [b]) => (SEVERITY[a] ?? 99) - (SEVERITY[b] ?? 99))
      .map(([type, count]) => `
        <span class="ap-chip ap-chip--issue ap-chip--${type.replace(/_/g, '-')}">
          <span class="material-icons">${ISSUE_ICONS[type] || 'warning'}</span>
          ${escapeHtml(this.t(`adminPanel.fixes.types.${type}`))} (${count})
        </span>
      `).join('');

    summaryEl.innerHTML = `
      <div class="ap-fixes-summary__stats">
        <span class="ap-stat">
          <strong>${totalSketches}</strong>
          ${escapeHtml(this.t('adminPanel.fixes.sketchesWithIssues'))}
        </span>
        <span class="ap-stat">
          <strong>${totalIssues}</strong>
          ${escapeHtml(this.t('adminPanel.fixes.totalIssues'))}
        </span>
      </div>
      <div class="ap-fixes-summary__types">${typeChips}</div>
    `;
    summaryEl.style.display = '';
  }

  _renderList() {
    const listEl = this.container.querySelector('#apFixesList');
    if (!listEl) return;

    let sketchData = this._sketchIssues.map(s => ({
      ...s,
      issues: this._filterType === 'all' ? s.issues : s.issues.filter(i => i.type === this._filterType),
    })).filter(s => s.issues.length > 0);

    if (this._sortBy === 'sketch') {
      sketchData.sort((a, b) => (a.sketch.name || '').localeCompare(b.sketch.name || ''));
    } else if (this._sortBy === 'count') {
      sketchData.sort((a, b) => b.issues.length - a.issues.length);
    } else {
      // severity: sort by minimum severity issue type in the sketch
      sketchData.sort((a, b) => {
        const minA = Math.min(...a.issues.map(i => SEVERITY[i.type] ?? 99));
        const minB = Math.min(...b.issues.map(i => SEVERITY[i.type] ?? 99));
        return minA - minB;
      });
    }

    if (sketchData.length === 0) {
      listEl.innerHTML = `<p class="ap-empty">${escapeHtml(this.t('adminPanel.fixes.noIssues'))}</p>`;
      return;
    }

    listEl.innerHTML = sketchData.map(s => this._renderSketchGroup(s)).join('');

    // Wire up fix buttons
    listEl.querySelectorAll('[data-fix-apply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { sketchId, issueIdx, fixIdx } = btn.dataset;
        await this._applyFix(sketchId, parseInt(issueIdx, 10), parseInt(fixIdx, 10), btn);
      });
    });
  }

  _renderSketchGroup({ sketch, issues, nodes, edges }) {
    const sortedIssues = [...issues].sort((a, b) => (SEVERITY[a.type] ?? 99) - (SEVERITY[b.type] ?? 99));

    const issueRows = sortedIssues.map((issue, issueIdx) => {
      const suggestions = getFixSuggestions(issue, nodes, edges);
      const icon = ISSUE_ICONS[issue.type] || 'warning';
      const typeLabel = this.t(`adminPanel.fixes.types.${issue.type}`);

      let detail = '';
      if (issue.lengthM != null) detail = `${issue.lengthM}m`;
      if (issue.distanceM != null) detail = `${issue.distanceM}m`;
      if (issue.gradient != null) detail = `Δ${issue.gradient.toFixed(2)}m`;

      const fixBtns = suggestions.map((fix, fixIdx) => `
        <button
          type="button"
          class="btn btn-ghost ap-fix-btn"
          data-fix-apply="1"
          data-sketch-id="${escapeHtml(String(sketch.id))}"
          data-issue-idx="${issueIdx}"
          data-fix-idx="${fixIdx}"
          title="${escapeHtml(this.t(fix.labelKey))}"
          ${fix.navigateTo ? 'data-navigate="1"' : ''}
        >
          <span class="material-icons">${escapeHtml(fix.icon)}</span>
          <span>${escapeHtml(this.t(fix.labelKey))}</span>
        </button>
      `).join('');

      return `
        <div class="ap-issue-row ap-issue-row--${escapeHtml(issue.type.replace(/_/g, '-'))}">
          <span class="material-icons ap-issue-row__icon">${icon}</span>
          <div class="ap-issue-row__body">
            <div class="ap-issue-row__type">${escapeHtml(typeLabel)}${detail ? ` <span class="ap-badge ap-badge--muted">${escapeHtml(detail)}</span>` : ''}</div>
            ${issue.nodeId != null ? `<div class="ap-issue-row__meta">${escapeHtml(this.t('adminPanel.fixes.nodeId'))}: ${escapeHtml(String(issue.nodeId))}</div>` : ''}
            ${issue.edgeId != null ? `<div class="ap-issue-row__meta">${escapeHtml(this.t('adminPanel.fixes.edgeId'))}: ${escapeHtml(String(issue.edgeId))}</div>` : ''}
          </div>
          ${fixBtns ? `<div class="ap-issue-row__fixes">${fixBtns}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <details class="ap-sketch-group" open>
        <summary class="ap-sketch-group__header">
          <span class="material-icons">folder_open</span>
          <span class="ap-sketch-group__name">${escapeHtml(sketch.name || sketch.id)}</span>
          <span class="ap-badge ap-badge--warning">${issues.length} ${escapeHtml(this.t('adminPanel.fixes.issues'))}</span>
        </summary>
        <div class="ap-sketch-group__body">
          ${issueRows}
        </div>
      </details>
    `;
  }

  async _applyFix(sketchId, issueIdx, fixIdx, btn) {
    const sketchData = this._sketchIssues.find(s => String(s.sketch.id) === String(sketchId));
    if (!sketchData) return;

    const sortedIssues = [...sketchData.issues].sort((a, b) => (SEVERITY[a.type] ?? 99) - (SEVERITY[b.type] ?? 99));
    const issue = sortedIssues[issueIdx];
    if (!issue) return;

    const suggestions = getFixSuggestions(issue, sketchData.nodes, sketchData.edges);
    const fix = suggestions[fixIdx];
    if (!fix) return;

    // Navigation-only fixes (open canvas) are not applicable from admin panel
    if (fix.navigateTo) {
      this.showToast(this.t('adminPanel.fixes.navigateHint'));
      return;
    }

    const result = fix.apply?.();
    if (result === false) return; // User cancelled (e.g., merge confirm)

    btn.disabled = true;

    // Persist the updated sketch
    try {
      const res = await fetch(`/api/sketches/${encodeURIComponent(sketchId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: sketchData.nodes,
          edges: sketchData.edges,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.showToast(this.t('adminPanel.fixes.fixApplied'));
    } catch (err) {
      console.error('[AdminFixes] apply fix error', err);
      btn.disabled = false;
      this.showToast(this.t('adminPanel.fixes.fixError'));
      return;
    }

    // Re-compute issues for this sketch after the fix
    const { issues: newIssues } = computeSketchIssues(sketchData.nodes, sketchData.edges);
    sketchData.issues = newIssues;

    // If no more issues, remove from list
    if (newIssues.length === 0) {
      this._sketchIssues = this._sketchIssues.filter(s => String(s.sketch.id) !== String(sketchId));
    }

    this._renderSummary();
    this._renderList();
  }
}
