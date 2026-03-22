/**
 * Quick-Win Notification System
 * Context-aware toasts that celebrate real achievements.
 * Rule: Max 1 notification per 5 minutes. Never during active drawing.
 */

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const SHOWN_KEY = 'cockpit_quickwins_shown';

let lastNotifTime = 0;
let sessionNodeCount = 0;
let firstRtkToday = false;
let shownThisSession = new Set();

/**
 * Initialize quick-win listeners
 */
export function initQuickWins() {
  // Track node additions
  if (window.menuEvents) {
    window.menuEvents.on('node:added', () => {
      sessionNodeCount++;
      checkNodeMilestone();
    });

    window.menuEvents.on('sketch:complete', () => {
      showQuickWin('milestone', 'check_circle', getMsg('sketchComplete'));
    });

    window.menuEvents.on('issues:allResolved', () => {
      showQuickWin('success', 'verified', getMsg('allIssuesResolved'));
    });
  }

  // Track first RTK fix of the day
  const gnssState = window.__gnssState;
  if (gnssState) {
    gnssState.on('position', (pos) => {
      if (pos?.fixQuality === 4 && !firstRtkToday) {
        const today = new Date().toISOString().slice(0, 10);
        const shown = getShownToday();
        if (!shown.includes(`rtk_${today}`)) {
          firstRtkToday = true;
          markShown(`rtk_${today}`);
          showQuickWin('success', 'gps_fixed', getMsg('rtkReady'));
        }
      }
    });
  }

  // Load today's shown notifications
  loadShownState();
}

/**
 * Check if we've hit a node milestone
 */
function checkNodeMilestone() {
  const milestones = [10, 25, 50, 100];
  for (const m of milestones) {
    if (sessionNodeCount === m && !shownThisSession.has(`nodes_${m}`)) {
      shownThisSession.add(`nodes_${m}`);
      showQuickWin('milestone', 'stars',
        getMsg('nodeMilestone', String(m))
      );
      break;
    }
  }
}

/**
 * Display a quick-win notification
 * @param {'success'|'info'|'milestone'} type
 * @param {string} icon - Material Icons name
 * @param {string} message
 */
function showQuickWin(type, icon, message) {
  // Enforce cooldown
  if (Date.now() - lastNotifTime < COOLDOWN_MS) return;
  lastNotifTime = Date.now();

  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'quick-win-toast';
  toast.innerHTML = `
    <span class="material-icons quick-win-toast__icon quick-win-toast__icon--${type}">${escapeText(icon)}</span>
    <span class="quick-win-toast__text">${escapeText(message)}</span>
  `;

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
  });

  // Auto-dismiss after 4s
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/**
 * Get localized message
 */
function getMsg(key, ...args) {
  const t = window.t;
  if (t) {
    const translated = t(`cockpit.quickWin.${key}`, ...args);
    if (translated !== `cockpit.quickWin.${key}`) return translated;
  }

  // Fallback English
  const fallbacks = {
    rtkReady: 'RTK Fixed — ready to survey',
    sketchComplete: 'Sketch complete — zero issues',
    allIssuesResolved: 'All issues resolved — sketch is clean',
    nodeMilestone: `${args[0]} nodes mapped — strong session`
  };

  return fallbacks[key] || key;
}

/**
 * Track which notifications have been shown today
 */
function loadShownState() {
  try {
    const stored = JSON.parse(localStorage.getItem(SHOWN_KEY) || '{}');
    const today = new Date().toISOString().slice(0, 10);

    // Clear old entries
    if (stored.date !== today) {
      localStorage.setItem(SHOWN_KEY, JSON.stringify({ date: today, items: [] }));
    }
  } catch {
    // ignore
  }
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
  } catch {
    // ignore
  }
}

/**
 * Simple text escaping for injection into innerHTML
 */
function escapeText(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
