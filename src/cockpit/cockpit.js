/**
 * Cockpit Layout Module
 * Landscape-first three-zone layout: Intel Strip | Canvas | Action Rail
 *
 * Activates automatically when device is in landscape orientation.
 * Falls back to standard layout in portrait.
 */

import './cockpit.css';
import { initIntelStrip, updateIntelStrip } from './intel-strip.js';
import { initActionRail } from './action-rail.js';
import { initSessionTracker } from './session-tracker.js';
import { initQuickWins } from './quick-wins.js';
import { computeSketchCompletion } from './completion-engine.js';

let cockpitEl = null;
let isActive = false;
let orientationQuery = null;

/**
 * Build the cockpit DOM structure and inject it into #canvasContainer
 */
function buildCockpitDOM() {
  cockpitEl = document.createElement('div');
  cockpitEl.className = 'cockpit';
  cockpitEl.innerHTML = `
    <!-- Zone A: Intel Strip -->
    <aside class="intel-strip" id="intelStrip" role="complementary" aria-label="Survey status">
      <!-- GPS Status -->
      <div class="intel-card intel-gps" id="intelGps">
        <div class="intel-card__header">
          <span class="material-icons">satellite_alt</span>
          <span data-i18n="cockpit.gps">GPS</span>
        </div>
        <div class="intel-gps__fix">
          <span class="intel-gps__dot" id="gpsDot"></span>
          <span class="intel-gps__label" id="gpsLabel">--</span>
        </div>
        <div class="intel-gps__accuracy" id="gpsAccuracy">--</div>
        <div class="intel-gps__satellites" id="gpsSatellites">
          <span class="material-icons">cell_tower</span>
          <span id="gpsSatCount">0</span>
        </div>
      </div>

      <!-- Sketch Health -->
      <div class="intel-card intel-health" id="intelHealth">
        <div class="intel-card__header">
          <span class="material-icons">assessment</span>
          <span data-i18n="cockpit.health">Health</span>
        </div>
        <div class="completion-ring" id="completionRing">
          <svg class="completion-ring__svg" viewBox="0 0 36 36">
            <circle class="completion-ring__bg" cx="18" cy="18" r="15.5"></circle>
            <circle class="completion-ring__fill" id="completionFill"
              cx="18" cy="18" r="15.5"
              stroke-dasharray="97.4"
              stroke-dashoffset="97.4"
              data-level="low">
            </circle>
          </svg>
          <span class="completion-ring__text" id="completionText">0%</span>
        </div>
        <div class="intel-health__stats" id="healthStats">--</div>
        <div class="intel-health__issues" id="healthIssues" style="display:none;">
          <span class="material-icons">warning_amber</span>
          <span id="issueCount">0</span>
        </div>
      </div>

      <!-- Sync Status -->
      <div class="intel-card intel-sync intel-sync--synced" id="intelSync">
        <span class="material-icons intel-sync__icon" id="syncIcon">cloud_done</span>
        <div>
          <div class="intel-sync__label" id="syncLabel" data-i18n="cockpit.synced">Synced</div>
          <div class="intel-sync__pending" id="syncPending" style="display:none;"></div>
        </div>
      </div>

      <!-- Session Tracker -->
      <div class="intel-card intel-session" id="intelSession">
        <div class="intel-card__header">
          <span class="material-icons">timer</span>
          <span data-i18n="cockpit.session">Session</span>
        </div>
        <div class="intel-session__row">
          <span data-i18n="cockpit.duration">Duration</span>
          <span class="intel-session__value" id="sessionDuration">0:00</span>
        </div>
        <div class="intel-session__row">
          <span data-i18n="cockpit.nodesPlaced">Nodes</span>
          <span class="intel-session__value" id="sessionNodes">+0</span>
        </div>
        <div class="intel-session__row">
          <span data-i18n="cockpit.edgesDrawn">Edges</span>
          <span class="intel-session__value" id="sessionEdges">+0</span>
        </div>
        <div class="intel-session__streak" id="sessionStreak" style="display:none;">
          <span class="material-icons">local_fire_department</span>
          <span id="streakCount">0</span>
          <span data-i18n="cockpit.days">days</span>
        </div>
      </div>
    </aside>

    <!-- Zone B is the existing #canvasContainer (managed externally) -->

    <!-- Zone C: Action Rail -->
    <nav class="action-rail" id="actionRail" role="toolbar" aria-label="Drawing tools">
      <!-- Mode buttons -->
      <button class="action-rail__btn action-rail__btn--mode" data-mode="node" data-i18n-title="cockpit.tooltipNodeMode" aria-pressed="false">
        <span class="material-icons">radio_button_unchecked</span>
      </button>
      <button class="action-rail__btn action-rail__btn--mode" data-mode="edge" data-i18n-title="cockpit.tooltipEdgeMode" aria-pressed="false">
        <span class="material-icons">timeline</span>
      </button>
      <button class="action-rail__btn action-rail__btn--mode" data-mode="home" data-i18n-title="cockpit.tooltipHomeNode" aria-pressed="false">
        <span class="material-icons">home</span>
      </button>
      <button class="action-rail__btn action-rail__btn--mode" data-mode="drainage" data-i18n-title="cockpit.tooltipDrainage" aria-pressed="false">
        <span class="material-icons">water_drop</span>
      </button>

      <div class="action-rail__divider"></div>

      <!-- GPS Capture -->
      <button class="action-rail__btn action-rail__btn--gps" id="railGpsBtn" data-i18n-title="cockpit.tooltipGps">
        <span class="material-icons">gps_fixed</span>
      </button>

      <!-- TSC3 Survey Controller -->
      <button class="action-rail__btn action-rail__btn--tsc3" id="railTsc3Btn" data-i18n-title="cockpit.tooltipTsc3">
        <span class="material-icons">precision_manufacturing</span>
        <span class="action-rail__tsc3-indicator" id="tsc3Indicator"></span>
      </button>

      <div class="action-rail__divider"></div>

      <!-- Undo/Redo -->
      <button class="action-rail__btn" id="railUndoBtn" data-i18n-title="cockpit.tooltipUndo" disabled>
        <span class="material-icons">undo</span>
      </button>
      <button class="action-rail__btn" id="railRedoBtn" data-i18n-title="cockpit.tooltipRedo" disabled>
        <span class="material-icons">redo</span>
      </button>

      <div class="action-rail__divider"></div>

      <!-- Zoom -->
      <button class="action-rail__btn" id="railZoomInBtn" data-i18n-title="cockpit.tooltipZoomIn">
        <span class="material-icons">add</span>
      </button>
      <button class="action-rail__btn" id="railZoomOutBtn" data-i18n-title="cockpit.tooltipZoomOut">
        <span class="material-icons">remove</span>
      </button>
      <button class="action-rail__btn" id="railFitBtn" data-i18n-title="cockpit.tooltipFit">
        <span class="material-icons">fit_screen</span>
      </button>

      <div class="action-rail__spacer"></div>

      <!-- Heat map toggle -->
      <button class="action-rail__btn action-rail__btn--heatmap" id="railHeatmapBtn" data-i18n-title="cockpit.tooltipHeatmap" aria-pressed="false">
        <span class="material-icons">thermostat</span>
      </button>

      <div class="action-rail__divider"></div>

      <!-- More menu -->
      <button class="action-rail__btn" id="railMoreBtn" data-i18n-title="cockpit.tooltipMore" aria-expanded="false">
        <span class="material-icons">more_vert</span>
      </button>

      <!-- Collapse Zone A toggle -->
      <button class="action-rail__btn action-rail__btn--collapse" id="railCollapseBtn" data-i18n-title="cockpit.tooltipCollapse">
        <span class="material-icons">chevron_right</span>
      </button>

    </nav>

    <!-- More menu popup (outside action-rail to avoid overflow clipping) -->
    <div class="action-rail__more-menu" id="railMoreMenu">
      <button class="action-rail__more-item" data-action="save">
        <span class="material-icons">save</span>
        <span data-i18n="save">Save</span>
      </button>
      <button class="action-rail__more-item" data-action="exportSketch">
        <span class="material-icons">download</span>
        <span data-i18n="exportSketch">Export Sketch</span>
      </button>
      <button class="action-rail__more-item" data-action="exportNodes">
        <span class="material-icons">donut_large</span>
        <span data-i18n="exportNodes">Export Nodes</span>
      </button>
      <button class="action-rail__more-item" data-action="exportEdges">
        <span class="material-icons">call_split</span>
        <span data-i18n="exportEdges">Export Edges</span>
      </button>
      <button class="action-rail__more-item" data-action="mySketches">
        <span class="material-icons">description</span>
        <span data-i18n="mySketches">My Sketches</span>
      </button>
      <button class="action-rail__more-item" data-action="admin">
        <span class="material-icons">tune</span>
        <span data-i18n="admin.manage">Admin</span>
      </button>
      <button class="action-rail__more-item" data-action="languageChange">
        <span class="material-icons">language</span>
        <span>EN / עב</span>
      </button>
    </div>

    <!-- Bottom progress bar -->
    <div class="cockpit__progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
      <div class="cockpit__progress-fill" id="cockpitProgressFill" data-level="low" style="width: 0%"></div>
    </div>
  `;

  // Insert cockpit into #main, before #canvasContainer
  const main = document.getElementById('main');
  if (main) {
    main.insertBefore(cockpitEl, main.firstChild);
  }
}

