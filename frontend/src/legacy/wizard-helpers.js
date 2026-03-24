/**
 * wizard-helpers.js
 *
 * Extracted wizard tab/field helpers from src/legacy/main.js.
 *
 * Reads main.js local state through the shared S proxy.
 * Calls cross-module functions through the shared F registry.
 */

import { S, F } from './shared-state.js';
import { NODE_COVER_DIAMETERS, getOptionLabel } from '../state/constants.js';

// Convenience wrapper
const t = (...args) => F.t(...args);

// ── Constants ────────────────────────────────────────────────────────────────

export const WIZARD_TAB_DEFS = {
  accuracy_level:     { icon: 'gps_fixed', color: '#1565C0', bg: '#E3F2FD', labelKey: 'labels.accuracyLevel' },
  maintenance_status: { icon: 'build',     color: '#E65100', bg: '#FFF3E0', labelKey: 'labels.maintenanceStatus' },
  material:           { icon: 'layers',    color: '#6A1B9A', bg: '#F3E5F5', labelKey: 'labels.coverMaterial' },
  cover_diameter:     { icon: 'circle',    color: '#2E7D32', bg: '#E8F5E9', labelKey: 'labels.coverDiameter' },
  access:             { icon: 'stairs',    color: '#C62828', bg: '#FFEBEE', labelKey: 'labels.access' },
  note:               { icon: 'notes',     color: '#37474F', bg: '#ECEFF1', labelKey: 'labels.note' },
};

// Maintenance codes that block access to manhole internals
const WIZARD_CLOSED_MAINT = new Set([3, 4, 5, 13]);
// Maintenance codes where there's no cover (skip material/diameter)
const WIZARD_NO_COVER_MAINT = new Set([10]);

// ── Helpers ──────────────────────────────────────────────────────────────────

export function wizardIsRTKFixed(node) {
  const inMap = typeof S.coordinatesMap !== 'undefined' && S.coordinatesMap && S.coordinatesMap.has(String(node.id));
  return node.gnssFixQuality === 4 ||
    (inMap && node.gnssFixQuality !== 5 && node.gnssFixQuality !== 6) ||
    (node.measure_precision != null && node.measure_precision <= 0.05);
}

export function wizardGetVisibleTabs(node) {
  const tabs = [];
  const autoFixed = wizardIsRTKFixed(node);
  if (!autoFixed) tabs.push('accuracy_level');
  tabs.push('maintenance_status');
  const maint = Number(node.maintenanceStatus);
  if (maint === 0) return tabs; // not set yet, stop here
  if (WIZARD_CLOSED_MAINT.has(maint)) { tabs.push('note'); return tabs; }
  if (WIZARD_NO_COVER_MAINT.has(maint)) { tabs.push('access'); tabs.push('note'); return tabs; }
  tabs.push('material'); tabs.push('cover_diameter'); tabs.push('access'); tabs.push('note');
  return tabs;
}

export function wizardIsFieldFilled(node, key) {
  switch (key) {
    case 'accuracy_level':     return Number(node.accuracyLevel) !== 0 || wizardIsRTKFixed(node);
    case 'maintenance_status': return Number(node.maintenanceStatus) !== 0;
    case 'material':           { const m = node.material; return m && m !== 'לא ידוע' && m !== ''; }
    case 'cover_diameter':     return node.coverDiameter !== '' && node.coverDiameter != null && node.coverDiameter !== 'לא ידוע';
    case 'access':             return Number(node.access) !== 0;
    case 'note':               return !!(node.note && node.note.trim());
    default:                   return false;
  }
}

export function buildWizardTabsHTML(node, activeKey, visibleTabs) {
  return visibleTabs.map(key => {
    const def = WIZARD_TAB_DEFS[key];
    const filled = wizardIsFieldFilled(node, key);
    const isActive = key === activeKey;
    let cls = 'wizard-tab';
    if (isActive) cls += ' wizard-tab--active';
    if (filled) cls += ' wizard-tab--filled';
    const label = t(def.labelKey);
    return `<button class="${cls}" data-wizard-tab="${key}" title="${label}"
              aria-label="${label}"
              style="--tab-color:${def.color};--tab-bg:${def.bg}">
      <span class="material-icons">${def.icon}</span>
      <span class="wizard-tab-label">${label}</span>
      <span class="wizard-check material-icons ${filled ? 'wizard-check--filled' : 'wizard-check--empty'}">${filled ? 'check_circle' : 'radio_button_unchecked'}</span>
    </button>`;
  }).join('');
}

export function buildWizardFieldHTML(node, activeKey, ruleResults, opts) {
  const def = WIZARD_TAB_DEFS[activeKey];
  const label = t(def.labelKey);
  const escapeHtml = window.escapeHtml || ((s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  let inputHtml = '';
  switch (activeKey) {
    case 'accuracy_level':
      inputHtml = `<select id="accuracyLevelSelect" class="wizard-field-input">${opts.accuracyLevelOptions}</select>`;
      break;
    case 'maintenance_status':
      inputHtml = `<select id="nodeMaintenanceStatusSelect" class="wizard-field-input">${opts.maintenanceStatusOptions}</select>`;
      break;
    case 'material':
      inputHtml = `<select id="materialSelect" class="wizard-field-input">${opts.materialOptions}</select>`;
      break;
    case 'cover_diameter':
      inputHtml = `<select id="coverDiameterSelect" class="wizard-field-input">
        ${NODE_COVER_DIAMETERS.map(d => `<option value="${d}" ${String(node.coverDiameter) === d ? 'selected' : ''}>${getOptionLabel(d)}</option>`).join('')}
      </select>`;
      break;
    case 'access':
      inputHtml = `<select id="accessSelect" class="wizard-field-input">${opts.accessOptions}</select>`;
      break;
    case 'note':
      inputHtml = `<textarea id="noteInput" rows="3" class="wizard-field-input" placeholder="${t('labels.notePlaceholder')}" dir="auto">${escapeHtml(node.note || '')}</textarea>`;
      break;
  }
  return `
    <div class="wizard-field-header" style="color:${def.color}">
      <span class="material-icons">${def.icon}</span>
      <span class="wizard-field-label">${label}</span>
    </div>
    ${inputHtml}
  `;
}
