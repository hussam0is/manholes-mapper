/**
 * FC XP Tracker — Experience points, combo multiplier, display
 *
 * XP values:
 *   node placed:       10 XP
 *   edge drawn:         5 XP
 *   GPS capture:       25 XP
 *   RTK capture:       50 XP
 *   measurement filled: 15 XP
 *   issue resolved:    30 XP
 *   sketch complete:  200 XP
 */

const STORAGE_KEY = 'fc_total_xp';
const SESSION_KEY = 'fc_session_xp';
const COMBO_WINDOW_MS = 30_000; // 30 seconds

const XP_VALUES = {
  node_placed: 10,
  edge_drawn: 5,
  gps_capture: 25,
  rtk_capture: 50,
  measurement_filled: 15,
  issue_resolved: 30,
  sketch_complete: 200,
};

class XPTracker {
  constructor() {
    this.sessionXP = 0;
    this.totalXP = 0;
    this.comboCount = 0;
    this.lastActionTime = 0;
  }

  init() {
    this.totalXP = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    this.sessionXP = 0;
    this.updateDisplay();
  }

  /**
   * Award XP for an action
   * @param {string} action - Key from XP_VALUES
   * @returns {number} XP awarded (including combo bonus)
   */
  award(action) {
    const base = XP_VALUES[action] || 0;
    if (!base) return 0;

    // Combo: rapid actions within COMBO_WINDOW_MS
    const now = Date.now();
    if (now - this.lastActionTime < COMBO_WINDOW_MS) {
      this.comboCount = Math.min(this.comboCount + 1, 5);
    } else {
      this.comboCount = 0;
    }
    this.lastActionTime = now;

    const multiplier = 1 + (this.comboCount * 0.2); // up to 2x
    const xp = Math.round(base * multiplier);

    this.sessionXP += xp;
    this.totalXP += xp;
    this.save();
    this.updateDisplay();

    return xp;
  }

  getComboMultiplier() {
    return 1 + (this.comboCount * 0.2);
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, String(this.totalXP));
    } catch { /* quota exceeded */ }
  }

  updateDisplay() {
    const badge = document.getElementById('fcXpBadge');
    if (!badge) return;
    badge.textContent = `${this.sessionXP} XP`;
    badge.classList.remove('fc-xp-bump');
    // Force reflow for re-triggering animation
    void badge.offsetWidth;
    if (this.sessionXP > 0) {
      badge.classList.add('fc-xp-bump');
    }
  }

  getStats() {
    return {
      sessionXP: this.sessionXP,
      totalXP: this.totalXP,
      comboCount: this.comboCount,
      multiplier: this.getComboMultiplier()
    };
  }
}

export const xpTracker = new XPTracker();

let lastGpsCaptureFixQuality = 0;

/**
 * Wire XP tracking to app events
 */
export function initXPTracker() {
  xpTracker.init();

  const menuEvents = window.menuEvents;
  if (menuEvents) {
    menuEvents.on('node:added', () => {
      const xp = xpTracker.award('node_placed');
      // Haptic feedback
      if (xp > 0) navigator.vibrate?.([10]);
    });

    menuEvents.on('edge:added', () => {
      xpTracker.award('edge_drawn');
    });

    menuEvents.on('sketch:complete', () => {
      xpTracker.award('sketch_complete');
    });

    menuEvents.on('issues:allResolved', () => {
      xpTracker.award('issue_resolved');
    });
  }

  // Track GPS captures via gnssState
  const gnssState = window.__gnssState;
  if (gnssState) {
    gnssState.on('position', (pos) => {
      if (pos?.fixQuality >= 1) {
        lastGpsCaptureFixQuality = pos.fixQuality;
      }
    });
  }

  // Hook into precision measure completion
  const origCreate = window.__createNodeFromMeasurement;
  if (typeof origCreate === 'function') {
    window.__createNodeFromMeasurement = function (...args) {
      const result = origCreate.apply(this, args);
      // Award based on fix quality
      if (lastGpsCaptureFixQuality === 4) {
        xpTracker.award('rtk_capture');
      } else if (lastGpsCaptureFixQuality >= 1) {
        xpTracker.award('gps_capture');
      }
      return result;
    };
  }
}
