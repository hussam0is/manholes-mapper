/**
 * Cockpit Layout Module
 * Landscape-first three-zone layout: Intel Strip | Canvas | Action Rail
 *
 * Activates automatically when device is in landscape orientation.
 * Falls back to standard layout in portrait.
 */

import './cockpit.css';
import { initIntelStrip, updateIntelStrip, destroyIntelStrip } from './intel-strip.js';
import { initActionRail } from './action-rail.js';
import { initSessionTracker } from './session-tracker.js';
import { initQuickWins } from './quick-wins.js';
import { computeSketchCompletion } from './completion-engine.js';

let cockpitEl = null;
let isActive = false;
let orientationQuery = null;
let _updateDebounceTimer = null;

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
        <div class="intel-health__issue-list" id="healthIssueList" style="display:none;"></div>
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
      <!-- Condensed status (visible only when Zone A is collapsed) -->
      <div class="action-rail__status-condensed" id="railStatusCondensed">
        <span class="action-rail__status-dot" id="railGpsDot"></span>
        <span class="action-rail__status-icon" id="railSyncIcon">
          <span class="material-icons">cloud_done</span>
        </span>
        <span class="action-rail__status-health" id="railHealthPct">0%</span>
      </div>

      <div class="action-rail__divider"></div>

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

      <!-- 3D View -->
      <button class="action-rail__btn action-rail__btn--3d" id="rail3DBtn" data-i18n-title="threeD.title">
        <span class="material-icons">view_in_ar</span>
      </button>

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
      <!-- Quick actions at top -->
      <button class="action-rail__more-item action-rail__more-item--primary" data-action="save">
        <span class="material-icons">save</span>
        <span data-i18n="save">Save</span>
      </button>
      <button class="action-rail__more-item" data-action="mySketches">
        <span class="material-icons">description</span>
        <span data-i18n="mySketches">My Sketches</span>
      </button>

      <hr class="action-rail__more-divider">

      <!-- Search group -->
      <div class="action-rail__more-group" data-more-group="search">
        <button class="action-rail__more-group-header" data-more-group-toggle="search" type="button" aria-expanded="false">
          <span class="material-icons">search</span>
          <span data-i18n="menuGroupSearch">Search</span>
          <span class="material-icons action-rail__more-chevron">expand_more</span>
        </button>
        <div class="action-rail__more-group-items" data-more-group-items="search" style="display:none">
          <div class="action-rail__more-search">
            <input id="railSearchNodeInput" type="text" placeholder="Search nodes" class="action-rail__more-search-input" data-i18n-placeholder="searchNode" />
          </div>
        </div>
      </div>

      <!-- View group -->
      <div class="action-rail__more-group" data-more-group="view">
        <button class="action-rail__more-group-header" data-more-group-toggle="view" type="button" aria-expanded="false">
          <span class="material-icons">visibility</span>
          <span data-i18n="menuGroupView">Element Size</span>
          <span class="material-icons action-rail__more-chevron">expand_more</span>
        </button>
        <div class="action-rail__more-group-items" data-more-group-items="view" style="display:none">
          <button class="action-rail__more-item" data-action="sizeDecrease">
            <span class="material-icons">remove_circle_outline</span>
            <span data-i18n="sizeDecrease">Decrease Size</span>
          </button>
          <button class="action-rail__more-item" data-action="sizeIncrease">
            <span class="material-icons">add_circle_outline</span>
            <span data-i18n="sizeIncrease">Increase Size</span>
          </button>
          <button class="action-rail__more-item" data-action="autoSize">
            <span class="material-icons">fit_screen</span>
            <span data-i18n="autoSize">Auto Size</span>
          </button>
          <button class="action-rail__more-item" data-action="threeDView">
            <span class="material-icons">view_in_ar</span>
            <span data-i18n="threeD.title">3D View</span>
          </button>
        </div>
      </div>

      <!-- Sketch & Export group -->
      <div class="action-rail__more-group" data-more-group="sketchExport">
        <button class="action-rail__more-group-header" data-more-group-toggle="sketchExport" type="button" aria-expanded="false">
          <span class="material-icons">description</span>
          <span data-i18n="menuGroup.sketchExport">Sketch & Export</span>
          <span class="material-icons action-rail__more-chevron">expand_more</span>
        </button>
        <div class="action-rail__more-group-items" data-more-group-items="sketchExport" style="display:none">
          <button class="action-rail__more-item" data-action="exportSketch">
            <span class="material-icons">download</span>
            <span data-i18n="exportSketch">Export Sketch</span>
          </button>
          <button class="action-rail__more-item" data-action="importSketch">
            <span class="material-icons">upload</span>
            <span data-i18n="importSketch">Import Sketch</span>
          </button>
          <button class="action-rail__more-item" data-action="exportNodes">
            <span class="material-icons">donut_large</span>
            <span data-i18n="exportNodes">Export Nodes</span>
          </button>
          <button class="action-rail__more-item" data-action="exportEdges">
            <span class="material-icons">call_split</span>
            <span data-i18n="exportEdges">Export Edges</span>
          </button>
        </div>
      </div>

      <!-- Location & Map group -->
      <div class="action-rail__more-group" data-more-group="locationMap">
        <button class="action-rail__more-group-header" data-more-group-toggle="locationMap" type="button" aria-expanded="false">
          <span class="material-icons">location_on</span>
          <span data-i18n="menuGroup.locationMap">Location & Map</span>
          <span class="material-icons action-rail__more-chevron">expand_more</span>
        </button>
        <div class="action-rail__more-group-items" data-more-group-items="locationMap" style="display:none">
          <button class="action-rail__more-item" data-action="importCoordinates">
            <span class="material-icons">place</span>
            <span data-i18n="coordinates.import">Import Coordinates</span>
          </button>
          <label class="action-rail__more-toggle">
            <input type="checkbox" id="railCoordinatesToggle" data-action="toggleCoordinates" />
            <span class="material-icons">my_location</span>
            <span data-i18n="coordinates.enable">Coordinates</span>
          </label>
          <div class="action-rail__more-scale-row">
            <span class="material-icons">straighten</span>
            <span data-i18n="coordinates.scale">Scale:</span>
            <div class="action-rail__more-scale-adjuster">
              <button class="action-rail__more-scale-btn" data-action="scaleDecrease">−</button>
              <span id="railScaleValueDisplay" class="action-rail__more-scale-value">1:100</span>
              <button class="action-rail__more-scale-btn" data-action="scaleIncrease">+</button>
            </div>
          </div>
          <div class="action-rail__more-scale-row">
            <span class="material-icons">swap_horiz</span>
            <span data-i18n="stretch.horizontal">X Stretch:</span>
            <div class="action-rail__more-scale-adjuster">
              <button class="action-rail__more-scale-btn" data-action="stretchXDecrease">−</button>
              <span id="railStretchXValueDisplay" class="action-rail__more-scale-value">1.0</span>
              <button class="action-rail__more-scale-btn" data-action="stretchXIncrease">+</button>
            </div>
          </div>
          <div class="action-rail__more-scale-row">
            <span class="material-icons">swap_vert</span>
            <span data-i18n="stretch.vertical">Y Stretch:</span>
            <div class="action-rail__more-scale-adjuster">
              <button class="action-rail__more-scale-btn" data-action="stretchYDecrease">−</button>
              <span id="railStretchYValueDisplay" class="action-rail__more-scale-value">1.0</span>
              <button class="action-rail__more-scale-btn" data-action="stretchYIncrease">+</button>
            </div>
          </div>
          <button class="action-rail__more-item" data-action="resetStretch">
            <span class="material-icons">refresh</span>
            <span data-i18n="stretch.reset">Reset Stretch</span>
          </button>
          <label class="action-rail__more-toggle">
            <input type="checkbox" id="railMapLayerToggle" data-action="toggleMapLayer" />
            <span class="material-icons">layers</span>
            <span data-i18n="mapLayer.enable">Map Layer</span>
          </label>
          <div class="action-rail__more-select-row">
            <span class="material-icons">terrain</span>
            <span data-i18n="map.type">Map type:</span>
            <select id="railMapTypeSelect" class="action-rail__more-inline-select" aria-label="Map type">
              <option value="orthophoto" data-i18n="map.orthophoto">Orthophoto</option>
              <option value="street" data-i18n="map.street">Street</option>
            </select>
          </div>
          <div id="railRefLayersSection" style="display:none">
            <label class="action-rail__more-toggle">
              <input type="checkbox" id="railRefLayersToggle" checked data-action="toggleRefLayers" />
              <span class="material-icons">layers</span>
              <span data-i18n="refLayers.enable">Reference Layers</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Measurement group -->
      <div class="action-rail__more-group" data-more-group="measurement">
        <button class="action-rail__more-group-header" data-more-group-toggle="measurement" type="button" aria-expanded="false">
          <span class="material-icons">satellite_alt</span>
          <span data-i18n="menuGroup.measurement">Measurement</span>
          <span class="material-icons action-rail__more-chevron">expand_more</span>
        </button>
        <div class="action-rail__more-group-items" data-more-group-items="measurement" style="display:none">
          <label class="action-rail__more-toggle">
            <input type="checkbox" id="railLiveMeasureToggle" data-action="toggleLiveMeasure" />
            <span class="material-icons">gps_fixed</span>
            <span data-i18n="liveMeasure.enable">Live Measure</span>
          </label>
          <button class="action-rail__more-item" data-action="connectTMM">
            <span class="material-icons">settings_remote</span>
            <span data-i18n="tmm.connect">Connect TMM</span>
          </button>
          <button class="action-rail__more-item" data-action="connectSurveyBluetooth">
            <span class="material-icons">bluetooth</span>
            <span data-i18n="survey.connectBluetooth">Bluetooth</span>
          </button>
          <button class="action-rail__more-item" data-action="connectSurveyWebSocket">
            <span class="material-icons">wifi</span>
            <span data-i18n="survey.connectWebSocket">WebSocket</span>
          </button>
          <button class="action-rail__more-item" data-action="disconnectSurvey">
            <span class="material-icons">bluetooth_disabled</span>
            <span data-i18n="survey.disconnect">Disconnect</span>
          </button>
          <button class="action-rail__more-item action-rail__more-item--success" data-action="finishWorkday">
            <span class="material-icons">done_all</span>
            <span data-i18n="finishWorkday.button">Finish Workday</span>
          </button>
        </div>
      </div>

      <!-- Settings group -->
      <div class="action-rail__more-group" data-more-group="settings">
        <button class="action-rail__more-group-header" data-more-group-toggle="settings" type="button" aria-expanded="false">
          <span class="material-icons">settings</span>
          <span data-i18n="menuGroupSettings">Settings</span>
          <span class="material-icons action-rail__more-chevron">expand_more</span>
        </button>
        <div class="action-rail__more-group-items" data-more-group-items="settings" style="display:none">
          <label class="action-rail__more-toggle">
            <input type="checkbox" id="railAutosaveToggle" data-action="toggleAutosave" />
            <span data-i18n="autosave">Autosave</span>
          </label>
          <button class="action-rail__more-item" data-action="help">
            <span class="material-icons">help_outline</span>
            <span data-i18n="help">Help</span>
          </button>
          <button class="action-rail__more-item" data-action="admin">
            <span class="material-icons">tune</span>
            <span data-i18n="admin.manage">Admin</span>
          </button>
          <button class="action-rail__more-item" data-action="projects">
            <span class="material-icons">folder_open</span>
            <span data-i18n="projects.title">Projects</span>
          </button>
        </div>
      </div>

      <hr class="action-rail__more-divider">

      <!-- Language toggle at bottom -->
      <button class="action-rail__more-item action-rail__more-item--secondary" data-action="languageChange">
        <span class="material-icons">language</span>
        <span data-i18n="cockpit.languageToggle">EN / HE</span>
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

  // Build micro-cockpit strip for mobile portrait mode
  buildMicroCockpit();
}

