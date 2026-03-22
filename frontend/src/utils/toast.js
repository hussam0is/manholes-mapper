// Toast utility module. Provides a global-compatible showToast used by legacy code.
// Usage: import './utils/toast.js' early to ensure window.showToast exists.

const VALID_VARIANTS = ['success', 'error', 'warning', 'info'];

/**
 * Show a transient toast message at the bottom of the screen.
 * Falls back safely if #toast is missing.
 * @param {string} message
 * @param {string|number} [variantOrDuration] - variant string ('error','warning','success','info') or duration in ms
 * @param {number} [durationMs] - duration in ms (default 1800)
 */
export function showToast(message, variantOrDuration, durationMs) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;

  // Parse flexible arguments: showToast(msg), showToast(msg, variant), showToast(msg, duration), showToast(msg, variant, duration)
  let variant = null;
  let duration = 1800;
  if (typeof variantOrDuration === 'string' && VALID_VARIANTS.includes(variantOrDuration)) {
    variant = variantOrDuration;
    duration = typeof durationMs === 'number' ? durationMs : 1800;
  } else if (typeof variantOrDuration === 'number') {
    duration = variantOrDuration;
  }

  toastEl.textContent = String(message);
  // Set or clear variant
  if (variant) {
    toastEl.setAttribute('data-variant', variant);
  } else {
    toastEl.removeAttribute('data-variant');
  }
  toastEl.classList.add('show');
  window.clearTimeout(showToast._timerId);
  showToast._timerId = window.setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

// Provide a global for legacy script references
if (typeof window !== 'undefined') {
  // Only define if not already defined to avoid double-binding during migration
  if (typeof window.showToast !== 'function') {
    window.showToast = showToast;
  }
}
