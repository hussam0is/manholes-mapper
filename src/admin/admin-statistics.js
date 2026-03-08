/**
 * Admin Statistics Tab
 *
 * Workload statistics dashboard showing:
 * - Summary cards (sketches, nodes, edges, km, completion)
 * - Per-user workload table
 * - Daily activity chart (CSS bar chart, last 30 days)
 * - Per-project breakdown
 */

function escapeHtml(str) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class AdminStatistics {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.t
   * @param {Function} options.showToast
   * @param {object} options.currentUser - { role, organizationId }
   */
  constructor({ container, t, showToast, currentUser }) {
    this.container = container;
    this.t = t;
    this.showToast = showToast;
    this.currentUser = currentUser;
    this._data = null;
    this._projectId = '';
    this._projects = [];
  }

  async render() {
    this.container.innerHTML = `
      <div class="ap-section admin-stats">
        <div class="admin-stats__toolbar">
          <select id="statsProjectFilter" class="admin-stats__filter" aria-label="${escapeHtml(this.t('statistics.filterByProject'))}">
            <option value="">${escapeHtml(this.t('statistics.allProjects'))}</option>
          </select>
          <button type="button" class="btn btn-ghost admin-stats__refresh" id="statsRefreshBtn" aria-label="${escapeHtml(this.t('statistics.refresh'))}">
            <span class="material-icons">refresh</span>
          </button>
        </div>
        <div id="statsContent" class="admin-stats__content">
          <div class="ap-spinner"><span class="material-icons ap-spin">sync</span></div>
        </div>
      </div>
    `;

    this.container.querySelector('#statsRefreshBtn').addEventListener('click', () => {
      this._loadData();
    });

    this.container.querySelector('#statsProjectFilter').addEventListener('change', (e) => {
      this._projectId = e.target.value;
      this._loadData();
    });

    await this._loadProjects();
    await this._loadData();
  }

  async _loadProjects() {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        this._projects = data.projects || data || [];
        const select = this.container.querySelector('#statsProjectFilter');
        if (select) {
          for (const p of this._projects) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name || p.id;
            select.appendChild(opt);
          }
        }
      }
    } catch (_) { /* ignore */ }
  }

  async _loadData() {
    const content = this.container.querySelector('#statsContent');
    if (!content) return;
    content.innerHTML = `<div class="ap-spinner"><span class="material-icons ap-spin">sync</span></div>`;

    try {
      const params = this._projectId ? `?projectId=${encodeURIComponent(this._projectId)}` : '';
      const res = await fetch(`/api/stats/workload${params}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      this._data = await res.json();
      this._renderStats(content);
    } catch (err) {
      console.error('[AdminStatistics] load error', err);
      content.innerHTML = `<p class="ap-empty ap-empty--error">${escapeHtml(err.message)}</p>`;
    }
  }

  _renderStats(content) {
    const { summary, perUser, daily, perProject } = this._data;
    const t = this.t;

    content.innerHTML = '';

    // Summary cards
    const summaryHtml = `
      <div class="admin-stats__cards">
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">description</span>
          <div class="admin-stats__card-value">${summary.totalSketches}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.totalSketches'))}</div>
        </div>
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">radio_button_checked</span>
          <div class="admin-stats__card-value">${summary.totalNodes}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.totalNodes'))}</div>
        </div>
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">timeline</span>
          <div class="admin-stats__card-value">${summary.totalEdges}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.totalEdges'))}</div>
        </div>
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">straighten</span>
          <div class="admin-stats__card-value">${summary.totalKm}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.totalKm'))}</div>
        </div>
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">gps_fixed</span>
          <div class="admin-stats__card-value">${summary.nodesWithCoords}/${summary.totalNodes}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.measured'))}</div>
          <div class="admin-stats__card-bar">
            <div class="admin-stats__card-bar-fill" style="width:${summary.completionPct}%"></div>
          </div>
          <div class="admin-stats__card-pct">${summary.completionPct}%</div>
        </div>
      </div>
    `;
    content.insertAdjacentHTML('beforeend', summaryHtml);

    // Daily activity chart
    if (daily.length > 0) {
      const maxCount = Math.max(...daily.map(d => d.count), 1);
      const barsHtml = daily.map(d => {
        const pct = Math.round((d.count / maxCount) * 100);
        const label = d.date.slice(5); // MM-DD
        return `
          <div class="admin-stats__bar-col" title="${escapeHtml(d.date)}: ${d.count}">
            <div class="admin-stats__bar" style="height:${pct}%"></div>
            <div class="admin-stats__bar-label">${escapeHtml(label)}</div>
          </div>
        `;
      }).join('');

      content.insertAdjacentHTML('beforeend', `
        <div class="admin-stats__section">
          <h3 class="admin-stats__section-title">
            <span class="material-icons">show_chart</span>
            ${escapeHtml(t('statistics.dailyActivity'))}
          </h3>
          <div class="admin-stats__chart">${barsHtml}</div>
        </div>
      `);
    }

    // Per-user workload table
    if (perUser.length > 0) {
      const userRows = perUser.map(u => {
        const lastActive = u.lastActive
          ? new Date(u.lastActive).toLocaleDateString()
          : '--';
        return `
          <tr>
            <td>${escapeHtml(u.user)}</td>
            <td>${u.sketchesCreated}</td>
            <td>${u.nodesCreated}</td>
            <td>${u.nodesMeasured}</td>
            <td>${lastActive}</td>
          </tr>
        `;
      }).join('');

      content.insertAdjacentHTML('beforeend', `
        <div class="admin-stats__section">
          <h3 class="admin-stats__section-title">
            <span class="material-icons">people</span>
            ${escapeHtml(t('statistics.perUser'))}
          </h3>
          <div class="admin-stats__table-wrap">
            <table class="stats-table">
              <thead>
                <tr>
                  <th>${escapeHtml(t('statistics.user'))}</th>
                  <th>${escapeHtml(t('statistics.sketches'))}</th>
                  <th>${escapeHtml(t('statistics.nodesCreated'))}</th>
                  <th>${escapeHtml(t('statistics.nodesMeasured'))}</th>
                  <th>${escapeHtml(t('statistics.lastActive'))}</th>
                </tr>
              </thead>
              <tbody>${userRows}</tbody>
            </table>
          </div>
        </div>
      `);
    }

    // Per-project breakdown
    if (perProject.length > 0) {
      const projRows = perProject.map(p => {
        const completion = p.nodes > 0 ? Math.round((p.nodesWithCoords / p.nodes) * 100) : 0;
        return `
          <tr>
            <td>${escapeHtml(p.name || '--')}</td>
            <td>${p.sketches}</td>
            <td>${p.nodes}</td>
            <td>${p.edges}</td>
            <td>${(p.km).toFixed(2)}</td>
            <td>
              <div class="stats-completion-bar">
                <div class="stats-completion-bar__fill" style="width:${completion}%"></div>
                <span>${completion}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      content.insertAdjacentHTML('beforeend', `
        <div class="admin-stats__section">
          <h3 class="admin-stats__section-title">
            <span class="material-icons">folder_open</span>
            ${escapeHtml(t('statistics.perProject'))}
          </h3>
          <div class="admin-stats__table-wrap">
            <table class="stats-table">
              <thead>
                <tr>
                  <th>${escapeHtml(t('statistics.project'))}</th>
                  <th>${escapeHtml(t('statistics.sketches'))}</th>
                  <th>${escapeHtml(t('statistics.totalNodes'))}</th>
                  <th>${escapeHtml(t('statistics.totalEdges'))}</th>
                  <th>km</th>
                  <th>${escapeHtml(t('statistics.completion'))}</th>
                </tr>
              </thead>
              <tbody>${projRows}</tbody>
            </table>
          </div>
        </div>
      `);
    }

    // Empty state
    if (!perUser.length && !perProject.length && !daily.length && summary.totalSketches === 0) {
      content.insertAdjacentHTML('beforeend', `
        <p class="ap-empty">${escapeHtml(t('statistics.noData'))}</p>
      `);
    }
  }
}