/**
 * Build the micro-cockpit strip for mobile portrait mode.
 * A thin bar below the header showing GPS, sync, and health indicators.
 */
function buildMicroCockpit() {
  const strip = document.createElement('div');
  strip.className = 'micro-cockpit';
  strip.id = 'microCockpit';
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-label', 'Survey status');
  strip.innerHTML = `
    <span class="micro-cockpit__gps" id="microGpsDot" title="GPS"></span>
    <span class="micro-cockpit__sync" id="microSyncIcon">
      <span class="material-icons">cloud_done</span>
    </span>
    <span class="micro-cockpit__health" id="microHealthPct">0%</span>
    <span class="micro-cockpit__timer" id="microSessionTimer">0:00</span>
  `;

  // Insert after <header>, before #main
  const header = document.querySelector('header.app-header');
  if (header && header.parentNode) {
    header.parentNode.insertBefore(strip, header.nextSibling);
  }

  // Wire up GPS updates
  const gnssState = window.__gnssState;
  if (gnssState) {
    gnssState.on('position', () => updateMicroGps(gnssState));
    gnssState.on('connection', () => updateMicroGps(gnssState));
  }

  // Wire up sync updates
  if (window.menuEvents) {
    window.menuEvents.on('sync:stateChange', (state) => updateMicroSync(state));
  }
}

