/**
 * Precision Measure Overlay
 * DOM bottom-sheet showing measurement progress: HRMS/VRMS bars,
 * occupation timer, epoch counter, fix type badge, and action buttons.
 */

let overlayEl = null;

// Element refs (set during init)
let els = {};

/** Shorthand for i18n */
function _t(key) {
  return typeof window.t === 'function' ? window.t(key) : key;
}

const FIX_COLORS = {
  0: '#6b7280', 1: '#f59e0b', 2: '#f59e0b', 3: '#f59e0b',
  4: '#22c55e', 5: '#3b82f6', 6: '#9ca3af', 7: '#9ca3af', 8: '#9ca3af',
};

/**
 * Initialize the overlay DOM element (call once at startup).
 */
export function initPrecisionMeasureOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.id = 'precisionMeasureOverlay';
  overlayEl.className = 'pm-overlay';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.style.display = 'none';

  overlayEl.innerHTML = `
    <div class="pm-overlay__header">
      <div class="pm-overlay__title">
        <span class="material-icons pm-overlay__spinner">hourglass_top</span>
        <span id="pmTitle">${_t('precisionMeasure.measuring')}</span>
      </div>
      <button class="pm-overlay__close" id="pmClose" aria-label="Cancel">
        <span class="material-icons">close</span>
      </button>
    </div>

    <div class="pm-overlay__body">
      <!-- Fix status row -->
      <div class="pm-overlay__fix-row">
        <span class="pm-overlay__fix-badge" id="pmFixBadge">--</span>
        <span class="pm-overlay__fix-detail" id="pmSats">
          <span class="material-icons" style="font-size:16px">satellite_alt</span>
          <span id="pmSatsVal">0</span>
        </span>
        <span class="pm-overlay__fix-detail" id="pmHdop">
          HDOP <span id="pmHdopVal">--</span>
        </span>
        <span class="pm-overlay__fix-detail" id="pmDiffAge" style="display:none">
          Age <span id="pmDiffAgeVal">--</span>s
        </span>
      </div>

      <!-- HRMS criterion -->
      <div class="pm-overlay__criterion" id="pmHrmsCriterion">
        <div class="pm-overlay__criterion-label">
          <span>HRMS</span>
          <span><span id="pmHrmsVal">--</span> / <span id="pmHrmsTarget">0.015</span>m</span>
        </div>
        <div class="pm-overlay__bar">
          <div class="pm-overlay__bar-fill" id="pmHrmsBar" style="width:0%"></div>
        </div>
      </div>

      <!-- VRMS criterion -->
      <div class="pm-overlay__criterion" id="pmVrmsCriterion">
        <div class="pm-overlay__criterion-label">
          <span>VRMS</span>
          <span><span id="pmVrmsVal">--</span> / <span id="pmVrmsTarget">0.020</span>m</span>
        </div>
        <div class="pm-overlay__bar">
          <div class="pm-overlay__bar-fill" id="pmVrmsBar" style="width:0%"></div>
        </div>
      </div>

      <!-- Occupation criterion -->
      <div class="pm-overlay__criterion">
        <div class="pm-overlay__criterion-label">
          <span>${_t('precisionMeasure.occupation')}</span>
          <span><span id="pmOccVal">0.0</span>s / <span id="pmOccTarget">5.0</span>s</span>
        </div>
        <div class="pm-overlay__bar">
          <div class="pm-overlay__bar-fill" id="pmOccBar" style="width:0%"></div>
        </div>
      </div>

      <!-- Epochs criterion -->
      <div class="pm-overlay__criterion">
        <div class="pm-overlay__criterion-label">
          <span>${_t('precisionMeasure.epochs')}</span>
          <span><span id="pmEpochVal">0</span> / <span id="pmEpochTarget">5</span></span>
        </div>
        <div class="pm-overlay__bar">
          <div class="pm-overlay__bar-fill" id="pmEpochBar" style="width:0%"></div>
        </div>
      </div>
    </div>

    <div class="pm-overlay__footer">
      <button class="pm-overlay__btn pm-overlay__btn--cancel" id="pmCancel">
        <span class="material-icons">close</span>
        ${_t('precisionMeasure.cancel')}
      </button>
      <button class="pm-overlay__btn pm-overlay__btn--accept" id="pmAccept">
        <span class="material-icons">check</span>
        ${_t('precisionMeasure.acceptEarly')}
      </button>
    </div>
  `;

  document.body.appendChild(overlayEl);

  // Cache element refs
  els = {
    title: overlayEl.querySelector('#pmTitle'),
    close: overlayEl.querySelector('#pmClose'),
    fixBadge: overlayEl.querySelector('#pmFixBadge'),
    satsVal: overlayEl.querySelector('#pmSatsVal'),
    hdopVal: overlayEl.querySelector('#pmHdopVal'),
    diffAge: overlayEl.querySelector('#pmDiffAge'),
    diffAgeVal: overlayEl.querySelector('#pmDiffAgeVal'),
    hrmsVal: overlayEl.querySelector('#pmHrmsVal'),
    hrmsTarget: overlayEl.querySelector('#pmHrmsTarget'),
    hrmsBar: overlayEl.querySelector('#pmHrmsBar'),
    hrmsCriterion: overlayEl.querySelector('#pmHrmsCriterion'),
    vrmsVal: overlayEl.querySelector('#pmVrmsVal'),
    vrmsTarget: overlayEl.querySelector('#pmVrmsTarget'),
    vrmsBar: overlayEl.querySelector('#pmVrmsBar'),
    vrmsCriterion: overlayEl.querySelector('#pmVrmsCriterion'),
    occVal: overlayEl.querySelector('#pmOccVal'),
    occTarget: overlayEl.querySelector('#pmOccTarget'),
    occBar: overlayEl.querySelector('#pmOccBar'),
    epochVal: overlayEl.querySelector('#pmEpochVal'),
    epochTarget: overlayEl.querySelector('#pmEpochTarget'),
    epochBar: overlayEl.querySelector('#pmEpochBar'),
    cancel: overlayEl.querySelector('#pmCancel'),
    accept: overlayEl.querySelector('#pmAccept'),
    spinner: overlayEl.querySelector('.pm-overlay__spinner'),
  };
}

