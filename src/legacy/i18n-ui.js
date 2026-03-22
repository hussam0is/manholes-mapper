/**
 * i18n-ui.js
 *
 * Extracted i18n UI application from src/legacy/main.js.
 *
 * Applies translations to static UI elements, rebuilds help lists,
 * and sets document direction based on current language.
 *
 * Reads shared state through the S proxy and calls cross-module functions
 * through the F registry.
 */

import { S, F } from './shared-state.js';
import { renderEdgeLegend } from './canvas-draw.js';
import {
  updateStreetViewTranslations
} from '../map/street-view.js';
import {
  updateLayersConfigTranslations
} from '../map/layers-config.js';

// use global t/isRTL injected from module entry

export function applyLangToStaticUI() {
  // Sweep all elements with translation data-attributes
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  // appTitle uses child spans for styled brand text — set textContent directly
  const appTitleEl = document.getElementById('appTitle');
  if (appTitleEl) appTitleEl.textContent = t('appTitle');

  // Canvas toolbar mode buttons: innerHTML must be reset each call to restore
  // the Material Icon markup that applyLangToStaticUI itself previously wiped.
  const nodeModeBtn = document.getElementById('nodeModeBtn');
  const homeNodeModeBtn = document.getElementById('homeNodeModeBtn');
  const drainageNodeModeBtn = document.getElementById('drainageNodeModeBtn');
  const issueNodeModeBtn = document.getElementById('issueNodeModeBtn');
  const edgeModeBtn = document.getElementById('edgeModeBtn');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  if (nodeModeBtn) {
    nodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">radio_button_unchecked</span>';
  }
  if (homeNodeModeBtn) {
    homeNodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">home</span>';
  }
  if (drainageNodeModeBtn) {
    drainageNodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">water_drop</span>';
  }
  if (issueNodeModeBtn) {
    issueNodeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">report_problem</span>';
  }
  if (edgeModeBtn) {
    edgeModeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">timeline</span>';
  }
  if (undoBtn) {
    undoBtn.innerHTML = '<span class="material-icons" aria-hidden="true">undo</span>';
  }
  if (redoBtn) {
    redoBtn.innerHTML = '<span class="material-icons" aria-hidden="true">redo</span>';
  }

  // Dynamic inputs not present in index.html (created at runtime by other modules)
  const searchAddressInput = document.getElementById('searchAddressInput');
  const mobileSearchAddressInput = document.getElementById('mobileSearchAddressInput');
  if (searchAddressInput) {
    searchAddressInput.placeholder = t('searchAddress');
    searchAddressInput.title = t('searchAddressTitle');
  }
  if (mobileSearchAddressInput) {
    mobileSearchAddressInput.placeholder = t('searchAddress');
    mobileSearchAddressInput.title = t('searchAddressTitle');
  }

  // Rebuild the help list — it is an array of translated strings, not a single key
  // Format: "KEY: description" — wrap the key portion in <kbd> for visual distinction
  const helpListEl = document.getElementById('helpList');
  if (helpListEl) {
    helpListEl.innerHTML = '';
    t('helpLines').forEach((line) => {
      const li = document.createElement('li');
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx < 30) {
        const keyPart = line.substring(0, colonIdx).trim();
        const descPart = line.substring(colonIdx + 1).trim();
        // Split compound keys like "= / -" into separate <kbd> elements
        const keys = keyPart.split(/\s*\/\s*/);
        keys.forEach((k, i) => {
          const kbd = document.createElement('kbd');
          kbd.textContent = k.trim();
          li.appendChild(kbd);
          if (i < keys.length - 1) {
            li.appendChild(document.createTextNode(' / '));
          }
        });
        li.appendChild(document.createTextNode(' — ' + descPart));
      } else {
        li.textContent = line;
      }
      helpListEl.appendChild(li);
    });
  }

  const currentLang = S.currentLang;

  // Apply document-level RTL/LTR direction and language tag
  document.documentElement.dir = isRTL(currentLang) ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLang;
  document.body.classList.toggle('rtl', isRTL(currentLang));

  // Re-render edge legend (alignment depends on current language direction)
  renderEdgeLegend();

  // Update street view pegman labels (managed by an external module)
  updateStreetViewTranslations(t);
  updateLayersConfigTranslations(t);
}
