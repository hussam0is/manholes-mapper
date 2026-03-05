/**
 * Accuracy Leaderboard Page (#/leaderboard)
 *
 * Shows surveyor rankings based on measurement accuracy.
 */

let boardEl = null;

/**
 * Render the leaderboard page.
 * @param {string} [projectId] - Optional project ID to filter
 */
export async function renderLeaderboardPage(projectId) {
  const t = window.t || ((k) => k);
  const esc = window.escapeHtml || ((s) => s);

  const canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) canvasContainer.style.display = 'none';

  const mainEl = document.getElementById('mainEl') || document.querySelector('main');
  if (!boardEl) {
    boardEl = document.createElement('div');
    boardEl.id = 'leaderboardPage';
    boardEl.className = 'page-panel';
    if (mainEl) mainEl.appendChild(boardEl);
    else document.body.appendChild(boardEl);
  }
  boardEl.style.display = 'flex';
  boardEl.innerHTML = `
    <div class="page-panel__header">
      <button class="page-panel__back" id="leaderboardBackBtn">
        <span class="material-icons">arrow_back</span>
      </button>
      <h2>${t('leaderboard.title')}</h2>
    </div>
    <div class="page-panel__body"><div class="page-loading">Loading...</div></div>
  `;

  document.getElementById('leaderboardBackBtn')?.addEventListener('click', () => {
    hideLeaderboardPage();
    window.location.hash = '#/';
  });

  try {
    const url = projectId
      ? `/api/stats/leaderboard?projectId=${encodeURIComponent(projectId)}`
      : '/api/stats/leaderboard';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to load leaderboard');
    const data = await resp.json();
    const leaderboard = data.leaderboard || [];

    const starIcons = (count) => {
      let html = '';
      for (let i = 0; i < 3; i++) {
        html += `<span class="material-icons" style="color:${i < count ? '#f59e0b' : '#d1d5db'};font-size:16px">star</span>`;
      }
      return html;
    };

    // Team total
    const teamNodes = leaderboard.reduce((sum, r) => sum + r.nodeCount, 0);

    const body = boardEl.querySelector('.page-panel__body');
    body.innerHTML = `
      <table class="stats-table leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${t('leaderboard.surveyor')}</th>
            <th>${t('leaderboard.nodes')}</th>
            <th>${t('leaderboard.avgAccuracy')}</th>
            <th>${t('leaderboard.stars')}</th>
          </tr>
        </thead>
        <tbody>
          ${leaderboard.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(r.user || '--')}</td>
              <td>${r.nodeCount}</td>
              <td>${r.avgAccuracy != null ? r.avgAccuracy.toFixed(3) + 'm' : '--'}</td>
              <td>${starIcons(r.stars)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>${t('leaderboard.teamTotal')}</strong></td>
            <td><strong>${teamNodes}</strong></td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    `;
  } catch (err) {
    const body = boardEl.querySelector('.page-panel__body');
    body.innerHTML = `<div class="page-error">${esc(err.message)}</div>`;
  }
}

export function hideLeaderboardPage() {
  if (boardEl) boardEl.style.display = 'none';
  const canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) canvasContainer.style.display = '';
}
