/**
 * Layers Config Module
 * Provides a button + floating panel for toggling map layers and individual sections.
 * Positioned in the top-left corner of the canvas, below the Street View pegman.
 */

import {
  isMapLayerEnabled,
  getMapType, setMapType, MAP_TYPES, saveMapSettings
} from './govmap-layer.js';
import {
  isRefLayersEnabled, setRefLayersEnabled,
  getReferenceLayers, setLayerVisibility,
  saveRefLayerSettings,
  getSectionFeatures, setSectionVisibility, saveSectionSettings,
  OUTSIDE_SECTIONS,
  addRawPointsLayer,
} from './reference-layers.js';
import { parseCoordinatesCsv } from '../utils/coordinates.js';

/** @type {HTMLElement|null} */
let btnEl = null;
/** @type {HTMLElement|null} */
let panelEl = null;
/** @type {boolean} */
let panelOpen = false;

// Callbacks from host
let _scheduleDraw = null;
let _t = null;
let _toggleMapLayer = null;
let _syncMapLayerToggleUI = null;

/**
 * Initialize the layers config button and panel.
 * @param {object} config
 * @param {HTMLElement} config.canvasContainer
 * @param {Function} config.scheduleDraw
 * @param {Function} config.t - Translation function
 * @param {Function} config.toggleMapLayer - Main.js map layer toggle (handles local state, toast, ref point)
 * @param {Function} config.syncMapLayerToggleUI - Syncs hamburger menu map checkboxes
 */
export function initLayersConfig(config) {
  const { canvasContainer, scheduleDraw, t, toggleMapLayer, syncMapLayerToggleUI } = config;
  _scheduleDraw = scheduleDraw;
  _t = t;
  _toggleMapLayer = toggleMapLayer;
  _syncMapLayerToggleUI = syncMapLayerToggleUI;

  createButton(canvasContainer);
  createPanel(canvasContainer);
}

function createButton(container) {
  btnEl = document.createElement('button');
  btnEl.id = 'layersConfigBtn';
  btnEl.className = 'layers-config-btn';
  btnEl.innerHTML = '<span class="material-icons">layers</span>';
  updateButtonLabels();
  container.appendChild(btnEl);

  btnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });
}

function createPanel(container) {
  panelEl = document.createElement('div');
  panelEl.id = 'layersConfigPanel';
  panelEl.className = 'layers-config-panel';
  panelEl.style.display = 'none';
  container.appendChild(panelEl);

  // Close on click outside
  document.addEventListener('pointerdown', (e) => {
    if (panelOpen && !panelEl.contains(e.target) && e.target !== btnEl && !btnEl.contains(e.target)) {
      closePanel();
    }
  });
}

function updateButtonLabels() {
  if (!btnEl || !_t) return;
  const label = _t('layersConfig.title') || 'Layers';
  btnEl.setAttribute('aria-label', label);
  btnEl.setAttribute('title', label);
}

function togglePanel() {
  if (panelOpen) closePanel();
  else openPanel();
}

function openPanel() {
  panelOpen = true;
  btnEl.classList.add('layers-config-btn--active');
  populatePanel();
  panelEl.style.display = '';
}

function closePanel() {
  panelOpen = false;
  btnEl.classList.remove('layers-config-btn--active');
  panelEl.style.display = 'none';
}

