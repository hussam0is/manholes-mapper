/**
 * If the element #idInput is focused, commit its change and blur.
 * Safe no-op if element is missing.
 */
export function commitIdInputIfFocused() {
  try {
    const idEl = document.getElementById('idInput');
    if (!idEl) return;
    if (document.activeElement === idEl) {
      idEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof idEl.blur === 'function') idEl.blur();
    }
  } catch (_err) {}
}


/**
 * Sync CSS variable --app-height with the actual viewport height.
 * This fixes issues on Android devices (e.g., Samsung Note 10) where 100dvh
 * doesn't calculate correctly, causing the canvas to appear only in half the screen.
 * Uses visualViewport API when available for more accurate measurements.
 */
export function syncAppHeightVar() {
  try {
    const setAppHeight = () => {
      // Use visualViewport height if available (more accurate on mobile)
      // Otherwise fall back to window.innerHeight
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const newVal = `${vh}px`;
      // Only write when value actually changes to avoid unnecessary style mutations
      if (document.documentElement.style.getPropertyValue('--app-height') !== newVal) {
        document.documentElement.style.setProperty('--app-height', newVal);
        return true;
      }
      return false;
    };

    // Set initial value
    setAppHeight();

    // After rotation, mobile browsers can keep reporting the pre-rotation
    // viewport size well past any fixed delay (often >300ms on Android), so
    // fixed setTimeout retries miss the final size. Poll until the reported
    // height stabilizes; when it changes after the original event already
    // fired, re-dispatch a resize event so canvas/layout listeners that read
    // window dimensions re-run with the settled values.
    const SETTLE_INTERVAL_MS = 100;
    const SETTLE_MAX_MS = 2000;
    const SETTLE_STABLE_TICKS = 3;
    let settleTimer = 0;
    const settleAppHeight = () => {
      clearInterval(settleTimer);
      const settleStart = Date.now();
      let stableTicks = 0;
      settleTimer = setInterval(() => {
        if (setAppHeight()) {
          stableTicks = 0;
          window.dispatchEvent(new Event('resize'));
        } else {
          stableTicks++;
        }
        if (stableTicks >= SETTLE_STABLE_TICKS || Date.now() - settleStart > SETTLE_MAX_MS) {
          clearInterval(settleTimer);
          settleTimer = 0;
        }
      }, SETTLE_INTERVAL_MS);
    };

    // Listen for viewport changes
    if (window.visualViewport) {
      // visualViewport fires resize when keyboard opens/closes, orientation changes, etc.
      window.visualViewport.addEventListener('resize', setAppHeight);
    }
    // Regular resize events: apply immediately, then keep polling briefly in
    // case the browser reported a stale (pre-rotation) size. The settleTimer
    // guard keeps the synthetic resize dispatched above from re-entering.
    window.addEventListener('resize', () => {
      setAppHeight();
      if (!settleTimer) settleAppHeight();
    });
    // Handle orientation changes specifically. Browsers differ in which of
    // these fires (and when), so wire all three; the settle loop is idempotent.
    window.addEventListener('orientationchange', settleAppHeight);
    if (window.screen?.orientation?.addEventListener) {
      window.screen.orientation.addEventListener('change', settleAppHeight);
    }
    const orientationMq = window.matchMedia?.('(orientation: portrait)');
    if (orientationMq?.addEventListener) {
      orientationMq.addEventListener('change', settleAppHeight);
    }
    // Watchdog: some WebViews change the viewport without firing any of the
    // events above. A cheap 1s check (one read + string compare) guarantees
    // the layout self-corrects even when every event was missed.
    setInterval(() => {
      if (setAppHeight()) window.dispatchEvent(new Event('resize'));
    }, 1000);
  } catch (_err) {}
}

/**
 * Sync CSS variable --header-h with the actual header height, so overlays
 * such as the details drawer can be positioned beneath it.
 */
export function syncHeaderHeightVar() {
  try {
    const header = document.querySelector('header');
    if (!header) return;
    const setVar = () => {
      const h = Math.round(header.getBoundingClientRect().height);
      const newVal = h + 'px';
      // Only write when value actually changes to avoid unnecessary style mutations
      if (document.documentElement.style.getPropertyValue('--header-h') !== newVal) {
        document.documentElement.style.setProperty('--header-h', newVal);
      }
    };
    setVar();
    if (typeof ResizeObserver !== 'undefined') {
      let rafId = 0;
      const ro = new ResizeObserver(() => {
        if (rafId) return;
        if (typeof requestAnimationFrame === 'function') {
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            setVar();
          });
        } else {
          // Fallback in environments without rAF
          rafId = setTimeout(() => {
            rafId = 0;
            setVar();
          }, 0);
        }
      });
      ro.observe(header);
    } else {
      window.addEventListener('resize', setVar);
    }
  } catch (_err) {}
}

