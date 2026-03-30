/**
 * Project Stats Page (#/project/:id/stats)
 *
 * Dashboard showing total nodes/edges/km, overall completion %, per-sketch table,
 * node type distribution, accuracy distribution, per-surveyor breakdown, and issue summary.
 */

let statsEl = null;

function donutArc(cx, cy, r, startAngle, endAngle) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function renderDonut(segments, { size = 140, strokeWidth = 20, centerLabel = '' } = {}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--color-border)" stroke-width="${strokeWidth}"/></svg>`;

  let angle = 0;
  let arcs = '';
  for (const seg of segments) {
    const sweep = (seg.value / total) * 360;
    if (sweep > 0.5) {
      arcs += `<path d="${donutArc(cx, cy, r, angle, Math.min(angle + sweep, angle + 359.9))}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
    }
    angle += sweep;
  }
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--color-border)" stroke-width="${strokeWidth}" opacity="0.15"/>
    ${arcs}
    ${centerLabel ? `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--color-text)">${centerLabel}</text>` : ''}
  </svg>`;
}

function renderLegend(items) {
  return items.filter(i => i.value > 0).map(i =>
    `<span style="display:inline-flex;align-items:center;gap:4px;margin-inline-end:12px;font-size:0.8rem">
      <span style="width:10px;height:10px;border-radius:2px;background:${i.color};display:inline-block"></span>
      ${i.label} (${i.value})
    </span>`
  ).join('');
}

/**
 * Render the project stats page.
 * @param {string} projectId - The project UUID
 */
export async function renderProjectStatsPage(projectId) {
  const t = window.t || ((k) => k);
  const esc = window.escapeHtml || ((s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'));

  const canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) canvasContainer.style.display = 'none';

  const mainEl = document.getElementById('mainEl') || document.querySelector('main');
  if (!statsEl) {
    statsEl = document.createElement('div');
    statsEl.id = 'projectStatsPage';
    statsEl.className = 'page-panel';
    if (mainEl) mainEl.appendChild(statsEl);
    else document.body.appendChild(statsEl);
  }
  statsEl.style.display = 'flex';
  statsEl.innerHTML = `
    <div class="page-panel__header">
      <button class="page-panel__back" id="statsBackBtn">
        <span class="material-icons">arrow_back</span>
      </button>
      <h2>${t('projectStats.title')}</h2>
    </div>
    <div class="page-panel__body"><div class="page-loading">Loading...</div></div>
  `;

  document.getElementById('statsBackBtn')?.addEventListener('click', () => {
    hideProjectStatsPage();
    window.location.hash = '#/';
  });

  try {
    const resp = await fetch(`/api/projects/${projectId}?fullSketches=true`);
    if (!resp.ok) throw new Error('Failed to load project');
    const project = await resp.json();

    const sketches = project.sketches || [];
    let totalNodes = 0;
    let totalEdges = 0;
    let totalKm = 0;
    const perSketch = [];

    // Aggregation maps
    const nodeTypeCounts = new Map();
    const accuracyBuckets = { rtk: 0, float: 0, dgps: 0, gps: 0, unknown: 0 };
    const surveyorMap = new Map();
    const issues = { missingCoords: 0, missingMeasurements: 0, longEdges: 0, negativeGradients: 0 };

    for (const sketch of sketches) {
      const sNodes = sketch.nodes || [];
      const sEdges = sketch.edges || [];
      const nodeCount = sNodes.length;
      const edgeCount = sEdges.length;

      // Build lookup for edges
      const nodeById = new Map();
      for (const n of sNodes) nodeById.set(String(n.id), n);

      // Compute km and edge issues
      let km = 0;
      for (const edge of sEdges) {
        const tailNode = nodeById.get(String(edge.tail));
        const headNode = nodeById.get(String(edge.head));
        const tailOk = tailNode?.surveyX != null && tailNode?.surveyY != null;
        const headOk = headNode?.surveyX != null && headNode?.surveyY != null;
        if (tailOk && headOk) {
          const dx = tailNode.surveyX - headNode.surveyX;
          const dy = tailNode.surveyY - headNode.surveyY;
          const distM = Math.sqrt(dx * dx + dy * dy);
          km += distM / 1000;
          if (distM > 70) issues.longEdges++;
        }
        // Negative gradient
        const tm = parseFloat(edge.tail_measurement);
        const hm = parseFloat(edge.head_measurement);
        if (!isNaN(tm) && tm > 0 && !isNaN(hm) && hm > 0 && hm > tm) {
          issues.negativeGradients++;
        }
        // Missing measurements on functional nodes
        const tailMissing = edge.tail_measurement == null || edge.tail_measurement === '';
        const headMissing = edge.head_measurement == null || edge.head_measurement === '';
        if (tailMissing || headMissing) {
          if (tailNode?.maintenanceStatus === 1 || headNode?.maintenanceStatus === 1) {
            issues.missingMeasurements++;
          }
        }
      }

      // Process nodes
      for (const node of sNodes) {
        const hasSurvey = node.surveyX != null && node.surveyY != null;
        // Node types
        const nt = node.nodeType || 'Manhole';
        nodeTypeCounts.set(nt, (nodeTypeCounts.get(nt) || 0) + 1);
        // Accuracy
        if (hasSurvey) {
          const p = node.measure_precision;
          if (p != null && p > 0) {
            if (p < 0.05) accuracyBuckets.rtk++;
            else if (p < 0.5) accuracyBuckets.float++;
            else if (p < 5) accuracyBuckets.dgps++;
            else accuracyBuckets.gps++;
          } else {
            accuracyBuckets.unknown++;
          }
        }
        // Missing coords
        if (!hasSurvey && node.type !== 'schematic' && node.nodeType !== 'Home' && !node.isForLater) {
          issues.missingCoords++;
        }
        // Surveyor stats
        const creator = node.createdBy || sketch.created_by || 'unknown';
        if (!surveyorMap.has(creator)) {
          surveyorMap.set(creator, { user: creator, nodeCount: 0, totalPrec: 0, precCount: 0 });
        }
        const su = surveyorMap.get(creator);
        if (hasSurvey) {
          su.nodeCount++;
          if (node.measure_precision > 0) {
            su.totalPrec += node.measure_precision;
            su.precCount++;
          }
        }
      }

      // Simple completion
      let completion = 0;
      if (nodeCount > 0) {
        const withCoords = sNodes.filter(n => n.surveyX != null && n.surveyY != null).length;
        completion = Math.round((withCoords / nodeCount) * 100);
      }

      totalNodes += nodeCount;
      totalEdges += edgeCount;
      totalKm += km;

      perSketch.push({
        name: sketch.name || sketch.id,
        nodes: nodeCount,
        edges: edgeCount,
        km: km.toFixed(2),
        completion
      });
    }

    // Build chart data
    const nodeTypeColors = {
      Manhole: '#3b82f6', Home: '#10b981', Drainage: '#f59e0b',
      Covered: '#8b5cf6', ForLater: '#6b7280', Issue: '#ef4444',
    };
    const nodeTypeSegments = Array.from(nodeTypeCounts.entries()).map(([type, count]) => ({
      label: type, value: count, color: nodeTypeColors[type] || '#94a3b8',
    }));

    const accSegments = [
      { label: 'RTK (<0.05m)', value: accuracyBuckets.rtk, color: '#10b981' },
      { label: 'Float (0.05-0.5m)', value: accuracyBuckets.float, color: '#3b82f6' },
      { label: 'DGPS (0.5-5m)', value: accuracyBuckets.dgps, color: '#f59e0b' },
      { label: 'GPS (>5m)', value: accuracyBuckets.gps, color: '#ef4444' },
      { label: 'Unknown', value: accuracyBuckets.unknown, color: '#94a3b8' },
    ];

    const surveyors = Array.from(surveyorMap.values())
      .map(s => {
        const avg = s.precCount > 0 ? s.totalPrec / s.precCount : null;
        let stars = 0;
        if (avg != null) {
          if (avg < 0.035) stars = 3;
          else if (avg < 0.05) stars = 2;
          else if (avg < 0.1) stars = 1;
        }
        return { ...s, avgAccuracy: avg, stars };
      })
      .sort((a, b) => b.nodeCount - a.nodeCount);

    const body = statsEl.querySelector('.page-panel__body');
    body.innerHTML = `
      <div class="stats-summary">
        <div class="stats-summary__item">
          <div class="stats-summary__value">${totalNodes}</div>
          <div class="stats-summary__label">${t('projectStats.totalNodes')}</div>
        </div>
        <div class="stats-summary__item">
          <div class="stats-summary__value">${totalEdges}</div>
          <div class="stats-summary__label">${t('projectStats.totalEdges')}</div>
        </div>
        <div class="stats-summary__item">
          <div class="stats-summary__value">${totalKm.toFixed(2)}</div>
          <div class="stats-summary__label">${t('projectStats.totalKm')}</div>
        </div>
      </div>

      <div class="meta-section" style="margin-top:20px">
        <h3>${t('projectStats.nodeTypes')}</h3>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          ${renderDonut(nodeTypeSegments, { size: 140, strokeWidth: 22, centerLabel: String(totalNodes) })}
          <div>${renderLegend(nodeTypeSegments)}</div>
        </div>
      </div>

      <div class="meta-section">
        <h3>${t('projectStats.accuracyDist')}</h3>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          ${renderDonut(accSegments, { size: 140, strokeWidth: 22 })}
          <div>${renderLegend(accSegments)}</div>
        </div>
      </div>

      <div class="meta-section">
        <h3>${t('projectStats.issueSummary')}</h3>
        <div class="meta-cards meta-cards--sm">
          <div class="meta-card ${issues.missingCoords > 0 ? 'meta-card--warn' : ''}">
            <div class="meta-card__value">${issues.missingCoords}</div>
            <div class="meta-card__label">${t('projectStats.missingCoords')}</div>
          </div>
          <div class="meta-card ${issues.missingMeasurements > 0 ? 'meta-card--warn' : ''}">
            <div class="meta-card__value">${issues.missingMeasurements}</div>
            <div class="meta-card__label">${t('projectStats.missingMeasurements')}</div>
          </div>
          <div class="meta-card ${issues.longEdges > 0 ? 'meta-card--warn' : ''}">
            <div class="meta-card__value">${issues.longEdges}</div>
            <div class="meta-card__label">${t('projectStats.longEdges')}</div>
          </div>
          <div class="meta-card ${issues.negativeGradients > 0 ? 'meta-card--warn' : ''}">
            <div class="meta-card__value">${issues.negativeGradients}</div>
            <div class="meta-card__label">${t('projectStats.negativeGradients')}</div>
          </div>
        </div>
      </div>

      ${surveyors.length > 0 ? `
      <div class="meta-section">
        <h3>${t('projectStats.perSurveyor')}</h3>
        <div style="overflow-x:auto">
        <table class="stats-table">
          <thead><tr>
            <th>${t('projectStats.surveyor')}</th>
            <th>${t('projectStats.nodesMeasured')}</th>
            <th>${t('projectStats.avgAccuracy')}</th>
            <th>${t('projectStats.stars')}</th>
          </tr></thead>
          <tbody>
            ${surveyors.map(s => `<tr>
              <td>${esc(s.user)}</td>
              <td>${s.nodeCount}</td>
              <td>${s.avgAccuracy != null ? s.avgAccuracy.toFixed(3) + 'm' : '--'}</td>
              <td>${'<span class="material-icons" style="font-size:16px;color:#f59e0b">star</span>'.repeat(s.stars)}${'<span class="material-icons" style="font-size:16px;color:var(--color-border)">star_border</span>'.repeat(3 - s.stars)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>
      </div>` : ''}

      <h3 style="margin-top:20px">${t('projectStats.perSketch')}</h3>
      <table class="stats-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>${t('projectStats.totalNodes')}</th>
            <th>${t('projectStats.totalEdges')}</th>
            <th>km</th>
            <th>${t('projectStats.completion')}</th>
          </tr>
        </thead>
        <tbody>
          ${perSketch.map(s => `
            <tr>
              <td>${esc(s.name)}</td>
              <td>${s.nodes}</td>
              <td>${s.edges}</td>
              <td>${s.km}</td>
              <td>
                <div class="stats-completion-bar">
                  <div class="stats-completion-bar__fill" style="width:${s.completion}%"></div>
                  <span>${s.completion}%</span>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    const body = statsEl.querySelector('.page-panel__body');
    body.innerHTML = `<div class="page-error">${esc(err.message)}</div>`;
  }
}

export function hideProjectStatsPage() {
  if (statsEl) statsEl.style.display = 'none';
  const canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) canvasContainer.style.display = '';
}
