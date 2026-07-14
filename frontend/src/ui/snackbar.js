/**
 * snackbar.js — stacking, actionable snackbar system (Wolt-style feedback).
 *
 * Replaces the single-element #toast: messages stack (up to 3 visible, FIFO
 * queue beyond that), carry severity + icon + optional action buttons, show a
 * time-remaining progress bar, pause on hover/touch, and can be dismissed.
 *
 * Back-compat: exposes showToast(message, variantOrDuration, durationMs) and
 * claims window.showToast BEFORE utils/toast.js loads (main-entry import
 * order), so every existing showToast call site upgrades automatically.
 *
 * Layout: bottom-center, clear of the landscape FABs (see snackbar.css);
 * z-index 170 (between #toast at 160 and the app header at 200).
 */
import './snackbar.css';

const VARIANTS = ['success', 'error', 'warning', 'info'];
const DEFAULT_DURATION = { success: 2400, info: 2800, warning: 5000, error: 8000 };
const MAX_VISIBLE = 3;

const ICONS = {
  success: 'check_circle',
  info: 'info',
  warning: 'warning_amber',
  error: 'error',
};

/** @type {Array<() => void>} pending shows beyond MAX_VISIBLE */
const queue = [];
let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.id = 'snackbarContainer';
  container.setAttribute('role', 'region');
  // no aria-live here — each item carries role=status/alert; a live container
  // would double-announce every insertion to screen readers
  container.setAttribute('aria-label', 'notifications');
  document.body.appendChild(container);
  return container;
}

function visibleItems() {
  return container ? Array.from(container.querySelectorAll('.snackbar-item:not(.leaving)')) : [];
}

function promoteQueue() {
  while (queue.length > 0 && visibleItems().length < MAX_VISIBLE) {
    const next = queue.shift();
    next();
  }
}

/**
 * Show a snackbar.
 *
 * @param {Object} opts
 * @param {string} opts.message         main text (plain text, not HTML)
 * @param {string} [opts.title]         optional bold first line
 * @param {'success'|'error'|'warning'|'info'} [opts.variant='info']
 * @param {string} [opts.kind]          machine-readable tag (data-kind), used for dedup + tests
 * @param {number} [opts.duration]      ms; defaults per variant
 * @param {string} [opts.icon]          material icon name override
 * @param {boolean} [opts.sticky]       never auto-dismiss
 * @param {Array<{label: string, onClick?: Function, primary?: boolean}>} [opts.actions]
 * @returns {{ dismiss: () => void, el: HTMLElement|null }}
 */