/**
 * Activate cockpit mode
 */
function activate() {
  if (isActive) return;
  isActive = true;
  document.body.classList.add('cockpit-mode');

  // Apply i18n to new elements
  if (window.t) {
    cockpitEl.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translated = window.t(key);
      if (translated && translated !== key) {
        el.textContent = translated;
      }
    });
    // Apply i18n tooltips (title + aria-label)
    cockpitEl.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const translated = window.t(key);
      if (translated && translated !== key) {
        el.title = translated;
        el.setAttribute('aria-label', translated);
      }
    });
  }

  // Initialize sub-modules
  initIntelStrip();
  initActionRail();
  initSessionTracker();

  // Trigger initial update
  requestAnimationFrame(() => {
    updateCockpit();
  });
}

/**
 * Deactivate cockpit mode (portrait fallback)
 */
function deactivate() {
  if (!isActive) return;
  isActive = false;
  document.body.classList.remove('cockpit-mode');
}

/**
 * Update all cockpit displays
 */
export function updateCockpit() {
  if (!isActive) return;

  const completion = computeSketchCompletion();
  updateIntelStrip(completion);
  updateProgressBar(completion.percentage);

  // Keep issue navigation context in sync with current sketch data
  if (window.__issueNav?.setIssueContext && completion.issueCount > 0) {
    try {
      const data = window.__getActiveSketchData?.();
      if (data?.nodes && data?.edges) {
        const currentState = window.__issueNav.getNavState?.();
        const sketchId = data.id || data.name || 'current';
        // Only re-init if sketch changed or issues not loaded
        if (currentState?.sketchId !== sketchId || currentState?.total === 0) {
          window.__issueNav.setIssueContext(sketchId, data.nodes, data.edges);
        }
      }
    } catch { /* ignore */ }
  }
}

