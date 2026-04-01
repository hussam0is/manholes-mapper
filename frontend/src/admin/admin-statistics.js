/**
 * Admin Statistics Tab — Enhanced KPI Dashboard
 *
 * Unified analytics window with filters:
 * - Project, User, Time Period (day/week/month), Date Range
 * - Records: peak day/week, this month vs last month
 * - Summary cards, velocity, forecast, health
 * - Activity chart (adapts to period), heatmap, accuracy, issues
 * - Per-user table, per-project table
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

function fmtNum(n) {
  return typeof n === 'number' ? n.toLocaleString() : '--';
}

function donutArc(cx, cy, r, startAngle, endAngle) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

/** Get Monday of the ISO week for a date string */
function getWeekMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Get month key YYYY-MM from date string */
function getMonth(dateStr) {
  return dateStr?.slice(0, 7) || null;
}

export class AdminStatistics {
  constructor({ container, t, showToast, currentUser }) {
    this.container = container;
    this.t = t;
    this.showToast = showToast;
    this.currentUser = currentUser;
    this._data = null;
    this._projectId = '';
    this._projects = [];
    // Filter state
    this._filterUser = '';      // '' = all users
    this._filterRange = '90';   // '7','30','90','365','thisMonth','lastMonth'
    this._filterPeriod = 'day'; // 'day','week','month'
  }

  async render() {
    this.container.innerHTML = `
      <div class="ap-section admin-stats">
        <div class="admin-stats__toolbar" id="statsToolbar"></div>
        <div id="statsContent" class="admin-stats__content">
          <div class="ap-spinner"><span class="material-icons ap-spin">sync</span></div>
        </div>
      </div>
    `;
    await this._loadProjects();
    this._renderToolbar();
    await this._loadData();
  }

  _renderToolbar() {
    const t = this.t;
    const toolbar = this.container.querySelector('#statsToolbar');
    if (!toolbar) return;

    toolbar.innerHTML = `
      <div class="admin-stats__filters-row">
        <select id="statsProjectFilter" class="admin-stats__filter" aria-label="${escapeHtml(t('statistics.filterByProject'))}">
          <option value="">${escapeHtml(t('statistics.allProjects'))}</option>
        </select>
        <select id="statsUserFilter" class="admin-stats__filter" aria-label="${escapeHtml(t('statistics.filterByUser'))}">
          <option value="">${escapeHtml(t('statistics.allUsers'))}</option>
        </select>
        <select id="statsRangeFilter" class="admin-stats__filter" aria-label="${escapeHtml(t('statistics.dateRange'))}">
          <option value="7">${escapeHtml(t('statistics.last7days'))}</option>
          <option value="30">${escapeHtml(t('statistics.last30days'))}</option>
          <option value="90" selected>${escapeHtml(t('statistics.last90days'))}</option>
          <option value="365">${escapeHtml(t('statistics.last365days'))}</option>
          <option value="thisMonth">${escapeHtml(t('statistics.thisMonth'))}</option>
          <option value="lastMonth">${escapeHtml(t('statistics.lastMonth'))}</option>
        </select>
        <div class="admin-stats__period-toggle" id="statsPeriodToggle">
          <button class="admin-stats__period-btn active" data-period="day">${escapeHtml(t('statistics.day'))}</button>
          <button class="admin-stats__period-btn" data-period="week">${escapeHtml(t('statistics.week'))}</button>
          <button class="admin-stats__period-btn" data-period="month">${escapeHtml(t('statistics.month'))}</button>
        </div>
        <button type="button" class="btn btn-ghost admin-stats__refresh" id="statsRefreshBtn" aria-label="${escapeHtml(t('statistics.refresh'))}">
          <span class="material-icons">refresh</span>
        </button>
      </div>
    `;

    // Populate project options
    const projSelect = toolbar.querySelector('#statsProjectFilter');
    for (const p of this._projects) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || p.id;
      if (p.id === this._projectId) opt.selected = true;
      projSelect.appendChild(opt);
    }

    // Event listeners
    projSelect.addEventListener('change', (e) => {
      this._projectId = e.target.value;
      this._loadData();
    });

    toolbar.querySelector('#statsUserFilter').addEventListener('change', (e) => {
      this._filterUser = e.target.value;
      this._rerender();
    });

    toolbar.querySelector('#statsRangeFilter').addEventListener('change', (e) => {
      this._filterRange = e.target.value;
      this._rerender();
    });