/**
 * Format precision value for display.
 * @param {number|null} val
 * @returns {string}
 */
function fmtPrecision(val) {
  if (val == null) return '--';
  return val < 1 ? val.toFixed(3) : val.toFixed(2);
}

/**
 * Show the precision measure overlay.
 * @param {object} options
 * @param {Function} options.onCancel - Called when user cancels
 * @param {Function} options.onAcceptEarly - Called when user accepts early
 * @returns {{ update: Function, close: Function, showAutoStored: Function }}
 */
export function showPrecisionOverlay({ onCancel, onAcceptEarly }) {
  if (!overlayEl) initPrecisionMeasureOverlay();

  // Wire button handlers
  const handleCancel = () => { if (onCancel) onCancel(); };
  const handleAccept = () => { if (onAcceptEarly) onAcceptEarly(); };
  const handleKeydown = (e) => {
    if (e.key === 'Escape') handleCancel();
  };

  els.cancel.onclick = handleCancel;
  els.accept.onclick = handleAccept;
  els.close.onclick = handleCancel;
  document.addEventListener('keydown', handleKeydown);

  // Reset visuals
  overlayEl.classList.remove('pm-overlay--auto-stored');
  els.spinner.textContent = 'hourglass_top';
  els.title.textContent = _t('precisionMeasure.measuring');

  // Show with animation
  overlayEl.style.display = '';
  requestAnimationFrame(() => {
    overlayEl.classList.add('pm-overlay--visible');
  });

  function cleanup() {
    document.removeEventListener('keydown', handleKeydown);
    els.cancel.onclick = null;
    els.accept.onclick = null;
    els.close.onclick = null;
  }

  return {
    /**
     * Update the overlay with new measurement stats.
     * @param {object} stats - From PrecisionMeasurement.getStats()
     */
    update(stats) {
      const cfg = stats.config || {};

      // Fix badge
      els.fixBadge.textContent = stats.currentFixLabel;
      els.fixBadge.style.background = FIX_COLORS[stats.currentFixQuality] || FIX_COLORS[0];

      // Satellites + HDOP
      els.satsVal.textContent = stats.currentSatellites || 0;
      els.hdopVal.textContent = stats.currentHdop != null ? stats.currentHdop.toFixed(1) : '--';

      // Diff age (only show if available)
      if (stats.currentDiffAge != null) {
        els.diffAge.style.display = '';
        els.diffAgeVal.textContent = stats.currentDiffAge.toFixed(1);
      } else {
        els.diffAge.style.display = 'none';
      }

      // HRMS
      els.hrmsVal.textContent = fmtPrecision(stats.currentHrms);
      els.hrmsTarget.textContent = (cfg.hrmsThreshold || 0.015).toFixed(3);
      els.hrmsBar.style.width = `${Math.min(100, stats.hrmsProgress * 100)}%`;
      els.hrmsBar.classList.toggle('pm-overlay__bar-fill--met', stats.hrmsMet);

      // VRMS (hide if adapter doesn't provide it)
      if (stats.currentVrms != null) {
        els.vrmsCriterion.style.display = '';
        els.vrmsVal.textContent = fmtPrecision(stats.currentVrms);
        els.vrmsTarget.textContent = (cfg.vrmsThreshold || 0.020).toFixed(3);
        els.vrmsBar.style.width = `${Math.min(100, stats.vrmsProgress * 100)}%`;
        els.vrmsBar.classList.toggle('pm-overlay__bar-fill--met', stats.vrmsMet);
      } else {
        els.vrmsCriterion.style.display = 'none';
      }

      // Occupation
      els.occVal.textContent = stats.elapsedSec.toFixed(1);
      els.occTarget.textContent = (cfg.occupationTimeSec || 5).toFixed(1);
      els.occBar.style.width = `${Math.min(100, stats.occupationProgress * 100)}%`;
      els.occBar.classList.toggle('pm-overlay__bar-fill--met', stats.occupationMet);

      // Epochs
      els.epochVal.textContent = stats.epochCount;
      els.epochTarget.textContent = cfg.minEpochs || 5;
      els.epochBar.style.width = `${Math.min(100, stats.epochProgress * 100)}%`;
      els.epochBar.classList.toggle('pm-overlay__bar-fill--met', stats.epochsMet);
    },

    /**
     * Close the overlay.
     */
    close() {
      cleanup();
      overlayEl.classList.remove('pm-overlay--visible');
      setTimeout(() => {
        overlayEl.style.display = 'none';
        overlayEl.classList.remove('pm-overlay--auto-stored');
      }, 300);
    },

    /**
     * Show auto-stored success flash, then close.
     */
    showAutoStored() {
      els.spinner.textContent = 'check_circle';
      els.title.textContent = _t('precisionMeasure.autoStored');
      overlayEl.classList.add('pm-overlay--auto-stored');
    },
  };
}