/**
 * Update the bottom progress bar
 */
function updateProgressBar(pct) {
  const fill = document.getElementById('cockpitProgressFill');
  if (!fill) return;

  fill.style.width = `${pct}%`;

  let level = 'low';
  if (pct >= 85) level = 'complete';
  else if (pct >= 60) level = 'high';
  else if (pct >= 30) level = 'mid';

  fill.setAttribute('data-level', level);
  fill.closest('[role="progressbar"]')?.setAttribute('aria-valuenow', String(Math.round(pct)));
}

/**
 * Initialize the cockpit system
 * Listens for orientation changes and activates/deactivates automatically
 */
export function initCockpit() {
  buildCockpitDOM();
  initQuickWins();

  // Use matchMedia for orientation detection
  orientationQuery = window.matchMedia('(orientation: landscape) and (min-width: 568px)');

  function handleOrientation(e) {
    if (e.matches) {
      activate();
    } else {
      deactivate();
    }
  }

  // Listen for changes
  orientationQuery.addEventListener('change', handleOrientation);

  // Check initial state
  handleOrientation(orientationQuery);

  // Re-compute on sketch changes
  if (window.menuEvents) {
    window.menuEvents.on('sketch:changed', () => {
      requestAnimationFrame(updateCockpit);
    });
    window.menuEvents.on('translations:updated', () => {
      if (cockpitEl && window.t) {
        cockpitEl.querySelectorAll('[data-i18n]').forEach(el => {
          const key = el.getAttribute('data-i18n');
          const translated = window.t(key);
          if (translated && translated !== key) {
            el.textContent = translated;
          }
        });
      }
    });
  }

  // Periodic update for session timer and GPS
  setInterval(() => {
    if (isActive) updateCockpit();
  }, 2000);
}

/**
 * Check if cockpit mode is currently active
 */
export function isCockpitActive() {
  return isActive;
}
