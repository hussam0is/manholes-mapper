/**
 * finish-workday.js
 *
 * Extracted Finish Workday functionality from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * Exported init function `initFinishWorkday()` wires up event listeners that
 * require DOM elements to already be available.
 */

import { clearHourlyBackups, saveDailyBackup } from '../utils/backup-manager.js';
import { S, F } from './shared-state.js';

// Convenience wrappers so calls inside this module look like plain calls
const t = (...args) => F.t(...args);

// ── DOM refs ────────────────────────────────────────────────────────────
const finishWorkdayBtn        = document.getElementById('finishWorkdayBtn');
const mobileFinishWorkdayBtn  = document.getElementById('mobileFinishWorkdayBtn');
const finishWorkdayModal      = document.getElementById('finishWorkdayModal');
const finishWorkdayCloseBtn   = document.getElementById('finishWorkdayCloseBtn');
const finishWorkdayCancelBtn  = document.getElementById('finishWorkdayCancelBtn');
const finishWorkdayConfirmBtn = document.getElementById('finishWorkdayConfirmBtn');
const danglingEdgesListEl     = document.getElementById('danglingEdgesList');
const finishWorkdayDescEl     = document.getElementById('finishWorkdayDesc');
const finishWorkdayTitleEl    = document.getElementById('finishWorkdayTitle');
const exportDropdown          = document.getElementById('exportDropdown');

// === Finish Workday Functionality ===

/**
 * Get all dangling edges (edges with head === null)
 * @returns {Array} Array of dangling edge objects
 */
export function getDanglingEdges() {
  return S.edges.filter(e => e.head === null || e.isDangling === true);
}

/**
 * Show the finish workday modal
 */
function showFinishWorkdayModal() {
  const danglingEdgesList = getDanglingEdges();
  
  if (danglingEdgesList.length === 0) {
    // No dangling edges - proceed directly
    completeFinishWorkday();
    return;
  }
  
  // Show modal with dangling edges
  if (finishWorkdayModal) {
    finishWorkdayModal.classList.remove('panel-closing');
    finishWorkdayModal.style.display = 'flex';
    renderDanglingEdgesForm(danglingEdgesList);
  }
}

/**
 * Render the form for resolving dangling edges
 * @param {Array} danglingEdgesList - Array of dangling edges
 */
function renderDanglingEdgesForm(danglingEdgesList) {
  if (!danglingEdgesListEl) return;
  
  // Update description text
  if (finishWorkdayDescEl) {
    finishWorkdayDescEl.textContent = t('labels.resolveDanglingDesc');
  }
  if (finishWorkdayTitleEl) {
    const titleText = finishWorkdayTitleEl.querySelector('.finish-workday-title-text');
    if (titleText) titleText.textContent = t('finishWorkday.title');
  }
  
  danglingEdgesListEl.innerHTML = danglingEdgesList.map((edge, index) => {
    const tailNode = S.nodes.find(n => n.id === edge.tail);
    const tailLabel = tailNode ? `${edge.tail}` : edge.tail;
    
    // escapeHtml is available globally via window.escapeHtml (from main-entry.js)
    const escapeHtml = window.escapeHtml || (s => String(s));
    
    return `
      <div class="dangling-edge-item" data-edge-id="${edge.id}">
        <div class="dangling-edge-item-header">
          <span class="material-icons">call_missed_outgoing</span>
          <span>${t('labels.danglingEdge')}: ${escapeHtml(tailLabel)} → ?</span>
        </div>
        <select class="dangling-edge-select" data-edge-index="${index}">
          <option value="">${t('labels.selectNodeType')}</option>
          <option value="Manhole">${t('modeNode')}</option>
          <option value="Home">${t('modeHome')}</option>
          <option value="ForLater">${t('modeForLater')}</option>
        </select>
      </div>
    `;
  }).join('');
  
  // Update button texts
  if (finishWorkdayCancelBtn) {
    finishWorkdayCancelBtn.textContent = t('cancel');
  }
  if (finishWorkdayConfirmBtn) {
    const confirmText = finishWorkdayConfirmBtn.querySelector('span:last-child');
    if (confirmText) confirmText.textContent = t('finishWorkday.confirm');
  }
}

/**
 * Close the finish workday modal
 */
function closeFinishWorkdayModal() {
  if (finishWorkdayModal) {
    F.hidePanelAnimated(finishWorkdayModal);
  }
}