/**
 * Update micro-cockpit GPS dot
 */
function updateMicroGps(gnssState) {
  const dot = document.getElementById('microGpsDot');
  if (!dot) return;

  const pos = gnssState?.position;
  const connected = gnssState?.connectionState === 'connected';

  dot.className = 'micro-cockpit__gps';

  if (!connected || !pos?.isValid) {
    dot.classList.add('micro-cockpit__gps--no-fix');
    return;
  }

  const fixClsMap = {
    4: 'micro-cockpit__gps--rtk-fixed',
    5: 'micro-cockpit__gps--rtk-float',
    2: 'micro-cockpit__gps--dgps',
    1: 'micro-cockpit__gps--gps',
    0: 'micro-cockpit__gps--no-fix',
  };

  dot.classList.add(fixClsMap[pos.fixQuality] || fixClsMap[0]);
}

/**
 * Update micro-cockpit sync icon
 */
function updateMicroSync(state) {
  const iconEl = document.getElementById('microSyncIcon');
  if (!iconEl) return;

  const iconSpan = iconEl.querySelector('.material-icons');
  iconEl.className = 'micro-cockpit__sync';

  if (state?.isSyncing) {
    iconEl.classList.add('micro-cockpit__sync--syncing');
    if (iconSpan) iconSpan.textContent = 'sync';
  } else if (state?.isOnline === false) {
    iconEl.classList.add('micro-cockpit__sync--offline');
    if (iconSpan) iconSpan.textContent = 'cloud_off';
  } else if (state?.error) {
    iconEl.classList.add('micro-cockpit__sync--error');
    if (iconSpan) iconSpan.textContent = 'cloud_off';
  } else {
    if (iconSpan) iconSpan.textContent = 'cloud_done';
  }
}

