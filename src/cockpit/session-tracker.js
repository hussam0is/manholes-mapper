/**
 * Session Tracker
 * Tracks session duration, nodes/edges placed, and daily streaks.
 * Data persisted in localStorage.
 */

const STORAGE_KEY = 'cockpit_session';
const STREAK_KEY = 'cockpit_streak';

let sessionStart = 0;
let nodesAtStart = 0;
let edgesAtStart = 0;
let timerInterval = null;
let initialized = false;

/**
 * Initialize session tracking
 */
export function initSessionTracker() {
  // Guard against double-init (called from initCockpit + activate)
  if (initialized) return;
  initialized = true;

  sessionStart = Date.now();

  // Capture initial counts
  try {
    const data = window.__getActiveSketchData?.();
    if (data) {
      nodesAtStart = data.nodes?.length || 0;
      edgesAtStart = data.edges?.length || 0;
    }
  } catch {
    // ignore
  }

  // Start timer display
  timerInterval = setInterval(updateSessionDisplay, 1000);

  // Load and update streak
  updateStreakDisplay();

  // Mark today as active (for streak tracking)
  markDayActive();
}

/**
 * Update the session duration and stats display
 */
function updateSessionDisplay() {
  const durationEl = document.getElementById('sessionDuration');
  const nodesEl = document.getElementById('sessionNodes');
  const edgesEl = document.getElementById('sessionEdges');

  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;

  if (durationEl) {
    durationEl.textContent = formatted;
  }

  // Also update micro-cockpit timer (mobile portrait)
  const microTimer = document.getElementById('microSessionTimer');
  if (microTimer) {
    microTimer.textContent = formatted;
  }

  // Count current nodes/edges vs start
  try {
    const data = window.__getActiveSketchData?.();
    if (data) {
      const currentNodes = data.nodes?.length || 0;
      const currentEdges = data.edges?.length || 0;

      if (nodesEl) {
        const diff = currentNodes - nodesAtStart;
        nodesEl.textContent = diff >= 0 ? `+${diff}` : String(diff);
      }
      if (edgesEl) {
        const diff = currentEdges - edgesAtStart;
        edgesEl.textContent = diff >= 0 ? `+${diff}` : String(diff);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Load and display streak data
 */
function updateStreakDisplay() {
  const streakEl = document.getElementById('sessionStreak');
  const streakCountEl = document.getElementById('streakCount');
  if (!streakEl || !streakCountEl) return;

  const streak = getStreak();
  if (streak > 0) {
    streakEl.style.display = '';
    streakCountEl.textContent = String(streak);
  } else {
    streakEl.style.display = 'none';
  }
}

/**
 * Mark today as an active work day for streak tracking
 */
function markDayActive() {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const stored = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}');

    if (!stored.days) stored.days = [];

    // Add today if not already present
    if (!stored.days.includes(today)) {
      stored.days.push(today);

      // Keep only last 60 days to prevent unbounded growth
      if (stored.days.length > 60) {
        stored.days = stored.days.slice(-60);
      }
    }

    localStorage.setItem(STREAK_KEY, JSON.stringify(stored));
  } catch {
    // localStorage might be full or unavailable
  }
}

/**
 * Calculate current consecutive day streak
 * Allows one "freeze" day (gap of 1 day doesn't break streak)
 *
 * @returns {number} Current streak count
 */
function getStreak() {
  try {
    const stored = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}');
    const days = (stored.days || []).sort();

    if (!days.length) return 0;

    // Work backwards from today
    const today = new Date();
    let streak = 0;
    let freezeUsed = false;
    let checkDate = new Date(today);

    // Check if today is in the list
    const todayStr = checkDate.toISOString().slice(0, 10);
    if (!days.includes(todayStr)) {
      // Allow today to not be counted yet (session just started)
      // But start checking from yesterday
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      streak = 1;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Walk backwards
    for (let i = 0; i < 365; i++) {
      const dateStr = checkDate.toISOString().slice(0, 10);

      if (days.includes(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (!freezeUsed) {
        // Use streak freeze (skip one day)
        freezeUsed = true;
        checkDate.setDate(checkDate.getDate() - 1);
        // Don't increment streak for the freeze day
      } else {
        break;
      }
    }

    return streak;
  } catch {
    return 0;
  }
}

/**
 * Get session stats for external use
 */
export function getSessionStats() {
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  let nodesPlaced = 0;
  let edgesDrawn = 0;

  try {
    const data = window.__getActiveSketchData?.();
    if (data) {
      nodesPlaced = (data.nodes?.length || 0) - nodesAtStart;
      edgesDrawn = (data.edges?.length || 0) - edgesAtStart;
    }
  } catch {
    // ignore
  }

  return {
    durationSeconds: elapsed,
    nodesPlaced,
    edgesDrawn,
    streak: getStreak()
  };
}
