/**
 * Point Capture Dialog Module
 * UI for capturing GNSS coordinates and assigning them to nodes
 */

import { gnssState } from './gnss-state.js';
import { wgs84ToItm } from '../map/govmap-layer.js';

// Dialog element references
let dialogEl = null;
let isOpen = false;

// Callbacks
let onCapture = null;
let onCancel = null;

/** Shorthand for i18n — falls back to key if window.t is unavailable */
function _t(key) {
  return typeof window.t === 'function' ? window.t(key) : key;
}

/**
 * Initialize the point capture dialog
 * Creates the dialog element and appends to the DOM
 */
export function initPointCaptureDialog() {
  if (dialogEl) {
    return;
  }

  dialogEl = document.createElement('div');
  dialogEl.id = 'pointCaptureDialog';
  dialogEl.className = 'point-capture-dialog';
  dialogEl.setAttribute('role', 'dialog');
  dialogEl.setAttribute('aria-modal', 'true');
  dialogEl.style.display = 'none';
  dialogEl.innerHTML = `
    <div class="point-capture-overlay"></div>
    <div class="point-capture-content">
      <div class="point-capture-header">
        <h3>
          <span class="material-icons">gps_fixed</span>
          <span id="captureDialogTitle"></span>
        </h3>
        <button class="point-capture-close" id="captureDialogClose" aria-label="${_t('close')}">
          <span class="material-icons">close</span>
        </button>
      </div>

      <div class="point-capture-body">
        <!-- Current Position Section -->
        <div class="capture-section">
          <h4 id="capturePositionTitle"></h4>
          <div class="position-info" id="capturePositionInfo">
            <div class="position-row">
              <span class="position-label">Lat:</span>
              <span class="position-value" id="captureLat">--</span>
            </div>
            <div class="position-row">
              <span class="position-label">Lon:</span>
              <span class="position-value" id="captureLon">--</span>
            </div>
            <div class="position-row">
              <span class="position-label">Alt:</span>
              <span class="position-value" id="captureAlt">--</span>
            </div>
            <div class="position-row">
              <span class="position-label">Fix:</span>
              <span class="position-value" id="captureFix">--</span>
            </div>
            <div class="position-row">
              <span class="position-label">HDOP:</span>
              <span class="position-value" id="captureHdop">--</span>
            </div>
            <div class="position-row">
              <span class="position-label">Sats:</span>
              <span class="position-value" id="captureSats">--</span>
            </div>
          </div>
        </div>

        <!-- Node Selection Section -->
        <div class="capture-section">
          <h4 id="captureNodeTitle"></h4>
          <select id="captureNodeSelect" class="capture-select">
            <option value=""></option>
          </select>
          <label class="capture-checkbox">
            <input type="checkbox" id="captureCreateNew" />
            <span id="captureCreateNewLabel"></span>
          </label>
        </div>

        <!-- Edge Creation Section -->
        <div class="capture-section" id="captureEdgeSection" style="display: none;">
          <h4 id="captureEdgeTitle"></h4>
          <label class="capture-checkbox">
            <input type="checkbox" id="captureCreateEdge" />
            <span id="captureCreateEdgeLabel"></span>
          </label>
          <div id="captureEdgeOptions" style="display: none;">
            <div class="capture-field">
              <label id="captureSourceLabel"></label>
              <span id="captureEdgeFrom">--</span>
            </div>
            <div class="capture-field">
              <label id="captureLineTypeLabel"></label>
              <select id="captureEdgeType" class="capture-select">
                <option value="" id="captureEdgeTypeMain"></option>
                <option value="" id="captureEdgeTypeDrainage"></option>
                <option value="" id="captureEdgeTypeSecondary"></option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="point-capture-footer">
        <button class="btn btn-ghost" id="captureDialogCancel"></button>
        <button class="btn btn-primary" id="captureDialogConfirm" disabled aria-label="${_t('gpsCapture.capturePoint')}">
          <span class="material-icons">check</span>
          <span id="captureConfirmLabel"></span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialogEl);

  // Set up event listeners
  setupEventListeners();
}

/**
 * Populate all translatable text in the dialog.
 * Called every time the dialog opens so language switches take effect.
 */
function applyTranslations() {
  const el = (id) => document.getElementById(id);

  // Header
  el('captureDialogTitle').textContent = _t('gpsCapture.dialogTitle');
  el('captureDialogClose').setAttribute('aria-label', _t('close'));

  // Section headers
  el('capturePositionTitle').textContent = _t('gpsCapture.currentPosition');
  el('captureNodeTitle').textContent = _t('gpsCapture.selectManhole');
  el('captureEdgeTitle').textContent = _t('gpsCapture.createLine');

  // Node selection
  el('captureCreateNewLabel').textContent = _t('gpsCapture.createNewNode');

  // Edge creation
  el('captureCreateEdgeLabel').textContent = _t('gpsCapture.createLineFromPrevious');
  el('captureSourceLabel').textContent = _t('gpsCapture.sourceManhole');
  el('captureLineTypeLabel').textContent = _t('gpsCapture.lineType');

  // Edge type options
  const mainOpt = el('captureEdgeTypeMain');
  mainOpt.value = _t('gpsCapture.lineTypeMain');
  mainOpt.textContent = _t('gpsCapture.lineTypeMain');

  const drainageOpt = el('captureEdgeTypeDrainage');
  drainageOpt.value = _t('gpsCapture.lineTypeDrainage');
  drainageOpt.textContent = _t('gpsCapture.lineTypeDrainage');

  const secOpt = el('captureEdgeTypeSecondary');
  secOpt.value = _t('gpsCapture.lineTypeSecondary');
  secOpt.textContent = _t('gpsCapture.lineTypeSecondary');

  // Footer buttons
  el('captureDialogCancel').textContent = _t('gpsCapture.cancel');
  el('captureConfirmLabel').textContent = _t('gpsCapture.capturePoint');

  // Dialog aria-label
  dialogEl.setAttribute('aria-label', _t('gpsCapture.dialogTitle'));
}

/**
 * Set up dialog event listeners
 */
function setupEventListeners() {
  const overlay = dialogEl.querySelector('.point-capture-overlay');
  const closeBtn = document.getElementById('captureDialogClose');
  const cancelBtn = document.getElementById('captureDialogCancel');
  const confirmBtn = document.getElementById('captureDialogConfirm');
  const nodeSelect = document.getElementById('captureNodeSelect');
  const createNewCheck = document.getElementById('captureCreateNew');
  const createEdgeCheck = document.getElementById('captureCreateEdge');

  overlay.addEventListener('click', closeDialog);
  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);
  confirmBtn.addEventListener('click', handleConfirm);

  nodeSelect.addEventListener('change', () => {
    updateConfirmButton();
    if (nodeSelect.value) {
      createNewCheck.checked = false;
    }
  });

  createNewCheck.addEventListener('change', () => {
    if (createNewCheck.checked) {
      nodeSelect.value = '';
    }
    updateConfirmButton();
  });

  createEdgeCheck.addEventListener('change', () => {
    const edgeOptions = document.getElementById('captureEdgeOptions');
    edgeOptions.style.display = createEdgeCheck.checked ? 'block' : 'none';
  });

  // Listen for position updates while dialog is open
  gnssState.on('position', updatePositionDisplay);
}

/**
 * Open the point capture dialog
 * @param {Array} nodes - List of available nodes
 * @param {Function} onCaptureCallback - Called when capture is confirmed
 * @param {Function} onCancelCallback - Called when dialog is cancelled
 */
export function openPointCaptureDialog(nodes, onCaptureCallback, onCancelCallback) {
  if (!dialogEl) {
    initPointCaptureDialog();
  }

  onCapture = onCaptureCallback;
  onCancel = onCancelCallback;

  // Refresh translations every time dialog opens (language may have changed)
  applyTranslations();

  // Populate node select
  const nodeSelect = document.getElementById('captureNodeSelect');
  const placeholder = _t('gpsCapture.selectManholePlaceholder');
  nodeSelect.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = placeholder;
  nodeSelect.appendChild(defaultOpt);

  // Sort nodes: those without coordinates first
  const sortedNodes = [...nodes].sort((a, b) => {
    const aHasCoords = a.hasCoordinates || false;
    const bHasCoords = b.hasCoordinates || false;
    if (aHasCoords === bHasCoords) {
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    }
    return aHasCoords ? 1 : -1;
  });

  const noCoordsLabel = _t('gpsCapture.noCoordinates');
  sortedNodes.forEach(node => {
    const option = document.createElement('option');
    option.value = node.id;
    const coordsIndicator = node.hasCoordinates ? ' \u2713' : ` ${noCoordsLabel}`;
    option.textContent = `${node.id}${coordsIndicator}`;
    nodeSelect.appendChild(option);
  });

  // Show/hide edge creation section based on previous capture
  const edgeSection = document.getElementById('captureEdgeSection');
  const lastNodeId = gnssState.lastCapturedNodeId;

  if (lastNodeId) {
    edgeSection.style.display = 'block';
    document.getElementById('captureEdgeFrom').textContent = lastNodeId;
    document.getElementById('captureCreateEdge').checked = true;
    document.getElementById('captureEdgeOptions').style.display = 'block';
  } else {
    edgeSection.style.display = 'none';
  }

  // Reset form
  document.getElementById('captureCreateNew').checked = false;
  updateConfirmButton();

  // Update position display
  updatePositionDisplay(gnssState.getPosition());

  // Show dialog
  dialogEl.style.display = 'flex';
  isOpen = true;
}

/**
 * Close the dialog
 */
export function closeDialog() {
  if (dialogEl) {
    dialogEl.style.display = 'none';
  }
  isOpen = false;

  if (onCancel) {
    onCancel();
    onCancel = null;
  }
  onCapture = null;
}

/**
 * Handle confirm button click
 */
function handleConfirm() {
  const nodeSelect = document.getElementById('captureNodeSelect');
  const createNew = document.getElementById('captureCreateNew').checked;
  const createEdge = document.getElementById('captureCreateEdge').checked;
  const edgeType = document.getElementById('captureEdgeType').value;

  const position = gnssState.getPosition();
  if (!position.isValid) {
    window.showToast?.(_t('gpsCapture.noValidGps'));
    return;
  }

  const captureData = {
    nodeId: createNew ? null : nodeSelect.value,
    createNewNode: createNew,
    position: {
      lat: position.lat,
      lon: position.lon,
      alt: position.alt,
      fixQuality: position.fixQuality,
      fixLabel: position.fixLabel,
      hdop: position.hdop,
      satellites: position.satellites
    },
    itm: wgs84ToItm(position.lat, position.lon),
    createEdge: createEdge && gnssState.lastCapturedNodeId,
    edgeFromNode: gnssState.lastCapturedNodeId,
    edgeType: edgeType,
    capturedAt: Date.now()
  };

  // Close dialog
  dialogEl.style.display = 'none';
  isOpen = false;

  if (onCapture) {
    onCapture(captureData);
    onCapture = null;
  }
  onCancel = null;
}

/**
 * Update position display in the dialog
 * @param {object} position - Current position data
 */
function updatePositionDisplay(position) {
  if (!isOpen) return;

  const latEl = document.getElementById('captureLat');
  const lonEl = document.getElementById('captureLon');
  const altEl = document.getElementById('captureAlt');
  const fixEl = document.getElementById('captureFix');
  const hdopEl = document.getElementById('captureHdop');
  const satsEl = document.getElementById('captureSats');

  if (position && position.isValid) {
    latEl.textContent = position.lat?.toFixed(7) || '--';
    lonEl.textContent = position.lon?.toFixed(7) || '--';
    altEl.textContent = position.alt != null ? `${position.alt.toFixed(2)} m` : '--';
    fixEl.textContent = position.fixLabel || '--';
    fixEl.className = `position-value fix-${position.fixQuality || 0}`;
    hdopEl.textContent = position.hdop != null ? position.hdop.toFixed(1) : '--';
    satsEl.textContent = position.satellites != null ? position.satellites : '--';
  } else {
    latEl.textContent = '--';
    lonEl.textContent = '--';
    altEl.textContent = '--';
    fixEl.textContent = _t('gpsCapture.noPosition');
    fixEl.className = 'position-value fix-0';
    hdopEl.textContent = '--';
    satsEl.textContent = '--';
  }

  updateConfirmButton();
}

/**
 * Update confirm button state
 */
function updateConfirmButton() {
  const confirmBtn = document.getElementById('captureDialogConfirm');
  const nodeSelect = document.getElementById('captureNodeSelect');
  const createNew = document.getElementById('captureCreateNew').checked;
  const position = gnssState.getPosition();

  const hasTarget = nodeSelect.value || createNew;
  const hasPosition = position && position.isValid;

  confirmBtn.disabled = !hasTarget || !hasPosition;
}

/**
 * Check if dialog is currently open
 * @returns {boolean}
 */
export function isDialogOpen() {
  return isOpen;
}