function populatePanel() {
  const t = _t || (k => k);
  const escHtml = window.escapeHtml || (s => s);

  const mapEnabled = isMapLayerEnabled();
  const mapType = getMapType();
  const refEnabled = isRefLayersEnabled();
  const allRefLayers = getReferenceLayers();
  const nonSectionLayers = allRefLayers.filter(l => l.layerType !== 'sections');
  const sections = getSectionFeatures();
  const hasRefLayers = allRefLayers.length > 0;
  const hasSections = sections.length > 1; // > 1 because outside_sections_data is always present

  let html = `
    <div class="layers-config-panel__header">
      <span class="material-icons">layers</span>
      <span>${escHtml(t('layersConfig.title') || 'Layers')}</span>
      <button class="layers-config-panel__close" aria-label="${escHtml(t('close') || 'Close')}">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="layers-config-panel__body">
  `;

  // --- Base Map Section ---
  html += `
    <div class="layers-config-panel__section">
      <div class="layers-config-panel__section-header">
        <span class="material-icons layers-config-panel__section-icon">map</span>
        <span>${escHtml(t('layersConfig.baseMap') || 'Base Map')}</span>
      </div>
      <div class="layers-config-panel__section-items">
        <label class="layers-config-panel__toggle">
          <input type="checkbox" id="lc-map-toggle" ${mapEnabled ? 'checked' : ''} />
          <span>${escHtml(t('mapLayer.enable') || 'Map Layer')}</span>
        </label>
        <div class="layers-config-panel__select-row">
          <span>${escHtml(t('map.type') || 'Map Type:')}</span>
          <select id="lc-map-type" class="layers-config-panel__select">
            <option value="orthophoto" ${mapType === 'orthophoto' ? 'selected' : ''}>${escHtml(t('map.orthophoto') || 'Aerial Photo')}</option>
            <option value="street" ${mapType === 'street' ? 'selected' : ''}>${escHtml(t('map.street') || 'Street Map')}</option>
          </select>
        </div>
      </div>
    </div>
  `;

  // --- Reference Layers Section ---
  if (hasRefLayers) {
    html += `
      <div class="layers-config-panel__section">
        <div class="layers-config-panel__section-header">
          <span class="material-icons layers-config-panel__section-icon">terrain</span>
          <span>${escHtml(t('refLayers.enable') || 'Reference Layers')}</span>
          <label class="layers-config-panel__header-toggle">
            <input type="checkbox" id="lc-ref-toggle" ${refEnabled ? 'checked' : ''} />
          </label>
        </div>
        <div class="layers-config-panel__section-items">
    `;

    for (const layer of nonSectionLayers) {
      html += `
        <label class="layers-config-panel__toggle">
          <input type="checkbox" data-layer-id="${escHtml(layer.id)}" ${layer.visible ? 'checked' : ''} class="lc-ref-layer-cb" />
          <span>${escHtml(layer.name)}</span>
          <span class="layers-config-panel__count">(${layer.featureCount})</span>
        </label>
      `;
    }

    html += '</div></div>';

    // --- Sections Section ---
    if (hasSections) {
      html += `
        <div class="layers-config-panel__section">
          <div class="layers-config-panel__section-header">
            <span class="material-icons layers-config-panel__section-icon">dashboard</span>
            <span>${escHtml(t('layersConfig.sections') || 'Sections')}</span>
          </div>
          <div class="layers-config-panel__section-items">
      `;

      for (const section of sections) {
        const isOutside = section.id === OUTSIDE_SECTIONS.id;
        const displayName = isOutside
          ? (t('layersConfig.outsideSections') || 'Outside Sections')
          : section.name;
        const numberStr = section.number != null ? `#${section.number}` : '';

        html += `
          <label class="layers-config-panel__toggle${isOutside ? ' layers-config-panel__toggle--outside' : ''}">
            <input type="checkbox" data-section-id="${escHtml(section.id)}" ${section.visible ? 'checked' : ''} class="lc-section-cb" />
            <span>${escHtml(displayName)}</span>
            ${numberStr ? `<span class="layers-config-panel__number">${escHtml(numberStr)}</span>` : ''}
          </label>
        `;
      }

      html += '</div></div>';
    }
  }

  // --- Raw Points Section (always shown) ---
  const rawPointLayers = allRefLayers.filter(l => l.layerType === 'raw_points');
  html += `
    <div class="layers-config-panel__section">
      <div class="layers-config-panel__section-header">
        <span class="material-icons layers-config-panel__section-icon" style="color:#dc2626">place</span>
        <span>${escHtml(t('layersConfig.rawPoints') || 'Raw Points')}</span>
      </div>
      <div class="layers-config-panel__section-items">
  `;
  for (const layer of rawPointLayers) {
    html += `
      <label class="layers-config-panel__toggle">
        <input type="checkbox" data-layer-id="${escHtml(layer.id)}" ${layer.visible ? 'checked' : ''} class="lc-ref-layer-cb" />
        <span>${escHtml(layer.name)}</span>
        <span class="layers-config-panel__count">(${layer.featureCount})</span>
      </label>
    `;
  }
  html += `
        <button class="layers-config-panel__add-btn" id="lc-add-raw-points">
          <span class="material-icons">add_circle_outline</span>
          <span>${escHtml(t('layersConfig.addRawPoints') || 'Add Coordinates File')}</span>
        </button>
        <input type="file" id="lc-raw-points-file" accept=".csv,text/csv" style="display:none" />
      </div>
    </div>
  `;

  html += '</div>';
  panelEl.innerHTML = html;
  attachPanelListeners();
}

