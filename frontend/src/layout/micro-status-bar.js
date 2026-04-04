/**
 * Micro Status Bar — compact 32px strip below header.
 * Shows: GPS fix | Sync status | Offline chip | Health % | Issue count | Session timer
 * Tapping the GPS chip expands a diagnostic panel (satellite count, HDOP, fix type, timestamp).
 * Tapping other items opens the corresponding sidebar tab.
 *
 * GPS accuracy traffic-light thresholds (CEO R&D spec):
 *   🟢 Green  : accuracy ≤ 3m   (sub-metre / RTK quality)
 *   🟡 Amber  : accuracy 3–15m  (phone GPS, usable with caution)
 *   🔴 Red    : accuracy > 15m  (unreliable — warn user)
 */

import './micro-status-bar.css';
import { drainSyncQueue } from '../db.js';

let barEl = null;
let updateInterval = null;

/** Whether the GPS diagnostic expand-panel is open */
let _gpsExpanded = false;

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

  let badgeEl = document.getElementById('msbOfflineBadge');
  if (pendingCount > 0) {
    if (!badgeEl) {
      badgeEl = document.createElement('span');
      badgeEl.id = 'msbOfflineBadge';
      badgeEl.className = 'msb-sync-badge';
      chipIconEl.parentNode.appendChild(badgeEl);
    }
    badgeEl.textContent = pendingCount;
  } else {
    if (badgeEl) badgeEl.remove();
  }

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

/**
 * Map GNSS fixQuality integer → human-readable label.
 * Mirrors fix labels used in gnss-marker.js.
 */
const FIX_TYPE_LABELS = {
  0: 'No Fix',
  1: 'Autonomous GPS',
  2: 'DGPS',
  4: 'RTK Fixed',
  5: 'RTK Float',
};

/**
 * Return the traffic-light CSS modifier for a given accuracy value (metres).
 * CEO R&D spec: ≤3m = green, 3–15m = amber, >15m = red.
 * @param {number|null} accuracy
 * @returns {'green'|'amber'|'red'|'none'}
 */
function _gpsTrafficLight(accuracy) {
  if (accuracy == null || accuracy < 0) return 'none';
  if (accuracy <= 3)  return 'green';
  if (accuracy <= 15) return 'amber';
  return 'red';
}

/**
 * Toggle the GPS diagnostic expand-panel and refresh its content.
 */
function _toggleGpsExpand() {
  const panel = document.getElementById('msbGpsExpand');
  if (!panel) return;

  _gpsExpanded = !_gpsExpanded;
  panel.style.display = _gpsExpanded ? '' : 'none';

  if (_gpsExpanded) {
    _updateGpsExpandPanel();
  }
}

/**
 * Populate the GPS diagnostic expand-panel with live GNSS data.
 * Reads from window.__gnssState / window.gnssState (same source as updateGPS).
 */
function _updateGpsExpandPanel() {
  const fixTypeEl  = document.getElementById('msbExpFixType');
  const satsEl     = document.getElementById('msbExpSats');
  const hdopEl     = document.getElementById('msbExpHdop');
  const timeEl     = document.getElementById('msbExpTime');
  if (!fixTypeEl || !satsEl || !hdopEl || !timeEl) return;

  const gnss = window.__gnssState || window.gnssState;
  if (!gnss) {
    fixTypeEl.textContent = '—';
    satsEl.textContent    = '—';
    hdopEl.textContent    = '—';
    timeEl.textContent    = '—';
    return;
  }

  const pos = gnss.getPosition?.();
  if (!pos || !pos.isValid) {
    fixTypeEl.textContent = 'No Fix';
    satsEl.textContent    = '—';
    hdopEl.textContent    = '—';
    timeEl.textContent    = '—';
    return;
  }

  // Fix type label
  fixTypeEl.textContent = FIX_TYPE_LABELS[pos.fixQuality] ?? `Fix ${pos.fixQuality}`;

  // Satellite count (may be null for browser GPS)
  satsEl.textContent = pos.satellites != null ? String(pos.satellites) : '—';

  // HDOP
  if (pos.hdop != null) {
    hdopEl.textContent = pos.hdop.toFixed(1);
  } else if (pos.accuracy != null) {
    // Browser GPS — estimate HDOP from accuracy
    hdopEl.textContent = `~${(pos.accuracy / 3).toFixed(1)} (est.)`;
  } else {
    hdopEl.textContent = '—';
  }

  // Last update timestamp
  if (pos.timestamp) {
    const d = new Date(pos.timestamp);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    timeEl.textContent = `${hh}:${mm}:${ss}`;
  } else {
    timeEl.textContent = '—';
  }
}

