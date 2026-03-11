/**
 * Field Commander Shell — Canvas-first UI restructure
 *
 * Replaces the traditional header + sidebar layout with:
 *   - Thin status bar at top (32px)
 *   - Persistent bottom action bar (56px)
 *   - Contextual sliding panels from edges
 *
 * Activated via feature flag: localStorage.fc_mode === '1'
 * Adds `body.fc-mode` class. Zero impact when OFF.
 */

import './fc-shell.css';
import { computeSketchCompletion } from '../cockpit/completion-engine.js';
import { initFCPanels, fcPanels } from './fc-panels.js';
import { initPanelGestures } from './fc-gestures.js';
import { initXPTracker, xpTracker } from './fc-xp.js';
import { initFCAchievements } from './fc-achievements.js';

// ── Feature flag ───────────────────────────────────────────────
export function isFCMode() {
  return document.body.classList.contains('fc-mode');
}

export function setFCMode(enabled) {
  if (enabled) {
    localStorage.setItem('fc_mode', '1');
  } else {
    localStorage.removeItem('fc_mode');
  }
  location.reload();
}

// ── Fix quality colors (mirrors gnss/index.js FIX_COLORS) ─────
const FIX_COLORS = {
  0: '#94a3b8', // no fix — slate
  1: '#3b82f6', // GPS — blue
  2: '#eab308', // DGPS — yellow
  4: '#22c55e', // RTK Fixed — green
  5: '#f97316', // RTK Float — orange
};

// ── Update interval (same cadence as cockpit: 2s) ──────────────
let updateTimer = null;

// ── DOM references ─────────────────────────────────────────────
let statusBar = null;
let actionBar = null;

// ── Observers for cleanup ──────────────────────────────────────
const observers = [];

/**
 * Main entry: called from main-entry.js at DOMContentLoaded
 */
export function initFieldCommander() {
  if (localStorage.getItem('fc_mode') !== '1') return;

  document.body.classList.add('fc-mode');

  buildStatusBar();
  buildActionBar();
  initFCPanels();
  initPanelGestures(fcPanels);
  initXPTracker();
  initFCAchievements();
  wireModeDelegation();
  wireGPSChip();
  wireSyncStatus();
  wireUndoSync();

  // Start periodic update
  updateTimer = setInterval(updateFC, 2000);
  updateFC(); // immediate first update

  // Listen for sketch changes
  if (window.menuEvents) {
    window.menuEvents.on('sketch:changed', updateFC);
    window.menuEvents.on('translations:updated', updateTranslations);
  }

  // Expose for legacy code
  window.__fcShell = { isFCMode, setFCMode, onRouteChange };

  console.debug('[FC] Field Commander activated');
}

// ── Status Bar ─────────────────────────────────────────────────

function buildStatusBar() {
  statusBar = document.createElement('div');
  statusBar.className = 'fc-status-bar';
  statusBar.id = 'fcStatusBar';
  statusBar.innerHTML = `
    <div class="fc-status-bar__left">
      <span class="fc-status-bar__sketch-name" id="fcSketchName"></span>
      <span class="fc-status-bar__sync" id="fcSyncIcon">
        <span class="material-icons" id="fcSyncIconText">cloud_done</span>
      </span>
    </div>
    <div class="fc-status-bar__center">
      <div class="fc-progress-line" id="fcProgressLine">
        <div class="fc-progress-line__fill" id="fcProgressFill" data-level="low"></div>
      </div>
    </div>
    <div class="fc-status-bar__right">
      <button class="fc-status-bar__gps" id="fcGpsChip" aria-label="GPS Status" type="button">
        <span class="fc-gps-dot" id="fcGpsDot"></span>
        <span id="fcGpsLabel">--</span>
      </button>
      <button class="fc-status-bar__menu" id="fcMenuBtn" aria-label="Menu" type="button">
        <span class="material-icons">menu</span>
      </button>
    </div>
  `;
  document.body.prepend(statusBar);

  // Menu button opens bottom panel
  document.getElementById('fcMenuBtn')?.addEventListener('click', () => {
    fcPanels?.toggle('bottom');
  });

  // GPS chip opens left panel (intel dashboard)
  document.getElementById('fcGpsChip')?.addEventListener('click', () => {
    fcPanels?.toggle('left');
  });
}

// ── Bottom Action Bar ──────────────────────────────────────────

