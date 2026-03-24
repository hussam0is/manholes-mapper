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
      }
    };
    
    // Set initial value
    setAppHeight();
    
    // Listen for viewport changes
    if (window.visualViewport) {
      // visualViewport fires resize when keyboard opens/closes, orientation changes, etc.
      window.visualViewport.addEventListener('resize', setAppHeight);
    }
    // Also listen for regular resize events as a fallback
    window.addEventListener('resize', setAppHeight);
    // Handle orientation changes specifically (some Android browsers need this)
    window.addEventListener('orientationchange', () => {
      // Delay slightly to allow the browser to finish orientation transition
      setTimeout(setAppHeight, 100);
      setTimeout(setAppHeight, 300);
    });
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

