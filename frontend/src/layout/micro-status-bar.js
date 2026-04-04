/**
 * Micro Status Bar — compact 32px strip below header.
 * Shows: GPS fix | Sync status | Offline chip | Health % | Issue count | Session timer
 * Tapping any item opens the corresponding sidebar tab.
 */

import './micro-status-bar.css';
import { drainSyncQueue } from '../db.js';

let barEl = null;
let updateInterval = null;

// ─── Offline chip state ────────────────────────────────────────────
let _offlineChipOnline = null;   // last known online state (null = uninitialised)
let _offlineChipBound = false;   // event listeners attached?

/**
 * Count pending items in the IndexedDB syncQueue.
 * Returns 0 on any error (e.g. quota, blocked).
 * @returns {Promise<number>}
 */
async function _countSyncQueue() {
  try {
    const items = await drainSyncQueue();
    return items.length;
  } catch {
    return 0;
  }
}

/**
 * Update the offline-status chip and emit toast on state transitions.
 */
async function updateOfflineChip() {
  const chipEl = document.getElementById('msbOfflineChip');
  const chipIconEl = document.getElementById('msbOfflineIcon');
  const chipLabelEl = document.getElementById('msbOfflineLabel');
  if (!chipEl || !chipIconEl || !chipLabelEl) return;

  const isOnline = navigator.onLine;
  const pendingCount = isOnline ? await _countSyncQueue() : await _countSyncQueue();

  // Determine chip state
  let state;
  if (!isOnline) {
    state = 'offline';
  } else if (pendingCount > 0) {
    state = 'pending';
  } else {
    state = 'synced';
  }

  // Update DOM
  chipEl.dataset.offlineState = state;
  chipEl.className = `msb-item msb-offline-chip msb-offline-chip--${state}`;

  switch (state) {
    case 'offline':
      chipIconEl.textContent = 'cloud_off';
      chipLabelEl.textContent = 'Offline';
      break;
    case 'pending':
      chipIconEl.textContent = 'cloud_upload';
      chipLabelEl.textContent = `${pendingCount} pending`;
      break;
    case 'synced':
    default:
      chipIconEl.textContent = 'cloud_done';
      chipLabelEl.textContent = 'Synced';
      break;
  }

  // Toast on transition (only when previous state is known)
  if (_offlineChipOnline !== null && _offlineChipOnline !== isOnline) {
    const t = window.t || ((k) => k);
    if (!isOnline) {
      const msg = t('offline.wentOffline') ||
        `Working offline${pendingCount > 0 ? ` — ${pendingCount} changes will sync when connected` : ''}`;
      window.showToast?.(msg, 'warning', 4000);
    } else {
      const msg = pendingCount > 0
        ? (t('offline.backOnlinePending') || `Back online — syncing ${pendingCount} pending changes`)
        : (t('offline.backOnline') || 'Back online — all changes synced');
      window.showToast?.(msg, 'success', 3000);
    }
  }

  _offlineChipOnline = isOnline;
}

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
      <span class="msb-gps-accuracy" id="msbGpsAccuracy" style="display:none"></span>
    </div>
    <div class="msb-sep"></div>
    <div class="msb-item msb-offline-chip msb-offline-chip--synced" id="msbOfflineChip" data-sidebar-tab="status" title="Connection &amp; Sync">
      <span class="material-icons" id="msbOfflineIcon">cloud_done</span>
      <span id="msbOfflineLabel">${t('cockpit.synced') || 'Synced'}</span>
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

  // ─── Offline chip: native online/offline events ─────────────────
  if (!_offlineChipBound) {
    window.addEventListener('online',  _onOnlineEvent);
    window.addEventListener('offline', _onOfflineEvent);
    _offlineChipBound = true;
  }
  // Run once to set initial state without transition toast
  _offlineChipOnline = navigator.onLine;
  updateOfflineChip();

  // Use a slower fallback interval for sync/health/session (no events available)
  updateInterval = setInterval(() => {
    updateSync();
    updateHealth();
    updateSession();
    updateOfflineChip(); // poll syncQueue periodically even without events
  }, 3000);

  // Initial full update
  updateStatusBar();

  // Re-translate on language change
  document.addEventListener('appLanguageChanged', () => {
    updateSync();
  });
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
  const accuracyBadge = document.getElementById('msbGpsAccuracy');
  if (!dot || !label) return;

  const pos = gnss.getPosition?.();
  // gnssState exposes connectionState as a direct property; fall back to getConnectionInfo()
  const connInfo = gnss.getConnectionInfo?.() || {};
  const isConnected = connInfo.isConnected || gnss.connectionState === 'connected';
  const connType = connInfo.type || gnss.connectionType;

  dot.className = 'msb-gps-dot';

  if (!isConnected || !pos || !pos.isValid) {
    label.textContent = 'GPS';
    if (accuracyBadge) accuracyBadge.style.display = 'none';
    return;
  }

  const fq = pos.fixQuality;

  if (fq === 4) { dot.classList.add('fix-4'); label.textContent = 'RTK'; }
  else if (fq === 5) { dot.classList.add('fix-5'); label.textContent = 'Float'; }
  else if (fq === 2) { dot.classList.add('fix-2'); label.textContent = 'DGPS'; }
  else if (fq === 1) { dot.classList.add('fix-1'); label.textContent = 'GPS'; }
  else { label.textContent = 'GPS'; }

  // Accuracy badge: color-coded ±Xm reading
  if (accuracyBadge) {
    const isTmm = connType === 'tmm' || connType === 'bluetooth';
    const accuracy = pos.accuracy ?? (pos.hdop ? pos.hdop * 3 : null);

    if (isTmm) {
      accuracyBadge.textContent = 'External GNSS';
      accuracyBadge.className = 'msb-gps-accuracy acc-external';
      accuracyBadge.style.display = '';
    } else if (accuracy != null && accuracy >= 0) {
      const accRounded = accuracy < 1 ? accuracy.toFixed(2) : Math.round(accuracy);
      accuracyBadge.textContent = `±${accRounded}m`;

      // Color coding: GREEN < 1m | YELLOW 1-5m | ORANGE 5-15m | RED > 15m
      accuracyBadge.className = 'msb-gps-accuracy';
      if (accuracy < 1) accuracyBadge.classList.add('acc-green');
      else if (accuracy < 5) accuracyBadge.classList.add('acc-yellow');
      else if (accuracy < 15) accuracyBadge.classList.add('acc-orange');
      else accuracyBadge.classList.add('acc-red');

      accuracyBadge.style.display = '';
    } else {
      accuracyBadge.style.display = 'none';
    }
  }
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

// ─── Online / Offline event handlers ────────────────────────────────
function _onOnlineEvent() {
  updateOfflineChip();
}
function _onOfflineEvent() {
  updateOfflineChip();
}

export function destroyMicroStatusBar() {
  if (updateInterval) clearInterval(updateInterval);
  if (_offlineChipBound) {
    window.removeEventListener('online',  _onOnlineEvent);
    window.removeEventListener('offline', _onOfflineEvent);
    _offlineChipBound = false;
  }
  _offlineChipOnline = null;
  barEl?.remove();
  barEl = null;
}