function attachPanelListeners() {
  // Close button
  const closeBtn = panelEl.querySelector('.layers-config-panel__close');
  if (closeBtn) closeBtn.addEventListener('click', () => closePanel());

  // Map layer toggle — delegates to main.js toggleMapLayer for full behavior
  const mapToggle = panelEl.querySelector('#lc-map-toggle');
  if (mapToggle) {
    mapToggle.addEventListener('change', (e) => {
      if (_toggleMapLayer) _toggleMapLayer(e.target.checked);
    });
  }

  // Map type select
  const mapTypeSelect = panelEl.querySelector('#lc-map-type');
  if (mapTypeSelect) {
    mapTypeSelect.addEventListener('change', (e) => {
      setMapType(e.target.value);
      saveMapSettings();
      if (_syncMapLayerToggleUI) _syncMapLayerToggleUI();
      _scheduleDraw();
    });
  }

  // Reference layers global toggle
  const refToggle = panelEl.querySelector('#lc-ref-toggle');
  if (refToggle) {
    refToggle.addEventListener('change', (e) => {
      setRefLayersEnabled(e.target.checked);
      saveRefLayerSettings();
      _scheduleDraw();
      // Sync hamburger menu toggles
      const dt = document.getElementById('refLayersToggle');
      const mt = document.getElementById('mobileRefLayersToggle');
      if (dt) dt.checked = e.target.checked;
      if (mt) mt.checked = e.target.checked;
    });
  }

  // Per-layer toggles
  panelEl.querySelectorAll('.lc-ref-layer-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      setLayerVisibility(e.target.dataset.layerId, e.target.checked);
      saveRefLayerSettings();
      _scheduleDraw();
      // Sync hamburger menu checkboxes
      document.querySelectorAll(`input[data-layer-id="${e.target.dataset.layerId}"]`).forEach(el => {
        if (el !== e.target) el.checked = e.target.checked;
      });
    });
  });

  // Per-section toggles
  panelEl.querySelectorAll('.lc-section-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      setSectionVisibility(e.target.dataset.sectionId, e.target.checked);
      saveSectionSettings();
      _scheduleDraw();
    });
  });

  // Add raw points file upload
  const addBtn = panelEl.querySelector('#lc-add-raw-points');
  const fileInput = panelEl.querySelector('#lc-raw-points-file');
  if (addBtn && fileInput) {
    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const coordsMap = parseCoordinatesCsv(text);
        if (coordsMap.size === 0) {
          alert((_t || (k => k))('coordinates.noCoordinatesFound') || 'No coordinates found in file');
          return;
        }
        addRawPointsLayer(file.name, coordsMap);
        // Refresh panel to show the new layer toggle
        populatePanel();
        // Refresh other layer UIs
        if (typeof window.renderRefLayerToggles === 'function') {
          window.renderRefLayerToggles();
        }
        _scheduleDraw();
      } catch (err) {
        console.error('[LayersConfig] Failed to parse raw points CSV:', err);
        alert((_t || (k => k))('coordinates.importError') || 'Error loading coordinates');
      } finally {
        fileInput.value = '';
      }
    });
  }
}

/**
 * Refresh the panel content (call after layers are loaded/changed).
 */
export function updateLayersPanel() {
  if (panelOpen) populatePanel();
}

/**
 * Update translations when language changes.
 * @param {Function} t - New translation function
 */
export function updateLayersConfigTranslations(t) {
  _t = t;
  updateButtonLabels();
  if (panelOpen) populatePanel();
}
