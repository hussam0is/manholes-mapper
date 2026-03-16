/**
 * Unified Sidebar — tabbed panel replacing cockpit, layers, sketches, and details panels.
 *
 * Tabs: Details | Status | Layers | Sketches (project mode only)
 * Desktop: docked right, 320px, collapsible
 * Mobile: bottom sheet, 55vh max
 */

import './unified-sidebar.css';

let sidebarEl = null;
let toggleBtn = null;
let activeTab = 'details';
let isOpen = false;

const TAB_CONFIG = [
  { id: 'details', icon: 'edit_note', labelKey: 'sidebar.details' },
  { id: 'status', icon: 'monitor_heart', labelKey: 'sidebar.status' },
  { id: 'layers', icon: 'layers', labelKey: 'sidebar.layers' },
  { id: 'sketches', icon: 'description', labelKey: 'sidebar.sketches' },
];

/**
 * Build the sidebar DOM and inject it after #canvasContainer
 */
export function initUnifiedSidebar() {
  const main = document.getElementById('main');
  if (!main || document.getElementById('unifiedSidebar')) return;

  const t = window.t || ((k) => {
    const labels = {
      'sidebar.details': document.documentElement.lang === 'he' ? 'פרטים' : 'Details',
      'sidebar.status': document.documentElement.lang === 'he' ? 'סטטוס' : 'Status',
      'sidebar.layers': document.documentElement.lang === 'he' ? 'שכבות' : 'Layers',
      'sidebar.sketches': document.documentElement.lang === 'he' ? 'שרטוטים' : 'Sketches',
    };
    return labels[k] || k;
  });

  // Build sidebar
  sidebarEl = document.createElement('aside');
  sidebarEl.id = 'unifiedSidebar';
  sidebarEl.className = 'unified-sidebar collapsed';
  sidebarEl.setAttribute('role', 'complementary');
  sidebarEl.setAttribute('aria-label', 'Sidebar');

  const isRTL = document.documentElement.dir === 'rtl';
  const collapseIcon = isRTL ? 'chevron_left' : 'chevron_right';

  sidebarEl.innerHTML = `
    <button class="unified-sidebar__collapse-btn" id="unifiedSidebarCollapseBtn" aria-label="Toggle sidebar">
      <span class="material-icons">${collapseIcon}</span>
    </button>
    <div class="unified-sidebar__sheet-handle"></div>
    <div class="unified-sidebar__tabs" role="tablist">
      ${TAB_CONFIG.map(tab => `
        <button class="unified-sidebar__tab${tab.id === activeTab ? ' active' : ''}"
                data-tab="${tab.id}"
                role="tab"
                aria-selected="${tab.id === activeTab}"
                aria-controls="us-panel-${tab.id}">
          <span class="material-icons">${tab.icon}</span>
          <span class="unified-sidebar__tab-label">${t(tab.labelKey)}</span>
        </button>
      `).join('')}
    </div>
    <div class="unified-sidebar__panels">
      <div id="us-panel-details" class="unified-sidebar__panel unified-sidebar__panel--details${activeTab === 'details' ? ' active' : ''}" role="tabpanel"></div>
      <div id="us-panel-status" class="unified-sidebar__panel unified-sidebar__panel--status${activeTab === 'status' ? ' active' : ''}" role="tabpanel"></div>
      <div id="us-panel-layers" class="unified-sidebar__panel unified-sidebar__panel--layers${activeTab === 'layers' ? ' active' : ''}" role="tabpanel"></div>
      <div id="us-panel-sketches" class="unified-sidebar__panel unified-sidebar__panel--sketches${activeTab === 'sketches' ? ' active' : ''}" role="tabpanel"></div>
    </div>
  `;

  main.appendChild(sidebarEl);

  // Create floating toggle button
  toggleBtn = document.createElement('button');
  toggleBtn.className = 'unified-sidebar-toggle';
  toggleBtn.setAttribute('aria-label', 'Open sidebar');
  toggleBtn.innerHTML = '<span class="material-icons">menu_open</span>';
  main.appendChild(toggleBtn);

  // ── Reparent original sidebar content into Details tab ──
  reparentDetailsContent();

  // ── Build Status tab content ──
  buildStatusTab();

  // ── Build Layers tab content ──
  buildLayersTab();

  // ── Wire events ──
  wireTabSwitching();
  wireCollapse();
  wireLegacySidebarBridge();

  // ── Sketches tab visibility (only in project-canvas mode) ──
  updateSketchesTabVisibility();
}

