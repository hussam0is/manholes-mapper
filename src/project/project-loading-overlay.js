/**
 * Project Loading Overlay
 *
 * Full-screen overlay with progress bar and step indicators shown while
 * a project is loading (sketches, layers, canvas prep, tile pre-cache).
 * Provides visual feedback instead of an empty canvas during the 2-3s load.
 */

/** @type {(key: string, ...args: any[]) => string} */
const t = (key, ...args) => (typeof window.t === 'function' ? window.t(key, ...args) : key);

// ── Constants ──────────────────────────────────────────────────────────────

const SAFETY_TIMEOUT_MS = 15000; // 15s max before auto-hide
const FADE_OUT_MS = 300;

/** Step definitions with their weight in the progress bar (must sum to 100) */
const STEPS = [
  { id: 'sketches', icon: 'description',    labelKey: 'projects.canvas.loadingSketches',    doneKey: 'projects.canvas.loadingSketchesDone',    weight: 40 },
  { id: 'layers',   icon: 'layers',         labelKey: 'projects.canvas.loadingLayers',      doneKey: 'projects.canvas.loadingLayersDone',      weight: 20 },
  { id: 'canvas',   icon: 'brush',          labelKey: 'projects.canvas.loadingCanvas',      doneKey: 'projects.canvas.loadingCanvasDone',      weight: 30 },
  { id: 'tiles',    icon: 'grid_view',      labelKey: 'projects.canvas.loadingTiles',       doneKey: 'projects.canvas.loadingTilesDone',       weight: 10 },
];

// ── State ──────────────────────────────────────────────────────────────────

/** @type {'pending'|'loading'|'done'|'error'} per step */
const stepStates = {};

/** Optional detail text per step (e.g. "12 sketches loaded") */
const stepDetails = {};

let safetyTimer = null;
let isVisible = false;

// ── DOM references (lazy-queried) ──────────────────────────────────────────

function getOverlay()     { return document.getElementById('projectLoadingOverlay'); }
function getBarFill()     { return document.getElementById('projectLoadingBarFill'); }
function getPercent()     { return document.getElementById('projectLoadingPercent'); }
function getStepsContainer() { return document.getElementById('projectLoadingSteps'); }

// ── Rendering helpers ──────────────────────────────────────────────────────

function iconForState(state) {
  switch (state) {
    case 'loading': return 'sync';
    case 'done':    return 'check_circle';
    case 'error':   return 'error';
    default:        return 'radio_button_unchecked';
  }
}

function renderSteps() {
  const container = getStepsContainer();
  if (!container) return;

  // Build or update step rows
  for (const step of STEPS) {
    let row = container.querySelector(`[data-step="${step.id}"]`);
    const state = stepStates[step.id] || 'pending';
    const detail = stepDetails[step.id] || '';

    if (!row) {
      row = document.createElement('div');
      row.className = `project-loading-step project-loading-step--${state}`;
      row.setAttribute('data-step', step.id);
      row.innerHTML = `
        <span class="material-icons">${iconForState(state)}</span>
        <span class="project-loading-step__label">${t(step.labelKey)}</span>
        <span class="project-loading-step__detail">${detail}</span>
      `;
      container.appendChild(row);
    } else {
      row.className = `project-loading-step project-loading-step--${state}`;
      const iconEl = row.querySelector('.material-icons');
      if (iconEl) iconEl.textContent = iconForState(state);

      const labelEl = row.querySelector('.project-loading-step__label');
      if (labelEl) {
        labelEl.textContent = state === 'done'
          ? (detail || t(step.labelKey))
          : t(step.labelKey);
      }

      const detailEl = row.querySelector('.project-loading-step__detail');
      if (detailEl) {
        detailEl.textContent = state === 'done' ? '' : detail;
      }
    }
  }
}

function updateProgressBar() {
  let completed = 0;
  for (const step of STEPS) {
    const state = stepStates[step.id] || 'pending';
    if (state === 'done' || state === 'error') {
      completed += step.weight;
    } else if (state === 'loading') {
      // Give partial credit for in-progress steps
      completed += step.weight * 0.3;
    }
  }
  const pct = Math.min(100, Math.round(completed));
  const barFill = getBarFill();
  const percentEl = getPercent();
  if (barFill) barFill.style.width = pct + '%';
  if (percentEl) percentEl.textContent = pct + '%';
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Show the project loading overlay. Resets all step states.
 */
export function showProjectLoadingOverlay() {
  const overlay = getOverlay();
  if (!overlay) return;

  // Reset state
  for (const step of STEPS) {
    stepStates[step.id] = 'pending';
    stepDetails[step.id] = '';
  }

  // Clear previous step DOM
  const container = getStepsContainer();
  if (container) container.innerHTML = '';

  // Reset progress bar
  const barFill = getBarFill();
  const percentEl = getPercent();
  if (barFill) barFill.style.width = '0%';
  if (percentEl) percentEl.textContent = '0%';

  // Show overlay
  overlay.classList.remove('project-loading-overlay--closing');
  overlay.style.display = 'flex';
  isVisible = true;

  // Render initial steps
  renderSteps();

  // Safety timeout: auto-close after SAFETY_TIMEOUT_MS
  clearTimeout(safetyTimer);
  safetyTimer = setTimeout(() => {
    if (isVisible) {
      console.warn('[ProjectLoading] Safety timeout reached, auto-closing overlay');
      if (typeof window.showToast === 'function') {
        window.showToast(t('projects.canvas.loadingTimeout'), 'warning');
      }
      hideProjectLoadingOverlay();
    }
  }, SAFETY_TIMEOUT_MS);
}

/**
 * Update a loading step's state and optional detail text.
 * @param {string} stepId - One of: 'sketches', 'layers', 'canvas', 'tiles'
 * @param {'pending'|'loading'|'done'|'error'} state
 * @param {string} [detail] - Optional detail text (e.g. "12 sketches loaded")
 */
export function updateLoadingStep(stepId, state, detail) {
  stepStates[stepId] = state;
  if (detail !== undefined) stepDetails[stepId] = detail;
  renderSteps();
  updateProgressBar();
}

/**
 * Hide the project loading overlay with a fade-out animation.
 * Returns a Promise that resolves when the overlay is fully hidden.
 * @returns {Promise<void>}
 */
export function hideProjectLoadingOverlay() {
  return new Promise((resolve) => {
    const overlay = getOverlay();
    clearTimeout(safetyTimer);

    if (!overlay || !isVisible) {
      isVisible = false;
      resolve();
      return;
    }

    // Set progress to 100% before closing
    const barFill = getBarFill();
    const percentEl = getPercent();
    if (barFill) barFill.style.width = '100%';
    if (percentEl) percentEl.textContent = '100%';

    // Animate fade-out
    overlay.classList.add('project-loading-overlay--closing');
    setTimeout(() => {
      overlay.style.display = 'none';
      overlay.classList.remove('project-loading-overlay--closing');
      isVisible = false;
      resolve();
    }, FADE_OUT_MS);
  });
}

/**
 * Force-close the overlay immediately (no animation).
 * Used for error recovery to avoid getting stuck.
 */
export function forceCloseProjectLoadingOverlay() {
  const overlay = getOverlay();
  clearTimeout(safetyTimer);
  if (overlay) {
    overlay.style.display = 'none';
    overlay.classList.remove('project-loading-overlay--closing');
  }
  isVisible = false;
}
