/**
 * FC Panel Manager — Contextual sliding panels
 *
 * Three panel slots:
 *   - right: node/edge properties (reparents existing #sidebar)
 *   - left: intel dashboard (GPS, health, sync, session)
 *   - bottom: tools, export, settings grid
 */

import { computeSketchCompletion } from '../cockpit/completion-engine.js';

class FCPanelManager {
  constructor() {
    /** @type {Map<string, HTMLElement>} */
    this.panels = new Map();
    this.scrim = null;
  }

  register(name, el) {
    this.panels.set(name, el);
  }

  open(name) {
    const panel = this.panels.get(name);
    if (!panel) return;

    // Close other panels first
    for (const [n, p] of this.panels) {
      if (n !== name) p.classList.remove('fc-panel--open');
    }

    panel.classList.add('fc-panel--open');
    panel.setAttribute('aria-hidden', 'false');
    this.showScrim();
    navigator.vibrate?.([10]);
  }

  close(name) {
    const panel = this.panels.get(name);
    if (!panel) return;
    panel.classList.remove('fc-panel--open');
    panel.setAttribute('aria-hidden', 'true');
    this.hideScrimIfNoneOpen();
  }

  closeAll() {
    for (const p of this.panels.values()) {
      p.classList.remove('fc-panel--open');
      p.setAttribute('aria-hidden', 'true');
    }
    this.hideScrim();
  }

  toggle(name) {
    const panel = this.panels.get(name);
    if (!panel) return;
    if (panel.classList.contains('fc-panel--open')) {
      this.close(name);
    } else {
      this.open(name);
    }
  }

  isOpen(name) {
    return this.panels.get(name)?.classList.contains('fc-panel--open') ?? false;
  }

  showScrim() {
    this.scrim?.classList.add('fc-scrim--visible');
  }

  hideScrim() {
    this.scrim?.classList.remove('fc-scrim--visible');
  }

  hideScrimIfNoneOpen() {
    const anyOpen = [...this.panels.values()].some(p => p.classList.contains('fc-panel--open'));
    if (!anyOpen) this.hideScrim();
  }
}

export const fcPanels = new FCPanelManager();

// ── Sidebar observer ───────────────────────────────────────────
let sidebarObserver = null;

/**
 * Initialize all three panels
 */
export function initFCPanels() {
  buildScrim();
  buildRightPanel();
  buildLeftPanel();
  buildBottomPanel();

  // Keyboard: Escape closes panels
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fcPanels.closeAll();
  });
}

// ── Scrim ──────────────────────────────────────────────────────

