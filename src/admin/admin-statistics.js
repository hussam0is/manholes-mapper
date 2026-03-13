/**
 * Admin Statistics Tab — Enhanced KPI Dashboard
 *
 * Workload statistics dashboard showing:
 * - Summary cards with period comparison badges
 * - Velocity, forecast & project health row
 * - Weekly velocity trend (SVG line chart)
 * - Accuracy distribution donut + Issue breakdown
 * - Team activity heatmap (90 days)
 * - Per-user workload table (enhanced)
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

/** Format number with locale-aware separators */
function fmtNum(n) {
  return typeof n === 'number' ? n.toLocaleString() : '--';
}

/** SVG donut segment path for a given start/end angle (0-360) */
function donutArc(cx, cy, r, startAngle, endAngle) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
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
    const { summary, perUser, daily, perProject, weekly, accuracyDistribution, issueBreakdown, activityHeatmap } = this._data;
    const t = this.t;

    content.innerHTML = '';

    // ── 1. Summary cards with velocity badge ──
    this._renderSummaryCards(content, summary, t);

    // ── 2. Velocity / Forecast / Health row ──
    this._renderKpiRow(content, summary, t);

    // ── 3. Weekly velocity trend chart ──
    if (weekly && weekly.length > 1) {
      const useKm = summary.targetKm != null && summary.targetKm > 0;
      this._renderVelocityChart(content, weekly, t, useKm);
    }

    // ── 4. Accuracy distribution + Issue breakdown (side by side) ──
    const hasDist = accuracyDistribution && Object.values(accuracyDistribution).some(v => v > 0);
    const hasIssues = issueBreakdown && Object.values(issueBreakdown).some(v => v > 0);
    if (hasDist || hasIssues) {
      this._renderChartsRow(content, accuracyDistribution, issueBreakdown, t);
    }

    // ── 5. Team activity heatmap ──
    if (activityHeatmap && activityHeatmap.length > 0) {
      this._renderActivityHeatmap(content, activityHeatmap, t);
    }

    // ── 6. Daily activity chart (existing) ──
    if (daily && daily.length > 0) {
      this._renderDailyChart(content, daily, t);
    }

    // ── 7. Per-user workload table (enhanced) ──
    if (perUser && perUser.length > 0) {
      this._renderPerUserTable(content, perUser, t);
    }

    // ── 8. Per-project breakdown ──
    if (perProject && perProject.length > 0) {
      this._renderPerProjectTable(content, perProject, t);
    }

    // Empty state
    if (!perUser?.length && !perProject?.length && !daily?.length && summary.totalSketches === 0) {
      content.insertAdjacentHTML('beforeend', `
        <p class="ap-empty">${escapeHtml(t('statistics.noData'))}</p>
      `);
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

  /** Period comparison badge */
  _velocityBadge(summary) {
    const pct = summary.velocityChangePct;
    if (pct == null) return '';
    const t = this.t;
    const isUp = pct > 0;
    const isDown = pct < 0;
    const icon = isUp ? 'trending_up' : isDown ? 'trending_down' : 'trending_flat';
    const cls = isUp ? 'badge--up' : isDown ? 'badge--down' : 'badge--flat';
    const label = isUp
      ? t('statistics.velocityUp').replace('{0}', pct)
      : isDown
        ? t('statistics.velocityDown').replace('{0}', Math.abs(pct))
        : t('statistics.velocityFlat');
    return `
      <div class="admin-stats__badge ${cls}" title="${escapeHtml(t('statistics.periodComparison'))}">
        <span class="material-icons">${icon}</span>
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }

  // ─── KPI Row: Velocity + Forecast + Health ───
  _renderKpiRow(content, summary, t) {
    const velocity = summary.weekVelocity ?? 0;
    const weekKm = summary.weekKm ?? 0;
    const hasTargetKm = summary.targetKm != null && summary.targetKm > 0;
    const forecastDays = summary.forecastDays;
    const healthScore = this._computeHealthScore(summary);

    // Forecast text
    let forecastText;
    if (forecastDays != null && forecastDays === 0) {
      forecastText = '100%';
    } else if (forecastDays != null && forecastDays > 0) {
      forecastText = t('statistics.forecastDays').replace('{0}', forecastDays);
    } else if (summary.completionPct >= 100) {
      forecastText = '100%';
    } else {
      forecastText = t('statistics.noForecast');
    }

    // Km progress bar (only when targetKm is set)
    let kmProgressHtml = '';
    if (hasTargetKm) {
      const kmPct = Math.min(100, Math.round((summary.totalKm / summary.targetKm) * 100));
      const remainingKm = Math.max(0, summary.targetKm - summary.totalKm).toFixed(1);
      kmProgressHtml = `
        <div class="admin-stats__km-progress">
          <div class="admin-stats__km-progress-text">
            ${summary.totalKm} / ${summary.targetKm} km (${kmPct}%)
          </div>
          <div class="admin-stats__card-bar" style="margin-top:4px">
            <div class="admin-stats__card-bar-fill" style="width:${kmPct}%"></div>
          </div>
          <div class="admin-stats__kpi-sub">${remainingKm} km ${escapeHtml(t('statistics.remaining'))}</div>
        </div>
      `;
    }

    // Velocity card: show km/week if targetKm is set, otherwise nodes/week
    const velocityValue = hasTargetKm ? `${weekKm}` : `${velocity}`;
    const velocityUnit = hasTargetKm
      ? escapeHtml(t('statistics.kmPerWeek'))
      : escapeHtml(t('statistics.nodesPerWeek'));

    const healthColor = healthScore >= 70 ? '#22c55e' : healthScore >= 40 ? '#eab308' : '#ef4444';
    const healthLabel = healthScore >= 70
      ? t('statistics.healthy')
      : healthScore >= 40
        ? t('statistics.atRisk')
        : t('statistics.critical');

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
          <div class="admin-stats__health-ring">
            ${this._healthRingSvg(healthScore, healthColor)}
          </div>
          <div class="admin-stats__kpi-label" style="color:${healthColor}">${escapeHtml(healthLabel)}</div>
          <div class="admin-stats__kpi-sub">${escapeHtml(t('statistics.projectHealth'))}</div>
        </div>
      </div>
    `);
  }

  /** Compute project health score 0-100 */
  _computeHealthScore(summary) {
    const { completionPct = 0, weekVelocity = 0, prevWeekVelocity = 0 } = summary;
    const { issueBreakdown } = this._data;

    // Completion weight: 40%
    const completionScore = completionPct;

    // Velocity trend weight: 30% (is velocity increasing?)
    let velocityScore = 50; // neutral
    if (prevWeekVelocity > 0 && weekVelocity > 0) {
      const ratio = weekVelocity / prevWeekVelocity;
      velocityScore = Math.min(100, Math.round(ratio * 60));
    } else if (weekVelocity > 0) {
      velocityScore = 70;
    }

    // Issue density weight: 30% (fewer issues = higher score)
    let issueScore = 100;
    if (issueBreakdown) {
      const totalIssues = Object.values(issueBreakdown).reduce((a, b) => a + b, 0);
      const totalNodes = summary.totalNodes || 1;
      const issueRatio = totalIssues / totalNodes;
      issueScore = Math.max(0, Math.round(100 - issueRatio * 200));
    }

    return Math.round(completionScore * 0.4 + velocityScore * 0.3 + issueScore * 0.3);
  }

  /** SVG health ring */
  _healthRingSvg(score, color) {
    const r = 30;
    const circumference = 2 * Math.PI * r;
    const offset = circumference - (score / 100) * circumference;
    return `
      <svg width="72" height="72" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--color-border)" stroke-width="6"/>
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="${color}" stroke-width="6"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 40 40)"
          style="transition: stroke-dashoffset 0.6s ease"/>
        <text x="40" y="44" text-anchor="middle" font-size="16" font-weight="700"
          fill="${color}">${score}</text>
      </svg>
    `;
  }

  // ─── Weekly Velocity Trend (SVG Line Chart) ───
  _renderVelocityChart(content, weekly, t, useKm = false) {
    const W = 560;
    const H = 140;
    const padX = 40;
    const padY = 20;
    const chartW = W - padX * 2;
    const chartH = H - padY * 2;

    const counts = weekly.map(w => useKm ? (w.km || 0) : w.count);
    const maxVal = Math.max(...counts, 1);

    // Build polyline points
    const points = counts.map((c, i) => {
      const x = padX + (i / Math.max(counts.length - 1, 1)) * chartW;
      const y = padY + chartH - (c / maxVal) * chartH;
      return `${x},${y}`;
    }).join(' ');

    // Area fill
    const areaPoints = [
      `${padX},${padY + chartH}`,
      ...counts.map((c, i) => {
        const x = padX + (i / Math.max(counts.length - 1, 1)) * chartW;
        const y = padY + chartH - (c / maxVal) * chartH;
        return `${x},${y}`;
      }),
      `${padX + chartW},${padY + chartH}`,
    ].join(' ');

    // X-axis labels (show every other week)
    const xLabels = weekly.map((w, i) => {
      if (i % 2 !== 0 && i !== weekly.length - 1) return '';
      const x = padX + (i / Math.max(weekly.length - 1, 1)) * chartW;
      const label = w.weekStart ? w.weekStart.slice(5) : `W${i + 1}`;
      return `<text x="${x}" y="${H - 2}" text-anchor="middle" font-size="9" fill="var(--color-text-muted)">${escapeHtml(label)}</text>`;
    }).join('');

    // Y-axis labels
    const ySteps = 4;
    const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => {
      const val = Math.round((maxVal / ySteps) * i);
      const y = padY + chartH - (i / ySteps) * chartH;
      return `<text x="${padX - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--color-text-muted)">${val}</text>
              <line x1="${padX}" y1="${y}" x2="${padX + chartW}" y2="${y}" stroke="var(--color-border)" stroke-width="0.5" stroke-dasharray="3"/>`;
    }).join('');

    // Data point dots
    const unit = useKm ? 'km' : t('statistics.totalNodes');
    const dots = counts.map((c, i) => {
      const x = padX + (i / Math.max(counts.length - 1, 1)) * chartW;
      const y = padY + chartH - (c / maxVal) * chartH;
      const label = useKm ? `${c.toFixed(2)} km` : `${c}`;
      return `<circle cx="${x}" cy="${y}" r="3" fill="var(--color-accent, #2563eb)">
        <title>${weekly[i].weekStart}: ${label}</title>
      </circle>`;
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

  // ─── Accuracy Distribution + Issue Breakdown ───
  _renderChartsRow(content, accuracyDistribution, issueBreakdown, t) {
    let leftHtml = '';
    let rightHtml = '';

    // Accuracy donut
    if (accuracyDistribution && Object.values(accuracyDistribution).some(v => v > 0)) {
      leftHtml = this._renderAccuracyDonut(accuracyDistribution, t);
    }

    // Issue breakdown bars
    if (issueBreakdown && Object.values(issueBreakdown).some(v => v > 0)) {
      rightHtml = this._renderIssueBreakdown(issueBreakdown, t);
    } else {
      rightHtml = `
        <div class="admin-stats__section">
          <h3 class="admin-stats__section-title">
            <span class="material-icons">bug_report</span>
            ${escapeHtml(t('statistics.issueBreakdown'))}
          </h3>
          <p class="ap-empty" style="margin:0;padding:16px 0">${escapeHtml(t('statistics.noIssues'))}</p>
        </div>
      `;
    }

    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__charts-row">
        ${leftHtml}
        ${rightHtml}
      </div>
    `);
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
    let arcs = '';
    let legendHtml = '';

    for (const seg of segments) {
      const sweep = (seg.count / total) * 360;
      // Avoid full circle issues
      const endAngle = startAngle + Math.min(sweep, 359.9);
      if (sweep > 0.5) {
        arcs += `<path d="${donutArc(cx, cy, r, startAngle, endAngle)}"
          fill="none" stroke="${seg.color}" stroke-width="14" stroke-linecap="butt">
          <title>${escapeHtml(seg.label)}: ${seg.count} (${Math.round((seg.count / total) * 100)}%)</title>
        </path>`;
      }
      startAngle += sweep;

      const pct = Math.round((seg.count / total) * 100);
      legendHtml += `
        <div class="admin-stats__legend-item">
          <span class="admin-stats__legend-dot" style="background:${seg.color}"></span>
          <span class="admin-stats__legend-text">${escapeHtml(seg.label)}</span>
          <span class="admin-stats__legend-val">${seg.count} (${pct}%)</span>
        </div>
      `;
    }

    return `
      <div class="admin-stats__section">
        <h3 class="admin-stats__section-title">
          <span class="material-icons">my_location</span>
          ${escapeHtml(t('statistics.accuracyDistribution'))}
        </h3>
        <div class="admin-stats__donut-wrap">
          <svg viewBox="0 0 120 120" class="admin-stats__donut-svg">
            ${arcs}
            <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--color-text)">${total}</text>
          </svg>
          <div class="admin-stats__legend">${legendHtml}</div>
        </div>
      </div>
    `;
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
      return `
        <div class="admin-stats__issue-row">
          <div class="admin-stats__issue-label">
            <span class="material-icons" style="font-size:16px;color:${i.color}">${i.icon}</span>
            <span>${escapeHtml(i.label)}</span>
          </div>
          <div class="admin-stats__issue-bar-wrap">
            <div class="admin-stats__issue-bar" style="width:${pct}%;background:${i.color}"></div>
          </div>
          <div class="admin-stats__issue-count">${count}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="admin-stats__section">
        <h3 class="admin-stats__section-title">
          <span class="material-icons">bug_report</span>
          ${escapeHtml(t('statistics.issueBreakdown'))}
          <span class="admin-stats__badge badge--neutral">${total} ${escapeHtml(t('statistics.totalIssues'))}</span>
        </h3>
        ${barsHtml}
      </div>
    `;
  }

  // ─── Activity Heatmap (90 days, GitHub-style) ───
  _renderActivityHeatmap(content, heatmapData, t) {
    // Group by date (sum across users)
    const dateMap = new Map();
    for (const entry of heatmapData) {
      dateMap.set(entry.date, (dateMap.get(entry.date) || 0) + entry.count);
    }

    // Generate last 90 days
    const today = new Date();
    const days = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: dateMap.get(key) || 0, dayOfWeek: d.getDay() });
    }

    const maxCount = Math.max(...days.map(d => d.count), 1);

    // Color scale (5 levels)
    const getColor = (count) => {
      if (count === 0) return 'var(--heatmap-0, #ebedf0)';
      const intensity = count / maxCount;
      if (intensity <= 0.25) return 'var(--heatmap-1, #9be9a8)';
      if (intensity <= 0.5) return 'var(--heatmap-2, #40c463)';
      if (intensity <= 0.75) return 'var(--heatmap-3, #30a14e)';
      return 'var(--heatmap-4, #216e39)';
    };

    const cellsHtml = days.map(d =>
      `<div class="admin-stats__heatmap-cell" style="background:${getColor(d.count)}" title="${escapeHtml(d.date)}: ${d.count}"></div>`
    ).join('');

    content.insertAdjacentHTML('beforeend', `
      <div class="admin-stats__section">
        <h3 class="admin-stats__section-title">
          <span class="material-icons">calendar_month</span>
          ${escapeHtml(t('statistics.activityHeatmap'))}
        </h3>
        <div class="admin-stats__heatmap">
          ${cellsHtml}
        </div>
        <div class="admin-stats__heatmap-legend">
          <span>${escapeHtml(t('statistics.less'))}</span>
          <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-0, #ebedf0)"></div>
          <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-1, #9be9a8)"></div>
          <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-2, #40c463)"></div>
          <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-3, #30a14e)"></div>
          <div class="admin-stats__heatmap-cell" style="background:var(--heatmap-4, #216e39)"></div>
          <span>${escapeHtml(t('statistics.more'))}</span>
        </div>
      </div>
    `);
  }

  // ─── Daily Activity Chart (existing, preserved) ───
  _renderDailyChart(content, daily, t) {
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
          <span class="material-icons">bar_chart</span>
          ${escapeHtml(t('statistics.dailyActivity'))}
        </h3>
        <div class="admin-stats__chart">${barsHtml}</div>
      </div>
    `);
  }

  // ─── Per-user workload table (enhanced) ───
  _renderPerUserTable(content, perUser, t) {
    const userRows = perUser.map(u => {
      const lastActive = u.lastActive
        ? new Date(u.lastActive).toLocaleDateString()
        : '--';
      const accuracy = u.avgAccuracy != null
        ? `${(u.avgAccuracy * 100).toFixed(1)} cm`
        : '--';
      const npd = u.nodesPerDay != null
        ? u.nodesPerDay.toFixed(1)
        : '--';
      const activeDays = u.activeDays ?? '--';

      return `
        <tr>
          <td>${escapeHtml(u.user)}</td>
          <td>${u.sketchesCreated}</td>
          <td>${u.nodesCreated}</td>
          <td>${u.nodesMeasured}</td>
          <td>${accuracy}</td>
          <td>${npd}</td>
          <td>${activeDays}</td>
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
                <th>${escapeHtml(t('statistics.avgAccuracy'))}</th>
                <th>${escapeHtml(t('statistics.nodesPerDay'))}</th>
                <th>${escapeHtml(t('statistics.activeDays'))}</th>
                <th>${escapeHtml(t('statistics.lastActive'))}</th>
              </tr>
            </thead>
            <tbody>${userRows}</tbody>
          </table>
        </div>
      </div>
    `);
  }

  // ─── Per-project breakdown (existing, preserved) ───
  _renderPerProjectTable(content, perProject, t) {
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
}
