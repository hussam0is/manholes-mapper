/**
 * Project Stats Page (#/project/:id/stats)
 *
 * Dashboard showing total nodes/edges/km, overall completion %, and per-sketch table.
 */

let statsEl = null;

/**
 * Render the project stats page.
 * @param {string} projectId - The project UUID
 */
export async function renderProjectStatsPage(projectId) {
  const t = window.t || ((k) => k);
  const esc = window.escapeHtml || ((s) => s);

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
    let totalIssues = 0;
    const perSketch = [];

    for (const sketch of sketches) {
      const sNodes = sketch.nodes || [];
      const sEdges = sketch.edges || [];
      const nodeCount = sNodes.length;
      const edgeCount = sEdges.length;

      // Compute km from survey coords
      let km = 0;
      for (const edge of sEdges) {
        const tailNode = sNodes.find(n => String(n.id) === String(edge.tail));
        const headNode = sNodes.find(n => String(n.id) === String(edge.head));
        if (tailNode?.surveyX != null && tailNode?.surveyY != null &&
            headNode?.surveyX != null && headNode?.surveyY != null) {
          const dx = tailNode.surveyX - headNode.surveyX;
          const dy = tailNode.surveyY - headNode.surveyY;
          km += Math.sqrt(dx * dx + dy * dy) / 1000;
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

      <h3>${t('projectStats.perSketch')}</h3>
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
