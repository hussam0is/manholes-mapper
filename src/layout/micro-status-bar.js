/**
 * Micro Status Bar — compact 32px strip below header.
 * Shows: GPS fix | Sync status | Health % | Issue count | Session timer
 * Tapping any item opens the corresponding sidebar tab.
 */

import './micro-status-bar.css';

let barEl = null;
let updateInterval = null;

export function initMicroStatusBar() {
  if (document.getElementById('microStatusBar')) return;

  const t = window.t || ((k) => k);

  barEl = document.createElement('div');
  barEl.id = 'microStatusBar';
  barEl.className = 'micro-status-bar';

  barEl.innerHTML = `
    <div class="msb-item msb-gps" data-sidebar-tab="status" title="GPS Status">
      <span class="msb-gps-dot" id="msbGpsDot"></span>
      <span id="msbGpsLabel">GPS</span>
    </div>
    <div class="msb-sep"></div>
    <div class="msb-item msb-sync synced" id="msbSync" data-sidebar-tab="status" title="Sync">
      <span class="material-icons" id="msbSyncIcon">cloud_done</span>
      <span id="msbSyncLabel">${t('cockpit.synced') || 'Synced'}</span>
    </div>
    <div class="msb-sep"></div>
    <div class="msb-item msb-health" data-sidebar-tab="status" title="Health">
      <span class="material-icons" style="font-size:14px">assessment</span>
      <span class="msb-health__percent high" id="msbHealthPercent">--%</span>
    </div>
    <div class="msb-sep"></div>
    <div class="msb-item msb-issues" id="msbIssues" data-sidebar-tab="status" title="Issues" style="display:none">
      <span class="material-icons">warning_amber</span>
      <span id="msbIssueCount">0</span>
    </div>
    <div class="msb-item msb-session" data-sidebar-tab="status" title="Session">
      <span class="material-icons" style="font-size:14px">timer</span>
      <span id="msbSessionTime">0:00</span>
    </div>
  `;

  // Insert after header
  const header = document.querySelector('.app-header');
  if (header && header.nextSibling) {
    header.parentNode.insertBefore(barEl, header.nextSibling);
  } else {
    document.body.prepend(barEl);
  }

  // Wire click → open sidebar tab
  barEl.addEventListener('click', (e) => {
    const item = e.target.closest('[data-sidebar-tab]');
    if (!item) return;
    const tab = item.dataset.sidebarTab;
    import('./unified-sidebar.js').then(({ switchTab, openSidebar }) => {
      switchTab(tab);
      openSidebar();
    });
  });

  // Subscribe to GNSS events for immediate GPS updates
  const gnss = window.__gnssState || window.gnssState;
  if (gnss && typeof gnss.on === 'function') {
    gnss.on('position', updateGPS);
    gnss.on('connection', updateGPS);
  }

  // Use a slower fallback interval for sync/health/session (no events available)
  updateInterval = setInterval(() => {
    updateSync();
    updateHealth();
    updateSession();
  }, 3000);

  // Initial full update
  updateStatusBar();
}

/**
 * Update all status bar indicators
 */
function updateStatusBar() {
  if (!barEl) return;

  updateGPS();
  updateSync();
  updateHealth();
  updateSession();
}

function updateGPS() {
  const gnss = window.__gnssState || window.gnssState;
  if (!gnss) return;

  const dot = document.getElementById('msbGpsDot');
  const label = document.getElementById('msbGpsLabel');
  if (!dot || !label) return;

  const pos = gnss.getPosition?.();
  const conn = gnss.getConnectionState?.();

  dot.className = 'msb-gps-dot';

  if (conn !== 'connected' || !pos || !pos.isValid) {
    label.textContent = 'GPS';
    return;
  }

  const fq = pos.fixQuality;
  if (fq === 4) { dot.classList.add('fix-4'); label.textContent = 'RTK'; }
  else if (fq === 5) { dot.classList.add('fix-5'); label.textContent = 'Float'; }
  else if (fq === 2) { dot.classList.add('fix-2'); label.textContent = 'DGPS'; }
  else if (fq === 1) { dot.classList.add('fix-1'); label.textContent = 'GPS'; }
  else { label.textContent = 'GPS'; }
}

function updateSync() {
  const syncEl = document.getElementById('msbSync');
  const iconEl = document.getElementById('msbSyncIcon');
  const labelEl = document.getElementById('msbSyncLabel');
  if (!syncEl || !iconEl || !labelEl) return;

  const t = window.t || ((k) => k);

  // Read sync state from the header sync indicator or sync service
  const headerSync = document.getElementById('headerSyncIndicator');
  const iconText = headerSync?.querySelector('.header-sync-indicator__icon')?.textContent?.trim();

  syncEl.className = 'msb-item msb-sync';

  if (iconText === 'cloud_done') {
    syncEl.classList.add('synced');
    iconEl.textContent = 'cloud_done';
    labelEl.textContent = t('cockpit.synced') || 'Synced';
  } else if (iconText === 'cloud_upload' || iconText === 'sync') {
    syncEl.classList.add('syncing');
    iconEl.textContent = 'cloud_upload';
    labelEl.textContent = t('cockpit.syncing') || 'Syncing';
  } else if (iconText === 'cloud_off') {
    syncEl.classList.add('offline');
    iconEl.textContent = 'cloud_off';
    labelEl.textContent = t('cockpit.offline') || 'Offline';
  } else {
    syncEl.classList.add('synced');
    iconEl.textContent = 'cloud_done';
    labelEl.textContent = t('cockpit.synced') || 'Synced';
  }
}

function updateHealth() {
  const percentEl = document.getElementById('msbHealthPercent');
  if (!percentEl) return;

  // Read from cockpit's completion text if available
  const cockpitText = document.getElementById('completionText');
  const origVal = cockpitText?.textContent || document.getElementById('usCompletionText')?.textContent;

  if (origVal) {
    percentEl.textContent = origVal;
    const num = parseInt(origVal);
    percentEl.className = 'msb-health__percent';
    if (num >= 70) percentEl.classList.add('high');
    else if (num >= 40) percentEl.classList.add('medium');
    else percentEl.classList.add('low');
  }

  // Issues
  const issuesEl = document.getElementById('msbIssues');
  const countEl = document.getElementById('msbIssueCount');
  const origIssues = document.getElementById('issueCount');
  if (issuesEl && countEl && origIssues) {
    const count = parseInt(origIssues.textContent) || 0;
    if (count > 0) {
      issuesEl.style.display = '';
      countEl.textContent = count;
    } else {
      issuesEl.style.display = 'none';
    }
  }
}

function updateSession() {
  const timeEl = document.getElementById('msbSessionTime');
  if (!timeEl) return;

  // Read from cockpit's session duration
  const origDuration = document.getElementById('sessionDuration');
  if (origDuration) {
    timeEl.textContent = origDuration.textContent || '0:00';
  }

  // Also sync to sidebar status panel
  const usDuration = document.getElementById('usSessionDuration');
  if (usDuration && origDuration) usDuration.textContent = origDuration.textContent || '0:00';

  const usNodes = document.getElementById('usSessionNodes');
  const origNodes = document.getElementById('sessionNodes');
  if (usNodes && origNodes) usNodes.textContent = origNodes.textContent || '0';

  const usEdges = document.getElementById('usSessionEdges');
  const origEdges = document.getElementById('sessionEdges');
  if (usEdges && origEdges) usEdges.textContent = origEdges.textContent || '0';
}

export function destroyMicroStatusBar() {
  if (updateInterval) clearInterval(updateInterval);
  barEl?.remove();
  barEl = null;
}
