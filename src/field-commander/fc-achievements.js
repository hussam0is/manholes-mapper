/**
 * FC Achievement System — Enhanced quick-win toasts with XP display
 *
 * Extends the cockpit quick-wins pattern:
 *   - 5-minute cooldown between notifications
 *   - Per-day deduplication
 *   - Visual toast with XP earned + combo indicator
 *   - Haptic feedback on milestones
 */

import { xpTracker } from './fc-xp.js';

const COOLDOWN_MS = 5 * 60_000; // 5 minutes
const SHOWN_KEY = 'fc_achievements_shown';
const TOAST_DURATION_MS = 4000;

let lastNotifTime = 0;
let sessionNodeCount = 0;
const shownThisSession = new Set();

/**
 * Initialize achievement listeners
 */
export function initFCAchievements() {
  loadShownState();

  const menuEvents = window.menuEvents;
  if (menuEvents) {
    menuEvents.on('node:added', () => {
      sessionNodeCount++;
      checkNodeMilestone();
    });

    menuEvents.on('sketch:complete', () => {
      showAchievement('success', 'check_circle', getMsg('sketchComplete'));
    });

    menuEvents.on('issues:allResolved', () => {
      showAchievement('success', 'verified', getMsg('allIssuesResolved'));
    });
  }

  // Week streak check
  checkWeekStreak();

  // First RTK fix of the day
  const gnssState = window.__gnssState;
  if (gnssState) {
    let firstRtkToday = false;
    gnssState.on('position', (pos) => {
      if (pos?.fixQuality === 4 && !firstRtkToday) {
        const today = new Date().toISOString().slice(0, 10);
        const shown = getShownToday();
        if (!shown.includes(`rtk_${today}`)) {
          firstRtkToday = true;
          markShown(`rtk_${today}`);
          showAchievement('success', 'gps_fixed', getMsg('rtkReady'));
        }
      }
    });
  }
}

// ── Milestones ─────────────────────────────────────────────────

function checkNodeMilestone() {
  const milestones = [10, 25, 50, 100, 250, 500];
  for (const m of milestones) {
    if (sessionNodeCount === m && !shownThisSession.has(`nodes_${m}`)) {
      shownThisSession.add(`nodes_${m}`);
      showAchievement('milestone', 'stars', getMsg('nodeMilestone', String(m)));
      break;
    }
  }
}

function checkWeekStreak() {
  try {
    const stored = JSON.parse(localStorage.getItem('cockpit_streak') || '{}');
    const days = (stored.days || []).sort();
    if (!days.length) return;

    const today = new Date();
    let streak = 0;
    const checkDate = new Date(today);
    const todayStr = checkDate.toISOString().slice(0, 10);

    if (days.includes(todayStr)) {
      streak = 1;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (let i = 0; i < 365; i++) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      if (days.includes(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    if (streak >= 7) {
      const shown = getShownToday();
      const weekKey = `week_streak_${todayStr}`;
      if (!shown.includes(weekKey)) {
        markShown(weekKey);
        showAchievement('milestone', 'local_fire_department', getMsg('weekStreak', String(streak)));
      }
    }
  } catch { /* ignore */ }
}

// ── Show Toast ─────────────────────────────────────────────────

/**
 * @param {'success'|'milestone'|'info'} type
 * @param {string} icon — Material Icons name
 * @param {string} message
 */
function showAchievement(type, icon, message) {
  // Enforce cooldown
  if (Date.now() - lastNotifTime < COOLDOWN_MS) return;
  lastNotifTime = Date.now();

  // Haptic
  if (type === 'milestone') {
    navigator.vibrate?.([50, 30, 50]);
  } else {
    navigator.vibrate?.([25]);
  }

  // Build toast
  const toast = document.createElement('div');
  toast.className = 'fc-achievement-toast';

  const stats = xpTracker.getStats();
  const comboHtml = stats.comboCount > 0
    ? `<span class="fc-achievement-toast__combo">${stats.multiplier.toFixed(1)}x</span>`
    : '';

  toast.innerHTML = `
    <span class="material-icons fc-achievement-toast__icon fc-achievement-toast__icon--${esc(type)}">${esc(icon)}</span>
    <span class="fc-achievement-toast__text">${esc(message)}</span>
    ${stats.sessionXP > 0 ? `<span class="fc-achievement-toast__xp">+${stats.sessionXP} XP</span>` : ''}
    ${comboHtml}
  `;

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('fc-achievement-toast--show');
    });
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove('fc-achievement-toast--show');
    setTimeout(() => toast.remove(), 400);
  }, TOAST_DURATION_MS);
}

// ── Localization ───────────────────────────────────────────────

function getMsg(key, ...args) {
  const t = window.t;
  if (t) {
    const translated = t(`fc.achievement.${key}`, ...args);
    if (translated !== `fc.achievement.${key}`) return translated;
  }

  const fallbacks = {
    rtkReady: 'RTK Fixed — ready to survey!',
    sketchComplete: 'Sketch complete — zero issues!',
    allIssuesResolved: 'All issues resolved!',
    nodeMilestone: `${args[0]} nodes mapped — great session!`,
    weekStreak: `${args[0]}-day streak — keep it up!`
  };

  return fallbacks[key] || key;
}

// ── Per-day dedup storage ──────────────────────────────────────

function loadShownState() {
  try {
    const stored = JSON.parse(localStorage.getItem(SHOWN_KEY) || '{}');
    const today = new Date().toISOString().slice(0, 10);
    if (stored.date !== today) {
      localStorage.setItem(SHOWN_KEY, JSON.stringify({ date: today, items: [] }));
    }
  } catch { /* ignore */ }
}

function getShownToday() {
  try {
    const stored = JSON.parse(localStorage.getItem(SHOWN_KEY) || '{}');
    const today = new Date().toISOString().slice(0, 10);
    return stored.date === today ? (stored.items || []) : [];
  } catch {
    return [];
  }
}

function markShown(key) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const stored = JSON.parse(localStorage.getItem(SHOWN_KEY) || '{}');
    if (stored.date !== today) {
      stored.date = today;
      stored.items = [];
    }
    stored.items.push(key);
    localStorage.setItem(SHOWN_KEY, JSON.stringify(stored));
  } catch { /* ignore */ }
}

// ── Helpers ────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