/**
 * Resolve dangling edges by creating nodes at their endpoints
 * @returns {boolean} True if all dangling edges were resolved
 */
export function resolveDanglingEdges() {
  const danglingEdgesList = getDanglingEdges();
  const selects = danglingEdgesListEl?.querySelectorAll('.dangling-edge-select') || [];
  
  // Check all selections are made
  for (const select of selects) {
    if (!select.value) {
      F.showToast(t('finishWorkday.resolveFirst'));
      return false;
    }
  }
  
  // Create nodes for each dangling edge
  danglingEdgesList.forEach((edge, index) => {
    const select = selects[index];
    if (!select || !select.value) return;
    
    const nodeType = select.value;
    const tailNode = S.nodes.find(n => n.id === edge.tail);
    
    // Calculate position for new node
    let newX, newY;
    if (edge.danglingEndpoint) {
      newX = edge.danglingEndpoint.x;
      newY = edge.danglingEndpoint.y;
    } else if (tailNode) {
      // Default offset from tail node
      newX = tailNode.x + 80;
      newY = tailNode.y - 40;
    } else {
      newX = 100;
      newY = 100;
    }
    
    // Create the new node
    const newNode = F.createNode(newX, newY);
    newNode.nodeType = nodeType;
    
    // Update the edge to connect to the new node
    edge.head = newNode.id;
    edge.isDangling = false;
    edge.danglingEndpoint = null;
  });
  
  F.computeNodeTypes();
  F.saveToStorage();
  F.scheduleDraw();
  
  return true;
}

/**
 * Complete the finish workday process
 */
async function completeFinishWorkday() {
  try {
    // Clear hourly backups
    await clearHourlyBackups();
    
    // Save daily backup
    await saveDailyBackup();
    
    // Export nodes and edges CSV (optional - could prompt user)
    // For now, just save the sketch and sync
    F.saveToStorage();
    
    // Force immediate sync if online
    if (S.currentSketchId && window.syncService?.syncSketchToCloud) {
      const sketchForSync = {
        id: S.currentSketchId,
        name: S.currentSketchName,
        creationDate: S.creationDate,
        nodes: S.nodes,
        edges: S.edges,
        adminConfig: typeof S.adminConfig !== 'undefined' ? S.adminConfig : {},
        lastEditedBy: F.getCurrentUsername(),
        lastEditedAt: new Date().toISOString(),
      };
      await window.syncService.syncSketchToCloud(sketchForSync);
    }
    
    F.showToast(t('toasts.finishWorkdaySuccess'));
    closeFinishWorkdayModal();
    F.scheduleDraw();
    
  } catch (error) {
    console.error('[App] Error completing finish workday:', error.message);
    F.showToast(t('finishWorkday.error') || 'Error completing workday');
  }
}

/**
 * Wire up all Finish Workday event listeners.
 * Call once after DOM is ready.
 */
export function initFinishWorkday() {
  // Finish Workday button handlers
  if (finishWorkdayBtn) {
    finishWorkdayBtn.addEventListener('click', () => {
      // Close dropdown menu first
      if (exportDropdown) exportDropdown.classList.remove('menu-dropdown--open');
      showFinishWorkdayModal();
    });
  }

  if (mobileFinishWorkdayBtn) {
    mobileFinishWorkdayBtn.addEventListener('click', () => {
      F.closeMobileMenu();
      showFinishWorkdayModal();
    });
  }

  // Modal close handlers
  if (finishWorkdayCloseBtn) {
    finishWorkdayCloseBtn.addEventListener('click', closeFinishWorkdayModal);
  }

  if (finishWorkdayCancelBtn) {
    finishWorkdayCancelBtn.addEventListener('click', closeFinishWorkdayModal);
  }

  // Confirm button handler
  if (finishWorkdayConfirmBtn) {
    finishWorkdayConfirmBtn.addEventListener('click', async () => {
      const danglingEdgesList = getDanglingEdges();
      
      if (danglingEdgesList.length > 0) {
        // Need to resolve dangling edges first
        if (!resolveDanglingEdges()) {
          return; // Resolution failed or incomplete
        }
      }
      
      // Proceed with finish workday
      await completeFinishWorkday();
    });
  }

  // Close modal when clicking backdrop
  if (finishWorkdayModal) {
    finishWorkdayModal.addEventListener('click', (e) => {
      if (e.target === finishWorkdayModal) {
        closeFinishWorkdayModal();
      }
    });
  }
}