export function showSnackbar(opts) {
  if (typeof document === 'undefined' || !document.body) return { dismiss() {}, el: null };
  const {
    message = '',
    title = '',
    kind = '',
    duration,
    icon,
    sticky = false,
    actions = [],
  } = opts || {};
  const variant = VARIANTS.includes(opts?.variant) ? opts.variant : 'info';

  ensureContainer();

  // Dedup: an identical visible message just gets its timer refreshed.
  // (data-kind is unset for kind-less items — normalize both sides to ''.)
  const dup = visibleItems().find(
    (el) => (el.getAttribute('data-kind') || '') === (kind || '') && el.__snackbarMessage === message,
  );
  if (dup && dup.__snackbarRefresh) {
    dup.__snackbarRefresh();
    return { dismiss: dup.__snackbarDismiss, el: dup };
  }

  let el = null;
  let dismissed = false;
  let timerId = null;
  let remaining = sticky ? Infinity : (duration ?? DEFAULT_DURATION[variant]);
  let startedAt = 0;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true; // also cancels a still-queued show()
    if (!el) return;
    if (timerId) clearTimeout(timerId);
    el.classList.add('leaving');
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      el?.remove();
      promoteQueue();
    };
    // only the item's own transition — the progress fill's transitionend
    // bubbles up and would truncate the exit animation
    el.addEventListener('transitionend', (ev) => { if (ev.target === el) remove(); });
    setTimeout(remove, 400); // fallback if transitions are disabled
  };

  const startTimer = () => {
    if (sticky || dismissed) return;
    startedAt = Date.now();
    timerId = setTimeout(dismiss, remaining);
    if (el) {
      const fill = el.querySelector('.snackbar-progress-fill');
      if (fill) {
        fill.style.transitionDuration = `${remaining}ms`;
        // next frame so the transition actually runs
        requestAnimationFrame(() => requestAnimationFrame(() => {
          fill.style.transform = 'scaleX(0)';
        }));
      }
    }
  };
  const pauseTimer = () => {
    if (sticky || dismissed || !timerId) return;
    clearTimeout(timerId);
    timerId = null;
    remaining = Math.max(800, remaining - (Date.now() - startedAt));
    const fill = el?.querySelector('.snackbar-progress-fill');
    if (fill) {
      const w = fill.getBoundingClientRect().width;
      const total = fill.parentElement.getBoundingClientRect().width || 1;
      fill.style.transitionDuration = '0ms';
      fill.style.transform = `scaleX(${w / total})`;
    }
  };

  let hovered = false;
  const show = () => {
    if (dismissed) return; // dismissed while still queued
    el = document.createElement('div');
    el.className = 'snackbar-item';
    el.setAttribute('data-variant', variant);
    if (kind) el.setAttribute('data-kind', kind);
    el.setAttribute('role', variant === 'error' || variant === 'warning' ? 'alert' : 'status');
    el.__snackbarMessage = message;

    const iconEl = document.createElement('span');
    iconEl.className = 'material-icons snackbar-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon || ICONS[variant];
    el.appendChild(iconEl);

    const body = document.createElement('div');
    body.className = 'snackbar-body';
    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'snackbar-title';
      titleEl.textContent = title;
      body.appendChild(titleEl);
    }
    const msgEl = document.createElement('div');
    msgEl.className = 'snackbar-msg';
    msgEl.textContent = message;
    body.appendChild(msgEl);
    el.appendChild(body);

    if (actions.length > 0) {
      const actionsEl = document.createElement('div');
      actionsEl.className = 'snackbar-actions';
      for (const a of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'snackbar-action';
        if (a.primary) btn.setAttribute('data-primary', '');
        btn.textContent = a.label;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          try { a.onClick?.(); } catch (err) { console.error('[snackbar] action failed', err); }
          dismiss();
        });
        actionsEl.appendChild(btn);
      }
      el.appendChild(actionsEl);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'material-icons snackbar-close';
    closeBtn.setAttribute('aria-label', window.t?.('snackbar.dismiss') || 'Dismiss');
    closeBtn.textContent = 'close';
    closeBtn.addEventListener('click', dismiss);
    el.appendChild(closeBtn);

    if (!sticky) {
      const progress = document.createElement('div');
      progress.className = 'snackbar-progress';
      const fill = document.createElement('div');
      fill.className = 'snackbar-progress-fill';
      progress.appendChild(fill);
      el.appendChild(progress);
    }

    // Hover-pause is a mouse affordance only: touch taps fire pointerenter
    // without a reliable pointerleave and would freeze the stack (TSC5 is
    // touch-first). A hard max-lifetime failsafe guards the queue regardless.
    el.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') { hovered = true; pauseTimer(); } });
    el.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') { hovered = false; startTimer(); } });
    if (!sticky) {
      const maxLifetime = (duration ?? DEFAULT_DURATION[variant]) * 3 + 5000;
      setTimeout(dismiss, maxLifetime);
    }
    el.__snackbarDismiss = dismiss;
    el.__snackbarRefresh = () => {
      pauseTimer();
      remaining = sticky ? Infinity : (duration ?? DEFAULT_DURATION[variant]);
      if (!hovered) startTimer(); // stay paused under the cursor
    };

    container.appendChild(el);
    // enter transition
    requestAnimationFrame(() => el.classList.add('shown'));
    startTimer();
  };

  const isUrgent = variant === 'error' || variant === 'warning';
  if (visibleItems().length >= MAX_VISIBLE) {
    if (isUrgent) {
      // Alerts never wait behind info/success toasts: evict the oldest
      // non-urgent visible item and show immediately.
      const evictable = visibleItems().find((it) =>
        it.getAttribute('data-variant') === 'success' || it.getAttribute('data-variant') === 'info');
      if (evictable && evictable.__snackbarDismiss) {
        evictable.__snackbarDismiss();
        show();
      } else {
        queue.unshift(show);
      }
    } else {
      queue.push(show);
    }
  } else {
    show();
  }
  return { dismiss, el };
}

/**
 * Legacy-compatible toast API (same signature as utils/toast.js showToast).
 * @param {string} message
 * @param {string|number} [variantOrDuration]
 * @param {number} [durationMs]
 */
export function showToast(message, variantOrDuration, durationMs) {
  let variant = 'info';
  let duration;
  if (typeof variantOrDuration === 'string' && VARIANTS.includes(variantOrDuration)) {
    variant = variantOrDuration;
    if (typeof durationMs === 'number') duration = durationMs;
  } else if (typeof variantOrDuration === 'number') {
    duration = variantOrDuration;
  }
  return showSnackbar({ message: String(message ?? ''), variant, duration });
}

// Claim the global BEFORE utils/toast.js loads (it only assigns when
// window.showToast is still undefined) — every legacy call site upgrades.
if (typeof window !== 'undefined' && !window.showToast) {
  window.showToast = showToast;
  window.showSnackbar = showSnackbar;
}