export function initMicroStatusBar() {
  if (document.getElementById('microStatusBar')) return;

  const t = window.t || ((k) => k);

  barEl = document.createElement('div');
  barEl.id = 'microStatusBar';
  barEl.className = 'micro-status-bar';

  barEl.innerHTML = `
    <div class="msb-item msb-gps msb-gps-chip" id="msbGpsChip" title="GPS Status — tap for details">
      <span class="msb-gps-dot" id="msbGpsDot"></span>
      <span id="msbGpsLabel">GPS</span>
      <span class="msb-gps-accuracy" id="msbGpsAccuracy" style="display:none"></span>
    </div>
    <div class="msb-gps-expand" id="msbGpsExpand" style="display:none">
      <div class="msb-gps-expand__row"><span class="msb-gps-expand__key">Fix</span><span id="msbExpFixType">—</span></div>
      <div class="msb-gps-expand__row"><span class="msb-gps-expand__key">Sats</span><span id="msbExpSats">—</span></div>
      <div class="msb-gps-expand__row"><span class="msb-gps-expand__key">HDOP</span><span id="msbExpHdop">—</span></div>
      <div class="msb-gps-expand__row"><span class="msb-gps-expand__key">Updated</span><span id="msbExpTime">—</span></div>
    </div>
    <div class="msb-sep"></div>
    <div class="msb-item msb-offline-chip msb-offline-chip--synced" id="msbOfflineChip" data-sidebar-tab="status" title="Connection &amp; Sync">
      <div class="msb-icon-wrapper">
        <span class="material-icons" id="msbOfflineIcon">cloud_done</span>
      </div>
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

  // Wire click: GPS chip → toggle diagnostic expand panel; others → open sidebar tab
  barEl.addEventListener('click', (e) => {
    const gpsChip = e.target.closest('#msbGpsChip');
    if (gpsChip) {
      _toggleGpsExpand();
      return;
    }
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
  const chipEl = document.getElementById('msbGpsChip');
  if (!dot || !label) return;

  const pos = gnss.getPosition?.();
  // gnssState exposes connectionState as a direct property; fall back to getConnectionInfo()
  const connInfo = gnss.getConnectionInfo?.() || {};
  const isConnected = connInfo.isConnected || gnss.connectionState === 'connected';
  const connType = connInfo.type || gnss.connectionType;

  dot.className = 'msb-gps-dot';

  // Reset traffic-light classes on chip before applying new ones
  if (chipEl) {
    chipEl.classList.remove('gps-tl-green', 'gps-tl-amber', 'gps-tl-red');
  }

  if (!isConnected || !pos || !pos.isValid) {
    label.textContent = 'GPS';
    if (accuracyBadge) accuracyBadge.style.display = 'none';
    // Keep expand panel fresh
    if (_gpsExpanded) _updateGpsExpandPanel();
    return;
  }

  const fq = pos.fixQuality;

  if (fq === 4) { dot.classList.add('fix-4'); label.textContent = 'RTK'; }
  else if (fq === 5) { dot.classList.add('fix-5'); label.textContent = 'Float'; }
  else if (fq === 2) { dot.classList.add('fix-2'); label.textContent = 'DGPS'; }
  else if (fq === 1) { dot.classList.add('fix-1'); label.textContent = 'GPS'; }
  else { label.textContent = 'GPS'; }

  // Resolve accuracy value (metres) once, shared by chip + badge
  const accuracy = pos.accuracy ?? (pos.hdop ? pos.hdop * 3 : null);

  // Traffic-light color on the chip (CEO R&D spec: ≤3m green, 3–15m amber, >15m red)
  if (chipEl && accuracy != null) {
    const tl = _gpsTrafficLight(accuracy);
    if (tl !== 'none') chipEl.classList.add(`gps-tl-${tl}`);
  }

  // Accuracy badge: detailed ±Xm reading
  if (accuracyBadge) {
    const isTmm = connType === 'tmm' || connType === 'bluetooth';

    if (isTmm) {
      accuracyBadge.textContent = 'External GNSS';
      accuracyBadge.className = 'msb-gps-accuracy acc-external';
      accuracyBadge.style.display = '';
    } else if (accuracy != null && accuracy >= 0) {
      const accRounded = accuracy < 1 ? accuracy.toFixed(2) : Math.round(accuracy);
      accuracyBadge.textContent = `±${accRounded}m`;

      // Badge color mirrors traffic-light thresholds (CEO R&D spec)
      accuracyBadge.className = 'msb-gps-accuracy';
      const tl = _gpsTrafficLight(accuracy);
      if (tl === 'green')      accuracyBadge.classList.add('acc-green');
      else if (tl === 'amber') accuracyBadge.classList.add('acc-amber');
      else if (tl === 'red')   accuracyBadge.classList.add('acc-red');

      accuracyBadge.style.display = '';
    } else {
      accuracyBadge.style.display = 'none';
    }
  }

  // Keep expand panel fresh if it's open
  if (_gpsExpanded) _updateGpsExpandPanel();
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
