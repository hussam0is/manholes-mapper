/**
 * Collapsible side panel that lists sketches in project-canvas mode.
 *
 * Features:
 * - Eye icon toggles visibility per sketch
 * - Click sketch name to switch active sketch
 * - Active sketch highlighted
 * - Toggle button in canvas toolbar (layers icon)
 */

/** @type {(key: string, ...args: any[]) => string} */
const t = (key, ...args) => (typeof window.t === 'function' ? window.t(key, ...args) : key);

import {
  getAllSketches,
  setSketchVisibility,
  switchActiveSketch,
  onProjectCanvasChange,
} from './project-canvas-state.js';

let panelEl = null;
let listEl = null;
let unsub = null;

/**
 * Initialize the side panel. Call once after DOM is ready.
 */
export function initSketchSidePanel() {
  panelEl = document.getElementById('sketchSidePanel');
  if (!panelEl) return;

  listEl = panelEl.querySelector('.sketch-side-panel__list');

  // Toggle button
  const toggleBtn = document.getElementById('sketchSidePanelToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      panelEl.classList.toggle('open');
    });
  }

  // Close button
  const closeBtn = panelEl.querySelector('.sketch-side-panel__close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panelEl.classList.remove('open');
    });
  }

  // Subscribe to state changes
  unsub = onProjectCanvasChange(() => render());
}

/**
 * Show the side panel (when entering project-canvas mode).
 */
export function showSketchSidePanel() {
  if (!panelEl) return;
  panelEl.style.display = '';
  panelEl.classList.add('open');
  const toggleBtn = document.getElementById('sketchSidePanelToggle');
  if (toggleBtn) toggleBtn.style.display = '';
  render();
}

/**
 * Hide the side panel (when leaving project-canvas mode).
 */
export function hideSketchSidePanel() {
  if (!panelEl) return;
  panelEl.style.display = 'none';
  panelEl.classList.remove('open');
  const toggleBtn = document.getElementById('sketchSidePanelToggle');
  if (toggleBtn) toggleBtn.style.display = 'none';
}

/**
 * Render the sketch list inside the side panel.
 */
function render() {
  if (!listEl) return;

  const sketches = getAllSketches();

  if (sketches.length === 0) {
    listEl.innerHTML = `<div class="sketch-side-panel__empty">
      <span class="material-icons">inbox</span>
      <span>${t('projects.canvas.noSketches') || 'No sketches'}</span>
    </div>`;
    return;
  }

  // Update header sketch count
  const countEl = panelEl?.querySelector('.sketch-side-panel__count');
  if (countEl) countEl.textContent = `(${sketches.length})`;

  listEl.innerHTML = '';

  for (const sketch of sketches) {
    const item = document.createElement('div');
    item.className = 'sketch-side-panel__item' + (sketch.isActive ? ' active' : '');
    item.dataset.sketchId = sketch.id;

    const nodeCount = (sketch.nodes || []).length;
    const displayName = (sketch.name && sketch.name.trim()) || sketch.id.slice(-6);

    item.innerHTML = `
      <button class="sketch-side-panel__eye" title="${sketch.isVisible ? t('projects.canvas.hide') || 'Hide' : t('projects.canvas.show') || 'Show'}">
        <span class="material-icons">${sketch.isVisible ? 'visibility' : 'visibility_off'}</span>
      </button>
      <div class="sketch-side-panel__info">
        <span class="sketch-side-panel__name">${displayName}</span>
        <span class="sketch-side-panel__badge">${nodeCount}</span>
      </div>
      ${sketch.isActive ? '<span class="material-icons sketch-side-panel__active-icon">edit</span>' : ''}
    `;

    // Eye toggle
    const eyeBtn = item.querySelector('.sketch-side-panel__eye');
    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setSketchVisibility(sketch.id, !sketch.isVisible);
    });

    // Click to switch active
    item.addEventListener('click', () => {
      if (!sketch.isActive) {
        switchActiveSketch(sketch.id);
      }
    });

    listEl.appendChild(item);
  }
}
