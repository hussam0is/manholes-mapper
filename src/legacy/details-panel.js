/**
 * details-panel.js
 *
 * Extracted details panel / sidebar rendering from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * Exported functions:
 *   - renderDetails()         — Render the right-hand details panel
 *   - closeSidebarPanel()     — Close the sidebar drawer
 *   - assignHomeIdFromConnectedManhole(homeNode) — Auto-assign Home node IDs
 *   - initDetailsPanel()      — Wire up sidebar close-button & backdrop listeners
 *
 * Issue-comment helpers (also exported):
 *   - _fetchOrgMembers, _attachMentionAutocomplete, _extractMentionedUserIds,
 *     _loadIssueComments, _sendIssueComment
 */

import { S, F } from './shared-state.js';
import {
  NODE_MATERIAL_OPTIONS,
  NODE_ACCESS_OPTIONS,
  NODE_ACCURACY_OPTIONS,
  NODE_MAINTENANCE_OPTIONS,
  EDGE_MATERIAL_OPTIONS,
  EDGE_LINE_DIAMETERS,
  EDGE_TYPE_OPTIONS,
  EDGE_ENGINEERING_STATUS,
  getOptionLabel,
} from '../state/constants.js';
import {
  evaluateRules,
  applyActions,
  normalizeEntityForRules,
} from '../utils/input-flow-engine.js';

// Convenience wrappers so calls inside this module look like plain calls
const t = (...args) => F.t(...args);

// ============================================
// @Mention autocomplete for issue comments
// ============================================
let _mentionCache = null;
let _mentionCachePromise = null;

async function _fetchOrgMembers() {
  if (_mentionCache) return _mentionCache;
  if (_mentionCachePromise) return _mentionCachePromise;
  _mentionCachePromise = (async () => {
    try {
      const resp = await fetch('/api/org-members');
      if (!resp.ok) return [];
      const data = await resp.json();
      _mentionCache = data.members || [];
      return _mentionCache;
    } catch {
      return [];
    } finally {
      _mentionCachePromise = null;
    }
  })();
  return _mentionCachePromise;
}

/**
 * Attach @mention autocomplete to a textarea.
 * Shows a dropdown when the user types @ followed by characters.
 */
function _attachMentionAutocomplete(textarea) {
  let dropdown = null;
  let mentionStart = -1;
  let selectedIndex = 0;
  let filteredMembers = [];

  function removeDropdown() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
    mentionStart = -1;
    selectedIndex = 0;
    filteredMembers = [];
  }

  function insertMention(member) {
    const value = textarea.value;
    const before = value.substring(0, mentionStart);
    const after = value.substring(textarea.selectionStart);
    const mention = `@${member.username} `;
    textarea.value = before + mention + after;
    const cursorPos = mentionStart + mention.length;
    textarea.setSelectionRange(cursorPos, cursorPos);
    textarea.focus();
    removeDropdown();
  }

  function renderDropdown(members) {
    filteredMembers = members;
    if (members.length === 0) {
      removeDropdown();
      return;
    }
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'mention-dropdown';
      // Position relative to the textarea's parent
      const inputRow = textarea.closest('.issue-comment-input-row');
      if (inputRow) {
        inputRow.style.position = 'relative';
        inputRow.appendChild(dropdown);
      } else {
        textarea.parentElement.style.position = 'relative';
        textarea.parentElement.appendChild(dropdown);
      }
    }
    selectedIndex = Math.min(selectedIndex, members.length - 1);
    dropdown.innerHTML = members.map((m, i) => {
      const activeClass = i === selectedIndex ? ' mention-item-active' : '';
      return `<div class="mention-item${activeClass}" data-index="${i}">
        <span class="mention-item-name">${escapeHtml(m.username)}</span>
        ${m.email ? `<span class="mention-item-email">${escapeHtml(m.email)}</span>` : ''}
      </div>`;
    }).join('');

    // Click handlers
    dropdown.querySelectorAll('.mention-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent textarea blur
        const idx = parseInt(el.dataset.index, 10);
        insertMention(filteredMembers[idx]);
      });
    });
  }

  async function handleInput() {
    const cursorPos = textarea.selectionStart;
    const text = textarea.value.substring(0, cursorPos);
    // Find the last @ that could be a mention trigger (preceded by start or whitespace)
    const lastAt = text.lastIndexOf('@');
    if (lastAt < 0 || (lastAt > 0 && !/\s/.test(text[lastAt - 1]))) {
      removeDropdown();
      return;
    }
    const query = text.substring(lastAt + 1);
    // If query contains whitespace, it's not an active mention
    if (/\s/.test(query)) {
      removeDropdown();
      return;
    }
    mentionStart = lastAt;
    const members = await _fetchOrgMembers();
    const lowerQuery = query.toLowerCase();
    const filtered = members.filter(m =>
      m.username.toLowerCase().includes(lowerQuery) ||
      (m.email && m.email.toLowerCase().includes(lowerQuery))
    ).slice(0, 6);
    renderDropdown(filtered);
  }

  textarea.addEventListener('input', handleInput);

  textarea.addEventListener('keydown', (e) => {
    if (!dropdown || filteredMembers.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredMembers.length;
      renderDropdown(filteredMembers);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredMembers.length) % filteredMembers.length;
      renderDropdown(filteredMembers);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      insertMention(filteredMembers[selectedIndex]);
    } else if (e.key === 'Escape') {
      removeDropdown();
    }
  });

  textarea.addEventListener('blur', () => {
    // Delay to allow click events on dropdown items
    setTimeout(removeDropdown, 200);
  });
}

/**
 * Extract @mentioned usernames from comment text and resolve to user IDs.
 */
function _extractMentionedUserIds(text) {
  if (!_mentionCache) return [];
  const mentionPattern = /@(\S+)/g;
  const ids = [];
  let match;
  while ((match = mentionPattern.exec(text)) !== null) {
    const username = match[1];
    const member = _mentionCache.find(m => m.username === username);
    if (member) ids.push(member.id);
  }
  return [...new Set(ids)];
}

/**
 * Load issue comments from the API and render them into the comments list.
 */
async function _loadIssueComments(node) {
  const listEl = document.getElementById('issueCommentsList');
  if (!listEl || !S.currentSketchId) {
    if (listEl) listEl.innerHTML = `<div class="issue-comments-empty">${t('issue.noComments')}</div>`;
    return;
  }
  try {
    const resp = await fetch(`/api/issue-comments?sketchId=${encodeURIComponent(S.currentSketchId)}&nodeId=${encodeURIComponent(node.id)}`);
    if (!resp.ok) throw new Error('Failed to load comments');
    const data = await resp.json();
    const comments = data.comments || [];
    if (comments.length === 0) {
      listEl.innerHTML = `<div class="issue-comments-empty">${t('issue.noComments')}</div>`;
      return;
    }
    listEl.innerHTML = comments.map(c => {
      const date = new Date(c.created_at);
      const timeStr = date.toLocaleString(S.currentLang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });
      const isAction = c.is_close_action || c.is_reopen_action;
      const actionClass = isAction ? ' issue-comment-action' : '';
      const icon = c.is_close_action ? 'check_circle' : c.is_reopen_action ? 'refresh' : '';
      return `<div class="issue-comment${actionClass}">
        ${icon ? `<span class="material-icons issue-comment-action-icon">${icon}</span>` : ''}
        <div class="issue-comment-header">
          <span class="issue-comment-author">${escapeHtml(c.username || 'Unknown')}</span>
          <span class="issue-comment-time">${timeStr}</span>
        </div>
        <div class="issue-comment-content">${escapeHtml(c.content).replace(/@(\S+)/g, '<span class="mention-highlight">@$1</span>')}</div>
      </div>`;
    }).join('');
    // Scroll to bottom
    listEl.scrollTop = listEl.scrollHeight;
  } catch (err) {
    console.error('[Issue Comments] Load failed:', err);
    listEl.innerHTML = `<div class="issue-comments-empty">${t('issue.loadError')}</div>`;
  }
}

/**
 * Send an issue comment to the API and reload the comment list.
 */
async function _sendIssueComment(node, inputEl, isCloseAction, isReopenAction) {
  const content = inputEl.value?.trim();
  if (!content || !S.currentSketchId) return;
  const mentionedUserIds = _extractMentionedUserIds(content);
  inputEl.value = '';
  try {
    const resp = await fetch('/api/issue-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sketchId: S.currentSketchId,
        nodeId: node.id,
        content,
        isCloseAction: !!isCloseAction,
        isReopenAction: !!isReopenAction,
        mentionedUserIds,
      }),
    });
    if (!resp.ok) throw new Error('Failed to send comment');
    await _loadIssueComments(node);
  } catch (err) {
    console.error('[Issue Comments] Send failed:', err);
    F.showToast(t('issue.sendError'));
  }
}

/**
 * Render the right-hand details panel based on the current selection.
 * Supports editing node id, note, material and edge type/material/measurements.
 */
