/**
 * Progressive Disclosure — Skill Level System
 *
 * Computes user skill level based on node count and GPS captures.
 * Gates advanced features behind experience thresholds.
 */

export const SKILL_LEVELS = {
  APPRENTICE: 1,
  SURVEYOR: 2,
  EXPERT: 3,
  ADMIN: 4,
};

const LEVEL_NAMES = {
  1: 'apprentice',
  2: 'surveyor',
  3: 'expert',
  4: 'admin',
};

// Features gated by skill level
const FEATURE_LEVEL_MAP = {
  heatmap: SKILL_LEVELS.EXPERT,
  tsc3: SKILL_LEVELS.EXPERT,
  fullNodeProperties: SKILL_LEVELS.SURVEYOR,
  adminPanel: SKILL_LEVELS.ADMIN,
};

let _cachedLevel = null;

/**
 * Compute skill level based on user activity.
 * @param {Object} options
 * @param {number} options.totalNodes - Total nodes across all local sketches
 * @param {number} options.gpsCaptures - Number of GPS-captured nodes
 * @param {string} options.role - User role (user/admin/super_admin)
 * @returns {number} Skill level (1-4)
 */
export function computeSkillLevel({ totalNodes = 0, gpsCaptures = 0, role = 'user' } = {}) {
  // Admin/super_admin always gets level 4
  if (role === 'admin' || role === 'super_admin') {
    _cachedLevel = SKILL_LEVELS.ADMIN;
    return SKILL_LEVELS.ADMIN;
  }

  let level = SKILL_LEVELS.APPRENTICE;

  if (totalNodes >= 50) {
    level = SKILL_LEVELS.SURVEYOR;
  }

  if (totalNodes >= 200 && gpsCaptures >= 10) {
    level = SKILL_LEVELS.EXPERT;
  }

  _cachedLevel = level;
  return level;
}

/**
 * Get the current cached skill level.
 */
export function getSkillLevel() {
  return _cachedLevel || SKILL_LEVELS.APPRENTICE;
}

/**
 * Get the i18n key for the skill level name.
 */
export function getSkillLevelName(level) {
  return LEVEL_NAMES[level] || LEVEL_NAMES[1];
}

/**
 * Check if a feature is visible at the current skill level.
 * @param {string} feature - Feature key from FEATURE_LEVEL_MAP
 * @returns {boolean}
 */
export function isFeatureVisible(feature) {
  // "Show all" bypass
  if (localStorage.getItem('skill_show_all') === 'true') return true;

  const requiredLevel = FEATURE_LEVEL_MAP[feature];
  if (requiredLevel == null) return true; // Not gated

  return getSkillLevel() >= requiredLevel;
}

/**
 * Toggle "show all features" bypass.
 */
export function setShowAllFeatures(enabled) {
  localStorage.setItem('skill_show_all', String(enabled));
}

/**
 * Check if "show all" is enabled.
 */
export function isShowAllEnabled() {
  return localStorage.getItem('skill_show_all') === 'true';
}

/**
 * Initialize skill level from local storage data.
 * Call this on session start.
 */
export function initSkillLevel() {
  // Count nodes across all sketches in localStorage
  let totalNodes = 0;
  let gpsCaptures = 0;

  try {
    const sketchesRaw = localStorage.getItem('sketches');
    if (sketchesRaw) {
      const sketches = JSON.parse(sketchesRaw);
      if (Array.isArray(sketches)) {
        for (const sketch of sketches) {
          const nodes = sketch.nodes || [];
          totalNodes += nodes.length;
          gpsCaptures += nodes.filter(n => n.surveyX != null && n.surveyY != null).length;
        }
      }
    }

    // Also check current sketch
    const currentRaw = localStorage.getItem('nodes');
    if (currentRaw) {
      const nodes = JSON.parse(currentRaw);
      if (Array.isArray(nodes)) {
        totalNodes += nodes.length;
        gpsCaptures += nodes.filter(n => n.surveyX != null && n.surveyY != null).length;
      }
    }
  } catch (_) {
    // Ignore parse errors
  }

  const role = window.authGuard?.getAuthState?.()?.role || 'user';
  computeSkillLevel({ totalNodes, gpsCaptures, role });
}
