/**
 * Device Picker Dialog
 * Modal for selecting a Bluetooth device from a list of paired devices.
 * Replaces the broken window.prompt() approach for Android/Capacitor WebView.
 * Self-contained: creates its own DOM elements and inline styles.
 */

const DIALOG_ID = 'devicePickerDialog';
const STYLE_ID = 'devicePickerDialogStyles';

/**
 * Inject the dialog styles once into the document head.
 */
function _ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .device-picker-dialog {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 10000;
      align-items: center;
      justify-content: center;
    }
    .device-picker-dialog.open {
      display: flex;
    }
    .device-picker-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
    }
    .device-picker-content {
      position: relative;
      background: var(--color-surface, #fff);
      color: var(--color-text, #222);
      border-radius: 16px;
      padding: 24px;
      min-width: 300px;
      max-width: min(480px, 90vw);
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    }
    .device-picker-title {
      margin: 0 0 16px;
      font-size: 18px;
      font-weight: 600;
      text-align: center;
    }
    .device-picker-list {
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1 1 auto;
    }
    .device-picker-btn {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 14px 16px;
      border: 2px solid var(--color-border, #ccc);
      border-radius: 12px;
      background: transparent;
      color: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      text-align: start;
      transition: background 0.15s, border-color 0.15s;
      min-height: 56px;
    }
    .device-picker-btn:hover,
    .device-picker-btn:focus {
      background: var(--color-surface-hover, #f0f0f0);
      border-color: var(--color-primary, #2563eb);
      outline: none;
    }
    .device-picker-btn.is-survey {
      border-color: var(--color-primary, #2563eb);
    }
    .device-picker-btn.is-survey .device-picker-name::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-primary, #2563eb);
      margin-inline-end: 8px;
      vertical-align: middle;
    }
    .device-picker-name {
      font-size: 15px;
      font-weight: 500;
    }
    .device-picker-address {
      font-size: 12px;
      font-family: monospace;
      opacity: 0.55;
      padding-inline-start: 16px;
    }
    .device-picker-cancel {
      margin-top: 16px;
      padding: 10px 24px;
      border: none;
      background: transparent;
      color: inherit;
      opacity: 0.6;
      cursor: pointer;
      font-size: 14px;
      align-self: center;
      border-radius: 8px;
      min-height: 44px;
    }
    .device-picker-cancel:hover,
    .device-picker-cancel:focus {
      opacity: 1;
      background: var(--color-surface-hover, #f0f0f0);
      outline: none;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Build and show the device picker dialog.
 *
 * @param {Array<{ name: string, address: string, isSurvey?: boolean }>} devices
 *   List of paired devices to present.
 * @param {Function} t - i18n translator function (may be undefined).
 * @returns {Promise<{ name: string, address: string, isSurvey?: boolean } | null>}
 *   Resolves with the chosen device, or null if the user cancels.
 */
export function openDevicePickerDialog(devices, t) {
  _ensureStyles();

  // Remove any stale instance from a prior call.
  const existing = document.getElementById(DIALOG_ID);
  if (existing) existing.remove();

  return new Promise((resolve) => {
    const title = t ? t('survey.selectDevice') : 'Select Device';
    const cancelLabel = t ? t('cancel') : 'Cancel';

    const dialogEl = document.createElement('div');
    dialogEl.id = DIALOG_ID;
    dialogEl.className = 'device-picker-dialog';
    dialogEl.setAttribute('role', 'dialog');
    dialogEl.setAttribute('aria-modal', 'true');
    dialogEl.setAttribute('aria-label', title);

    // Build the device button list HTML. Content is constructed from structured
    // data rather than unsanitized strings, so no XSS risk here.
    const listItems = devices.map((device) => {
      const isSurvey = Boolean(device.isSurvey);
      return `
        <button
          class="device-picker-btn${isSurvey ? ' is-survey' : ''}"
          data-address="${device.address}"
          type="button"
        >
          <span class="device-picker-name"></span>
          <span class="device-picker-address"></span>
        </button>
      `;
    }).join('');

    dialogEl.innerHTML = `
      <div class="device-picker-overlay"></div>
      <div class="device-picker-content">
        <h3 class="device-picker-title"></h3>
        <div class="device-picker-list">${listItems}</div>
        <button class="device-picker-cancel" type="button"></button>
      </div>
    `;

    // Populate text content via textContent (safe, no XSS).
    dialogEl.querySelector('.device-picker-title').textContent = title;
    dialogEl.querySelector('.device-picker-cancel').textContent = cancelLabel;

    const btns = dialogEl.querySelectorAll('.device-picker-btn');
    btns.forEach((btn, index) => {
      const device = devices[index];
      btn.querySelector('.device-picker-name').textContent = device.name || device.address;
      btn.querySelector('.device-picker-address').textContent = device.address || '';
    });

    function _close(selectedDevice) {
      dialogEl.classList.remove('open');
      // Allow the CSS transition to finish before removal.
      dialogEl.addEventListener('transitionend', () => dialogEl.remove(), { once: true });
      // Fallback removal in case no transition fires.
      setTimeout(() => dialogEl.remove(), 300);
      resolve(selectedDevice ?? null);
    }

    // Device selection
    btns.forEach((btn, index) => {
      btn.addEventListener('click', () => _close(devices[index]));
    });

    // Cancel / overlay dismiss
    dialogEl.querySelector('.device-picker-cancel').addEventListener('click', () => _close(null));
    dialogEl.querySelector('.device-picker-overlay').addEventListener('click', () => _close(null));

    // Keyboard: Escape cancels
    function _onKeyDown(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', _onKeyDown);
        _close(null);
      }
    }
    document.addEventListener('keydown', _onKeyDown);

    document.body.appendChild(dialogEl);

    // Trigger open on the next frame so the CSS transition plays.
    requestAnimationFrame(() => dialogEl.classList.add('open'));
  });
}
