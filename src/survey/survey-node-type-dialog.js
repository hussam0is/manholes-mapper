/**
 * Survey Node Type Dialog
 * Modal for selecting the type of a new survey point (Manhole, Home, Drainage).
 * Self-contained: creates its own DOM elements and inline styles.
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

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    .survey-type-dialog {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 10000;
      align-items: center;
      justify-content: center;
    }
    .survey-type-dialog.open {
      display: flex;
    }
    .survey-type-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.5);
    }
    .survey-type-content {
      position: relative;
      background: var(--surface, #fff);
      color: var(--on-surface, #222);
      border-radius: 16px;
      padding: 24px;
      min-width: 300px;
      max-width: 90vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      text-align: center;
    }
    .survey-type-content h3 {
      margin: 0 0 4px;
      font-size: 18px;
    }
    .survey-type-content .survey-type-desc {
      margin: 0 0 20px;
      font-size: 14px;
      opacity: 0.7;
    }
    .survey-type-coords {
      font-family: monospace;
      font-size: 13px;
      margin-bottom: 16px;
      opacity: 0.6;
    }
    .survey-type-buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .survey-type-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 16px 24px;
      border: 2px solid var(--outline, #ccc);
      border-radius: 12px;
      background: transparent;
      color: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      min-width: 90px;
      transition: background 0.15s, border-color 0.15s;
    }
    .survey-type-btn:hover, .survey-type-btn:focus {
      background: var(--surface-variant, #f0f0f0);
      border-color: var(--primary, #1976d2);
    }
    .survey-type-btn .material-icons {
      font-size: 32px;
    }
    .survey-type-cancel {
      margin-top: 16px;
      padding: 8px 24px;
      border: none;
      background: transparent;
      color: inherit;
      opacity: 0.6;
      cursor: pointer;
      font-size: 14px;
    }
    .survey-type-cancel:hover {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);

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
 */
export function openSurveyNodeTypeDialog(pointName, coords, onChoose, onCancel, t) {
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

  dialogEl.classList.add('open');
  isOpen = true;
}

/**
 * Check if the dialog is currently open.
 * @returns {boolean}
 */
export function isSurveyNodeTypeDialogOpen() {
  return isOpen;
}