    toolbar.querySelector('#statsPeriodToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-period]');
      if (!btn) return;
      this._filterPeriod = btn.dataset.period;
      toolbar.querySelectorAll('.admin-stats__period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._rerender();
    });

    toolbar.querySelector('#statsRefreshBtn').addEventListener('click', () => {
      this._loadData();
    });
  }

  async _loadProjects() {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        this._projects = data.projects || data || [];
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
      this._populateUserFilter();
      this._renderStats(content);
    } catch (err) {
      console.error('[AdminStatistics] load error', err);
      content.innerHTML = `<p class="ap-empty ap-empty--error">${escapeHtml(err.message)}</p>`;
    }
  }

  _populateUserFilter() {
    const select = this.container.querySelector('#statsUserFilter');
    if (!select || !this._data?.perUser) return;
    const current = this._filterUser;
    // Keep first option, remove rest
    while (select.options.length > 1) select.remove(1);
    for (const u of this._data.perUser) {
      const opt = document.createElement('option');
      opt.value = u.user;
      opt.textContent = u.user;
      if (u.user === current) opt.selected = true;
      select.appendChild(opt);
    }
  }

  /** Re-render with current filters (no API call) */
  _rerender() {
    const content = this.container.querySelector('#statsContent');
    if (!content || !this._data) return;
    this._renderStats(content);
  }

  // ─── Filter logic ───

  /** Get date range bounds based on filter */
  _getDateBounds() {
    const now = new Date();
    // Use UTC date parts consistently to avoid timezone-vs-ISO mismatch
    const todayStr = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
    ].join('-');
    let startDate, endDate = todayStr;

    switch (this._filterRange) {
      case '7': {
        const d = new Date(now); d.setUTCDate(d.getUTCDate() - 6);
        startDate = d.toISOString().slice(0, 10);
        break;
      }
      case '30': {
        const d = new Date(now); d.setUTCDate(d.getUTCDate() - 29);
        startDate = d.toISOString().slice(0, 10);
        break;
      }
      case '90': {
        const d = new Date(now); d.setUTCDate(d.getUTCDate() - 89);
        startDate = d.toISOString().slice(0, 10);
        break;
      }
      case '365': {
        const d = new Date(now); d.setUTCDate(d.getUTCDate() - 364);
        startDate = d.toISOString().slice(0, 10);
        break;
      }
      case 'thisMonth': {
        startDate = todayStr.slice(0, 7) + '-01';
        break;
      }
      case 'lastMonth': {
        const d = new Date(now);
        d.setUTCMonth(d.getUTCMonth() - 1);
        startDate = d.toISOString().slice(0, 7) + '-01';
        const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
        endDate = lastDay.toISOString().slice(0, 10);
        break;
      }
      default:
        startDate = '2020-01-01';
    }
    return { startDate, endDate };
  }

  /** Filter activityHeatmap data by user and date range */
  _filterHeatmapData() {
    const heatmap = this._data?.activityHeatmap || [];
    const { startDate, endDate } = this._getDateBounds();
    const user = this._filterUser;

    return heatmap.filter(entry => {
      if (entry.date < startDate || entry.date > endDate) return false;
      if (user && entry.user !== user) return false;
      return true;
    });
  }

  /** Aggregate filtered heatmap data into time buckets based on period */
  _aggregateByPeriod(filteredHeatmap) {
    const period = this._filterPeriod;
    const bucketMap = new Map(); // key -> { key, label, count }

    for (const entry of filteredHeatmap) {
      let bucketKey, label;
      if (period === 'day') {
        bucketKey = entry.date;
        label = entry.date.slice(5); // MM-DD
      } else if (period === 'week') {
        bucketKey = getWeekMonday(entry.date) || entry.date;
        label = bucketKey.slice(5);
      } else {
        bucketKey = getMonth(entry.date) || entry.date;
        label = bucketKey;
      }

      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, { key: bucketKey, label, count: 0 });
      }
      bucketMap.get(bucketKey).count += entry.count;
    }

    return Array.from(bucketMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Compute filtered summary stats from heatmap data */
  _computeFilteredSummary(filteredHeatmap) {
    let totalNodes = 0;
    const days = new Set();
    const users = new Map();

    for (const entry of filteredHeatmap) {
      totalNodes += entry.count;
      days.add(entry.date);
      users.set(entry.user, (users.get(entry.user) || 0) + entry.count);
    }

    return {
      totalNodes,
      activeDays: days.size,
      avgPerDay: days.size > 0 ? Math.round(totalNodes / days.size * 10) / 10 : 0,
      activeUsers: users.size,
      topUser: users.size > 0 ? Array.from(users.entries()).sort((a, b) => b[1] - a[1])[0] : null,
    };
  }

  // ─── Main render ───

  _renderStats(content) {
    const { summary, perUser, perProject, weekly, accuracyDistribution, issueBreakdown, activityHeatmap, records } = this._data;
    const t = this.t;
    const filteredHeatmap = this._filterHeatmapData();
    const aggregated = this._aggregateByPeriod(filteredHeatmap);
    const filteredSummary = this._computeFilteredSummary(filteredHeatmap);

    content.innerHTML = '';

    // ── 1. Summary cards ──
    this._renderSummaryCards(content, summary, t);

    // ── 2. KPI row ──
    this._renderKpiRow(content, summary, t);

    // ── 3. Records row ──
    if (records) {
      this._renderRecords(content, records, t);
    }

    // ── 4. Filtered period summary ──
    this._renderFilteredSummary(content, filteredSummary, t);

    // ── 5. Activity chart (filtered, adapts to period) ──
    if (aggregated.length > 0) {
      this._renderActivityChart(content, aggregated, t);
    }

    // ── 6. Weekly velocity trend ──
    if (weekly && weekly.length > 1) {
      const useKm = summary.targetKm != null && summary.targetKm > 0;
      this._renderVelocityChart(content, weekly, t, useKm);
    }

    // ── 7. Accuracy + Issues ──
    const hasDist = accuracyDistribution && Object.values(accuracyDistribution).some(v => v > 0);
    const hasIssues = issueBreakdown && Object.values(issueBreakdown).some(v => v > 0);
    if (hasDist || hasIssues) {
      this._renderChartsRow(content, accuracyDistribution, issueBreakdown, t);
    }

    // ── 8. Activity heatmap ──
    if (activityHeatmap && activityHeatmap.length > 0) {
      this._renderActivityHeatmap(content, activityHeatmap, t);
    }

    // ── 9. Per-user table ──
    if (perUser && perUser.length > 0) {
      this._renderPerUserTable(content, perUser, t);
    }

    // ── 10. Per-project table ──
    if (perProject && perProject.length > 0) {
      this._renderPerProjectTable(content, perProject, t);
    }

    // Empty state
    if (!perUser?.length && !perProject?.length && summary.totalSketches === 0) {
      content.insertAdjacentHTML('beforeend', `<p class="ap-empty">${escapeHtml(t('statistics.noData'))}</p>`);
    }
  }

  // ─── Summary Cards ───
  _renderSummaryCards(content, summary, t) {
    const velBadge = this._velocityBadge(summary);
    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__cards">
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">description</span>
          <div class="admin-stats__card-value">${fmtNum(summary.totalSketches)}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.totalSketches'))}</div>
        </div>
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">radio_button_checked</span>
          <div class="admin-stats__card-value">${fmtNum(summary.totalNodes)}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.totalNodes'))}</div>
        </div>
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">timeline</span>
          <div class="admin-stats__card-value">${fmtNum(summary.totalEdges)}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.totalEdges'))}</div>
        </div>
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">straighten</span>
          <div class="admin-stats__card-value">${summary.totalKm}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.totalKm'))}</div>
        </div>
        <div class="admin-stats__card">
          <span class="material-icons admin-stats__card-icon">gps_fixed</span>
          <div class="admin-stats__card-value">${fmtNum(summary.nodesWithCoords)}/${fmtNum(summary.totalNodes)}</div>
          <div class="admin-stats__card-label">${escapeHtml(t('statistics.measured'))}</div>
          <div class="admin-stats__card-bar">
            <div class="admin-stats__card-bar-fill" style="width:${summary.completionPct}%"></div>
          </div>
          <div class="admin-stats__card-pct">${summary.completionPct}%</div>
          ${velBadge}
        </div>
      </div>
    `);
  }

  _velocityBadge(summary) {
    const pct = summary.velocityChangePct;
    if (pct == null) return '';
    const t = this.t;
    const isUp = pct > 0, isDown = pct < 0;
    const icon = isUp ? 'trending_up' : isDown ? 'trending_down' : 'trending_flat';
    const cls = isUp ? 'badge--up' : isDown ? 'badge--down' : 'badge--flat';
    const label = isUp
      ? t('statistics.velocityUp').replace('{0}', pct)
      : isDown ? t('statistics.velocityDown').replace('{0}', Math.abs(pct)) : t('statistics.velocityFlat');
    return `<div class="admin-stats__badge ${cls}" title="${escapeHtml(t('statistics.periodComparison'))}">
      <span class="material-icons">${icon}</span><span>${escapeHtml(label)}</span>
    </div>`;
  }

  // ─── KPI Row ───
  _renderKpiRow(content, summary, t) {
    const velocity = summary.weekVelocity ?? 0;
    const weekKm = summary.weekKm ?? 0;
    const hasTargetKm = summary.targetKm != null && summary.targetKm > 0;
    const forecastDays = summary.forecastDays;
    const healthScore = this._computeHealthScore(summary);

    let forecastText;
    if (forecastDays != null && forecastDays === 0) forecastText = '100%';
    else if (forecastDays != null && forecastDays > 0) forecastText = t('statistics.forecastDays').replace('{0}', forecastDays);
    else if (summary.completionPct >= 100) forecastText = '100%';
    else forecastText = t('statistics.noForecast');

    let kmProgressHtml = '';
    if (hasTargetKm) {
      const kmPct = Math.min(100, Math.round((summary.totalKm / summary.targetKm) * 100));
      const remainingKm = Math.max(0, summary.targetKm - summary.totalKm).toFixed(1);
      kmProgressHtml = `<div class="admin-stats__km-progress">
        <div class="admin-stats__km-progress-text">${summary.totalKm} / ${summary.targetKm} km (${kmPct}%)</div>
        <div class="admin-stats__card-bar" style="margin-top:4px"><div class="admin-stats__card-bar-fill" style="width:${kmPct}%"></div></div>
        <div class="admin-stats__kpi-sub">${remainingKm} km ${escapeHtml(t('statistics.remaining'))}</div>
      </div>`;
    }

    const velocityValue = hasTargetKm ? `${weekKm}` : `${velocity}`;
    const velocityUnit = hasTargetKm ? escapeHtml(t('statistics.kmPerWeek')) : escapeHtml(t('statistics.nodesPerWeek'));
    const healthColor = healthScore >= 70 ? '#22c55e' : healthScore >= 40 ? '#eab308' : '#ef4444';
    const healthLabel = healthScore >= 70 ? t('statistics.healthy') : healthScore >= 40 ? t('statistics.atRisk') : t('statistics.critical');

    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__kpi-row">
        <div class="admin-stats__kpi-card">
          <span class="material-icons admin-stats__kpi-icon">speed</span>
          <div class="admin-stats__kpi-value">${velocityValue}</div>
          <div class="admin-stats__kpi-label">${velocityUnit}</div>
          <div class="admin-stats__kpi-sub">${escapeHtml(t('statistics.velocity'))}</div>
        </div>
        <div class="admin-stats__kpi-card">
          <span class="material-icons admin-stats__kpi-icon">event</span>
          <div class="admin-stats__kpi-value admin-stats__kpi-value--sm">${escapeHtml(forecastText)}</div>
          <div class="admin-stats__kpi-label">${escapeHtml(t('statistics.completionForecast'))}</div>
          ${kmProgressHtml}
        </div>
        <div class="admin-stats__kpi-card">
          <div class="admin-stats__health-ring">${this._healthRingSvg(healthScore, healthColor)}</div>
          <div class="admin-stats__kpi-label" style="color:${healthColor}">${escapeHtml(healthLabel)}</div>
          <div class="admin-stats__kpi-sub">${escapeHtml(t('statistics.projectHealth'))}</div>
        </div>
      </div>
    `);
  }

  _computeHealthScore(summary) {
    const { completionPct = 0, weekVelocity = 0, prevWeekVelocity = 0 } = summary;
    const { issueBreakdown } = this._data;
    const completionScore = completionPct;
    let velocityScore = 50;
    if (prevWeekVelocity > 0 && weekVelocity > 0) velocityScore = Math.min(100, Math.round((weekVelocity / prevWeekVelocity) * 60));
    else if (weekVelocity > 0) velocityScore = 70;
    let issueScore = 100;
    if (issueBreakdown) {
      const totalIssues = Object.values(issueBreakdown).reduce((a, b) => a + b, 0);
      issueScore = Math.max(0, Math.round(100 - (totalIssues / (summary.totalNodes || 1)) * 200));
    }
    return Math.round(completionScore * 0.4 + velocityScore * 0.3 + issueScore * 0.3);
  }

  _healthRingSvg(score, color) {
    const r = 30, circumference = 2 * Math.PI * r;
    const offset = circumference - (score / 100) * circumference;
    return `<svg width="72" height="72" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--color-border)" stroke-width="6"/>
      <circle cx="40" cy="40" r="${r}" fill="none" stroke="${color}" stroke-width="6"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
        transform="rotate(-90 40 40)" style="transition: stroke-dashoffset 0.6s ease"/>
      <text x="40" y="44" text-anchor="middle" font-size="16" font-weight="700" fill="${color}">${score}</text>
    </svg>`;
  }

  // ─── Records Row ───
  _renderRecords(content, records, t) {
    const { peakDay, peakWeek, thisMonth, lastMonth, monthOverMonthPct } = records;

    const peakDayHtml = peakDay
      ? `<div class="admin-stats__record-value">${peakDay.count}</div>
         <div class="admin-stats__record-detail">${escapeHtml(peakDay.date)}</div>`
      : `<div class="admin-stats__record-value">--</div>`;

    const peakWeekHtml = peakWeek
      ? `<div class="admin-stats__record-value">${peakWeek.count}</div>
         <div class="admin-stats__record-detail">${escapeHtml(t('statistics.weekOf'))} ${escapeHtml(peakWeek.weekStart)}</div>`
      : `<div class="admin-stats__record-value">--</div>`;

    const momBadge = monthOverMonthPct != null
      ? (() => {
          const isUp = monthOverMonthPct > 0, isDown = monthOverMonthPct < 0;
          const cls = isUp ? 'badge--up' : isDown ? 'badge--down' : 'badge--flat';
          const icon = isUp ? 'trending_up' : isDown ? 'trending_down' : 'trending_flat';
          return `<div class="admin-stats__badge ${cls}">
            <span class="material-icons">${icon}</span><span>${Math.abs(monthOverMonthPct)}%</span>
          </div>`;
        })()
      : '';

    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__section">
        <h3 class="admin-stats__section-title">
          <span class="material-icons">emoji_events</span>
          ${escapeHtml(t('statistics.records'))}
        </h3>
        <div class="admin-stats__records-row">
          <div class="admin-stats__record-card">
            <span class="material-icons admin-stats__record-icon" style="color:#f59e0b">star</span>
            <div class="admin-stats__record-label">${escapeHtml(t('statistics.peakDay'))}</div>
            ${peakDayHtml}
          </div>
          <div class="admin-stats__record-card">
            <span class="material-icons admin-stats__record-icon" style="color:#8b5cf6">military_tech</span>
            <div class="admin-stats__record-label">${escapeHtml(t('statistics.peakWeek'))}</div>
            ${peakWeekHtml}
          </div>
          <div class="admin-stats__record-card">
            <span class="material-icons admin-stats__record-icon" style="color:#3b82f6">calendar_today</span>
            <div class="admin-stats__record-label">${escapeHtml(t('statistics.thisMonthLabel'))}</div>
            <div class="admin-stats__record-value">${thisMonth?.nodes ?? 0}</div>
            <div class="admin-stats__record-detail">${thisMonth?.activeDays ?? 0} ${escapeHtml(t('statistics.activeDays'))}, ${thisMonth?.avgPerDay ?? 0}/${escapeHtml(t('statistics.day'))}</div>
          </div>
          <div class="admin-stats__record-card">
            <span class="material-icons admin-stats__record-icon" style="color:#6b7280">date_range</span>
            <div class="admin-stats__record-label">${escapeHtml(t('statistics.lastMonthLabel'))}</div>
            <div class="admin-stats__record-value">${lastMonth?.nodes ?? 0}</div>
            <div class="admin-stats__record-detail">${lastMonth?.activeDays ?? 0} ${escapeHtml(t('statistics.activeDays'))}, ${lastMonth?.avgPerDay ?? 0}/${escapeHtml(t('statistics.day'))}</div>
            ${momBadge}
          </div>
        </div>
      </div>
    `);
  }

  // ─── Filtered Summary (shows stats for current filter selection) ───
  _renderFilteredSummary(content, fs, t) {
    const rangeLabel = this._getRangeLabel();
    const userLabel = this._filterUser || escapeHtml(t('statistics.allUsers'));

    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__section">
        <h3 class="admin-stats__section-title">
          <span class="material-icons">filter_alt</span>
          ${escapeHtml(rangeLabel)} — ${escapeHtml(userLabel)}
        </h3>
        <div class="admin-stats__cards" style="margin-bottom:0">
          <div class="admin-stats__card">
            <span class="material-icons admin-stats__card-icon">radio_button_checked</span>
            <div class="admin-stats__card-value">${fmtNum(fs.totalNodes)}</div>
            <div class="admin-stats__card-label">${escapeHtml(t('statistics.nodesMeasured'))}</div>
          </div>
          <div class="admin-stats__card">
            <span class="material-icons admin-stats__card-icon">today</span>
            <div class="admin-stats__card-value">${fs.activeDays}</div>
            <div class="admin-stats__card-label">${escapeHtml(t('statistics.activeDays'))}</div>
          </div>
          <div class="admin-stats__card">
            <span class="material-icons admin-stats__card-icon">avg_pace</span>
            <div class="admin-stats__card-value">${fs.avgPerDay}</div>
            <div class="admin-stats__card-label">${escapeHtml(t('statistics.nodesPerDay'))}</div>
          </div>
          <div class="admin-stats__card">
            <span class="material-icons admin-stats__card-icon">group</span>
            <div class="admin-stats__card-value">${fs.activeUsers}</div>
            <div class="admin-stats__card-label">${escapeHtml(t('statistics.activeUsersLabel'))}</div>
          </div>
        </div>
      </div>
    `);
  }

  _getRangeLabel() {
    const t = this.t;
    switch (this._filterRange) {
      case '7': return t('statistics.last7days');
      case '30': return t('statistics.last30days');
      case '90': return t('statistics.last90days');
      case '365': return t('statistics.last365days');
      case 'thisMonth': return t('statistics.thisMonth');
      case 'lastMonth': return t('statistics.lastMonth');
      default: return '';
    }
  }

  // ─── Activity Chart (filtered, adapts to day/week/month) ───
  _renderActivityChart(content, aggregated, t) {
    const maxCount = Math.max(...aggregated.map(d => d.count), 1);
    const periodLabel = {
      day: t('statistics.dailyActivity'),
      week: t('statistics.weeklyActivity'),
      month: t('statistics.monthlyActivity'),
    }[this._filterPeriod] || t('statistics.dailyActivity');

    const barsHtml = aggregated.map(d => {
      const pct = Math.round((d.count / maxCount) * 100);
      return `
        <div class="admin-stats__bar-col" title="${escapeHtml(d.key)}: ${d.count}">
          <div class="admin-stats__bar" style="height:${pct}%"></div>
          <div class="admin-stats__bar-label">${escapeHtml(d.label)}</div>
        </div>
      `;
    }).join('');

    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__section">
        <h3 class="admin-stats__section-title">
          <span class="material-icons">bar_chart</span>
          ${escapeHtml(periodLabel)}
          <span class="admin-stats__badge badge--neutral">${aggregated.reduce((a, d) => a + d.count, 0)} ${escapeHtml(t('statistics.totalNodes'))}</span>
        </h3>
        <div class="admin-stats__chart">${barsHtml}</div>
      </div>
    `);
  }

  // ─── Weekly Velocity Trend (SVG) ───
  _renderVelocityChart(content, weekly, t, useKm = false) {
    const W = 560, H = 140, padX = 40, padY = 20;
    const chartW = W - padX * 2, chartH = H - padY * 2;
    const counts = weekly.map(w => useKm ? (w.km || 0) : w.count);
    const maxVal = Math.max(...counts, 1);

    const points = counts.map((c, i) => {
      const x = padX + (i / Math.max(counts.length - 1, 1)) * chartW;
      const y = padY + chartH - (c / maxVal) * chartH;
      return `${x},${y}`;
    }).join(' ');

    const areaPoints = [`${padX},${padY + chartH}`, ...counts.map((c, i) => {
      const x = padX + (i / Math.max(counts.length - 1, 1)) * chartW;
      const y = padY + chartH - (c / maxVal) * chartH;
      return `${x},${y}`;
    }), `${padX + chartW},${padY + chartH}`].join(' ');

    const xLabels = weekly.map((w, i) => {
      if (i % 2 !== 0 && i !== weekly.length - 1) return '';
      const x = padX + (i / Math.max(weekly.length - 1, 1)) * chartW;
      return `<text x="${x}" y="${H - 2}" text-anchor="middle" font-size="9" fill="var(--color-text-muted)">${escapeHtml((w.weekStart || '').slice(5))}</text>`;
    }).join('');

    const ySteps = 4;
    const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => {
      const val = useKm ? (maxVal / ySteps * i).toFixed(1) : Math.round(maxVal / ySteps * i);
      const y = padY + chartH - (i / ySteps) * chartH;
      return `<text x="${padX - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--color-text-muted)">${val}</text>
              <line x1="${padX}" y1="${y}" x2="${padX + chartW}" y2="${y}" stroke="var(--color-border)" stroke-width="0.5" stroke-dasharray="3"/>`;
    }).join('');

    const dots = counts.map((c, i) => {
      const x = padX + (i / Math.max(counts.length - 1, 1)) * chartW;
      const y = padY + chartH - (c / maxVal) * chartH;
      const label = useKm ? `${c.toFixed(2)} km` : `${c}`;
      return `<circle cx="${x}" cy="${y}" r="3" fill="var(--color-accent, #2563eb)"><title>${weekly[i].weekStart}: ${label}</title></circle>`;
    }).join('');

    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__section">
        <h3 class="admin-stats__section-title">
          <span class="material-icons">show_chart</span>
          ${escapeHtml(t('statistics.velocityTrend'))}
        </h3>
        <div class="admin-stats__svg-chart">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
            ${yLabels}
            <polygon points="${areaPoints}" fill="var(--color-accent, #2563eb)" opacity="0.1"/>
            <polyline points="${points}" fill="none" stroke="var(--color-accent, #2563eb)" stroke-width="2" stroke-linejoin="round"/>
            ${dots}
            ${xLabels}
          </svg>
        </div>
      </div>
    `);
  }

  // ─── Accuracy + Issues ───
  _renderChartsRow(content, accuracyDistribution, issueBreakdown, t) {
    let leftHtml = '', rightHtml = '';
    if (accuracyDistribution && Object.values(accuracyDistribution).some(v => v > 0)) {
      leftHtml = this._renderAccuracyDonut(accuracyDistribution, t);
    }
    if (issueBreakdown && Object.values(issueBreakdown).some(v => v > 0)) {
      rightHtml = this._renderIssueBreakdown(issueBreakdown, t);
    } else {
      rightHtml = `<div class="admin-stats__section">
        <h3 class="admin-stats__section-title"><span class="material-icons">bug_report</span>${escapeHtml(t('statistics.issueBreakdown'))}</h3>
        <p class="ap-empty" style="margin:0;padding:16px 0">${escapeHtml(t('statistics.noIssues'))}</p>
      </div>`;
    }
    content.insertAdjacentHTML('beforeend', `<div class="admin-stats__charts-row">${leftHtml}${rightHtml}</div>`);
  }

  _renderAccuracyDonut(dist, t) {
    const segments = [
      { key: 'rtk', label: t('statistics.rtk'), color: '#22c55e', count: dist.rtk || 0 },
      { key: 'float', label: t('statistics.rtkFloat'), color: '#3b82f6', count: dist.float || 0 },
      { key: 'dgps', label: t('statistics.dgps'), color: '#eab308', count: dist.dgps || 0 },
      { key: 'gps', label: t('statistics.gpsOnly'), color: '#f97316', count: dist.gps || 0 },
      { key: 'unknown', label: t('statistics.unknown'), color: '#94a3b8', count: dist.unknown || 0 },
    ].filter(s => s.count > 0);
    const total = segments.reduce((a, s) => a + s.count, 0);
    if (total === 0) return '';

    const cx = 60, cy = 60, r = 42;
    let startAngle = 0;
    let arcs = '', legendHtml = '';
    for (const seg of segments) {
      const sweep = (seg.count / total) * 360;
      const endAngle = startAngle + Math.min(sweep, 359.9);
      if (sweep > 0.5) {
        arcs += `<path d="${donutArc(cx, cy, r, startAngle, endAngle)}" fill="none" stroke="${seg.color}" stroke-width="14" stroke-linecap="butt">
          <title>${escapeHtml(seg.label)}: ${seg.count} (${Math.round((seg.count / total) * 100)}%)</title></path>`;
      }
      startAngle += sweep;
      legendHtml += `<div class="admin-stats__legend-item">
        <span class="admin-stats__legend-dot" style="background:${seg.color}"></span>
        <span class="admin-stats__legend-text">${escapeHtml(seg.label)}</span>
        <span class="admin-stats__legend-val">${seg.count} (${Math.round((seg.count / total) * 100)}%)</span>
      </div>`;
    }
    return `<div class="admin-stats__section">
      <h3 class="admin-stats__section-title"><span class="material-icons">my_location</span>${escapeHtml(t('statistics.accuracyDistribution'))}</h3>
      <div class="admin-stats__donut-wrap">
        <svg viewBox="0 0 120 120" class="admin-stats__donut-svg">${arcs}
          <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--color-text)">${total}</text>
        </svg>
        <div class="admin-stats__legend">${legendHtml}</div>
      </div>
    </div>`;
  }

  _renderIssueBreakdown(issues, t) {
    const items = [
      { key: 'missingCoords', label: t('statistics.missingCoords'), color: '#ef4444', icon: 'location_off' },
      { key: 'missingMeasurements', label: t('statistics.missingMeasurements'), color: '#f97316', icon: 'straighten' },
      { key: 'longEdges', label: t('statistics.longEdges'), color: '#eab308', icon: 'open_in_full' },
      { key: 'negativeGradients', label: t('statistics.negativeGradients'), color: '#8b5cf6', icon: 'trending_down' },
    ].filter(i => (issues[i.key] || 0) > 0);
    const total = items.reduce((a, i) => a + (issues[i.key] || 0), 0);
    const maxVal = Math.max(...items.map(i => issues[i.key] || 0), 1);
    const barsHtml = items.map(i => {
      const count = issues[i.key] || 0;
      const pct = Math.round((count / maxVal) * 100);
      return `<div class="admin-stats__issue-row">
        <div class="admin-stats__issue-label"><span class="material-icons" style="font-size:16px;color:${i.color}">${i.icon}</span><span>${escapeHtml(i.label)}</span></div>
        <div class="admin-stats__issue-bar-wrap"><div class="admin-stats__issue-bar" style="width:${pct}%;background:${i.color}"></div></div>
        <div class="admin-stats__issue-count">${count}</div>
      </div>`;
    }).join('');
    return `<div class="admin-stats__section">
      <h3 class="admin-stats__section-title"><span class="material-icons">bug_report</span>${escapeHtml(t('statistics.issueBreakdown'))}
        <span class="admin-stats__badge badge--neutral">${total} ${escapeHtml(t('statistics.totalIssues'))}</span></h3>
      ${barsHtml}
    </div>`;
  }

  // ─── Activity Heatmap ───
  _renderActivityHeatmap(content, heatmapData, t) {
    const dateMap = new Map();
    const dateUsersMap = new Map();
    // Apply user filter to heatmap
    const userFilter = this._filterUser;
    for (const entry of heatmapData) {
      if (userFilter && entry.user !== userFilter) continue;
      dateMap.set(entry.date, (dateMap.get(entry.date) || 0) + entry.count);
      if (!dateUsersMap.has(entry.date)) dateUsersMap.set(entry.date, []);
      dateUsersMap.get(entry.date).push({ user: entry.user, count: entry.count });
    }
    for (const users of dateUsersMap.values()) users.sort((a, b) => b.count - a.count);

    // Generate days based on date range
    const rangeDays = this._filterRange === '365' ? 365 : this._filterRange === '7' ? 7 : this._filterRange === '30' ? 30 : 90;
    const today = new Date();
    const days = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: dateMap.get(key) || 0, dayOfWeek: d.getDay() });
    }
    const maxCount = Math.max(...days.map(d => d.count), 1);

    const getColor = (count) => {
      if (count === 0) return 'var(--heatmap-0, #ebedf0)';
      const intensity = count / maxCount;
      if (intensity <= 0.25) return 'var(--heatmap-1, #9be9a8)';
      if (intensity <= 0.5) return 'var(--heatmap-2, #40c463)';
      if (intensity <= 0.75) return 'var(--heatmap-3, #30a14e)';
      return 'var(--heatmap-4, #216e39)';
    };

    const cellsHtml = days.map((d, i) =>
      `<div class="admin-stats__heatmap-cell" data-idx="${i}" style="background:${getColor(d.count)}" title="${escapeHtml(d.date)}: ${d.count}"></div>`
    ).join('');

    const sectionEl = document.createElement('div');
    sectionEl.className = 'admin-stats__section';
    sectionEl.style.position = 'relative';
    sectionEl.innerHTML = `
      <h3 class="admin-stats__section-title">
        <span class="material-icons">calendar_month</span>
        ${escapeHtml(t('statistics.activityHeatmap'))}
      </h3>
      <div class="admin-stats__heatmap">${cellsHtml}</div>
      <div class="admin-stats__heatmap-tooltip" id="heatmapTooltip"></div>
      <div class="admin-stats__heatmap-legend">
        <span>${escapeHtml(t('statistics.less'))}</span>
        <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-0, #ebedf0)"></div>
        <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-1, #9be9a8)"></div>
        <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-2, #40c463)"></div>
        <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-3, #30a14e)"></div>
        <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-4, #216e39)"></div>
        <span>${escapeHtml(t('statistics.more'))}</span>
      </div>`;
    content.appendChild(sectionEl);

    // Tooltip
    const tooltip = sectionEl.querySelector('#heatmapTooltip');
    const heatmapEl = sectionEl.querySelector('.admin-stats__heatmap');
    let activeIdx = -1;

    const showTooltip = (idx, cellEl) => {
      const day = days[idx];
      if (!day) return;
      activeIdx = idx;
      const dateStr = new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      let html = `<div class="admin-stats__heatmap-tip-date">${escapeHtml(dateStr)}</div>`;
      if (day.count === 0) {
        html += `<div class="admin-stats__heatmap-tip-empty">${escapeHtml(t('statistics.noData'))}</div>`;
      } else {
        html += `<div class="admin-stats__heatmap-tip-total">${day.count} ${escapeHtml(t('statistics.nodesMeasured'))}</div>`;
        const users = dateUsersMap.get(day.date) || [];
        if (users.length > 0) {
          html += `<div class="admin-stats__heatmap-tip-users">`;
          for (const u of users) html += `<div class="admin-stats__heatmap-tip-user"><span>${escapeHtml(u.user)}</span><span class="admin-stats__heatmap-tip-count">${u.count}</span></div>`;
          html += `</div>`;
        }
      }
      tooltip.innerHTML = html;
      tooltip.classList.add('visible');
      const heatmapRect = heatmapEl.getBoundingClientRect();
      const cellRect = cellEl.getBoundingClientRect();
      tooltip.style.left = `${cellRect.left - heatmapRect.left + cellRect.width / 2}px`;
      tooltip.style.top = `${cellRect.top - heatmapRect.top - 4}px`;
    };
    const hideTooltip = () => { activeIdx = -1; tooltip.classList.remove('visible'); };

    heatmapEl.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-idx]');
      if (!cell) return;
      const idx = parseInt(cell.dataset.idx);
      if (activeIdx === idx) hideTooltip(); else showTooltip(idx, cell);
    });
    heatmapEl.addEventListener('mouseover', (e) => {
      const cell = e.target.closest('[data-idx]');
      if (cell) showTooltip(parseInt(cell.dataset.idx), cell);
    });
    heatmapEl.addEventListener('mouseleave', hideTooltip);
  }

  // ─── Per-user table ───
  _renderPerUserTable(content, perUser, t) {
    // Highlight selected user
    const selectedUser = this._filterUser;
    const userRows = perUser.map(u => {
      const lastActive = u.lastActive ? new Date(u.lastActive).toLocaleDateString() : '--';
      const accuracy = u.avgAccuracy != null ? `${(u.avgAccuracy * 100).toFixed(1)} cm` : '--';
      const npd = u.nodesPerDay != null ? u.nodesPerDay.toFixed(1) : '--';
      const highlight = selectedUser && u.user === selectedUser ? ' class="admin-stats__row-highlight"' : '';
      return `<tr${highlight}>
        <td>${escapeHtml(u.user)}</td><td>${u.sketchesCreated}</td><td>${u.nodesCreated}</td>
        <td>${u.nodesMeasured}</td><td>${accuracy}</td><td>${npd}</td>
        <td>${u.activeDays ?? '--'}</td><td>${lastActive}</td>
      </tr>`;
    }).join('');

    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__section">
        <h3 class="admin-stats__section-title"><span class="material-icons">people</span>${escapeHtml(t('statistics.perUser'))}</h3>
        <div class="admin-stats__table-wrap">
          <table class="stats-table"><thead><tr>
            <th>${escapeHtml(t('statistics.user'))}</th><th>${escapeHtml(t('statistics.sketches'))}</th>
            <th>${escapeHtml(t('statistics.nodesCreated'))}</th><th>${escapeHtml(t('statistics.nodesMeasured'))}</th>
            <th>${escapeHtml(t('statistics.avgAccuracy'))}</th><th>${escapeHtml(t('statistics.nodesPerDay'))}</th>
            <th>${escapeHtml(t('statistics.activeDays'))}</th><th>${escapeHtml(t('statistics.lastActive'))}</th>
          </tr></thead><tbody>${userRows}</tbody></table>
        </div>
      </div>
    `);
  }

  // ─── Per-project table ───
  _renderPerProjectTable(content, perProject, t) {
    const projRows = perProject.map(p => {
      const completion = p.nodes > 0 ? Math.round((p.nodesWithCoords / p.nodes) * 100) : 0;
      return `<tr>
        <td>${escapeHtml(p.name || '--')}</td><td>${p.sketches}</td><td>${p.nodes}</td>
        <td>${p.edges}</td><td>${(p.km).toFixed(2)}</td>
        <td><div class="stats-completion-bar"><div class="stats-completion-bar__fill" style="width:${completion}%"></div><span>${completion}%</span></div></td>
      </tr>`;
    }).join('');

    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__section">
        <h3 class="admin-stats__section-title"><span class="material-icons">folder_open</span>${escapeHtml(t('statistics.perProject'))}</h3>
        <div class="admin-stats__table-wrap">
          <table class="stats-table"><thead><tr>
            <th>${escapeHtml(t('statistics.project'))}</th><th>${escapeHtml(t('statistics.sketches'))}</th>
            <th>${escapeHtml(t('statistics.totalNodes'))}</th><th>${escapeHtml(t('statistics.totalEdges'))}</th>
            <th>km</th><th>${escapeHtml(t('statistics.completion'))}</th>
          </tr></thead><tbody>${projRows}</tbody></table>
        </div>
      </div>
    `);
  }
}
