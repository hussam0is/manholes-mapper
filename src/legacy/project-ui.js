/**
 * project-ui.js
 *
 * Extracted project dropdown and flyout UI from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 */

import { DEFAULT_INPUT_FLOW_CONFIG } from '../state/constants.js';
import { S, F } from './shared-state.js';

// ── Convenience wrappers ────────────────────────────────────────────────
const t = (...args) => F.t(...args);
const escapeHtml = (s) => window.escapeHtml ? window.escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

// ── DOM refs ────────────────────────────────────────────────────────────
const nodeTypeFlyoutBtn = document.getElementById('nodeTypeFlyoutBtn');
const nodeTypeFlyout = document.getElementById('nodeTypeFlyout');

// ── Node-type flyout icons ──────────────────────────────────────────────
const NODE_TYPE_ICONS = {
  node:     'radio_button_unchecked',
  home:     'home',
  drainage: 'water_drop',
  issue:    'report_problem',
};

// ── Fetch projects from API ─────────────────────────────────────────────
export async function fetchProjects() {
  try {
    const authState = window.authGuard?.getAuthState?.() || {};
    if (!authState.isSignedIn) {
      console.warn('[Projects] Not authenticated');
      return [];
    }
    
    const response = await fetch('/api/projects', {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('[Projects] Failed to fetch projects:', response.status);
      return [];
    }
    
    const data = await response.json();
    S.availableProjects = data.projects || [];
    return S.availableProjects;
  } catch (error) {
    console.error('[Projects] Error fetching projects:', error);
    return [];
  }
}

// ── Render project dropdown ─────────────────────────────────────────────
export function renderProjectDropdown() {
  const projectSelect = document.getElementById('projectSelect');
  if (!projectSelect) return;

  const fieldContainer = projectSelect.closest('.field');
  if (S.availableProjects.length === 0) {
    if (fieldContainer) fieldContainer.style.display = 'none';
    return;
  }

  if (fieldContainer) fieldContainer.style.display = '';
  projectSelect.innerHTML = `
    <option value="">${t('labels.selectProject')}</option>
    ${S.availableProjects.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
  `;
}

// ── Get project input flow config ───────────────────────────────────────
export function getProjectInputFlowConfig(projectId) {
  if (!projectId) return DEFAULT_INPUT_FLOW_CONFIG;
  
  const project = S.availableProjects.find(p => p.id === projectId);
  if (!project || !project.inputFlowConfig || Object.keys(project.inputFlowConfig).length === 0) {
    return DEFAULT_INPUT_FLOW_CONFIG;
  }
  
  return project.inputFlowConfig;
}

// ── Flyout icon sync ────────────────────────────────────────────────────
export function syncFlyoutIcon() {
  if (!nodeTypeFlyoutBtn) return;
  const iconEl = nodeTypeFlyoutBtn.querySelector('.material-icons');
  if (!iconEl) return;
  const isNodeType = ['node', 'home', 'drainage', 'issue'].includes(S.currentMode);
  iconEl.textContent = isNodeType
    ? (NODE_TYPE_ICONS[S.currentMode] || 'radio_button_unchecked')
    : 'radio_button_unchecked';
  nodeTypeFlyoutBtn.classList.toggle('has-active-type', isNodeType);
  nodeTypeFlyoutBtn.classList.toggle('active', isNodeType);
}

// ── Close flyout ────────────────────────────────────────────────────────
export function closeFlyout() {
  if (!nodeTypeFlyout || !nodeTypeFlyoutBtn) return;
  nodeTypeFlyout.classList.remove('open');
  nodeTypeFlyoutBtn.setAttribute('aria-expanded', 'false');
}

/**
 * Initialize flyout event listeners.
 * Called from main.js after DOM is ready.
 */
export function initProjectUI() {
  if (nodeTypeFlyoutBtn && nodeTypeFlyout) {
    function toggleFlyout() {
      const isOpen = nodeTypeFlyout.classList.toggle('open');
      nodeTypeFlyoutBtn.setAttribute('aria-expanded', String(isOpen));
    }

    nodeTypeFlyoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFlyout();
    });

    // Close flyout when a node-type button is clicked
    const nodeModeBtn = document.getElementById('nodeModeBtn');
    const homeNodeModeBtn = document.getElementById('homeNodeModeBtn');
    const drainageNodeModeBtn = document.getElementById('drainageNodeModeBtn');
    const issueNodeModeBtn = document.getElementById('issueNodeModeBtn');
    const edgeModeBtn = document.getElementById('edgeModeBtn');

    [nodeModeBtn, homeNodeModeBtn, drainageNodeModeBtn, issueNodeModeBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', () => {
        closeFlyout();
        syncFlyoutIcon();
      });
    });

    // Close flyout when edge mode or any non-node-type is chosen
    if (edgeModeBtn) edgeModeBtn.addEventListener('click', () => {
      closeFlyout();
      syncFlyoutIcon();
    });

    // Close flyout on outside tap
    document.addEventListener('click', (e) => {
      if (!nodeTypeFlyout.classList.contains('open')) return;
      if (nodeTypeFlyoutBtn.contains(e.target) || nodeTypeFlyout.contains(e.target)) return;
      closeFlyout();
    });

    // Initial sync
    syncFlyoutIcon();
  }
}
