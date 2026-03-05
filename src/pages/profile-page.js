/**
 * User Profile Page (#/profile)
 *
 * Shows user info, stats, streak badges, and enabled feature flags.
 */

let profileEl = null;

/**
 * Render the profile page.
 */
export function renderProfilePage() {
  const mainEl = document.getElementById('mainEl') || document.querySelector('main');
  const t = window.t || ((k) => k);
  const esc = window.escapeHtml || ((s) => s);

  // Hide canvas, show profile
  const canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) canvasContainer.style.display = 'none';

  if (!profileEl) {
    profileEl = document.createElement('div');
    profileEl.id = 'profilePage';
    profileEl.className = 'page-panel';
    if (mainEl) mainEl.appendChild(profileEl);
    else document.body.appendChild(profileEl);
  }

  profileEl.style.display = 'flex';

  // Gather data
  const authState = window.authGuard?.getAuthState?.() || {};
  const userName = authState.name || authState.email || '--';
  const userEmail = authState.email || '--';
  const userRole = authState.role || 'user';
  const userOrg = authState.organizationName || '--';

  // Streak
  const streak = parseInt(localStorage.getItem('cockpit_streak') || '0', 10);
  let streakBadge = '';
  if (streak >= 30) streakBadge = t('profile.fieldVeteran');
  else if (streak >= 7) streakBadge = t('profile.reliable');
  else if (streak >= 3) streakBadge = t('profile.consistent');

  // Count from local sketches
  let totalNodes = 0;
  let totalEdges = 0;
  let totalSketches = 0;
  try {
    const lib = JSON.parse(localStorage.getItem('sketchLibrary') || '[]');
    totalSketches = lib.length;
    for (const sketch of lib) {
      totalNodes += (sketch.nodes || []).length;
      totalEdges += (sketch.edges || []).length;
    }
  } catch (_) { /* ignore */ }

  // Feature flags
  const features = authState.features || [];
  const featureList = Array.isArray(features) && features.length > 0
    ? features.map(f => `<li>${esc(f)}</li>`).join('')
    : `<li style="color:var(--color-text-muted)">--</li>`;

  profileEl.innerHTML = `
    <div class="page-panel__header">
      <button class="page-panel__back" id="profileBackBtn">
        <span class="material-icons">arrow_back</span>
      </button>
      <h2>${t('profile.title')}</h2>
    </div>
    <div class="page-panel__body">
      <div class="profile-card">
        <div class="profile-card__avatar">
          <span class="material-icons">person</span>
        </div>
        <div class="profile-card__name">${esc(userName)}</div>
        <div class="profile-card__email">${esc(userEmail)}</div>
        <div class="profile-card__role">${t('profile.role')}: ${esc(userRole)}</div>
        <div class="profile-card__org">${t('profile.org')}: ${esc(userOrg)}</div>
      </div>

      ${streakBadge ? `
        <div class="profile-streak">
          <span class="material-icons">local_fire_department</span>
          <span>${streak} ${t('cockpit.days')} — ${streakBadge}</span>
        </div>
      ` : ''}

      <div class="profile-stats">
        <div class="profile-stat">
          <div class="profile-stat__value">${totalSketches}</div>
          <div class="profile-stat__label">${t('profile.totalSketches')}</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat__value">${totalNodes}</div>
          <div class="profile-stat__label">${t('profile.totalNodes')}</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat__value">${totalEdges}</div>
          <div class="profile-stat__label">${t('profile.totalEdges')}</div>
        </div>
      </div>

      <div class="profile-features">
        <h3>${t('profile.enabledFeatures')}</h3>
        <ul>${featureList}</ul>
      </div>
    </div>
  `;

  // Back button
  document.getElementById('profileBackBtn')?.addEventListener('click', () => {
    hideProfilePage();
    window.location.hash = '#/';
  });
}

/**
 * Hide the profile page.
 */
export function hideProfilePage() {
  if (profileEl) profileEl.style.display = 'none';
  const canvasContainer = document.getElementById('canvasContainer');
  if (canvasContainer) canvasContainer.style.display = '';
}