function buildActionBar() {
  actionBar = document.createElement('nav');
  actionBar.className = 'fc-action-bar';
  actionBar.id = 'fcActionBar';
  actionBar.setAttribute('role', 'toolbar');

  const t = window.t || (k => k);

  actionBar.innerHTML = `
    <div class="fc-action-bar__modes" role="group">
      <button class="fc-action-btn" data-fc-mode="node" aria-pressed="false" type="button">
        <span class="material-icons">radio_button_unchecked</span>
        <span class="fc-action-btn__label">${esc(t('fc.node'))}</span>
      </button>
      <button class="fc-action-btn" data-fc-mode="edge" aria-pressed="false" type="button">
        <span class="material-icons">timeline</span>
        <span class="fc-action-btn__label">${esc(t('fc.edge'))}</span>
      </button>
      <button class="fc-action-btn fc-action-btn--capture" data-fc-action="capture" id="fcCaptureBtn" aria-label="${esc(t('fc.capture'))}" type="button">
        <span class="material-icons">add_location_alt</span>
      </button>
      <button class="fc-action-btn" data-fc-action="undo" id="fcUndoBtn" disabled type="button">
        <span class="material-icons">undo</span>
        <span class="fc-action-btn__label">${esc(t('fc.undo'))}</span>
      </button>
      <button class="fc-action-btn" data-fc-action="more" id="fcMoreBtn" type="button">
        <span class="material-icons">apps</span>
        <span class="fc-action-btn__label">${esc(t('fc.more'))}</span>
      </button>
    </div>
    <div class="fc-action-bar__xp" id="fcXpArea">
      <span class="fc-xp-badge" id="fcXpBadge">0 XP</span>
    </div>
  `;

  document.body.appendChild(actionBar);

  // Wire action buttons
  actionBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fc-action]');
    if (!btn) return;

    const action = btn.dataset.fcAction;
    if (action === 'capture') {
      // Delegate to GPS quick capture or precision measure
      if (typeof window.__startPrecisionMeasure === 'function') {
        window.__startPrecisionMeasure();
      } else {
        document.getElementById('gpsQuickCaptureBtn')?.click();
      }
    } else if (action === 'undo') {
      document.getElementById('undoBtn')?.click();
    } else if (action === 'more') {
      fcPanels?.toggle('bottom');
    }
  });
}

// ── Mode Delegation ────────────────────────────────────────────

function wireModeDelegation() {
  const bar = document.getElementById('fcActionBar');
  if (!bar) return;

  // Click delegation: FC mode buttons → original toolbar buttons
  const modeMap = {
    node: 'nodeModeBtn',
    edge: 'edgeModeBtn',
  };

  bar.querySelectorAll('[data-fc-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const origId = modeMap[btn.dataset.fcMode];
      if (origId) document.getElementById(origId)?.click();
    });
  });

  // Sync active state from original buttons via MutationObserver
  const modeButtons = [
    { id: 'nodeModeBtn', mode: 'node' },
    { id: 'edgeModeBtn', mode: 'edge' },
  ];

  for (const { id } of modeButtons) {
    const origBtn = document.getElementById(id);
    if (!origBtn) continue;
    const obs = new MutationObserver(() => syncModeIndicator());
    obs.observe(origBtn, { attributes: true, attributeFilter: ['class'] });
    observers.push(obs);
  }

  // Also listen for mode:changed events
  window.menuEvents?.on('mode:changed', () => syncModeIndicator());

  // Initial sync
  syncModeIndicator();
}

function syncModeIndicator() {
  const modeButtons = [
    { id: 'nodeModeBtn', mode: 'node' },
    { id: 'edgeModeBtn', mode: 'edge' },
  ];

  let activeMode = null;
  for (const { id, mode } of modeButtons) {
    if (document.getElementById(id)?.classList.contains('active')) {
      activeMode = mode;
      break;
    }
  }

  document.querySelectorAll('[data-fc-mode]').forEach(btn => {
    const pressed = btn.dataset.fcMode === activeMode;
    btn.setAttribute('aria-pressed', String(pressed));
    btn.classList.toggle('fc-action-btn--active', pressed);
  });
}

// ── GPS Chip ───────────────────────────────────────────────────