/**
 * Move existing #sidebar (#detailsContainer) content into the Details tab
 */
function reparentDetailsContent() {
  const detailsPanel = document.getElementById('us-panel-details');
  const oldSidebar = document.getElementById('sidebar');
  if (!detailsPanel || !oldSidebar) return;

  // Move all children of #sidebar into our details panel
  while (oldSidebar.firstChild) {
    detailsPanel.appendChild(oldSidebar.firstChild);
  }

  // Hide the old sidebar shell
  oldSidebar.style.display = 'none';
}

/**
 * Build Status tab with GPS, Health, Sync, Session cards
 */
function buildStatusTab() {
  const panel = document.getElementById('us-panel-status');
  if (!panel) return;

  const t = window.t || ((k) => k);

  panel.innerHTML = `
    <div class="us-status-card" id="usGpsCard">
      <div class="us-status-card__header">
        <span class="material-icons">satellite_alt</span>
        <span>GPS</span>
      </div>
      <div class="us-gps-row">
        <span class="us-gps-dot" id="usGpsDot"></span>
        <span id="usGpsLabel">--</span>
      </div>
      <div id="usGpsAccuracy" style="font-size:12px;color:var(--color-text-muted,#64748b);margin-top:4px">--</div>
    </div>

    <div class="us-status-card" id="usHealthCard">
      <div class="us-status-card__header">
        <span class="material-icons">assessment</span>
        <span>${t('cockpit.health') || 'Health'}</span>
      </div>
      <div class="us-health-ring">
        <svg viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-border,#e2e8f0)" stroke-width="3"></circle>
          <circle id="usCompletionFill" cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-accent,#2563eb)" stroke-width="3"
            stroke-dasharray="97.4" stroke-dashoffset="97.4" stroke-linecap="round" transform="rotate(-90 18 18)"></circle>
        </svg>
        <div>
          <div class="us-health-ring__text" id="usCompletionText">0%</div>
          <div class="us-health-stats" id="usHealthStats">--</div>
        </div>
      </div>
      <div id="usHealthIssues" style="display:none;margin-top:6px;font-size:12px;color:#f59e0b">
        <span class="material-icons" style="font-size:14px;vertical-align:middle">warning_amber</span>
        <span id="usIssueCount">0</span>
      </div>
    </div>

    <div class="us-status-card" id="usSyncCard">
      <div class="us-status-card__header">
        <span class="material-icons">cloud</span>
        <span>Sync</span>
      </div>
      <div class="us-sync-row synced" id="usSyncRow">
        <span class="material-icons" id="usSyncIcon">cloud_done</span>
        <span id="usSyncLabel">${t('cockpit.synced') || 'Synced'}</span>
      </div>
    </div>

    <div class="us-status-card" id="usSessionCard">
      <div class="us-status-card__header">
        <span class="material-icons">timer</span>
        <span>${t('cockpit.session') || 'Session'}</span>
      </div>
      <div class="us-session-grid">
        <div class="us-session-stat">
          <div class="us-session-stat__value" id="usSessionDuration">0:00</div>
          <div class="us-session-stat__label">${t('cockpit.duration') || 'Duration'}</div>
        </div>
        <div class="us-session-stat">
          <div class="us-session-stat__value" id="usSessionNodes">0</div>
          <div class="us-session-stat__label">${t('cockpit.nodesPlaced') || 'Nodes'}</div>
        </div>
        <div class="us-session-stat">
          <div class="us-session-stat__value" id="usSessionEdges">0</div>
          <div class="us-session-stat__label">${t('cockpit.edgesDrawn') || 'Edges'}</div>
        </div>
        <div class="us-session-stat">
          <div class="us-session-stat__value" id="usSessionStreak">-</div>
          <div class="us-session-stat__label">${t('cockpit.streak') || 'Streak'}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Build Layers tab — mirrors layers-config panel content
 */
function buildLayersTab() {
  const panel = document.getElementById('us-panel-layers');
  if (!panel) return;

  const t = window.t || ((k) => k);

  panel.innerHTML = `
    <div class="us-layer-section">
      <div class="us-layer-section__title">${t('menuGroup.map') || 'Map'}</div>
      <label class="us-layer-toggle">
        <input type="checkbox" id="usMapToggle" />
        <span class="material-icons">map</span>
        <span>${t('mapLayer.enable') || 'Map Layer'}</span>
      </label>
      <label class="us-layer-toggle">
        <span class="material-icons">terrain</span>
        <span>${t('map.type') || 'Map Type'}:</span>
        <select id="usMapType" style="margin-inline-start:auto;border:1px solid var(--color-border,#e2e8f0);border-radius:6px;padding:4px 8px;font-size:12px;background:var(--color-surface,#fff)">
          <option value="orthophoto">${t('map.orthophoto') || 'Satellite'}</option>
          <option value="street">${t('map.street') || 'Streets'}</option>
        </select>
      </label>
    </div>
    <div class="us-layer-section" id="usRefLayersSection" style="display:none">
      <div class="us-layer-section__title">${t('refLayers.enable') || 'Reference Layers'}</div>
      <label class="us-layer-toggle">
        <input type="checkbox" id="usRefLayersToggle" checked />
        <span class="material-icons">layers</span>
        <span>${t('refLayers.enable') || 'Reference Layers'}</span>
      </label>
      <div id="usRefLayersList"></div>
    </div>
  `;

  // Sync with original map layer toggle
  syncLayerControls();
}

/**
 * Sync our layer controls with the original toggles
 */
function syncLayerControls() {
  const usMapToggle = document.getElementById('usMapToggle');
  const origMapToggle = document.getElementById('mapLayerToggle');
  const usMapType = document.getElementById('usMapType');
  const origMapType = document.getElementById('mapTypeSelect');

  if (usMapToggle && origMapToggle) {
    usMapToggle.checked = origMapToggle.checked;
    usMapToggle.addEventListener('change', () => {
      origMapToggle.checked = usMapToggle.checked;
      origMapToggle.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Watch original for changes from other UI
    const obs = new MutationObserver(() => {
      usMapToggle.checked = origMapToggle.checked;
    });
    obs.observe(origMapToggle, { attributes: true, attributeFilter: ['checked'] });
    // Also listen for change events
    origMapToggle.addEventListener('change', () => {
      usMapToggle.checked = origMapToggle.checked;
    });
  }

  if (usMapType && origMapType) {
    usMapType.value = origMapType.value;
    usMapType.addEventListener('change', () => {
      origMapType.value = usMapType.value;
      origMapType.dispatchEvent(new Event('change', { bubbles: true }));
    });
    origMapType.addEventListener('change', () => {
      usMapType.value = origMapType.value;
    });
  }

  // Watch for reference layers appearing
  const refToggle = document.getElementById('refLayersToggle');
  const usRefToggle = document.getElementById('usRefLayersToggle');
  if (refToggle && usRefToggle) {
    usRefToggle.checked = refToggle.checked;
    usRefToggle.addEventListener('change', () => {
      refToggle.checked = usRefToggle.checked;
      refToggle.dispatchEvent(new Event('change', { bubbles: true }));
    });
    refToggle.addEventListener('change', () => {
      usRefToggle.checked = refToggle.checked;
    });
  }

  // Watch ref layers section visibility via MutationObserver instead of polling
  const origSection = document.getElementById('refLayersSection');
  const usSection = document.getElementById('usRefLayersSection');
  const syncRefLayerVisibility = () => {
    if (origSection && usSection) {
      usSection.style.display = origSection.style.display !== 'none' ? '' : 'none';
    }
  };
  if (origSection) {
    const refObs = new MutationObserver(syncRefLayerVisibility);
    refObs.observe(origSection, { attributes: true, attributeFilter: ['style'] });
  }
  syncRefLayerVisibility();
}

/**
 * Wire tab switching
 */
function wireTabSwitching() {
  const tabBar = sidebarEl.querySelector('.unified-sidebar__tabs');
  if (!tabBar) return;

  tabBar.addEventListener('click', (e) => {
    const tab = e.target.closest('.unified-sidebar__tab');
    if (!tab) return;
    switchTab(tab.dataset.tab);
  });
}

/**
 * Switch to a specific tab
 */
export function switchTab(tabId) {
  if (!sidebarEl) return;
  activeTab = tabId;

  // Update tab buttons
  sidebarEl.querySelectorAll('.unified-sidebar__tab').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  // Update panels
  sidebarEl.querySelectorAll('.unified-sidebar__panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `us-panel-${tabId}`);
  });

  // Ensure sidebar is open when switching tabs
  if (!isOpen) {
    openSidebar();
  }
}

/**
 * Wire collapse button + floating toggle
 */
function wireCollapse() {
  const collapseBtn = document.getElementById('unifiedSidebarCollapseBtn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      if (isOpen) closeSidebar();
      else openSidebar();
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      openSidebar();
    });
  }
}

/**
 * Bridge: when legacy code opens #sidebar, switch to Details tab
 */
function wireLegacySidebarBridge() {
  const oldSidebar = document.getElementById('sidebar');
  if (!oldSidebar) return;

  // Watch for the legacy 'open' class being added
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'class') {
        if (oldSidebar.classList.contains('open')) {
          oldSidebar.classList.remove('open');
          switchTab('details');
          openSidebar();
        }
      }
    }
  });
  observer.observe(oldSidebar, { attributes: true, attributeFilter: ['class'] });

  // Intercept direct calls to open/close sidebar, chaining the originals
  const origOpenFn = window.openSidebar;
  const origCloseFn = window.closeSidebar;
  window.openSidebar = function (...args) {
    switchTab('details');
    openSidebar();
    // Chain original so legacy listeners still fire
    if (typeof origOpenFn === 'function') origOpenFn.apply(this, args);
  };
  window.closeSidebar = function (...args) {
    closeSidebar();
    if (typeof origCloseFn === 'function') origCloseFn.apply(this, args);
  };
}

export function openSidebar() {
  if (!sidebarEl) return;
  isOpen = true;
  sidebarEl.classList.remove('collapsed');
  document.body.classList.add('sidebar-open');
  if (toggleBtn) toggleBtn.style.opacity = '0';
}

export function closeSidebar() {
  if (!sidebarEl) return;
  isOpen = false;
  sidebarEl.classList.add('collapsed');
  document.body.classList.remove('sidebar-open');
  if (toggleBtn) toggleBtn.style.opacity = '1';
}

export function toggleSidebar() {
  if (isOpen) closeSidebar();
  else openSidebar();
}

/**
 * Show/hide Sketches tab based on project-canvas mode
 */
function updateSketchesTabVisibility() {
  const sketchesTab = sidebarEl?.querySelector('[data-tab="sketches"]');
  if (!sketchesTab) return;

  const check = () => {
    const inProjectMode = window.__projectCanvas?.isProjectCanvasMode?.();
    sketchesTab.style.display = inProjectMode ? '' : 'none';
    // Also reparent sketch side panel content
    if (inProjectMode) {
      reparentSketchPanel();
    }
  };

  // Listen for project canvas events instead of polling
  if (window.menuEvents) {
    window.menuEvents.on('projectCanvas:enter', check);
    window.menuEvents.on('projectCanvas:exit', check);
  }
  // Initial check
  check();
}

/**
 * Reparent sketch side panel content into Sketches tab
 */
function reparentSketchPanel() {
  const panel = document.getElementById('us-panel-sketches');
  const origPanel = document.getElementById('sketchSidePanel');
  if (!panel || !origPanel || panel.dataset.reparented) return;

  // Clone the content from the original panel
  panel.dataset.reparented = '1';

  // Move children
  while (origPanel.firstChild) {
    panel.appendChild(origPanel.firstChild);
  }
  origPanel.style.display = 'none';
}

/**
 * Tear down the unified sidebar and restore original sidebar
 */
export function destroyUnifiedSidebar() {
  // Restore original window functions if saved
  if (sidebarEl) {
    // Move details content back to original sidebar
    const detailsPanel = document.getElementById('us-panel-details');
    const oldSidebar = document.getElementById('sidebar');
    if (detailsPanel && oldSidebar) {
      while (detailsPanel.firstChild) {
        oldSidebar.appendChild(detailsPanel.firstChild);
      }
      oldSidebar.style.display = '';
    }
    sidebarEl.remove();
  }
  toggleBtn?.remove();
  sidebarEl = null;
  toggleBtn = null;
  isOpen = false;
  activeTab = 'details';
  document.body.classList.remove('sidebar-open');
}

/**
 * Get current sidebar state
 */
export function getSidebarState() {
  return { isOpen, activeTab };
}