function buildScrim() {
  const scrim = document.createElement('div');
  scrim.className = 'fc-scrim';
  scrim.id = 'fcScrim';
  document.body.appendChild(scrim);
  fcPanels.scrim = scrim;

  scrim.addEventListener('click', () => fcPanels.closeAll());
  // Prevent touch passthrough
  scrim.addEventListener('touchmove', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
}

// ── Right Panel (Properties) ───────────────────────────────────

function buildRightPanel() {
  const t = window.t || (k => k);
  const panel = document.createElement('div');
  panel.className = 'fc-panel fc-panel--right';
  panel.id = 'fcPanelRight';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="fc-panel__header">
      <span class="fc-panel__title">${esc(t('fc.properties'))}</span>
      <button class="fc-panel__close" aria-label="${esc(t('fc.close'))}" type="button">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="fc-panel__body" id="fcPanelRightBody"></div>
  `;

  document.body.appendChild(panel);
  fcPanels.register('right', panel);

  panel.querySelector('.fc-panel__close')?.addEventListener('click', () => fcPanels.close('right'));

  // Reparent existing sidebar content into this panel
  reparentSidebar();
}

function reparentSidebar() {
  const sidebar = document.getElementById('sidebar');
  const rightBody = document.getElementById('fcPanelRightBody');
  if (!sidebar || !rightBody) return;

  // Move sidebar into the FC panel
  rightBody.appendChild(sidebar);
  sidebar.style.display = 'flex';
  sidebar.style.width = '100%';
  sidebar.style.border = 'none';
  sidebar.style.position = 'static';
  sidebar.style.maxHeight = 'none';
  sidebar.classList.remove('drawer');

  // Watch for sidebar .open class toggled by main.js
  sidebarObserver = new MutationObserver(() => {
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
      fcPanels.open('right');
    } else {
      fcPanels.close('right');
    }
  });
  sidebarObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
}

// ── Left Panel (Intel Dashboard) ───────────────────────────────

function buildLeftPanel() {
  const t = window.t || (k => k);
  const panel = document.createElement('div');
  panel.className = 'fc-panel fc-panel--left';
  panel.id = 'fcPanelLeft';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="fc-panel__header">
      <span class="fc-panel__title">${esc(t('fc.status'))}</span>
      <button class="fc-panel__close" aria-label="${esc(t('fc.close'))}" type="button">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="fc-panel__body" id="fcPanelLeftBody">
      <div class="fc-intel-card" id="fcIntelGps">
        <div class="fc-intel-card__title">${esc(t('fc.gpsStatus'))}</div>
        <div class="fc-intel-card__value" id="fcIntelGpsValue">--</div>
        <div class="fc-intel-card__sub" id="fcIntelGpsSub"></div>
      </div>
      <div class="fc-intel-card" id="fcIntelHealth">
        <div class="fc-intel-card__title">${esc(t('fc.completion'))}</div>
        <div class="fc-intel-card__value" id="fcIntelHealthValue">0%</div>
        <div class="fc-intel-card__sub" id="fcIntelHealthSub"></div>
      </div>
      <div class="fc-intel-card" id="fcIntelSession">
        <div class="fc-intel-card__title">${esc(t('fc.session'))}</div>
        <div class="fc-intel-row">
          <span class="material-icons">timer</span>
          <span id="fcIntelSessionDuration">0:00</span>
        </div>
        <div class="fc-intel-row">
          <span class="material-icons">radio_button_unchecked</span>
          <span id="fcIntelSessionNodes">+0</span>
          <span style="margin-inline-start:8px" class="material-icons">timeline</span>
          <span id="fcIntelSessionEdges">+0</span>
        </div>
        <div class="fc-intel-row" id="fcIntelStreak" style="display:none">
          <span class="material-icons" style="color:#f59e0b">local_fire_department</span>
          <span id="fcIntelStreakCount">0</span>
          <span>${esc(t('fc.days'))}</span>
        </div>
      </div>
      <div class="fc-intel-card" id="fcIntelSync">
        <div class="fc-intel-card__title">${esc(t('fc.syncStatus'))}</div>
        <div class="fc-intel-row">
          <span class="material-icons" id="fcIntelSyncIcon">cloud_done</span>
          <span id="fcIntelSyncLabel">${esc(t('fc.synced'))}</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  fcPanels.register('left', panel);

  panel.querySelector('.fc-panel__close')?.addEventListener('click', () => fcPanels.close('left'));

  // Wire GNSS updates to left panel
  wireLeftPanelGPS();

  // Wire sync status to left panel
  wireLeftPanelSync();

  // Start session timer for left panel
  startLeftPanelSessionTimer();

  // Periodic completion update
  setInterval(updateLeftPanelCompletion, 2000);
  updateLeftPanelCompletion();
}

function wireLeftPanelGPS() {
  const gnssState = window.__gnssState;
  if (!gnssState) return;

  const FIX_LABELS = {
    4: 'RTK Fixed',
    5: 'RTK Float',
    2: 'DGPS',
    1: 'GPS',
    0: 'No Fix'
  };

  const update = () => {
    const pos = gnssState.position;
    const valEl = document.getElementById('fcIntelGpsValue');
    const subEl = document.getElementById('fcIntelGpsSub');
    if (!valEl) return;

    if (!pos?.isValid) {
      valEl.textContent = window.t?.('cockpit.noFix') || 'No Fix';
      if (subEl) subEl.textContent = '';
      return;
    }

    const t = window.t || (k => k);
    const fixLabel = {
      4: t('gnssMarker.fixRtkFixed') || FIX_LABELS[4],
      5: t('gnssMarker.fixRtkFloat') || FIX_LABELS[5],
      2: t('gnssMarker.fixDgps') || FIX_LABELS[2],
      1: t('gnssMarker.fixGps') || FIX_LABELS[1],
      0: t('gnssMarker.noFix') || FIX_LABELS[0]
    };

    valEl.textContent = fixLabel[pos.fixQuality] || FIX_LABELS[0];

    if (subEl) {
      const parts = [];
      if (pos.hdop != null) {
        parts.push(pos.hdop < 1 ? `${(pos.hdop * 100).toFixed(0)}cm` : `${pos.hdop.toFixed(1)}m`);
      }
      if (pos.satellites) parts.push(`${pos.satellites} sats`);
      subEl.textContent = parts.join(' | ');
    }
  };

  gnssState.on('position', update);
  gnssState.on('connection', update);
}

function wireLeftPanelSync() {
  if (!window.menuEvents) return;
  const t = window.t || (k => k);
  window.menuEvents.on('sync:stateChange', (state) => {
    const icon = document.getElementById('fcIntelSyncIcon');
    const label = document.getElementById('fcIntelSyncLabel');
    if (!icon || !label) return;

    if (state?.isSyncing) {
      icon.textContent = 'sync';
      label.textContent = t('fc.syncing');
    } else if (state?.isOnline === false) {
      icon.textContent = 'cloud_off';
      label.textContent = t('fc.offline');
    } else if (state?.error) {
      icon.textContent = 'error_outline';
      label.textContent = t('fc.syncError');
    } else {
      icon.textContent = 'cloud_done';
      label.textContent = t('fc.synced');
    }
  });
}

let sessionStart = Date.now();
let nodesAtStart = 0;
let edgesAtStart = 0;

function startLeftPanelSessionTimer() {
  try {
    const data = window.__getActiveSketchData?.();
    if (data) {
      nodesAtStart = data.nodes?.length || 0;
      edgesAtStart = data.edges?.length || 0;
    }
  } catch { /* ignore */ }

  setInterval(() => {
    const dEl = document.getElementById('fcIntelSessionDuration');
    const nEl = document.getElementById('fcIntelSessionNodes');
    const eEl = document.getElementById('fcIntelSessionEdges');

    if (dEl) {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      dEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    try {
      const data = window.__getActiveSketchData?.();
      if (data) {
        if (nEl) nEl.textContent = `+${Math.max(0, (data.nodes?.length || 0) - nodesAtStart)}`;
        if (eEl) eEl.textContent = `+${Math.max(0, (data.edges?.length || 0) - edgesAtStart)}`;
      }
    } catch { /* ignore */ }
  }, 1000);

  // Streak
  updateStreak();
}

function updateStreak() {
  try {
    const stored = JSON.parse(localStorage.getItem('cockpit_streak') || '{}');
    const days = (stored.days || []).sort();
    if (!days.length) return;

    const today = new Date();
    let streak = 0;
    let freezeUsed = false;
    const checkDate = new Date(today);
    const todayStr = checkDate.toISOString().slice(0, 10);

    if (days.includes(todayStr)) {
      streak = 1;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (let i = 0; i < 365; i++) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      if (days.includes(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (!freezeUsed) {
        freezeUsed = true;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    if (streak > 0) {
      const streakEl = document.getElementById('fcIntelStreak');
      const countEl = document.getElementById('fcIntelStreakCount');
      if (streakEl) streakEl.style.display = '';
      if (countEl) countEl.textContent = String(streak);
    }
  } catch { /* ignore */ }
}

function updateLeftPanelCompletion() {
  const completion = computeSketchCompletion();
  const valEl = document.getElementById('fcIntelHealthValue');
  const subEl = document.getElementById('fcIntelHealthSub');
  if (valEl) valEl.textContent = `${completion.percentage}%`;
  if (subEl) {
    const t = window.t || (k => k);
    subEl.textContent = `${completion.nodeCount} ${t('cockpit.nodes') || 'nodes'} · ${completion.edgeCount} ${t('cockpit.edges') || 'edges'}`;
    if (completion.issueCount > 0) {
      subEl.textContent += ` · ${completion.issueCount} ${t('cockpit.issues') || 'issues'}`;
    }
  }
}

// ── Bottom Panel (Tools/Settings) ──────────────────────────────

function buildBottomPanel() {
  const t = window.t || (k => k);
  const panel = document.createElement('div');
  panel.className = 'fc-panel fc-panel--bottom';
  panel.id = 'fcPanelBottom';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="fc-panel__drag-handle">
      <div class="fc-panel__drag-bar"></div>
    </div>
    <div class="fc-panel__body" id="fcPanelBottomBody">
      <div class="fc-tool-section">
        <div class="fc-tool-section__title">${esc(t('fc.tools'))}</div>
        <div class="fc-tool-grid">
          <button class="fc-tool-btn" data-fc-delegate="canvasZoomInBtn" type="button">
            <span class="material-icons">zoom_in</span>
            <span class="fc-tool-btn__label">${esc(t('fc.zoomIn'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-delegate="canvasZoomOutBtn" type="button">
            <span class="material-icons">zoom_out</span>
            <span class="fc-tool-btn__label">${esc(t('fc.zoomOut'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-delegate="zoomToFitBtn" type="button">
            <span class="material-icons">fit_screen</span>
            <span class="fc-tool-btn__label">${esc(t('fc.fitAll'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-delegate="myLocationBtn" type="button">
            <span class="material-icons">my_location</span>
            <span class="fc-tool-btn__label">${esc(t('fc.myLocation'))}</span>
          </button>
        </div>
      </div>
      <div class="fc-tool-section">
        <div class="fc-tool-section__title">${esc(t('fc.sketch'))}</div>
        <div class="fc-tool-grid">
          <button class="fc-tool-btn" data-fc-delegate="saveBtn" type="button">
            <span class="material-icons">save</span>
            <span class="fc-tool-btn__label">${esc(t('fc.save'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-delegate="exportSketchBtn" type="button">
            <span class="material-icons">download</span>
            <span class="fc-tool-btn__label">${esc(t('fc.export'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-action-emit="importSketch" type="button">
            <span class="material-icons">upload</span>
            <span class="fc-tool-btn__label">${esc(t('fc.import'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-delegate="exportNodesBtn" type="button">
            <span class="material-icons">table_chart</span>
            <span class="fc-tool-btn__label">${esc(t('fc.csvNodes'))}</span>
          </button>
        </div>
      </div>
      <div class="fc-tool-section">
        <div class="fc-tool-section__title">${esc(t('fc.measurement'))}</div>
        <div class="fc-tool-grid">
          <button class="fc-tool-btn" data-fc-action-emit="liveMeasure:toggle" type="button">
            <span class="material-icons">gps_fixed</span>
            <span class="fc-tool-btn__label">${esc(t('fc.liveMeasure'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-action-emit="tsc3:connect" type="button">
            <span class="material-icons">settings_remote</span>
            <span class="fc-tool-btn__label">${esc(t('fc.tsc3'))}</span>
          </button>
        </div>
      </div>
      <div class="fc-tool-section">
        <div class="fc-tool-section__title">${esc(t('fc.settings'))}</div>
        <div class="fc-tool-grid">
          <button class="fc-tool-btn" data-fc-lang-toggle type="button">
            <span class="material-icons">language</span>
            <span class="fc-tool-btn__label" id="fcLangLabel">${esc(t('fc.language'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-fc-toggle type="button">
            <span class="material-icons">toggle_on</span>
            <span class="fc-tool-btn__label">${esc(t('fc.fcMode'))}</span>
          </button>
        </div>
      </div>
      <div class="fc-tool-section">
        <div class="fc-tool-section__title">${esc(t('fc.navigation'))}</div>
        <div class="fc-tool-grid">
          <button class="fc-tool-btn" data-fc-navigate="#/" type="button">
            <span class="material-icons">home</span>
            <span class="fc-tool-btn__label">${esc(t('fc.home'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-navigate="#/admin" type="button">
            <span class="material-icons">admin_panel_settings</span>
            <span class="fc-tool-btn__label">${esc(t('fc.admin'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-navigate="#/projects" type="button">
            <span class="material-icons">folder_open</span>
            <span class="fc-tool-btn__label">${esc(t('fc.projects'))}</span>
          </button>
          <button class="fc-tool-btn" data-fc-delegate="helpDialogBtn" type="button">
            <span class="material-icons">help_outline</span>
            <span class="fc-tool-btn__label">${esc(t('fc.help'))}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  fcPanels.register('bottom', panel);

  // Wire tool buttons
  panel.addEventListener('click', (e) => {
    const delegateBtn = e.target.closest('[data-fc-delegate]');
    if (delegateBtn) {
      document.getElementById(delegateBtn.dataset.fcDelegate)?.click();
      fcPanels.close('bottom');
      return;
    }

    const emitBtn = e.target.closest('[data-fc-action-emit]');
    if (emitBtn) {
      window.menuEvents?.emit(emitBtn.dataset.fcActionEmit, { element: emitBtn, originalEvent: e });
      fcPanels.close('bottom');
      return;
    }

    const navBtn = e.target.closest('[data-fc-navigate]');
    if (navBtn) {
      window.location.hash = navBtn.dataset.fcNavigate;
      fcPanels.close('bottom');
      return;
    }

    const langBtn = e.target.closest('[data-fc-lang-toggle]');
    if (langBtn) {
      const langSelect = document.getElementById('langSelect') || document.getElementById('mobileLangSelect');
      if (langSelect) {
        const newVal = langSelect.value === 'he' ? 'en' : 'he';
        langSelect.value = newVal;
        langSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      fcPanels.close('bottom');
      return;
    }

    const fcToggle = e.target.closest('[data-fc-fc-toggle]');
    if (fcToggle) {
      // Dynamic import to avoid circular dependency
      import('./fc-shell.js').then(m => m.setFCMode(false));
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