/**
 * Update micro-cockpit health and timer from completion data
 */
function updateMicroCockpit(completion) {
  const healthEl = document.getElementById('microHealthPct');
  if (healthEl) {
    healthEl.textContent = `${completion.percentage}%`;

    // Color-code by level
    healthEl.className = 'micro-cockpit__health';
    if (completion.percentage >= 85) {
      healthEl.classList.add('micro-cockpit__health--good');
    } else if (completion.percentage >= 30) {
      healthEl.classList.add('micro-cockpit__health--mid');
    } else {
      healthEl.classList.add('micro-cockpit__health--low');
    }
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
  // Action rail removed — canvas toolbar is used in both orientations
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
  // Stop intel strip timers (e.g. 3s GPS stale check) when cockpit is not visible
  destroyIntelStrip();
}

/**
 * Update all cockpit displays
 */
export function updateCockpit() {
  if (document.hidden) return; // Skip when tab is backgrounded

  const completion = computeSketchCompletion();

  // Always update micro-cockpit (visible in portrait mobile)
  updateMicroCockpit(completion);

  if (!isActive) return;

  updateIntelStrip(completion);
  updateProgressBar(completion.percentage);

  // Keep issue navigation context in sync with current sketch data
  if (window.__issueNav?.setIssueContext && completion.issueCount > 0) {
    try {
      // Use __getSketchStats for direct references (no copy needed for read-only nav context)
      const stats = window.__getSketchStats?.();
      if (stats?.nodes && stats?.edges) {
        const currentState = window.__issueNav.getNavState?.();
        const sketchId = stats.sketchId || stats.sketchName || 'current';
        // Only re-init if sketch changed or issues not loaded
        if (currentState?.sketchId !== sketchId || currentState?.total === 0) {
          window.__issueNav.setIssueContext(sketchId, stats.nodes, stats.edges);
        }
      }
    } catch { /* ignore */ }
  }
}

/**
 * Debounced updateCockpit — coalesces rapid sketch:changed events
 * into at most one update per 500ms.
 */
function debouncedUpdateCockpit() {
  if (_updateDebounceTimer) return;
  _updateDebounceTimer = setTimeout(() => {
    _updateDebounceTimer = null;
    updateCockpit();
  }, 500);
}

/**
 * Update the bottom progress bar
 */
function updateProgressBar(pct) {
  const fill = document.getElementById('cockpitProgressFill');
  if (!fill) return;

  fill.style.width = `${pct}%`;

  // <25% = low (danger), 25-75% = mid (warning), 75-85% = high, 85%+ = complete (success)
  let level = 'low';
  if (pct >= 85) level = 'complete';
  else if (pct >= 75) level = 'high';
  else if (pct >= 25) level = 'mid';

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

  // Start session tracker early so micro-cockpit timer works in portrait
  initSessionTracker();

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

  // Re-compute on sketch changes (debounced to avoid rapid-fire updates)
  if (window.menuEvents) {
    window.menuEvents.on('sketch:changed', debouncedUpdateCockpit);
    window.menuEvents.on('translations:updated', () => {
      if (cockpitEl && window.t) {
        cockpitEl.querySelectorAll('[data-i18n]').forEach(el => {
          const key = el.getAttribute('data-i18n');
          const translated = window.t(key);
          if (translated && translated !== key) {
            el.textContent = translated;
          }
        });
        cockpitEl.querySelectorAll('[data-i18n-title]').forEach(el => {
          const key = el.getAttribute('data-i18n-title');
          const translated = window.t(key);
          if (translated && translated !== key) {
            el.title = translated;
            el.setAttribute('aria-label', translated);
          }
        });
      }
    });
  }

  // Safety-net periodic update (5s instead of 2s — most updates are event-driven now)
  setInterval(() => {
    updateCockpit();
  }, 5000);
}

/**
 * Check if cockpit mode is currently active
 */
export function isCockpitActive() {
  return isActive;
}
