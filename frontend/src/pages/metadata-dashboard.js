/**
 * Metadata Statistics Dashboard (#/metadata)
 *
 * Admin-only dashboard showing platform-wide metadata:
 * - Tab 1 (Overview): counts, growth chart, org breakdown, user activity, storage, features
 * - Tab 2 (Database Health): data quality, sketch sizes, engagement, locks, orphans
 */

let dashEl = null;
let _data = null;
let _activeTab = 'overview';

function esc(s) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtNum(n) {
  return typeof n === 'number' ? n.toLocaleString() : '--';
}

/** SVG donut arc path */
function donutArc(cx, cy, r, startAngle, endAngle) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** SVG bar chart (vertical bars) */
function renderBarChart(data, { width = 500, height = 180, barColor = 'var(--color-accent, #2563eb)', labelKey = 'label', valueKey = 'value' } = {}) {
  if (!data.length) return '<p style="color:var(--color-text-muted)">No data</p>';
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const barW = Math.max(8, Math.min(32, (width - 40) / data.length - 4));
  const chartH = height - 30;

  let bars = '';
  data.forEach((d, i) => {
    const bh = (d[valueKey] / max) * chartH;
    const x = 30 + i * (barW + 4);
    const y = chartH - bh;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${barColor}" rx="2"/>`;
    // Label every Nth item to avoid crowding
    const step = Math.max(1, Math.floor(data.length / 12));
    if (i % step === 0) {
      bars += `<text x="${x + barW / 2}" y="${chartH + 14}" text-anchor="middle" font-size="9" fill="var(--color-text-muted)">${esc(d[labelKey])}</text>`;
    }
    // Value on top
    if (d[valueKey] > 0) {
      bars += `<text x="${x + barW / 2}" y="${y - 3}" text-anchor="middle" font-size="8" fill="var(--color-text-muted)">${d[valueKey]}</text>`;
    }
  });

  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px;height:auto">
    <line x1="30" y1="0" x2="30" y2="${chartH}" stroke="var(--color-border)" stroke-width="1"/>
    <line x1="30" y1="${chartH}" x2="${width}" y2="${chartH}" stroke="var(--color-border)" stroke-width="1"/>
    ${bars}
  </svg>`;
}

/** SVG donut chart */
function renderDonutChart(segments, { size = 160, strokeWidth = 24, centerLabel = '' } = {}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--color-border)" stroke-width="${strokeWidth}"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="14" fill="var(--color-text-muted)">0%</text></svg>`;

  let angle = 0;
  let arcs = '';
  for (const seg of segments) {
    const sweep = (seg.value / total) * 360;
    if (sweep > 0.5) {
      const end = Math.min(angle + sweep, angle + 359.9);
      arcs += `<path d="${donutArc(cx, cy, r, angle, end)}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
    }
    angle += sweep;
  }

  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--color-border)" stroke-width="${strokeWidth}" opacity="0.2"/>
    ${arcs}
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="16" font-weight="700" fill="var(--color-text)">${esc(centerLabel)}</text>
  </svg>`;
}

/** Horizontal stacked bar */
function renderHorizontalBar(items, { width = 400, barHeight = 28 } = {}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return '<p style="color:var(--color-text-muted)">No data</p>';

  let x = 0;
  let rects = '';
  for (const item of items) {
    const w = (item.value / total) * width;
    if (w > 1) {
      rects += `<rect x="${x}" y="0" width="${w}" height="${barHeight}" fill="${item.color}" rx="3"/>`;
      if (w > 30) {
        rects += `<text x="${x + w / 2}" y="${barHeight / 2 + 4}" text-anchor="middle" font-size="10" fill="#fff" font-weight="600">${item.value}</text>`;
      }
    }
    x += w;
  }

  const legend = items.map(i => `<span style="display:inline-flex;align-items:center;gap:4px;margin-inline-end:12px"><span style="width:10px;height:10px;border-radius:2px;background:${i.color};display:inline-block"></span>${esc(i.label)}</span>`).join('');

  return `<svg viewBox="0 0 ${width} ${barHeight}" style="width:100%;max-width:${width}px;height:${barHeight}px;border-radius:6px;overflow:hidden">${rects}</svg>
    <div style="margin-top:6px;font-size:0.75rem;color:var(--color-text-muted)">${legend}</div>`;
}

export async function renderMetadataDashboard() {
  const t = window.t || ((k) => k);
  const canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) canvasContainer.style.display = 'none';

  const mainEl = document.getElementById('mainEl') || document.querySelector('main');
  if (!dashEl) {
    dashEl = document.createElement('div');
    dashEl.id = 'metadataDashboard';
    dashEl.className = 'page-panel';
    if (mainEl) mainEl.appendChild(dashEl);
    else document.body.appendChild(dashEl);
  }
  dashEl.style.display = 'flex';
  _activeTab = 'overview';

  dashEl.innerHTML = `
    <div class="page-panel__header">
      <button class="page-panel__back" id="metaBackBtn">
        <span class="material-icons">arrow_back</span>
      </button>
      <h2>${t('metadata.title')}</h2>
      <div style="flex:1"></div>
      <button class="btn btn-ghost" id="metaRefreshBtn" title="${t('metadata.refresh')}">
        <span class="material-icons">refresh</span>
      </button>
    </div>
    <div class="meta-tabs" id="metaTabs">
      <button class="meta-tab active" data-tab="overview">${t('metadata.overview')}</button>
      <button class="meta-tab" data-tab="dbhealth">${t('metadata.dbHealth')}</button>
    </div>
    <div class="page-panel__body" id="metaBody">
      <div class="page-loading">Loading...</div>
    </div>
  `;

  dashEl.querySelector('#metaBackBtn').addEventListener('click', () => {
    hideMetadataDashboard();
    window.location.hash = '#/';
  });

  dashEl.querySelector('#metaRefreshBtn').addEventListener('click', () => loadData());

  dashEl.querySelector('#metaTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    _activeTab = btn.dataset.tab;
    dashEl.querySelectorAll('.meta-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderActiveTab();
  });

  await loadData();
}

async function loadData() {
  const body = dashEl?.querySelector('#metaBody');
  if (!body) return;
  body.innerHTML = '<div class="page-loading">Loading...</div>';

  try {
    const resp = await fetch('/api/stats/metadata', { credentials: 'include' });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    _data = await resp.json();
    renderActiveTab();
  } catch (err) {
    body.innerHTML = `<div class="page-error">${esc(err.message)}</div>`;
  }
}

function renderActiveTab() {
  const body = dashEl?.querySelector('#metaBody');
  if (!body || !_data) return;

  if (_activeTab === 'dbhealth') {
    renderDbHealth(body);
  } else {
    renderOverview(body);
  }
}

// ─── Tab 1: Overview ───

function renderOverview(body) {
  const t = window.t || ((k) => k);
  const c = _data.counts;
  const growth = _data.growth || [];
  const orgs = _data.orgBreakdown || [];
  const users = _data.userActivity || [];
  const storage = _data.storage || {};
  const features = _data.featureAdoption || [];

  // Summary cards
  const cards = [
    { icon: 'business', label: t('metadata.organizations'), value: fmtNum(c.organizations) },
    { icon: 'people', label: t('metadata.users'), value: fmtNum(c.users) },
    { icon: 'folder', label: t('metadata.projects'), value: fmtNum(c.projects) },
    { icon: 'draw', label: t('metadata.sketches'), value: fmtNum(c.sketches) },
    { icon: 'radio_button_checked', label: t('metadata.totalNodes'), value: fmtNum(c.totalNodes) },
    { icon: 'timeline', label: t('metadata.totalEdges'), value: fmtNum(c.totalEdges) },
  ];

  const growthData = growth.map(g => ({
    label: g.month.slice(5), // MM
    value: g.sketches,
  }));

  const nodeGrowthData = growth.map(g => ({
    label: g.month.slice(5),
    value: g.nodes,
  }));

  body.innerHTML = `
    <div class="meta-cards">
      ${cards.map(c => `
        <div class="meta-card">
          <span class="material-icons meta-card__icon">${c.icon}</span>
          <div class="meta-card__value">${c.value}</div>
          <div class="meta-card__label">${esc(c.label)}</div>
        </div>
      `).join('')}
    </div>

    <div class="meta-section">
      <h3>${t('metadata.growthSketches')}</h3>
      ${renderBarChart(growthData, { barColor: 'var(--color-accent, #2563eb)' })}
    </div>

    <div class="meta-section">
      <h3>${t('metadata.growthNodes')}</h3>
      ${renderBarChart(nodeGrowthData, { barColor: '#10b981' })}
    </div>

    ${orgs.length > 1 ? `
    <div class="meta-section">
      <h3>${t('metadata.orgBreakdown')}</h3>
      <table class="stats-table">
        <thead><tr>
          <th>${t('metadata.organization')}</th>
          <th>${t('metadata.users')}</th>
          <th>${t('metadata.sketches')}</th>
          <th>${t('metadata.totalNodes')}</th>
        </tr></thead>
        <tbody>
          ${orgs.map(o => `<tr>
            <td>${esc(o.orgName || '--')}</td>
            <td>${fmtNum(o.userCount)}</td>
            <td>${fmtNum(o.sketchCount)}</td>
            <td>${fmtNum(o.nodeCount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="meta-section">
      <h3>${t('metadata.userActivity')}</h3>
      <div style="overflow-x:auto">
      <table class="stats-table">
        <thead><tr>
          <th>${t('metadata.user')}</th>
          <th>${t('metadata.role')}</th>
          <th>${t('metadata.sketches')}</th>
          <th>${t('metadata.totalNodes')}</th>
          <th>${t('metadata.lastActive')}</th>
        </tr></thead>
        <tbody>
          ${users.slice(0, 50).map(u => `<tr>
            <td>${esc(u.username || u.email || u.userId)}</td>
            <td><span class="meta-role-badge meta-role-badge--${esc(u.role)}">${esc(u.role)}</span></td>
            <td>${fmtNum(u.sketchCount)}</td>
            <td>${fmtNum(u.nodeCount)}</td>
            <td>${u.lastActive ? new Date(u.lastActive).toLocaleDateString() : '--'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>

    <div class="meta-section">
      <h3>${t('metadata.storageMetrics')}</h3>
      <div class="meta-cards meta-cards--sm">
        <div class="meta-card">
          <div class="meta-card__value">${fmtNum(storage.avgNodesPerSketch)}</div>
          <div class="meta-card__label">${t('metadata.avgNodesPerSketch')}</div>
        </div>
        <div class="meta-card">
          <div class="meta-card__value">${fmtNum(storage.avgEdgesPerSketch)}</div>
          <div class="meta-card__label">${t('metadata.avgEdgesPerSketch')}</div>
        </div>
      </div>
      <h4>${t('metadata.largestSketches')}</h4>
      <table class="stats-table">
        <thead><tr><th>#</th><th>${t('metadata.name')}</th><th>${t('metadata.totalNodes')}</th><th>${t('metadata.totalEdges')}</th></tr></thead>
        <tbody>
          ${(storage.largestSketches || []).map((s, i) => `<tr>
            <td>${i + 1}</td>
            <td>${esc(s.name)}</td>
            <td>${fmtNum(s.nodeCount)}</td>
            <td>${fmtNum(s.edgeCount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    ${features.length > 0 ? `
    <div class="meta-section">
      <h3>${t('metadata.featureAdoption')}</h3>
      ${renderBarChart(features.map(f => ({ label: f.feature.replace(/_/g, ' '), value: f.enabledCount })), { barColor: '#8b5cf6', width: 400, height: 140 })}
    </div>` : ''}
  `;
}

// ─── Tab 2: Database Health ───

function renderDbHealth(body) {
  const t = window.t || ((k) => k);
  const c = _data.counts;
  const dq = _data.dataQuality || {};
  const sd = _data.sizeDistribution || {};
  const eng = _data.engagement || {};
  const orphans = _data.orphanedData || {};
  const locks = _data.locks || [];

  // Data quality donut
  const qualityDonut = renderDonutChart([
    { value: dq.pctWithCoords, color: '#10b981', label: t('metadata.withCoords') },
    { value: 100 - dq.pctWithCoords, color: 'var(--color-border)', label: t('metadata.withoutCoords') },
  ], { centerLabel: `${dq.pctWithCoords}%` });

  // Size distribution bar
  const sizeItems = [
    { label: `0-5 (${sd.tiny || 0})`, value: sd.tiny || 0, color: '#10b981' },
    { label: `6-20 (${sd.small || 0})`, value: sd.small || 0, color: '#3b82f6' },
    { label: `21-50 (${sd.medium || 0})`, value: sd.medium || 0, color: '#f59e0b' },
    { label: `51-200 (${sd.large || 0})`, value: sd.large || 0, color: '#f97316' },
    { label: `200+ (${sd.huge || 0})`, value: sd.huge || 0, color: '#ef4444' },
  ];

  body.innerHTML = `
    <div class="meta-section">
      <h3>${t('metadata.engagement')}</h3>
      <div class="meta-cards">
        <div class="meta-card">
          <span class="material-icons meta-card__icon" style="color:#10b981">today</span>
          <div class="meta-card__value">${fmtNum(eng.dau)}</div>
          <div class="meta-card__label">DAU</div>
        </div>
        <div class="meta-card">
          <span class="material-icons meta-card__icon" style="color:#3b82f6">date_range</span>
          <div class="meta-card__value">${fmtNum(eng.wau)}</div>
          <div class="meta-card__label">WAU</div>
        </div>
        <div class="meta-card">
          <span class="material-icons meta-card__icon" style="color:#8b5cf6">calendar_month</span>
          <div class="meta-card__value">${fmtNum(eng.mau)}</div>
          <div class="meta-card__label">MAU</div>
        </div>
        <div class="meta-card">
          <span class="material-icons meta-card__icon" style="color:#f59e0b">key</span>
          <div class="meta-card__value">${fmtNum(c.activeSessions)}</div>
          <div class="meta-card__label">${t('metadata.activeSessions')}</div>
        </div>
      </div>
    </div>

    <div class="meta-section">
      <h3>${t('metadata.dataQuality')}</h3>
      <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center">
        <div style="text-align:center">
          ${qualityDonut}
          <div style="font-size:0.8rem;color:var(--color-text-muted);margin-top:4px">${t('metadata.coordCoverage')}</div>
        </div>
        <div class="meta-cards meta-cards--sm" style="flex:1">
          <div class="meta-card">
            <div class="meta-card__value">${dq.pctWithCoords}%</div>
            <div class="meta-card__label">${t('metadata.withCoords')}</div>
          </div>
          <div class="meta-card">
            <div class="meta-card__value">${dq.pctWithMeasurements}%</div>
            <div class="meta-card__label">${t('metadata.withMeasurements')}</div>
          </div>
          <div class="meta-card">
            <div class="meta-card__value">${dq.pctWithMaterial}%</div>
            <div class="meta-card__label">${t('metadata.withMaterial')}</div>
          </div>
          <div class="meta-card">
            <div class="meta-card__value">${fmtNum(dq.issueNodeCount)}</div>
            <div class="meta-card__label">${t('metadata.issueNodes')}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="meta-section">
      <h3>${t('metadata.sketchSizes')}</h3>
      <p style="font-size:0.8rem;color:var(--color-text-muted);margin-bottom:8px">${t('metadata.sketchSizesDesc')}</p>
      ${renderHorizontalBar(sizeItems, { width: 500, barHeight: 32 })}
    </div>

    <div class="meta-section">
      <h3>${t('metadata.orphanedData')}</h3>
      <div class="meta-cards meta-cards--sm">
        <div class="meta-card ${orphans.sketchesWithoutProject > 0 ? 'meta-card--warn' : ''}">
          <span class="material-icons meta-card__icon">link_off</span>
          <div class="meta-card__value">${fmtNum(orphans.sketchesWithoutProject)}</div>
          <div class="meta-card__label">${t('metadata.sketchesNoProject')}</div>
        </div>
        <div class="meta-card ${orphans.usersWithoutOrg > 0 ? 'meta-card--warn' : ''}">
          <span class="material-icons meta-card__icon">person_off</span>
          <div class="meta-card__value">${fmtNum(orphans.usersWithoutOrg)}</div>
          <div class="meta-card__label">${t('metadata.usersNoOrg')}</div>
        </div>
      </div>
    </div>

    <div class="meta-section">
      <h3>${t('metadata.activeLocks')}</h3>
      ${locks.length === 0 ? `<p style="color:var(--color-text-muted)">${t('metadata.noActiveLocks')}</p>` : `
      <table class="stats-table">
        <thead><tr>
          <th>${t('metadata.sketch')}</th>
          <th>${t('metadata.lockedBy')}</th>
          <th>${t('metadata.expiresAt')}</th>
        </tr></thead>
        <tbody>
          ${locks.map(l => `<tr>
            <td>${esc(l.sketchName)}</td>
            <td>${esc(l.lockedBy)}</td>
            <td>${new Date(l.expiresAt).toLocaleString()}</td>
          </tr>`).join('')}
        </tbody>
      </table>`}
    </div>

    <div class="meta-section">
      <h3>${t('metadata.tableCounts')}</h3>
      <table class="stats-table">
        <thead><tr><th>${t('metadata.table')}</th><th>${t('metadata.rows')}</th></tr></thead>
        <tbody>
          <tr><td>organizations</td><td>${fmtNum(c.organizations)}</td></tr>
          <tr><td>users</td><td>${fmtNum(c.users)}</td></tr>
          <tr><td>projects</td><td>${fmtNum(c.projects)}</td></tr>
          <tr><td>sketches</td><td>${fmtNum(c.sketches)}</td></tr>
          <tr><td>user_features</td><td>${fmtNum(c.features)}</td></tr>
          <tr><td>sessions</td><td>${fmtNum(c.activeSessions)}</td></tr>
        </tbody>
        <tfoot><tr><td><strong>Total</strong></td><td><strong>${fmtNum(c.organizations + c.users + c.projects + c.sketches + c.features + c.activeSessions)}</strong></td></tr></tfoot>
      </table>
    </div>
  `;
}

export function hideMetadataDashboard() {
  if (dashEl) dashEl.style.display = 'none';
  const canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) canvasContainer.style.display = '';
}
