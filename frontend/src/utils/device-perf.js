/**
 * Device Performance Utilities
 *
 * Detects device capabilities and applies performance budgets accordingly.
 * Targeted at Galaxy Note 10 (Exynos 9825, DPR 2.625, 1080×2280) and similar
 * mid-range Android devices used in the field.
 *
 * Key optimizations:
 * - DPR capping: limits canvas pixel buffer to avoid GPU memory pressure
 * - Frame budget adaptation: adjusts progressive renderer budget per device
 * - Haptic throttling: prevents rapid-fire vibrations that drain battery
 * - Touch coalescing hint: for smoother panning on high-DPR screens
 */

// ── Device detection ─────────────────────────────────────────────────────────

/**
 * Quick heuristic for whether we're on a "mid-range" mobile device.
 * Used to decide how aggressive our perf knobs should be.
 */
function detectDeviceTier() {
  if (typeof navigator === 'undefined') return 'high';
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  if (!isMobile) return 'high'; // Desktop is assumed capable

  // Check GPU via WebGL renderer string
  let gpuTier = 'mid';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
        // Mali-G76 (Note 10 Exynos), Adreno 6xx series, etc.
        if (/Mali-G7[0-9]|Adreno 6[0-4]/i.test(renderer)) gpuTier = 'mid';
        else if (/Mali-G[89]|Adreno 7|Apple GPU/i.test(renderer)) gpuTier = 'high';
        else gpuTier = 'low';
      }
    }
  } catch (_) { /* WebGL unavailable — assume mid */ }

  // Hardware concurrency (CPU cores) as secondary signal
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 4 && gpuTier !== 'high') return 'low';
  if (cores <= 8 && gpuTier === 'mid') return 'mid';
  return gpuTier;
}

let _cachedTier = null;

/**
 * Get the detected device tier: 'low', 'mid', or 'high'.
 * Result is cached after first call.
 * @returns {'low'|'mid'|'high'}
 */
export function getDeviceTier() {
  if (_cachedTier === null) _cachedTier = detectDeviceTier();
  return _cachedTier;
}

// ── DPR capping ──────────────────────────────────────────────────────────────

/**
 * Get the effective DPR for canvas sizing.
 *
 * Galaxy Note 10 has DPR 2.625, meaning a 1080px-wide canvas becomes
 * 2835 physical pixels — that's 2835×6000+ pixel buffer per frame, which
 * strains the GPU. Capping at 2.0 gives a 2160×4560 buffer (~40% fewer
 * pixels) with negligible visual difference on a 6.3" screen.
 *
 * @param {number} [maxDpr] - Override maximum DPR (default: tier-based)
 * @returns {number} Capped DPR value
 */
export function getEffectiveDpr(maxDpr) {
  const raw = window.devicePixelRatio || 1;
  if (maxDpr != null) return Math.min(raw, maxDpr);

  const tier = getDeviceTier();
  switch (tier) {
    case 'low':  return Math.min(raw, 1.5);
    case 'mid':  return Math.min(raw, 2.0);
    case 'high': return raw; // full resolution
    default:     return Math.min(raw, 2.0);
  }
}

// ── Haptic throttling ────────────────────────────────────────────────────────

let _lastVibrate = 0;

/**
 * Throttled haptic feedback. Prevents rapid-fire vibrations that:
 * - Drain battery on field devices
 * - Feel unpleasant to users
 * - Can trigger OS-level vibration rate limits
 *
 * @param {number|number[]} pattern - Vibration pattern (ms or array)
 * @param {number} [minIntervalMs=80] - Minimum ms between vibrations
 * @returns {boolean} Whether the vibration was actually triggered
 */
export function throttledVibrate(pattern = 15, minIntervalMs = 80) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return false;
  const now = performance.now();
  if (now - _lastVibrate < minIntervalMs) return false;
  _lastVibrate = now;
  return navigator.vibrate(pattern);
}

// ── Frame budget ─────────────────────────────────────────────────────────────

/**
 * Get the recommended frame budget for progressive rendering (ms).
 * Lower budgets on weaker devices to maintain 30fps minimum.
 * @returns {number}
 */
export function getFrameBudgetMs() {
  const tier = getDeviceTier();
  switch (tier) {
    case 'low':  return 6;   // 6ms budget → leaves room for compositing
    case 'mid':  return 8;   // 8ms budget → targets 60fps on Note 10
    case 'high': return 12;  // 12ms budget → can afford more per frame
    default:     return 10;
  }
}

// ── Canvas resize helper ─────────────────────────────────────────────────────

/**
 * Resize a canvas element accounting for DPR capping.
 * Sets the physical pixel dimensions and CSS dimensions so the canvas
 * renders at the effective DPR without over-allocating GPU memory.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} cssWidth - Desired CSS width in px
 * @param {number} cssHeight - Desired CSS height in px
 * @param {CanvasRenderingContext2D} [ctx] - If provided, applies DPR scale
 * @returns {{dpr: number, physicalWidth: number, physicalHeight: number}}
 */
export function resizeCanvasForDevice(canvas, cssWidth, cssHeight, ctx) {
  const dpr = getEffectiveDpr();
  const physicalWidth = Math.round(cssWidth * dpr);
  const physicalHeight = Math.round(cssHeight * dpr);

  if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
  }

  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return { dpr, physicalWidth, physicalHeight };
}

// ── Touch coalescing ─────────────────────────────────────────────────────────

/**
 * Check if the browser supports `getCoalescedEvents()` for smoother
 * pointer tracking on high-DPR touch screens.
 * @returns {boolean}
 */
export function supportsCoalescedEvents() {
  return typeof PointerEvent !== 'undefined' &&
    'getCoalescedEvents' in PointerEvent.prototype;
}