function wireGPSChip() {
  const gnssState = window.__gnssState;
  if (!gnssState) return;

  gnssState.on('position', (pos) => {
    const dot = document.getElementById('fcGpsDot');
    const label = document.getElementById('fcGpsLabel');
    const captureBtn = document.getElementById('fcCaptureBtn');
    if (!dot || !label) return;

    if (!pos?.isValid) {
      dot.style.background = FIX_COLORS[0];
      label.textContent = '--';
      captureBtn?.classList.remove('fc-capture--rtk', 'fc-capture--has-fix');
      return;
    }

    const color = FIX_COLORS[pos.fixQuality] || FIX_COLORS[0];
    dot.style.background = color;

    // Format accuracy
    if (pos.hdop != null) {
      label.textContent = pos.hdop < 1 ? `${(pos.hdop * 100).toFixed(0)}cm` : `${pos.hdop.toFixed(1)}m`;
    } else if (pos.accuracy != null) {
      label.textContent = `${pos.accuracy.toFixed(1)}m`;
    } else {
      label.textContent = '--';
    }

    // Capture button state
    if (captureBtn) {
      captureBtn.classList.toggle('fc-capture--rtk', pos.fixQuality === 4);
      captureBtn.classList.toggle('fc-capture--has-fix', pos.fixQuality >= 1);
    }
  });

  gnssState.on('connection', () => {
    const dot = document.getElementById('fcGpsDot');
    if (dot && gnssState.connectionState !== 'connected') {
      dot.style.background = FIX_COLORS[0];
    }
  });
}

// ── Sync Status ────────────────────────────────────────────────

function wireSyncStatus() {
  if (!window.menuEvents) return;
  window.menuEvents.on('sync:stateChange', (state) => {
    const icon = document.getElementById('fcSyncIconText');
    if (!icon) return;

    if (state?.isSyncing) {
      icon.textContent = 'sync';
      icon.parentElement.classList.add('fc-sync--syncing');
    } else if (state?.isOnline === false) {
      icon.textContent = 'cloud_off';
      icon.parentElement.classList.remove('fc-sync--syncing');
    } else if (state?.error) {
      icon.textContent = 'cloud_off';
      icon.parentElement.classList.remove('fc-sync--syncing');
    } else {
      icon.textContent = 'cloud_done';
      icon.parentElement.classList.remove('fc-sync--syncing');
    }
  });
}

// ── Undo Sync ──────────────────────────────────────────────────

function wireUndoSync() {
  const origUndo = document.getElementById('undoBtn');
  const fcUndo = document.getElementById('fcUndoBtn');
  if (!origUndo || !fcUndo) return;

  const obs = new MutationObserver(() => {
    fcUndo.disabled = origUndo.disabled;
  });
  obs.observe(origUndo, { attributes: true, attributeFilter: ['disabled'] });
  observers.push(obs);
  fcUndo.disabled = origUndo.disabled;
}

// ── Periodic Update ────────────────────────────────────────────

function updateFC() {
  if (!isFCMode()) return;

  const completion = computeSketchCompletion();

  // Progress line
  const fill = document.getElementById('fcProgressFill');
  if (fill) {
    fill.style.width = `${completion.percentage}%`;
    const level = completion.percentage >= 90 ? 'complete'
      : completion.percentage >= 70 ? 'high'
      : completion.percentage >= 40 ? 'mid' : 'low';
    fill.dataset.level = level;
  }

  // Sketch name
  const nameEl = document.getElementById('fcSketchName');
  if (nameEl) {
    const sketchNameEl = document.getElementById('sketchNameDisplay');
    nameEl.textContent = sketchNameEl?.textContent || '';
  }
}

// ── Route Change Hook ──────────────────────────────────────────

function onRouteChange(_hash) {
  // FC mode adds slide-up transitions to route panels via CSS.
  // No JS-level changes needed — the existing handleRoute()
  // already shows/hides panels, and FC CSS animates them.
}

// ── Translation Update ─────────────────────────────────────────

function updateTranslations() {
  const t = window.t || (k => k);
  document.querySelectorAll('[data-fc-mode="node"] .fc-action-btn__label').forEach(el => {
    el.textContent = t('fc.node');
  });
  document.querySelectorAll('[data-fc-mode="edge"] .fc-action-btn__label').forEach(el => {
    el.textContent = t('fc.edge');
  });
  const undoLabel = document.querySelector('[data-fc-action="undo"] .fc-action-btn__label');
  if (undoLabel) undoLabel.textContent = t('fc.undo');
  const moreLabel = document.querySelector('[data-fc-action="more"] .fc-action-btn__label');
  if (moreLabel) moreLabel.textContent = t('fc.more');
}

// ── Helpers ────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
