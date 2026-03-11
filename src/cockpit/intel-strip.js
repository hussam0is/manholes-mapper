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

  // Issue count click: first click expands list, subsequent clicks cycle through issues
  const issuesEl = document.getElementById('healthIssues');
  const issueListEl = document.getElementById('healthIssueList');
  if (issuesEl) {
    issuesEl.addEventListener('click', () => {
      // Toggle issue list visibility
      if (issueListEl) {
        const isHidden = issueListEl.style.display === 'none';
        issueListEl.style.display = isHidden ? '' : 'none';
        if (isHidden) {
          populateIssueList(issueListEl);
        }
      }
      // Also navigate to next issue on canvas
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
  updateCondensedStatus(completion);

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

  const t = window.t || (k => k);

  // Fix quality mapping — use gnssMarker i18n keys
  const fixMap = {
    4: { cls: 'rtk-fixed', label: t('gnssMarker.fixRtkFixed') || 'RTK Fixed' },
    5: { cls: 'rtk-float', label: t('gnssMarker.fixRtkFloat') || 'RTK Float' },
    2: { cls: 'dgps', label: t('gnssMarker.fixDgps') || 'DGPS' },
    1: { cls: 'gps', label: t('gnssMarker.fixGps') || 'GPS' },
    0: { cls: 'no-fix', label: t('gnssMarker.noFix') || 'No Fix' }
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

  // Also update condensed status dot in action rail
  updateCondensedGpsDot(gnssState);
}

/**
 * Sync GPS dot in condensed action-rail status
 */
function updateCondensedGpsDot(gnssState) {
  const dot = document.getElementById('railGpsDot');
  if (!dot) return;

  const pos = gnssState?.position;
  const connected = gnssState?.connectionState === 'connected';

  dot.className = 'action-rail__status-dot';

  if (!connected || !pos?.isValid) {
    dot.classList.add('action-rail__status-dot--no-fix');
    return;
  }

  const fixClsMap = {
    4: 'action-rail__status-dot--rtk-fixed',
    5: 'action-rail__status-dot--rtk-float',
    2: 'action-rail__status-dot--dgps',
    1: 'action-rail__status-dot--gps',
    0: 'action-rail__status-dot--no-fix',
  };

  dot.classList.add(fixClsMap[pos.fixQuality] || fixClsMap[0]);
}

/**
 * Update the condensed status in the action rail (health %, sync icon)
 */
function updateCondensedStatus(completion) {
  const healthEl = document.getElementById('railHealthPct');
  if (healthEl) {
    healthEl.textContent = `${completion.percentage}%`;
  }
}

/**
 * Update the condensed sync icon in the action rail
 */
function updateCondensedSyncIcon(state) {
  const iconEl = document.getElementById('railSyncIcon');
  if (!iconEl) return;

  const iconSpan = iconEl.querySelector('.material-icons');
  iconEl.className = 'action-rail__status-icon';

  if (state?.isSyncing) {
    iconEl.classList.add('action-rail__status-icon--syncing');
    if (iconSpan) iconSpan.textContent = 'sync';
  } else if (state?.isOnline === false) {
    iconEl.classList.add('action-rail__status-icon--offline');
    if (iconSpan) iconSpan.textContent = 'cloud_off';
  } else if (state?.error) {
    iconEl.classList.add('action-rail__status-icon--error');
    if (iconSpan) iconSpan.textContent = 'cloud_off';
  } else {
    if (iconSpan) iconSpan.textContent = 'cloud_done';
  }
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

  // Determine level: <25% = low (danger), 25-75% = mid (warning), 75-85% = high, 85%+ = complete
  let level = 'low';
  if (pct >= 85) level = 'complete';
  else if (pct >= 75) level = 'high';
  else if (pct >= 25) level = 'mid';

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

  // Also update condensed sync icon in action rail
  updateCondensedSyncIcon(state);
}

/**
 * Populate the expandable issue detail list
 */
function populateIssueList(listEl) {
  if (!listEl) return;
  const navState = window.__issueNav?.getNavState?.();
  const issues = navState?.issues || [];
  const t = window.t || (k => k);

  if (issues.length === 0) {
    listEl.innerHTML = '';
    listEl.style.display = 'none';
    return;
  }

  const issueTypeIcons = {
    missingCoords: 'location_off',
    missingMeasurement: 'straighten',
    negativeGradient: 'trending_down',
  };

  const issueTypeLabels = {
    missingCoords: t('elementIssues.missingCoords') || 'Missing coordinates',
    missingMeasurement: t('elementIssues.missingMeasurement') || 'Missing measurement',
    negativeGradient: t('elementIssues.negativeGradient') || 'Negative gradient',
  };

  listEl.innerHTML = issues.map((issue, i) => {
    const icon = issueTypeIcons[issue.type] || 'warning_amber';
    const label = issueTypeLabels[issue.type] || issue.type;
    const target = issue.nodeLabel || issue.edgeLabel || `#${i + 1}`;
    return `<div class="intel-health__issue-item" data-index="${i}">
      <span class="material-icons">${icon}</span>
      <span class="intel-health__issue-text">${window.escapeHtml ? window.escapeHtml(target) : target}: ${window.escapeHtml ? window.escapeHtml(label) : label}</span>
    </div>`;
  }).join('');

  // Click individual issue to navigate to it
  listEl.querySelectorAll('.intel-health__issue-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(item.dataset.index, 10);
      if (window.__issueNav?.setCurrentIndex) {
        window.__issueNav.setCurrentIndex(idx);
        window.__issueNav.navigateToCurrentIssue?.();
      }
    });
  });
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