function renderDetails() {
  const detailsContainer = S.detailsContainer;
  const selectedNode = S.selectedNode;
  const selectedEdge = S.selectedEdge;
  const sidebarEl = S.sidebarEl;
  const sidebarTitleEl = S.sidebarTitleEl;
  const nodes = S.nodes;
  const edges = S.edges;
  const adminConfig = S.adminConfig;
  const currentLang = S.currentLang;
  const nodeMap = S.nodeMap;

  detailsContainer.innerHTML = '';
  // Show/hide measurement rail for edge selection
  if (selectedEdge && typeof window.__showMeasurementRail === 'function') {
    window.__showMeasurementRail(selectedEdge);
  } else if (typeof window.__hideMeasurementRail === 'function') {
    window.__hideMeasurementRail();
  }
  // Dynamic sidebar title: show element type + ID instead of generic "Details"
  if (sidebarTitleEl) {
    if (selectedNode) {
      const ntKey = (selectedNode.nodeType || 'Manhole').toLowerCase();
      const typeLabel = t('nodeTypeLabel.' + ntKey) || t('nodeTypeLabel.manhole');
      sidebarTitleEl.textContent = t('sidebarNodeTitle', typeLabel, selectedNode.id);
      sidebarTitleEl.removeAttribute('data-i18n');
    } else if (selectedEdge) {
      sidebarTitleEl.textContent = t('sidebarEdgeTitle', selectedEdge.tail, selectedEdge.head);
      sidebarTitleEl.removeAttribute('data-i18n');
    } else {
      sidebarTitleEl.textContent = t('sidebarTitle');
      sidebarTitleEl.setAttribute('data-i18n', 'sidebarTitle');
    }
  }
  // Track last edited position for "center between" navigation
  if (selectedNode) {
    window.__setLastEditPosition?.(selectedNode.x, selectedNode.y);
  } else if (selectedEdge) {
    const tailN = nodeMap.get(String(selectedEdge.tail));
    const headN = nodeMap.get(String(selectedEdge.head));
    if (tailN && headN) {
      window.__setLastEditPosition?.((tailN.x + headN.x) / 2, (tailN.y + headN.y) / 2);
    }
  }
  if (selectedNode) {
    const node = selectedNode;
    const container = document.createElement('div');
    
    // Evaluate input flow rules for this node
    const normalizedNode = normalizeEntityForRules(node);
    const ruleResults = evaluateRules(S.currentInputFlowConfig, 'nodes', normalizedNode);
    
    // Store rule results for use in event handlers
    // Convert fillValues Map to object for JSON serialization
    const fillValuesObj = {};
    if (ruleResults.fillValues) {
      for (const [key, val] of ruleResults.fillValues) {
        fillValuesObj[key] = val;
      }
    }
    container.dataset.ruleResults = JSON.stringify({
      disabled: Array.from(ruleResults.disabled),
      required: Array.from(ruleResults.required),
      nullified: Array.from(ruleResults.nullified),
      fillValues: fillValuesObj
    });
    
    // Helper to check if a field is auto-filled
    const isAutoFilled = (fieldKey) => ruleResults.fillValues && ruleResults.fillValues.has(fieldKey);
    const getFilledValue = (fieldKey) => ruleResults.fillValues ? ruleResults.fillValues.get(fieldKey) : undefined;
    
    // Apply fill values to the node and get effective values for rendering
    // This ensures the correct option is selected in dropdowns
    if (ruleResults.fillValues && ruleResults.fillValues.size > 0) {
      let hasChanges = false;
      for (const [field, value] of ruleResults.fillValues) {
        // Map snake_case field keys to camelCase for comparison
        const propMap = {
          'accuracy_level': 'accuracyLevel',
          'maintenance_status': 'maintenanceStatus', 
          'cover_diameter': 'coverDiameter',
          'material': 'material',
          'access': 'access',
          'engineering_status': 'nodeEngineeringStatus'
        };
        const propName = propMap[field] || field;
        if (node[propName] !== value) {
          hasChanges = true;
          break;
        }
      }
      if (hasChanges) {
        const modifiedNode = applyActions(node, ruleResults, adminConfig.nodes?.defaults || {});
        // Update node with fill values (persist the change)
        Object.assign(node, modifiedNode);
        F.saveToStorage();
      }
    }
    
    // Build node details form with smart sorting based on usage history
    let materialOptions = '';
    const rawMaterialOptions = (adminConfig.nodes?.options?.material ?? NODE_MATERIAL_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedMaterialOptions = F.getSortedOptions('nodes', 'material', rawMaterialOptions);
    sortedMaterialOptions.forEach((opt) => {
      const mat = opt.label || opt;
      materialOptions += `<option value="${escapeHtml(mat)}" ${node.material === mat ? 'selected' : ''}>${escapeHtml(getOptionLabel(opt))}</option>`;
    });
    // Cover diameter as free integer input
    // Access options with smart sorting
    const rawAccessOptions = (adminConfig.nodes?.options?.access ?? NODE_ACCESS_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedAccessOptions = F.getSortedOptions('nodes', 'access', rawAccessOptions);
    const accessOptions = sortedAccessOptions
      .map((opt) => `<option value="${escapeHtml(String(opt.code))}" ${Number(node.access)===Number(opt.code)?'selected':''}>${escapeHtml(getOptionLabel(opt))}</option>`)
      .join('');
    
    // Accuracy level options with smart sorting
    const rawAccuracyOptions = (adminConfig.nodes?.options?.accuracy_level ?? NODE_ACCURACY_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedAccuracyOptions = F.getSortedOptions('nodes', 'accuracy_level', rawAccuracyOptions);
    const accuracyLevelOptions = sortedAccuracyOptions
      .map((opt) => `<option value="${escapeHtml(String(opt.code))}" ${Number(node.accuracyLevel)===Number(opt.code)?'selected':''}>${escapeHtml(getOptionLabel(opt))}</option>`)
      .join('');

    // Maintenance status options with smart sorting
    const rawMaintenanceOptions = (adminConfig.nodes?.options?.maintenance_status ?? NODE_MAINTENANCE_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedMaintenanceOptions = F.getSortedOptions('nodes', 'maintenance_status', rawMaintenanceOptions);
    const maintenanceStatusOptions = sortedMaintenanceOptions
      .map((opt) => `<option value="${escapeHtml(String(opt.code))}" ${Number(node.maintenanceStatus)===Number(opt.code)?'selected':''}>${escapeHtml(getOptionLabel(opt))}</option>`)
      .join('');

    // Node type options: A (default), B (house), C (grey)
    if (node.nodeType === 'Issue') {
      const issueStatus = node.issueStatus || 'open';
      const isOpen = issueStatus === 'open';
      const statusBadgeClass = isOpen ? 'chip chip-warn' : 'chip chip-ok';
      const statusLabel = isOpen ? t('issue.statusOpen') : t('issue.statusClosed');
      const toggleLabel = isOpen ? t('issue.closeIssue') : t('issue.reopenIssue');
      const toggleIcon = isOpen ? 'check_circle' : 'refresh';

      container.innerHTML = `
        <div class="details-section">
          <div class="field">
            <label for="idInput">${t('labels.nodeId')}</label>
            <input id="idInput" type="text" value="${escapeHtml(node.id)}" dir="auto" />
          </div>
        </div>
        <div class="details-section">
          <div class="issue-status-row">
            <div class="${statusBadgeClass}">${statusLabel}</div>
          </div>
          <div class="field">
            <label for="noteInput">${t('issue.description')}</label>
            <textarea id="noteInput" rows="3" placeholder="${t('issue.descriptionPlaceholder')}" dir="auto">${escapeHtml(node.note || '')}</textarea>
          </div>
        </div>
        <div class="details-section issue-comments-section">
          <div class="details-section-title">${t('issue.comments')}</div>
          <div id="issueCommentsList" class="issue-comments-list">
            <div class="issue-comments-loading">${t('issue.loadingComments')}</div>
          </div>
          <div class="issue-comment-input-row">
            <textarea id="issueCommentInput" rows="2" placeholder="${t('issue.commentPlaceholder')}" dir="auto"></textarea>
            <button id="issueCommentSendBtn" class="btn btn-primary issue-comment-send" title="${t('issue.send')}" aria-label="${t('issue.send')}">
              <span class="material-icons">send</span>
            </button>
          </div>
          <div class="issue-actions-row">
            <button id="issueToggleBtn" class="btn ${isOpen ? 'btn-danger' : 'btn-success'} issue-toggle-btn">
              <span class="material-icons">${toggleIcon}</span>
              <span>${toggleLabel}</span>
            </button>
          </div>
        </div>
      `;

      // Load comments from API
      _loadIssueComments(node);

      // Attach listeners for comment send
      const sendBtn = container.querySelector('#issueCommentSendBtn');
      const commentInput = container.querySelector('#issueCommentInput');
      if (sendBtn && commentInput) {
        sendBtn.addEventListener('click', () => _sendIssueComment(node, commentInput, false, false));
        // Attach @mention autocomplete
        _attachMentionAutocomplete(commentInput);
        commentInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            // Don't send if mention dropdown is open (it handles Enter itself)
            const mentionDropdown = commentInput.closest('.issue-comment-input-row')?.querySelector('.mention-dropdown');
            if (mentionDropdown) return;
            e.preventDefault();
            _sendIssueComment(node, commentInput, false, false);
          }
        });
      }

      // Close/reopen toggle
      const toggleBtn = container.querySelector('#issueToggleBtn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const wasOpen = (node.issueStatus || 'open') === 'open';
          node.issueStatus = wasOpen ? 'closed' : 'open';
          F.saveToStorage();
          // Send a system comment for the status change
          const statusInput = { value: wasOpen ? t('issue.closedByUser') : t('issue.reopenedByUser') };
          _sendIssueComment(node, statusInput, wasOpen, !wasOpen);
          F.scheduleDraw();
          renderDetails();
        });
      }
    } else if (node.nodeType === 'Home') {
      const dcText = t('labels.directConnection');
      container.innerHTML = `
        <div class="details-section">
          <div class="field">
            <label for="idInput">${t('labels.nodeId')}</label>
            <input id="idInput" type="text" value="${escapeHtml(node.id)}" dir="auto" />
          </div>
        </div>
        <div class="details-section">
          <div class="field">
            <label><input id="directConnectionToggle" type="checkbox" ${node.directConnection ? 'checked' : ''}/> ${dcText}</label>
          </div>
          <div class="field">
            <label for="homeMaintenanceStatusSelect">${t('labels.maintenanceStatus')}</label>
            <select id="homeMaintenanceStatusSelect">${maintenanceStatusOptions}</select>
          </div>
        </div>
        <div class="details-section">
          <div class="field">
            <label for="noteInput">${t('labels.note')}</label>
            <textarea id="noteInput" rows="3" placeholder="${t('labels.notePlaceholder')}" dir="auto">${escapeHtml(node.note || '')}</textarea>
          </div>
        </div>
      `;
    } else {
      // Compute visible wizard tabs and resolve active tab
      const visibleTabs = F.wizardGetVisibleTabs(node);
      if (!S.__wizardActiveTab || !visibleTabs.includes(S.__wizardActiveTab)) {
        S.__wizardActiveTab = visibleTabs[0];
      }
      const activeWizardTab = S.__wizardActiveTab;

      // Auto-fill accuracy for RTK Fixed nodes
      if (F.wizardIsRTKFixed(node) && node.accuracyLevel !== 0) {
        node.accuracyLevel = 0;
        F.saveToStorage();
      }

      container.innerHTML = `
        <div class="details-section">
          <div class="field">
            <label for="idInput">${t('labels.nodeId')}</label>
            <input id="idInput" type="text" value="${escapeHtml(node.id)}" dir="auto" />
          </div>
        </div>
        <div class="details-section">
          ${F.wizardIsRTKFixed(node) ? `
          <div class="wizard-accuracy-badge">
            <span class="material-icons" style="font-size:16px;vertical-align:middle;color:#2E7D32">gps_fixed</span>
            <span>${t('labels.accuracyBadge')}</span>
          </div>` : ''}
          <div class="wizard-indicator-row">
            ${(() => {
              if (node.type === 'type2') {
                // Node has missing pipe measurements. If it has GPS coords, the issue is pipe data;
                // otherwise the coordinates themselves are missing.
                const hasSurveyCoords = node.surveyX != null && node.surveyY != null;
                const label = hasSurveyCoords
                  ? t('labels.indicatorMissingPipeData')
                  : t('labels.indicatorMissingCoords');
                return `<div class="chip chip-warn">${label}</div>`;
              }
              return `<div class="chip chip-ok">${t('labels.indicatorOk')}</div>`;
            })()}
          </div>
          ${(() => {
            const visTabs = F.wizardGetVisibleTabs(node);
            const filledCount = visTabs.filter(k => F.wizardIsFieldFilled(node, k)).length;
            const totalCount = visTabs.length;
            const pct = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;
            const barColor = pct === 100 ? 'var(--color-success, #22c55e)' : pct >= 50 ? 'var(--color-warning, #eab308)' : 'var(--color-danger, #ef4444)';
            return `<div class="data-completeness-bar" title="${t('labels.dataCompleteness')}: ${filledCount}/${totalCount}">
              <div class="data-completeness-bar__track">
                <div class="data-completeness-bar__fill" style="width:${pct}%;background:${barColor}"></div>
              </div>
              <span class="data-completeness-bar__label">${filledCount}/${totalCount} (${pct}%)</span>
            </div>`;
          })()}
          <div class="node-tab-wizard" id="nodeTabWizard">
            <div class="wizard-tabs-row" id="wizardTabsRow">
              ${F.buildWizardTabsHTML(node, activeWizardTab, visibleTabs)}
            </div>
            <div class="wizard-field-area" id="wizardFieldArea">
              ${F.buildWizardFieldHTML(node, activeWizardTab, ruleResults, { materialOptions, accessOptions, accuracyLevelOptions, maintenanceStatusOptions })}
            </div>
          </div>
        </div>
        ${(() => {
          const hasSurvey = node.surveyX != null || node.surveyY != null || node.surveyZ != null || node.measure_precision != null;
          if (!hasSurvey && node.manual_x == null && node.manual_y == null) {
            // No survey data at all — show a single compact message + timestamps
            const _fmtDateEmpty = (v) => new Date(v).toLocaleString(currentLang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });
            let tsFields = '';
            if (node.createdAt) tsFields += `<div class="field col-span-2"><label>${t('labels.createdAt')}</label><div class="field-value-readonly">${escapeHtml(_fmtDateEmpty(node.createdAt))}</div></div>`;
            if (node.measuredAt) tsFields += `<div class="field col-span-2"><label>${t('labels.measuredAt')}</label><div class="field-value-readonly">${escapeHtml(_fmtDateEmpty(node.measuredAt))}</div></div>`;
            return `<div class="details-section">
              <div class="details-section-title">${t('labels.surveyData')}</div>
              <div class="survey-empty-message">${t('labels.noSurveyData')}</div>
              ${tsFields ? `<div class="details-grid two-col">${tsFields}</div>` : ''}
            </div>`;
          }
          // Has some survey data — show only fields that have values
          let fields = '';
          if (node.surveyX != null) fields += `<div class="field"><label>${t('labels.surveyX')}</label><div class="field-value-readonly">${node.surveyX.toFixed(3)}</div></div>`;
          if (node.surveyY != null) fields += `<div class="field"><label>${t('labels.surveyY')}</label><div class="field-value-readonly">${node.surveyY.toFixed(3)}</div></div>`;
          if (node.surveyZ != null) fields += `<div class="field"><label>${t('labels.terrainLevel')}</label><div class="field-value-readonly">${node.surveyZ.toFixed(3)}</div></div>`;
          fields += `<div class="field"><label>${t('labels.measurePrecision')}</label><div class="field-value-readonly">${node.measure_precision != null ? node.measure_precision.toFixed(3) + ' ' + t('units.meters') : t('labels.notRecorded')}</div></div>`;
          // Fix type badge — only show when node has survey coordinates
          if (node.surveyX != null || node.surveyY != null) {
            const inMap = S.coordinatesMap && S.coordinatesMap.has(String(node.id));
            const fq = (node.gnssFixQuality === 4 || node.gnssFixQuality === 5)
              ? node.gnssFixQuality
              : (inMap ? 4 : 6);
            const cls = fq === 4 ? '4' : fq === 5 ? '5' : '6';
            const fixLabel = fq === 4 ? t('labels.fixFixed') : fq === 5 ? t('labels.fixDeviceFloat') : t('labels.fixManualFloat');
            fields += `<div class="field col-span-2"><label>${t('labels.fixType')}</label><div class="field-value-readonly survey-fix-badge fix-${cls}">${fixLabel}</div></div>`;
          }
          // Timestamps: createdAt and measuredAt
          const _fmtDate = (v) => new Date(v).toLocaleString(currentLang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });
          if (node.createdAt) {
            fields += `<div class="field col-span-2"><label>${t('labels.createdAt')}</label><div class="field-value-readonly">${escapeHtml(_fmtDate(node.createdAt))}</div></div>`;
          }
          if (node.measuredAt) {
            fields += `<div class="field col-span-2"><label>${t('labels.measuredAt')}</label><div class="field-value-readonly">${escapeHtml(_fmtDate(node.measuredAt))}</div></div>`;
          }
          if (node.manual_x != null || node.manual_y != null) {
            if (node.manual_x != null) fields += `<div class="field"><label>${t('labels.manualX')}</label><div class="field-value-readonly">${node.manual_x.toFixed(3)}</div></div>`;
            if (node.manual_y != null) fields += `<div class="field"><label>${t('labels.manualY')}</label><div class="field-value-readonly">${node.manual_y.toFixed(3)}</div></div>`;
            // Lock toggle for manual-coordinate nodes (not RTK — those are always locked)
            if (node.manual_x != null && node.manual_y != null) {
              const isLocked = !!node.positionLocked;
              fields += `<div class="field col-span-2">
                <label class="lock-toggle-label">
                  <input id="positionLockToggle" type="checkbox" ${isLocked ? 'checked' : ''}/>
                  <span class="material-icons" style="font-size:16px;vertical-align:middle;margin-inline-end:4px">${isLocked ? 'lock' : 'lock_open'}</span>
                  ${t('labels.lockPosition')}
                </label>
              </div>`;
            }
          }
          return `<div class="details-section">
            <div class="details-section-title">${t('labels.surveyData')}</div>
            <div class="details-grid two-col">${fields}</div>
          </div>`;
        })()}
      `;
    }

    // Build per-connected-edge inputs: all measurement details
    try {
      const connectedEdges = edges.filter((e) => String(e.tail) === String(node.id) || String(e.head) === String(node.id));
      if (connectedEdges.length > 0) {
        const edgeMaterialOptionRaw = (adminConfig.edges?.options?.material ?? EDGE_MATERIAL_OPTIONS)
          .filter(o => (o.enabled !== false));
        const edgeMaterialOptionLabels = edgeMaterialOptionRaw.map(o => o.label || o);
        const diameterOptions = (adminConfig.edges?.options?.line_diameter ?? EDGE_LINE_DIAMETERS)
          .filter(o => (o.enabled !== false))
          .map(d => ({ code: d.code ?? d, label: d.label ?? d }));
        const diameterIndexFromCode = (code) => {
          if (code === '' || code == null) return 0;
          const idx = diameterOptions.findIndex((d) => String(d.code) === String(code));
          return idx >= 0 ? (idx + 1) : 0;
        };
        // Edge type options
        const ceEdgeTypeOptions = (adminConfig.edges?.options?.edge_type ?? EDGE_TYPE_OPTIONS)
          .filter(o => (o.enabled !== false));
        const ceSortedEdgeTypeOptions = F.getSortedOptions('edges', 'edge_type', ceEdgeTypeOptions);
        // Engineering status options
        const ceEngineeringOptions = (adminConfig.edges?.options?.engineering_status ?? EDGE_ENGINEERING_STATUS);
        const ceSortedEngineeringOptions = F.getSortedOptions('edges', 'engineering_status', ceEngineeringOptions);
        // Fall position options
        const ceFallPositionOptions = (adminConfig.edges?.options?.fall_position || [{code:0,label:t('labels.fallPositionInternal')},{code:1,label:t('labels.fallPositionExternal')}])
          .filter(o => (o.enabled !== false));
        const ceSortedFallPositionOptions = F.getSortedOptions('edges', 'fall_position', ceFallPositionOptions);

        const connectedLinesText = t('labels.connectedLines');
        let html = `<div class="details-section"><div class="panel-section-header">${connectedLinesText}</div>`;
        connectedEdges.forEach((e, ceIdx) => {
          const isTail = String(e.tail) === String(node.id);
          const otherNodeId = isTail ? e.head : e.tail;
          const measureLabel = isTail ? t('labels.tailMeasure') : t('labels.headMeasure');
          const inputId = `edgeMeasure_${e.id}_${isTail ? 'tail' : 'head'}`;
          const matId = `edgeMaterial_${e.id}`;
          const diamSelectId = `edgeDiameterSelect_${e.id}`;
          const edgeTypeId = `edgeType_${e.id}`;
          const engStatusId = `edgeEngStatus_${e.id}`;
          const fallDepthId = `edgeFallDepth_${e.id}`;
          const fallPosId = `edgeFallPosition_${e.id}`;
          const materialOptions = edgeMaterialOptionRaw.map((o) => { const m = o.label || o; return `<option value="${escapeHtml(m)}" ${e.material === m ? 'selected' : ''}>${escapeHtml(getOptionLabel(o))}</option>`; }).join('');
          const currentDiameterIndex = diameterIndexFromCode(e.line_diameter);
          const edgeTypeOptionsHtml = ceSortedEdgeTypeOptions.map(opt => {
            const et = opt.label || opt;
            return `<option value="${escapeHtml(et)}" ${e.edge_type === et ? 'selected' : ''}>${escapeHtml(getOptionLabel(opt))}</option>`;
          }).join('');
          const engStatusOptionsHtml = ceSortedEngineeringOptions.map((opt) =>
            `<option value="${escapeHtml(String(opt.code))}" ${Number(e.engineeringStatus)===Number(opt.code)?'selected':''}>${escapeHtml(getOptionLabel(opt))}</option>`
          ).join('');
          const fallPosOptionsHtml = ceSortedFallPositionOptions.map(({code, label}) =>
            `<option value="${escapeHtml(String(code))}" ${Number(e.fall_position)===Number(code)?'selected':''}>${escapeHtml(label)}</option>`
          ).join('');
          if (ceIdx > 0) html += `<hr class="connected-edge-divider" />`;
          html += `<div class="connected-edge-header">${isRTL(currentLang) ? '\u2190' : '\u2192'} ${escapeHtml(String(otherNodeId))}</div>`;
          html += `<div class="details-grid two-col connected-lines-grid">`;
          // Row 1: measurement + edge type
          html += `
            <div class="field">
              <label for="${inputId}">${measureLabel}</label>
              <input id="${inputId}" type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" value="${isTail ? (e.tail_measurement || '') : (e.head_measurement || '')}" placeholder="${t('labels.optional')}" dir="auto" />
            </div>`;
          if (adminConfig.edges.include.edge_type) {
            html += `
            <div class="field">
              <label for="${edgeTypeId}">${t('labels.edgeType')}</label>
              <select id="${edgeTypeId}">${edgeTypeOptionsHtml}</select>
            </div>`;
          } else {
            html += `<div class="field"></div>`;
          }
          // Row 2: material + diameter
          html += `
            <div class="field">
              <label for="${matId}">${t('labels.edgeMaterial')}</label>
              <select id="${matId}">${materialOptions}</select>
            </div>`;
          if (adminConfig.edges.include.line_diameter) {
            html += `
            <div class="field">
              <label for="${diamSelectId}">${t('labels.lineDiameter')}</label>
              <select id="${diamSelectId}">
                <option value="" ${e.line_diameter === '' ? 'selected' : ''}>${t('labels.optional')}</option>
                ${diameterOptions.map((d) => { const lbl = String(d.label); const display = /^\d+$/.test(lbl) ? lbl + ' mm' : lbl; return `<option value="${String(d.code)}" ${String(e.line_diameter) === String(d.code) ? 'selected' : ''}>${display}</option>`; }).join('')}
              </select>
            </div>`;
          } else {
            html += `<div class="field"></div>`;
          }
          // Row 3: fall depth + fall position
          if (adminConfig.edges.include.fall_depth || adminConfig.edges.include.fall_position) {
            if (adminConfig.edges.include.fall_depth) {
              html += `
            <div class="field">
              <label for="${fallDepthId}">${t('labels.fallDepth')}</label>
              <input id="${fallDepthId}" type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" value="${e.fall_depth || ''}" placeholder="${t('labels.optional')}" dir="auto" />
            </div>`;
            } else {
              html += `<div class="field"></div>`;
            }
            if (adminConfig.edges.include.fall_position) {
              html += `
            <div class="field">
              <label for="${fallPosId}">${t('labels.fallPosition')}</label>
              <select id="${fallPosId}">
                <option value="" ${e.fall_position===''?'selected':''}>${t('labels.optional')}</option>
                ${fallPosOptionsHtml}
              </select>
            </div>`;
            } else {
              html += `<div class="field"></div>`;
            }
          }
          // Row 4: engineering status
          if (adminConfig.edges.include.engineering_status) {
            html += `
            <div class="field col-span-2">
              <label for="${engStatusId}">${t('labels.engineeringStatus')}</label>
              <select id="${engStatusId}">${engStatusOptionsHtml}</select>
            </div>`;
          }
          html += `</div>`;
        });
        html += '</div>';
        const nodeEdgesWrapper = document.createElement('div');
        nodeEdgesWrapper.innerHTML = html;
        container.appendChild(nodeEdgesWrapper);

        // Listeners
        connectedEdges.forEach((e) => {
          const isTail = String(e.tail) === String(node.id);
          const inputId = `edgeMeasure_${e.id}_${isTail ? 'tail' : 'head'}`;
          const matId = `edgeMaterial_${e.id}`;
          const diamSelectId = `edgeDiameterSelect_${e.id}`;
          const edgeTypeId = `edgeType_${e.id}`;
          const engStatusId = `edgeEngStatus_${e.id}`;
          const fallDepthId = `edgeFallDepth_${e.id}`;
          const fallPosId = `edgeFallPosition_${e.id}`;
          const measureInput = container.querySelector(`#${CSS.escape(inputId)}`);
          const materialSelect = container.querySelector(`#${CSS.escape(matId)}`);
          const diameterSelect = container.querySelector(`#${CSS.escape(diamSelectId)}`);
          const edgeTypeSelect = container.querySelector(`#${CSS.escape(edgeTypeId)}`);
          const engStatusSelect = container.querySelector(`#${CSS.escape(engStatusId)}`);
          const fallDepthInput = container.querySelector(`#${CSS.escape(fallDepthId)}`);
          const fallPosSelect = container.querySelector(`#${CSS.escape(fallPosId)}`);

          const setHighlight = () => { S.highlightedHalfEdge = { edgeId: e.id, half: isTail ? 'tail' : 'head' }; F.scheduleDraw(); };
          const clearHighlight = () => { S.highlightedHalfEdge = null; F.scheduleDraw(); };

          if (measureInput) {
            measureInput.addEventListener('focus', setHighlight);
            measureInput.addEventListener('input', setHighlight);
            measureInput.addEventListener('blur', clearHighlight);
            measureInput.addEventListener('input', (ev) => {
              const raw = String(ev.target.value || '');
              const sanitized = raw.replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, '');
              if (sanitized !== raw) ev.target.value = sanitized;
              if (isTail) e.tail_measurement = sanitized; else e.head_measurement = sanitized;
              F.computeNodeTypes();
              F.debouncedSaveToStorage();
              F.scheduleDraw();
            });
          }
          if (materialSelect) {
            materialSelect.addEventListener('focus', setHighlight);
            materialSelect.addEventListener('change', (ev) => {
              setHighlight();
              e.material = ev.target.value;
              F.trackFieldUsage('edges', 'material', ev.target.value);
              F.saveToStorage();
              F.scheduleDraw();
            });
            materialSelect.addEventListener('blur', clearHighlight);
          }
          if (diameterSelect) {
            diameterSelect.addEventListener('focus', setHighlight);
            diameterSelect.addEventListener('change', (ev) => {
              setHighlight();
              e.line_diameter = String(ev.target.value || '');
              if (e.line_diameter !== '') F.trackFieldUsage('edges', 'line_diameter', e.line_diameter);
              F.saveToStorage();
              F.scheduleDraw();
            });
            diameterSelect.addEventListener('blur', clearHighlight);
          }
          if (edgeTypeSelect) {
            edgeTypeSelect.addEventListener('focus', setHighlight);
            edgeTypeSelect.addEventListener('change', (ev) => {
              setHighlight();
              e.edge_type = ev.target.value;
              F.trackFieldUsage('edges', 'edge_type', ev.target.value);
              F.saveToStorage();
              F.scheduleDraw();
            });
            edgeTypeSelect.addEventListener('blur', clearHighlight);
          }
          if (engStatusSelect) {
            engStatusSelect.addEventListener('focus', setHighlight);
            engStatusSelect.addEventListener('change', (ev) => {
              setHighlight();
              const num = Number(ev.target.value);
              e.engineeringStatus = Number.isFinite(num) ? num : 0;
              F.trackFieldUsage('edges', 'engineering_status', e.engineeringStatus);
              F.saveToStorage();
              F.scheduleDraw();
            });
            engStatusSelect.addEventListener('blur', clearHighlight);
          }
          if (fallDepthInput) {
            fallDepthInput.addEventListener('focus', setHighlight);
            fallDepthInput.addEventListener('blur', clearHighlight);
            fallDepthInput.addEventListener('input', (ev) => {
              setHighlight();
              const val = String(ev.target.value || '').replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, '');
              if (val !== ev.target.value) ev.target.value = val;
              if (val === '') { e.fall_depth = ''; }
              else {
                const num = Number(val);
                e.fall_depth = Number.isFinite(num) ? num : val;
              }
              F.debouncedSaveToStorage();
            });
          }
          if (fallPosSelect) {
            fallPosSelect.addEventListener('focus', setHighlight);
            fallPosSelect.addEventListener('change', (ev) => {
              setHighlight();
              const raw = ev.target.value;
              const num = Number(raw);
              e.fall_position = raw === '' || !Number.isFinite(num) ? '' : num;
              if (e.fall_position !== '') F.trackFieldUsage('edges', 'fall_position', e.fall_position);
              F.saveToStorage();
            });
            fallPosSelect.addEventListener('blur', clearHighlight);
          }
        });
      }
    } catch (_) { }
    // ── Element issues for selected node ──
    if (typeof window.__computeSketchIssues === 'function') {
      const { issues } = window.__computeSketchIssues(nodes, edges);
      const nodeIssues = issues.filter(i => String(i.nodeId) === String(node.id));
      if (nodeIssues.length > 0) {
        // Issues display section
        const issuesSection = document.createElement('div');
        issuesSection.className = 'details-section element-issues-section';
        issuesSection.innerHTML = `<div class="details-section-title"><span class="material-icons" style="font-size:16px;color:var(--color-danger,#ef4444);vertical-align:middle">warning</span> ${escapeHtml(t('elementIssues.title'))} (${nodeIssues.length})</div>`;

        for (const issue of nodeIssues) {
          const issueEl = document.createElement('div');
          issueEl.className = 'element-issue-item';
          let issueIcon = 'warning';
          let issueText = '';
          if (issue.type === 'missing_coords') {
            issueIcon = 'location_off';
            issueText = t('elementIssues.missingCoords');
          } else if (issue.type === 'missing_pipe_data' || issue.type === 'missing_measurement') {
            issueIcon = 'rule';
            const sideLabel = issue.side === 'tail' ? t('elementIssues.tail') : t('elementIssues.head');
            issueText = t('elementIssues.missingMeasurementSide', sideLabel);
          } else if (issue.type === 'long_edge') {
            issueIcon = 'straighten';
            issueText = t('elementIssues.longEdge', issue.lengthM || '');
          } else if (issue.type === 'not_last_manhole') {
            issueIcon = 'last_page';
            issueText = t('elementIssues.notLastManhole');
          } else if (issue.type === 'negative_gradient') {
            issueIcon = 'trending_down';
            issueText = t('elementIssues.negativeGradient', issue.gradient || '');
          }
          issueEl.innerHTML = `<span class="material-icons">${issueIcon}</span><span class="element-issue-item__text">${escapeHtml(issueText)}</span>`;
          issueEl.addEventListener('click', () => {
            if (window.__issueHighlight) {
              window.__issueHighlight.start(issue.worldX, issue.worldY, 2000);
            }
          });
          issuesSection.appendChild(issueEl);
        }
        container.appendChild(issuesSection);

        // Fix suggestions section (below issues)
        if (typeof window.__getFixSuggestions === 'function') {
          const fixSection = document.createElement('div');
          fixSection.className = 'details-section fix-suggestions-section';
          fixSection.innerHTML = `<div class="details-section-title"><span class="material-icons" style="font-size:16px;color:var(--color-warning,#eab308);vertical-align:middle">lightbulb</span> ${escapeHtml(t('fixes.title'))}</div>`;

          for (const issue of nodeIssues) {
            const suggestions = window.__getFixSuggestions(issue, nodes, edges);
            for (const fix of suggestions) {
              if (fix.navigateTo) continue; // skip navigation-only fixes in this context
              const btn = document.createElement('button');
              btn.className = 'btn-fix-suggestion';
              btn.innerHTML = `<span class="material-icons">${fix.icon}</span> ${escapeHtml(t(fix.labelKey))}`;
              btn.addEventListener('click', () => {
                const result = fix.apply();
                if (result === false) return; // cancelled or failed
                S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
                F.computeNodeTypes();
                F.updateIncompleteEdgeTracker();
                if (S.selectedNode && !nodes.find(n => n === S.selectedNode)) {
                  S.selectedNode = null;
                  S.selectedEdge = null;
                }
                F.saveToStorage();
                F.scheduleDraw();
                // Refresh nav state and stay on current node
                if (window.__issueNav) {
                  window.__issueNav.refreshIssues(nodes, edges);
                  const nav = window.__issueNav.getNavState();
                  renderDetails();
                  if (nav.total === 0) {
                    if (window.showToast) window.showToast(t('fixes.allResolved'));
                  } else {
                    if (window.showToast) window.showToast(t('fixes.applied'));
                  }
                } else {
                  renderDetails();
                  if (window.showToast) window.showToast(t('fixes.applied'));
                }
              });
              fixSection.appendChild(btn);
            }
          }
          if (fixSection.querySelectorAll('.btn-fix-suggestion').length > 0) {
            container.appendChild(fixSection);
          }
        }

        // ── Issue navigation bar (prev / counter / next) — node panel ──
        if (window.__issueNav) {
          const nav = window.__issueNav.getNavState();
          if (nav.total > 0) {
            const navBar = document.createElement('div');
            navBar.className = 'issue-nav-bar';
            navBar.setAttribute('role', 'navigation');
            navBar.setAttribute('aria-label', t('fixes.title'));
            const counterText = t('fixes.issueCounter', nav.currentIndex + 1, nav.total);
            navBar.innerHTML = `
              <button class="issue-nav-bar__btn issue-nav-bar__prev" title="${escapeHtml(t('fixes.prevIssue'))}" aria-label="${escapeHtml(t('fixes.prevIssue'))}">
                <span class="material-icons" aria-hidden="true">navigate_before</span>
              </button>
              <span class="issue-nav-bar__counter" aria-live="polite">${escapeHtml(counterText)}</span>
              <button class="issue-nav-bar__btn issue-nav-bar__next" title="${escapeHtml(t('fixes.nextIssue'))}" aria-label="${escapeHtml(t('fixes.nextIssue'))}">
                <span class="material-icons" aria-hidden="true">navigate_next</span>
              </button>
            `;
            navBar.querySelector('.issue-nav-bar__prev').addEventListener('click', () => {
              const issue = window.__issueNav.goToPrevIssue();
              if (issue) {
                if (issue.nodeId != null) window.__selectNodeById?.(issue.nodeId);
                else if (issue.edgeId != null) window.__selectEdgeById?.(issue.edgeId);
              }
            });
            navBar.querySelector('.issue-nav-bar__next').addEventListener('click', () => {
              const issue = window.__issueNav.goToNextIssue();
              if (issue) {
                if (issue.nodeId != null) window.__selectNodeById?.(issue.nodeId);
                else if (issue.edgeId != null) window.__selectEdgeById?.(issue.edgeId);
              }
            });
            container.appendChild(navBar);
          }
        }
      }
    }
    // Add delete button at the bottom (after connected lines if present)
    const deleteButtonWrapper = document.createElement('div');
    deleteButtonWrapper.className = 'details-actions';
    deleteButtonWrapper.innerHTML = `<button id="deleteNodeBtn" class="btn-danger-soft" aria-label="${t('labels.deleteNode')}"><span class="material-icons" style="font-size:18px" aria-hidden="true">delete</span> ${t('labels.deleteNode')}</button>`;
    container.appendChild(deleteButtonWrapper);

    // ── Measurement metadata (below delete button, bottom of panel) ──
    if (node.measuredBy) {
      const metaSection = document.createElement('div');
      metaSection.className = 'details-section measurement-metadata';
      let metaHtml = '';
      metaHtml += `<div class="measurement-meta-row"><span class="material-icons">person</span><span>${escapeHtml(t('labels.measuredBy'))}: ${escapeHtml(node.measuredBy)}</span></div>`;
      metaSection.innerHTML = metaHtml;
      container.appendChild(metaSection);
    }

    // Save & Next button
    const saveNextBtn = document.createElement('button');
    saveNextBtn.className = 'save-next-btn';
    saveNextBtn.innerHTML = `<span class="material-icons">skip_next</span> ${escapeHtml(t('labels.saveAndNext'))}`;
    saveNextBtn.addEventListener('click', () => {
      F.saveToStorage();
      const next = F.findNextIncompleteNode(node);
      if (next) {
        S.selectedNode = next;
        S.selectedEdge = null;
        S.__wizardActiveTab = null;
        F.centerOnNode(next);
        renderDetails();
        F.scheduleDraw();
      } else {
        F.showToast(t('toasts.allNodesComplete'));
      }
    });
    container.appendChild(saveNextBtn);

    detailsContainer.appendChild(container);
    // ID rename listener
    const idInput = container.querySelector('#idInput');
    idInput.addEventListener('change', (e) => {
      const raw = e.target.value.trim();
      const oldId = String(node.id);
      if (!raw || raw === oldId) return;
      if (node.nodeType !== 'Home' && node.nodeType !== 'Issue' && !/^\d+$/.test(raw)) {
        F.showToast(t('alerts.nodeIdUnique'), 'error');
        idInput.value = oldId;
        return;
      }
      if (nodes.some((n) => n !== node && String(n.id) === raw)) {
        F.showToast(t('alerts.nodeIdUnique'), 'error');
        idInput.value = oldId;
        return;
      }
      F.renameNodeIdInternal(oldId, raw);
      if (node.nodeType !== 'Home' && node.nodeType !== 'Issue') {
        const used = F.collectUsedNumericIds();
        let nextCandidate = 1;
        while (used.has(nextCandidate)) nextCandidate += 1;
        S.nextNodeId = nextCandidate;
        F.computeNodeTypes();
      }
      F.saveToStorage();
      F.scheduleDraw();
      renderDetails();
    });
    idInput.addEventListener('blur', () => {
      // Commit pending changes on blur
      idInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    idInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        idInput.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof idInput.blur === 'function') idInput.blur();
      }
    });
    // Note input listener (Home nodes have a standalone #noteInput; manhole nodes use wizard)
    const noteInput = container.querySelector('#noteInput');
    if (noteInput) {
      noteInput.addEventListener('input', (e) => {
        node.note = e.target.value;
        F.updateNodeTimestamp(node);
        F.debouncedSaveToStorage();
      });
    }
    // Direct connection toggle (Home only)
    const directToggle = container.querySelector('#directConnectionToggle');
    if (directToggle) {
      directToggle.addEventListener('change', (e) => {
        node.directConnection = !!e.target.checked;
        F.updateNodeTimestamp(node);
        // Keep the same ID regardless of direct connection status
        F.saveToStorage();
        F.scheduleDraw();
        renderDetails();
      });
    }
    // Position lock toggle for manual-coordinate nodes
    const positionLockToggle = container.querySelector('#positionLockToggle');
    if (positionLockToggle) {
      positionLockToggle.addEventListener('change', (e) => {
        node.positionLocked = !!e.target.checked;
        F.updateNodeTimestamp(node);
        F.saveToStorage();
        F.scheduleDraw();
        renderDetails();
      });
    }
    // Maintenance status for Home nodes
    const homeMaintSelect = container.querySelector('#homeMaintenanceStatusSelect');
    if (homeMaintSelect) {
      homeMaintSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        node.maintenanceStatus = Number.isFinite(num) ? num : 0;
        F.trackFieldUsage('nodes', 'maintenance_status', node.maintenanceStatus);
        F.updateNodeTimestamp(node);
        F.saveToStorage();
        F.scheduleDraw();
      });
    }

    // ── Wizard tab click — switch active tab ──────────────────
    const wizardTabsRow = container.querySelector('#wizardTabsRow');
    if (wizardTabsRow) {
      wizardTabsRow.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('[data-wizard-tab]');
        if (!tabBtn) return;
        S.__wizardActiveTab = tabBtn.dataset.wizardTab;
        renderDetails();
      });
    }

    // ── Wizard field changes ───────────────────────────────────

    // accuracy_level
    const accuracyLevelSelect = container.querySelector('#accuracyLevelSelect');
    if (accuracyLevelSelect) {
      accuracyLevelSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        node.accuracyLevel = Number.isFinite(num) ? num : 0;
        F.updateNodeTimestamp(node);
        F.trackFieldUsage('nodes', 'accuracy_level', node.accuracyLevel);
        const norm = normalizeEntityForRules(node);
        const res = evaluateRules(S.currentInputFlowConfig, 'nodes', norm);
        const updatedNode = applyActions(node, res, adminConfig.nodes?.defaults || {});
        Object.assign(node, updatedNode);
        F.saveToStorage();
        F.scheduleDraw();
        // Advance to next visible tab
        const vt = F.wizardGetVisibleTabs(node);
        const idx = vt.indexOf('accuracy_level');
        S.__wizardActiveTab = vt[idx + 1] || vt[0];
        renderDetails();
      });
    }

    // maintenance_status
    const nodeMaintenanceStatusSelect = container.querySelector('#nodeMaintenanceStatusSelect');
    if (nodeMaintenanceStatusSelect) {
      nodeMaintenanceStatusSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        node.maintenanceStatus = Number.isFinite(num) ? num : 0;
        F.updateNodeTimestamp(node);
        F.trackFieldUsage('nodes', 'maintenance_status', node.maintenanceStatus);
        const norm = normalizeEntityForRules(node);
        const res = evaluateRules(S.currentInputFlowConfig, 'nodes', norm);
        const updatedNode = applyActions(node, res, adminConfig.nodes?.defaults || {});
        Object.assign(node, updatedNode);
        F.computeNodeTypes(); // Refresh type1/type2 since maintenance status affects issue indicators
        F.saveToStorage();
        F.scheduleDraw();
        // Advance to next visible tab after maintenance_status
        const vt = F.wizardGetVisibleTabs(node);
        const idx = vt.indexOf('maintenance_status');
        S.__wizardActiveTab = vt[idx + 1] || 'maintenance_status';
        renderDetails();
      });
    }

    // material (manhole wizard)
    const materialSelect = container.querySelector('#materialSelect');
    if (materialSelect) {
      materialSelect.addEventListener('change', (e) => {
        node.material = e.target.value;
        F.updateNodeTimestamp(node);
        F.trackFieldUsage('nodes', 'material', e.target.value);
        F.saveToStorage();
        F.scheduleDraw();
      });
    }

    // cover_diameter (now a select in wizard)
    const coverDiameterSelect = container.querySelector('#coverDiameterSelect');
    if (coverDiameterSelect) {
      coverDiameterSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        node.coverDiameter = val === '\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2' ? '' : val;
        F.updateNodeTimestamp(node);
        if (node.coverDiameter !== '') {
          F.trackFieldUsage('nodes', 'cover_diameter', node.coverDiameter);
        }
        F.saveToStorage();
        F.scheduleDraw();
      });
    }

    // access
    const accessSelect = container.querySelector('#accessSelect');
    if (accessSelect) {
      accessSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        node.access = Number.isFinite(num) ? num : 0;
        F.updateNodeTimestamp(node);
        F.trackFieldUsage('nodes', 'access', node.access);
        F.saveToStorage();
        F.scheduleDraw();
      });
    }

    // Node type selection removed from UI per requirements
    // Delete node button listener — "tap twice" confirmation pattern
    const deleteNodeBtn = container.querySelector('#deleteNodeBtn');
    let _nodeDeleteConfirmTimer = null;
    deleteNodeBtn.addEventListener('click', () => {
      if (deleteNodeBtn.classList.contains('btn-danger-confirm')) {
        // Second tap — perform deletion (skip confirm dialog, already confirmed via UI)
        clearTimeout(_nodeDeleteConfirmTimer);
        F.deleteNodeShared(node, true, true);
      } else {
        // First tap — enter confirm state
        const originalHTML = deleteNodeBtn.innerHTML;
        deleteNodeBtn.innerHTML = `<span class="material-icons" style="font-size:18px">warning</span> ${t('labels.confirmDeleteNode')}`;
        deleteNodeBtn.classList.add('btn-danger-confirm');
        _nodeDeleteConfirmTimer = setTimeout(() => {
          deleteNodeBtn.innerHTML = originalHTML;
          deleteNodeBtn.classList.remove('btn-danger-confirm');
        }, 3000);
      }
    });

    // Mark required fields with visual indicators
    F.markRequiredFields(container, ruleResults.required);

  } else if (selectedEdge) {
    const edge = selectedEdge;
    const tailNode = nodes.find((n) => String(n.id) === String(edge.tail));
    const headNode = nodes.find((n) => String(n.id) === String(edge.head));
    const container = document.createElement('div');

    // Build dropdown options for material with smart sorting
    let materialOptions = '';
    const rawEdgeMaterialOptions = (adminConfig.edges?.options?.material ?? EDGE_MATERIAL_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedEdgeMaterialOptions = F.getSortedOptions('edges', 'material', rawEdgeMaterialOptions);
    sortedEdgeMaterialOptions.forEach((opt) => {
      const m = opt.label || opt;
      materialOptions += `<option value="${escapeHtml(m)}" ${edge.material === m ? 'selected' : ''}>${escapeHtml(getOptionLabel(opt))}</option>`;
    });

    // Compute current material code based on label
    const materialCodeFor = (label) => {
      const list = adminConfig.edges?.options?.material ?? EDGE_MATERIAL_OPTIONS;
      const found = list.find(o => o.label === label);
      if (found) return found.code;
      const idx = (adminConfig.edges?.options?.material ? list.map(o => o.label) : EDGE_MATERIAL_OPTIONS.map(o => o.label)).indexOf(label);
      return idx >= 0 ? idx : 0;
    };

    // Build dropdown options for edge type with smart sorting
    let edgeTypeOptions = '';
    const rawEdgeTypeOptions = (adminConfig.edges?.options?.edge_type ?? EDGE_TYPE_OPTIONS)
      .filter(o => (o.enabled !== false));
    const sortedEdgeTypeOptions = F.getSortedOptions('edges', 'edge_type', rawEdgeTypeOptions);
    sortedEdgeTypeOptions.forEach((opt) => {
      const et = opt.label || opt;
      edgeTypeOptions += `<option value="${escapeHtml(et)}" ${edge.edge_type === et ? 'selected' : ''}>${escapeHtml(getOptionLabel(opt))}</option>`;
    });

    // Engineering status options for edge with smart sorting
    const rawEngineeringOptions = (adminConfig.edges?.options?.engineering_status ?? EDGE_ENGINEERING_STATUS);
    const sortedEngineeringOptions = F.getSortedOptions('edges', 'engineering_status', rawEngineeringOptions);
    const edgeEngineeringOptions = sortedEngineeringOptions
      .map((opt) => `<option value="${escapeHtml(String(opt.code))}" ${Number(edge.engineeringStatus)===Number(opt.code)?'selected':''}>${escapeHtml(getOptionLabel(opt))}</option>`)
      .join('');

    // Normalize line diameter options with smart sorting
    const rawDiameterOptions = (adminConfig.edges?.options?.line_diameter ?? EDGE_LINE_DIAMETERS)
      .filter(o => (o.enabled !== false))
      .map(d => ({ code: d.code ?? d, label: d.label ?? d }));
    const sortedDiameterOptions = F.getSortedOptions('edges', 'line_diameter', rawDiameterOptions);
    const diameterOptions = sortedDiameterOptions;
    const diameterIndexFromCode = (code) => {
      if (code === '' || code == null) return 0; // 0 represents Optional/empty
      const idx = diameterOptions.findIndex((d) => String(d.code) === String(code));
      return idx >= 0 ? (idx + 1) : 0;
    };
    const currentDiameterIndex = diameterIndexFromCode(edge.line_diameter);

    // Fall position options with smart sorting
    const rawFallPositionOptions = (adminConfig.edges?.options?.fall_position || [{code:0,label:t('labels.fallPositionInternal')},{code:1,label:t('labels.fallPositionExternal')}])
      .filter(o => (o.enabled !== false));
    const sortedFallPositionOptions = F.getSortedOptions('edges', 'fall_position', rawFallPositionOptions);
    const fallPositionOptionsHtml = sortedFallPositionOptions
      .map(({code,label}) => `<option value="${escapeHtml(String(code))}" ${Number(edge.fall_position)===Number(code)?'selected':''}>${escapeHtml(label)}</option>`)
      .join('');

    container.innerHTML = `
      <div class="details-section edge-connection-diagram">
        <div class="edge-connection-diagram__flow">
          <div class="edge-connection-diagram__node">
            <span class="material-icons">radio_button_checked</span>
            <span class="edge-connection-diagram__id">${escapeHtml(String(edge.tail))}</span>
            ${tailNode ? `<span class="edge-connection-diagram__type">${escapeHtml(t('nodeTypeLabel.' + (tailNode.nodeType || 'manhole').toLowerCase()) || '')}</span>` : ''}
          </div>
          <div class="edge-connection-diagram__arrow">
            <span class="edge-connection-diagram__line"></span>
            <span class="material-icons">${isRTL(currentLang) ? 'arrow_back' : 'arrow_forward'}</span>
            ${edge.length_m ? `<span class="edge-connection-diagram__length">${Number(edge.length_m).toFixed(1)} ${t('units.meters')}</span>` : ''}
          </div>
          <div class="edge-connection-diagram__node">
            <span class="material-icons">radio_button_checked</span>
            <span class="edge-connection-diagram__id">${escapeHtml(String(edge.head))}</span>
            ${headNode ? `<span class="edge-connection-diagram__type">${escapeHtml(t('nodeTypeLabel.' + (headNode.nodeType || 'manhole').toLowerCase()) || '')}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="details-section">
        <div class="panel-section-header">${t('labels.edgeSectionClassification')}</div>
        <div class="details-grid two-col">
          <div class="field">
            <label for="edgeTypeSelect">${t('labels.edgeType')}</label>
            <select id="edgeTypeSelect">${edgeTypeOptions}</select>
          </div>
          ${adminConfig.edges.include.engineering_status ? `
          <div class="field">
            <label for="edgeEngineeringStatusSelect">${t('labels.engineeringStatus')}</label>
            <select id="edgeEngineeringStatusSelect">${edgeEngineeringOptions}</select>
          </div>` : '<div class="field"></div>'}
        </div>
      </div>

      <div class="details-section">
        <div class="panel-section-header">${t('labels.edgeSectionPhysical')}</div>
        <div class="details-grid two-col">
          <div class="field">
            <label for="edgeMaterialSelect">${t('labels.edgeMaterial')}</label>
            <select id="edgeMaterialSelect">${materialOptions}</select>
          </div>
          ${adminConfig.edges.include.line_diameter ? `
          <div class="field">
            <label for="edgeDiameterSelect">${t('labels.lineDiameter')}</label>
            <select id="edgeDiameterSelect">
              <option value="" ${edge.line_diameter === '' ? 'selected' : ''}>${t('labels.optional')}</option>
              ${diameterOptions.map((d) => { const lbl = String(d.label); const display = /^\d+$/.test(lbl) ? lbl + ' mm' : lbl; return `<option value="${String(d.code)}" ${String(edge.line_diameter) === String(d.code) ? 'selected' : ''}>${display}</option>`; }).join('')}
            </select>
          </div>` : ''}
        </div>
        ${adminConfig.edges.include.line_diameter ? `
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--color-text-secondary,#888);margin-top:6px">
          <span>10 mm</span>
          <div class="diameter-gradient-bar"></div>
          <span>2000 mm</span>
        </div>` : ''}
      </div>

      ${(adminConfig.edges.include.fall_depth || adminConfig.edges.include.fall_position || adminConfig.edges.include.tail_measurement || adminConfig.edges.include.head_measurement) ? `
      <div class="details-section">
        <div class="panel-section-header">${t('labels.edgeSectionMeasurements')}</div>
        <div class="details-grid measurements-single-col">
          ${adminConfig.edges.include.fall_depth ? `
          <div class="field">
            <label for="fallDepthInput">${t('labels.fallDepth')}</label>
            <input id="fallDepthInput" type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" value="${edge.fall_depth || ''}" placeholder="${t('labels.optional')}" dir="auto" />
          </div>` : ''}
          ${adminConfig.edges.include.fall_position ? `
          <div class="field">
            <label for="fallPositionSelect">${t('labels.fallPosition')}</label>
            <select id="fallPositionSelect">
              <option value="" ${edge.fall_position===''?'selected':''}>${t('labels.optional')}</option>
              ${fallPositionOptionsHtml}
            </select>
          </div>` : ''}
          ${adminConfig.edges.include.tail_measurement ? `
          <div class="field">
            <label for="tailInput">${t('labels.tailMeasure')}</label>
            <input id="tailInput" type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" value="${edge.tail_measurement || ''}" placeholder="${t('labels.optional')}" dir="auto" />
          </div>` : ''}
          ${adminConfig.edges.include.head_measurement ? `
          <div class="field">
            <label for="headInput">${t('labels.headMeasure')}</label>
            <input id="headInput" type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" value="${edge.head_measurement || ''}" placeholder="${t('labels.optional')}" dir="auto" />
          </div>` : ''}
        </div>
      </div>` : ''}

      ${(headNode && headNode.note) ? `
      <div class="details-section">
        <div class="field">
          <div class="field-label">${t('labels.targetNote')}</div>
          <div class="muted">${escapeHtml(headNode.note)}</div>
        </div>
      </div>` : ''}

      <div class="details-actions">
        <button id="deleteEdgeBtn" class="btn-danger-soft"><span class="material-icons" style="font-size:18px">delete</span> ${t('labels.deleteEdge')}</button>
      </div>
    `;
    detailsContainer.appendChild(container);

    // ── Element issues + fix suggestions for selected edge ──
    if (typeof window.__computeSketchIssues === 'function') {
      const { issues } = window.__computeSketchIssues(nodes, edges);
      const edgeIssues = issues.filter(i => i.edgeId === edge.id);
      if (edgeIssues.length > 0) {
        const actionsDiv = container.querySelector('.details-actions');

        // Issues display section
        const issuesSection = document.createElement('div');
        issuesSection.className = 'details-section element-issues-section';
        issuesSection.innerHTML = `<div class="details-section-title"><span class="material-icons" style="font-size:16px;color:var(--color-danger,#ef4444);vertical-align:middle">warning</span> ${escapeHtml(t('elementIssues.title'))} (${edgeIssues.length})</div>`;

        for (const issue of edgeIssues) {
          const issueEl = document.createElement('div');
          issueEl.className = 'element-issue-item';
          let issueIcon = 'warning';
          let issueText = '';
          if (issue.type === 'missing_pipe_data' || issue.type === 'missing_measurement') {
            issueIcon = 'rule';
            const sideLabel = issue.side === 'tail' ? t('elementIssues.tail') : t('elementIssues.head');
            issueText = t('elementIssues.missingMeasurementSide', sideLabel);
          } else if (issue.type === 'long_edge') {
            issueIcon = 'straighten';
            issueText = t('elementIssues.longEdge', issue.lengthM || '');
          } else if (issue.type === 'negative_gradient') {
            issueIcon = 'trending_down';
            issueText = t('elementIssues.negativeGradient', issue.gradient || '');
          } else if (issue.type === 'missing_coords') {
            issueIcon = 'location_off';
            issueText = t('elementIssues.missingCoords');
          } else if (issue.type === 'not_last_manhole') {
            issueIcon = 'last_page';
            issueText = t('elementIssues.notLastManhole');
          }
          issueEl.innerHTML = `<span class="material-icons">${issueIcon}</span><span class="element-issue-item__text">${escapeHtml(issueText)}</span>`;
          issueEl.addEventListener('click', () => {
            if (window.__issueHighlight) {
              window.__issueHighlight.start(issue.worldX, issue.worldY, 2000);
            }
          });
          issuesSection.appendChild(issueEl);
        }
        if (actionsDiv) {
          container.insertBefore(issuesSection, actionsDiv);
        } else {
          container.appendChild(issuesSection);
        }

        // Fix suggestions section (below issues)
        if (typeof window.__getFixSuggestions === 'function') {
          const fixSection = document.createElement('div');
          fixSection.className = 'details-section fix-suggestions-section';
          fixSection.innerHTML = `<div class="details-section-title"><span class="material-icons" style="font-size:16px;color:var(--color-warning,#eab308);vertical-align:middle">lightbulb</span> ${escapeHtml(t('fixes.title'))}</div>`;

          for (const issue of edgeIssues) {
            const suggestions = window.__getFixSuggestions(issue, nodes, edges);
            for (const fix of suggestions) {
              if (fix.navigateTo) continue;
              const btn = document.createElement('button');
              btn.className = 'btn-fix-suggestion';
              btn.innerHTML = `<span class="material-icons">${fix.icon}</span> ${escapeHtml(t(fix.labelKey))}`;
              btn.addEventListener('click', () => {
                const result = fix.apply();
                if (result === false) return;
                S._nodeMapDirty = true; S._spatialGridDirty = true; S._dataVersion++;
                F.computeNodeTypes();
                F.updateIncompleteEdgeTracker();
                if (S.selectedEdge && !S.edges.find(e => e === S.selectedEdge)) {
                  S.selectedEdge = null;
                  S.selectedNode = null;
                }
                F.saveToStorage();
                F.scheduleDraw();
                // Refresh nav state and stay on current edge
                if (window.__issueNav) {
                  window.__issueNav.refreshIssues(nodes, edges);
                  const nav = window.__issueNav.getNavState();
                  renderDetails();
                  if (nav.total === 0) {
                    if (window.showToast) window.showToast(t('fixes.allResolved'));
                  } else {
                    if (window.showToast) window.showToast(t('fixes.applied'));
                  }
                } else {
                  renderDetails();
                  if (window.showToast) window.showToast(t('fixes.applied'));
                }
              });
              fixSection.appendChild(btn);
            }
          }
          if (fixSection.querySelectorAll('.btn-fix-suggestion').length > 0) {
            if (actionsDiv) {
              container.insertBefore(fixSection, actionsDiv);
            } else {
              container.appendChild(fixSection);
            }
          }
        }

        // ── Issue navigation bar for edge panel (prev / counter / next) ──
        if (window.__issueNav) {
          const nav = window.__issueNav.getNavState();
          if (nav.total > 0) {
            const navBar = document.createElement('div');
            navBar.className = 'issue-nav-bar';
            navBar.setAttribute('role', 'navigation');
            navBar.setAttribute('aria-label', t('fixes.title'));
            const counterText = t('fixes.issueCounter', nav.currentIndex + 1, nav.total);
            navBar.innerHTML = `
              <button class="issue-nav-bar__btn issue-nav-bar__prev" title="${escapeHtml(t('fixes.prevIssue'))}" aria-label="${escapeHtml(t('fixes.prevIssue'))}">
                <span class="material-icons" aria-hidden="true">navigate_before</span>
              </button>
              <span class="issue-nav-bar__counter" aria-live="polite">${escapeHtml(counterText)}</span>
              <button class="issue-nav-bar__btn issue-nav-bar__next" title="${escapeHtml(t('fixes.nextIssue'))}" aria-label="${escapeHtml(t('fixes.nextIssue'))}">
                <span class="material-icons" aria-hidden="true">navigate_next</span>
              </button>
            `;
            navBar.querySelector('.issue-nav-bar__prev').addEventListener('click', () => {
              const issue = window.__issueNav.goToPrevIssue();
              if (issue) {
                if (issue.nodeId != null) window.__selectNodeById?.(issue.nodeId);
                else if (issue.edgeId != null) window.__selectEdgeById?.(issue.edgeId);
              }
            });
            navBar.querySelector('.issue-nav-bar__next').addEventListener('click', () => {
              const issue = window.__issueNav.goToNextIssue();
              if (issue) {
                if (issue.nodeId != null) window.__selectNodeById?.(issue.nodeId);
                else if (issue.edgeId != null) window.__selectEdgeById?.(issue.edgeId);
              }
            });
            if (actionsDiv) {
              container.insertBefore(navBar, actionsDiv);
            } else {
              container.appendChild(navBar);
            }
          }
        }
      }
    }

    // Attach listeners with field usage tracking
    const edgeTypeSelect = container.querySelector('#edgeTypeSelect');
    const edgeMaterialSelect = container.querySelector('#edgeMaterialSelect');
    const edgeDiameterSelect = container.querySelector('#edgeDiameterSelect');
    const edgeEngineeringStatusSelect = container.querySelector('#edgeEngineeringStatusSelect');
    const fallPositionSelect = container.querySelector('#fallPositionSelect');
    edgeTypeSelect.addEventListener('change', (e) => {
      edge.edge_type = e.target.value;
      F.updateEdgeTimestamp(edge);
      F.trackFieldUsage('edges', 'edge_type', e.target.value);
      F.saveToStorage();
      F.scheduleDraw();
    });
    edgeMaterialSelect.addEventListener('change', (e) => {
      edge.material = e.target.value;
      F.updateEdgeTimestamp(edge);
      F.trackFieldUsage('edges', 'material', e.target.value);
      F.saveToStorage();
      F.scheduleDraw();
    });
    if (edgeDiameterSelect) {
      edgeDiameterSelect.addEventListener('change', (e) => {
        edge.line_diameter = String(e.target.value || '');
        F.updateEdgeTimestamp(edge);
        if (edge.line_diameter !== '') {
          F.trackFieldUsage('edges', 'line_diameter', edge.line_diameter);
        }
        F.saveToStorage();
        F.scheduleDraw();
      });
    }
    if (edgeEngineeringStatusSelect) {
      edgeEngineeringStatusSelect.addEventListener('change', (e) => {
        const num = Number(e.target.value);
        edge.engineeringStatus = Number.isFinite(num) ? num : 0;
        F.updateEdgeTimestamp(edge);
        F.trackFieldUsage('edges', 'engineering_status', edge.engineeringStatus);
        F.saveToStorage();
        F.scheduleDraw();
      });
    }
    if (fallPositionSelect) {
      fallPositionSelect.addEventListener('change', (e) => {
        const raw = e.target.value;
        const num = Number(raw);
        edge.fall_position = raw === '' || !Number.isFinite(num) ? '' : num;
        F.updateEdgeTimestamp(edge);
        if (edge.fall_position !== '') {
          F.trackFieldUsage('edges', 'fall_position', edge.fall_position);
        }
        F.saveToStorage();
      });
    }
    const tailInput = container.querySelector('#tailInput');
    const headInput = container.querySelector('#headInput');
    const fallDepthInput = container.querySelector('#fallDepthInput');
    if (tailInput) {
      tailInput.addEventListener('input', (e) => {
        const raw = String(e.target.value || '');
        // Keep digits and a single dot for decimals
        const sanitized = raw
          .replace(/[^0-9.]/g, '')
          .replace(/\.(?=.*\.)/g, '');
        if (sanitized !== raw) {
          e.target.value = sanitized;
        }
        edge.tail_measurement = sanitized;
        F.updateEdgeTimestamp(edge);
        // Recompute node types because missing measurement may affect connected node type
        F.computeNodeTypes();
        F.debouncedSaveToStorage();
        F.scheduleDraw();
      });
    }
    if (headInput) {
      headInput.addEventListener('input', (e) => {
        const raw = String(e.target.value || '');
        const sanitized = raw
          .replace(/[^0-9.]/g, '')
          .replace(/\.(?=.*\.)/g, '');
        if (sanitized !== raw) {
          e.target.value = sanitized;
        }
        edge.head_measurement = sanitized;
        F.updateEdgeTimestamp(edge);
        F.computeNodeTypes();
        F.debouncedSaveToStorage();
        F.scheduleDraw();
      });
    }
    if (fallDepthInput) {
      fallDepthInput.addEventListener('input', (e) => {
        // Store the value, allowing partial decimals like "3." while typing
        const val = e.target.value;

        // Allow empty string
        if (val === '') {
          edge.fall_depth = '';
        }
        // Allow partial decimal numbers (e.g., "3." or "0.")
        else if (val.endsWith('.') && !isNaN(parseFloat(val))) {
          edge.fall_depth = val;
        }
        // Convert complete numbers to number type
        else {
          const num = Number(val);
          edge.fall_depth = Number.isFinite(num) ? num : val;
        }

        F.updateEdgeTimestamp(edge);
        F.debouncedSaveToStorage();
        F.scheduleDraw();
      });
    }
    // Delete edge button — "tap twice" confirmation pattern
    const deleteEdgeBtn = container.querySelector('#deleteEdgeBtn');
    let _edgeDeleteConfirmTimer = null;
    deleteEdgeBtn.addEventListener('click', () => {
      if (deleteEdgeBtn.classList.contains('btn-danger-confirm')) {
        // Second tap — perform deletion (skip confirm dialog, already confirmed via UI)
        clearTimeout(_edgeDeleteConfirmTimer);
        F.deleteEdgeShared(edge, true, true);
      } else {
        // First tap — enter confirm state
        const originalHTML = deleteEdgeBtn.innerHTML;
        deleteEdgeBtn.innerHTML = `<span class="material-icons" style="font-size:18px">warning</span> ${t('labels.confirmDeleteEdge')}`;
        deleteEdgeBtn.classList.add('btn-danger-confirm');
        _edgeDeleteConfirmTimer = setTimeout(() => {
          deleteEdgeBtn.innerHTML = originalHTML;
          deleteEdgeBtn.classList.remove('btn-danger-confirm');
        }, 3000);
      }
    });

  } else {
    detailsContainer.textContent = t('detailsDefault');
  }
  // Toggle drawer visibility on tablet/mobile
  try {
    const shouldOpen = !!(selectedNode || selectedEdge);
    const wasOpen = sidebarEl && sidebarEl.classList && sidebarEl.classList.contains('open');
    if (sidebarEl && sidebarEl.classList) {
      if (shouldOpen) {
        // Save pre-sidebar focus before opening (only on fresh open)
        if (!wasOpen) {
          _preSidebarFocusEl = document.activeElement;
        }
        sidebarEl.classList.add('open');
        // Move focus into the sidebar for screen-reader users
        requestAnimationFrame(() => {
          const firstInput = detailsContainer.querySelector('input, select, textarea, button');
          if (firstInput) firstInput.focus({ preventScroll: true });
          else if (sidebarTitleEl) sidebarTitleEl.focus({ preventScroll: true });
        });
      }
      else sidebarEl.classList.remove('open');
    }
    // Mark body for CSS offset of canvas toolbar
    if (document && document.body && document.body.classList) {
      if (shouldOpen) document.body.classList.add('drawer-open');
      else document.body.classList.remove('drawer-open');
    }
    // Eagerly set --drawer-height so FAB and other controls reposition immediately
    // (the MutationObserver in resizable-drawer fires with a 50ms delay)
    if (shouldOpen && sidebarEl) {
      requestAnimationFrame(() => {
        const h = sidebarEl.offsetHeight;
        if (h > 0) document.documentElement.style.setProperty('--drawer-height', `${h}px`);
      });
    }
  } catch (_) { }
  // In mobile layout, the sidebar height affects the canvasContainer height.
  // Ensure the canvas backing store matches the new display size.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => F.resizeCanvas());
  } else {
    setTimeout(() => F.resizeCanvas(), 0);
  }
}

// Track the element that had focus before the sidebar opened so we can
// restore it when the panel closes (a11y focus-management best practice).
let _preSidebarFocusEl = null;

// Close button for drawer
function closeSidebarPanel() {
  const sidebarEl = S.sidebarEl;
  if (sidebarEl && sidebarEl.classList) sidebarEl.classList.remove('open');
  if (document && document.body && document.body.classList) document.body.classList.remove('drawer-open');
  S.selectedNode = null;
  S.selectedEdge = null;
  renderDetails();
  F.scheduleDraw();
  // Restore focus to the element that was focused before the sidebar opened
  if (_preSidebarFocusEl && typeof _preSidebarFocusEl.focus === 'function') {
    try { _preSidebarFocusEl.focus(); } catch (_) {}
    _preSidebarFocusEl = null;
  }
}

/**
 * Wire up sidebar close-button, visibility-change and backdrop-tap listeners.
 * Called once from main.js init().
 */
function initDetailsPanel() {
  const sidebarCloseBtn = S.sidebarCloseBtn;
  const sidebarEl = S.sidebarEl;
  const canvas = S.canvas;

  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', closeSidebarPanel);
    // Explicit touchend handler — on some Android WebViews the click event
    // fires unreliably on small touch targets, so we handle touchend directly.
    sidebarCloseBtn.addEventListener('touchend', (e) => {
      e.preventDefault();  // prevent ghost click
      e.stopPropagation();
      closeSidebarPanel();
    }, { passive: false });
  }

  // Close panel when app comes back from background (Android multitasking)
  // so user returns to the canvas view, not a stale form
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sidebarEl && sidebarEl.classList.contains('open')) {
      closeSidebarPanel();
    }
  });

  // Backdrop tap: tapping canvas while sidebar is open closes the panel,
  // but ONLY when no drawing mode is actively placing nodes/edges.
  canvas.addEventListener('touchstart', (e) => {
    if (sidebarEl && sidebarEl.classList.contains('open')) {
      // Only close on backdrop tap when in select/pan mode (not placing nodes/edges)
      const currentMode = S.currentMode;
      const isDrawing = (currentMode === 'node' || currentMode === 'home' || currentMode === 'drainage' || currentMode === 'edge');
      if (!isDrawing) {
        closeSidebarPanel();
        // Don't prevent default — allow the touch to also pan the canvas
      }
    }
  }, { passive: true });
}

/**
 * If the provided Home node is connected to a Manhole, assign an id derived from the manhole id.
 * Format: `${manholeId}-${k}` where k is the next available positive integer suffix.
 */
function assignHomeIdFromConnectedManhole(homeNode) {
  if (!homeNode || homeNode.nodeType !== 'Home') return;
  // For direct connection, use the normal numeric id assignment
  const newId = F.findSmallestAvailableNumericId();
  if (String(homeNode.id) !== String(newId)) {
    F.renameNodeIdInternal(String(homeNode.id), String(newId));
  }
}

export {
  renderDetails,
  closeSidebarPanel,
  initDetailsPanel,
  assignHomeIdFromConnectedManhole,
  _fetchOrgMembers,
  _attachMentionAutocomplete,
  _extractMentionedUserIds,
  _loadIssueComments,
  _sendIssueComment,
};
