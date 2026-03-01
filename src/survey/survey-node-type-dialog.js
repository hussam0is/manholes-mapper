/**
 * Survey Node Type Dialog
 * Modal for selecting the type of a new survey point (Manhole, Home, Drainage).
 * Styles are in styles.css under ".survey-type-*" selectors.
 */

let dialogEl = null;
let isOpen = false;
let _onChoose = null;
let _onCancel = null;

const DIALOG_ID = 'surveyNodeTypeDialog';

/**
 * Initialize the dialog element and append to DOM.
 * Safe to call multiple times — only creates once.
 */
export function initSurveyNodeTypeDialog() {
  if (dialogEl) return;

  dialogEl = document.createElement('div');
  dialogEl.id = DIALOG_ID;
  dialogEl.className = 'survey-type-dialog';
  dialogEl.innerHTML = `
    <div class="survey-type-overlay"></div>
    <div class="survey-type-content">
      <h3 id="surveyTypeTitle"></h3>
      <p class="survey-type-desc" id="surveyTypeDesc"></p>
      <div class="survey-type-coords" id="surveyTypeCoords"></div>
      <div class="survey-type-buttons">
        <button class="survey-type-btn" data-type="Manhole">
          <span class="material-icons">album</span>
          <span data-label="manhole"></span>
        </button>
        <button class="survey-type-btn" data-type="Home">
          <span class="material-icons">home</span>
          <span data-label="home"></span>
        </button>
        <button class="survey-type-btn" data-type="Drainage">
          <span class="material-icons">water_drop</span>
          <span data-label="drainage"></span>
        </button>
      </div>
      <label class="survey-type-autoconnect">
        <input type="checkbox" id="surveyAutoConnectCheckbox" checked />
        <span id="surveyAutoConnectLabel"></span>
      </label>
      <button class="survey-type-cancel" id="surveyTypeCancel"></button>
    </div>
  `;

  document.body.appendChild(dialogEl);

  // Event listeners
  dialogEl.querySelector('.survey-type-overlay').addEventListener('click', _dismiss);
  dialogEl.querySelector('#surveyTypeCancel').addEventListener('click', _dismiss);

  dialogEl.querySelectorAll('.survey-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      _close();
      if (_onChoose) _onChoose(type);
      _onChoose = null;
      _onCancel = null;
    });
  });
}

function _close() {
  if (dialogEl) dialogEl.classList.remove('open');
  isOpen = false;
}

function _dismiss() {
  _close();
  if (_onCancel) _onCancel();
  _onChoose = null;
  _onCancel = null;
}

/**
 * Open the node type selection dialog.
 * @param {string} pointName - The survey point name/ID
 * @param {{ easting: number, northing: number, elevation: number }} coords - ITM coordinates
 * @param {Function} onChoose - Called with the chosen type string ('Manhole'|'Home'|'Drainage')
 * @param {Function} onCancel - Called if the user dismisses the dialog
 * @param {Function} t - i18n translator function
 * @param {{ autoConnect?: boolean }} [options] - Extra options
 */
export function openSurveyNodeTypeDialog(pointName, coords, onChoose, onCancel, t, options) {
  if (!dialogEl) initSurveyNodeTypeDialog();

  _onChoose = onChoose;
  _onCancel = onCancel;

  // Update text with translations
  const title = t ? t('survey.newPointTitle') : 'New Survey Point';
  const desc = t ? t('survey.newPointDesc', pointName) : `Point "${pointName}" not found. Choose node type:`;
  const cancelText = t ? t('cancel') : 'Cancel';

  document.getElementById('surveyTypeTitle').textContent = title;
  document.getElementById('surveyTypeDesc').textContent = desc;
  document.getElementById('surveyTypeCoords').textContent =
    `E ${coords.easting.toFixed(3)}  N ${coords.northing.toFixed(3)}  Z ${coords.elevation.toFixed(2)}`;
  document.getElementById('surveyTypeCancel').textContent = cancelText;

  // Update button labels
  const manholeLabel = t ? t('modeNode') : 'Manhole';
  const homeLabel = t ? t('modeHome') : 'Home';
  const drainageLabel = t ? t('modeDrainage') : 'Drainage';

  dialogEl.querySelector('[data-label="manhole"]').textContent = manholeLabel;
  dialogEl.querySelector('[data-label="home"]').textContent = homeLabel;
  dialogEl.querySelector('[data-label="drainage"]').textContent = drainageLabel;

  // Auto-connect checkbox
  const acCheckbox = document.getElementById('surveyAutoConnectCheckbox');
  const acLabel = document.getElementById('surveyAutoConnectLabel');
  if (acCheckbox) acCheckbox.checked = options?.autoConnect !== false;
  if (acLabel) acLabel.textContent = t ? t('survey.connectToPrevious') : 'Connect to previous';

  dialogEl.classList.add('open');
  isOpen = true;
}

/**
 * Get the current auto-connect checkbox state.
 * @returns {boolean}
 */
export function getSurveyAutoConnect() {
  const cb = document.getElementById('surveyAutoConnectCheckbox');
  return cb ? cb.checked : true;
}

/**
 * Check if the dialog is currently open.
 * @returns {boolean}
 */
export function isSurveyNodeTypeDialogOpen() {
  return isOpen;
}
