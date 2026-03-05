/**
 * Intel Strip — Zone A of the Cockpit layout
 * Displays GPS status, sketch health ring, sync status, and session stats.
 */

let staleTimer = null;
let lastPositionTime = 0;

/**
 * Initialize Intel Strip event listeners
 */
export function initIntelStrip() {
  // Listen for GNSS position updates
  const gnssState = window.__gnssState;
  if (gnssState) {
    gnssState.on('position', () => {
      lastPositionTime = Date.now();
      updateGPS(gnssState);
    });
    gnssState.on('connection', () => {
      updateGPS(gnssState);
    });
  }

  // Listen for sync state changes
  if (window.menuEvents) {
    window.menuEvents.on('sync:stateChange', (state) => {
      updateSyncStatus(state);
    });
  }

  // Issue count click cycles through issues and navigates canvas
  const issuesEl = document.getElementById('healthIssues');
  if (issuesEl) {
    issuesEl.addEventListener('click', () => {
      if (window.__issueNav?.goToNextIssue) {
        window.__issueNav.goToNextIssue();
      }
    });
  }

  // Start stale check interval
  staleTimer = setInterval(checkGpsStale, 3000);
}

/**
 * Update all Intel Strip displays with current completion data
 */
export function updateIntelStrip(completion) {
  updateCompletionRing(completion);
  updateHealthStats(completion);

  // Also refresh GPS from current state
  const gnssState = window.__gnssState;
  if (gnssState) {
    updateGPS(gnssState);
  }
}

/**
 * Update GPS status display
 */
function updateGPS(gnssState) {
  const dot = document.getElementById('gpsDot');
  const label = document.getElementById('gpsLabel');
  const accuracy = document.getElementById('gpsAccuracy');
  const satCount = document.getElementById('gpsSatCount');
  const card = document.getElementById('intelGps');

  if (!dot || !label) return;

  const pos = gnssState.position;
  const connected = gnssState.connectionState === 'connected';

  // Remove stale class on fresh update
  card?.classList.remove('intel-gps__stale');

  if (!connected || !pos?.isValid) {
    dot.className = 'intel-gps__dot intel-gps__dot--no-fix';
    label.textContent = window.t?.('cockpit.noFix') || 'No Fix';
    accuracy.textContent = '--';
    satCount.textContent = '0';
    return;
  }

  // Fix quality mapping
  const fixMap = {
    4: { cls: 'rtk-fixed', label: 'RTK Fixed' },
    5: { cls: 'rtk-float', label: 'RTK Float' },
    2: { cls: 'dgps', label: 'DGPS' },
    1: { cls: 'gps', label: 'GPS' },
    0: { cls: 'no-fix', label: 'No Fix' }
  };

  const fix = fixMap[pos.fixQuality] || fixMap[0];
  dot.className = `intel-gps__dot intel-gps__dot--${fix.cls}`;

  // Add pulse for RTK Fixed
  if (pos.fixQuality === 4) {
    dot.classList.add('pulse');
  }

  label.textContent = fix.label;

  // Format accuracy
  if (pos.hdop != null) {
    const acc = pos.hdop < 1 ? `${(pos.hdop * 100).toFixed(0)}cm` : `${pos.hdop.toFixed(1)}m`;
    accuracy.textContent = acc;
  } else {
    accuracy.textContent = '--';
  }

  satCount.textContent = String(pos.satellites || 0);
}

/**
 * Check if GPS position is stale (>3s without update)
 */
function checkGpsStale() {
  if (lastPositionTime === 0) return;
  const card = document.getElementById('intelGps');
  if (!card) return;

  if (Date.now() - lastPositionTime > 3000) {
    card.classList.add('intel-gps__stale');
  }
}

/**
 * Update the completion ring visualization
 */
function updateCompletionRing(completion) {
  const fill = document.getElementById('completionFill');
  const text = document.getElementById('completionText');
  const ring = document.getElementById('completionRing');

  if (!fill || !text) return;

  const pct = completion.percentage;
  const circumference = 97.4; // 2 * PI * 15.5
  const offset = circumference - (circumference * pct / 100);

  fill.style.strokeDashoffset = String(offset);
  text.textContent = `${pct}%`;

  // Determine level
  let level = 'low';
  if (pct >= 85) level = 'complete';
  else if (pct >= 60) level = 'high';
  else if (pct >= 30) level = 'mid';

  fill.setAttribute('data-level', level);

  // Trigger complete animation
  if (pct >= 100) {
    ring?.classList.add('completion-ring--complete');
  } else {
    ring?.classList.remove('completion-ring--complete');
  }
}

/**
 * Update health stats text and issue count
 */
function updateHealthStats(completion) {
  const stats = document.getElementById('healthStats');
  const issuesEl = document.getElementById('healthIssues');
  const issueCountEl = document.getElementById('issueCount');

  if (stats) {
    const t = window.t || (k => k);
    stats.textContent = `${completion.nodeCount} ${t('cockpit.nodes') || 'nodes'} · ${completion.edgeCount} ${t('cockpit.edges') || 'edges'}`;
  }

  if (issuesEl && issueCountEl) {
    if (completion.issueCount > 0) {
      issuesEl.style.display = '';
      issueCountEl.textContent = String(completion.issueCount);
    } else {
      issuesEl.style.display = 'none';
    }
  }
}

/**
 * Update sync status display
 */
function updateSyncStatus(state) {
  const card = document.getElementById('intelSync');
  const icon = document.getElementById('syncIcon');
  const label = document.getElementById('syncLabel');
  const pending = document.getElementById('syncPending');

  if (!card || !icon) return;

  // Remove all state classes
  card.className = 'intel-card intel-sync';

  const t = window.t || (k => k);

  if (state?.isSyncing) {
    card.classList.add('intel-sync--syncing');
    icon.textContent = 'sync';
    label.textContent = t('cockpit.syncing') || 'Syncing...';
  } else if (state?.isOnline === false) {
    card.classList.add('intel-sync--offline');
    icon.textContent = 'cloud_off';
    label.textContent = t('cockpit.offline') || 'Offline';
  } else if (state?.error) {
    card.classList.add('intel-sync--error');
    icon.textContent = 'cloud_off';
    label.textContent = t('cockpit.syncError') || 'Sync Error';
  } else {
    card.classList.add('intel-sync--synced');
    icon.textContent = 'cloud_done';
    label.textContent = t('cockpit.synced') || 'Synced';
  }

  if (pending) {
    const count = state?.pendingChanges || 0;
    if (count > 0) {
      pending.style.display = '';
      pending.textContent = `${count} ${t('cockpit.pending') || 'pending'}`;
    } else {
      pending.style.display = 'none';
    }
  }
}

/**
 * Cleanup
 */
export function destroyIntelStrip() {
  if (staleTimer) {
    clearInterval(staleTimer);
    staleTimer = null;
  }
}
