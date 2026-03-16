/**
 * Unified Bottom Toolbar — horizontal bar at the bottom of the canvas.
 *
 * Replaces the vertical canvas-toolbar + FAB speed-dial.
 * Sections: [Modes] [GPS Capture] [Actions]
 * Delegates to existing button clicks for compatibility.
 */

import './unified-toolbar.css';

let toolbarEl = null;
let flyoutEl = null;
let flyoutOpen = false;

/**
 * Build and inject the unified toolbar into #canvasContainer
 */
export function initUnifiedToolbar() {
  const container = document.getElementById('canvasContainer');
  if (!container || document.getElementById('unifiedToolbar')) return;

  const t = window.t || ((k) => k);

  toolbarEl = document.createElement('div');
  toolbarEl.id = 'unifiedToolbar';
  toolbarEl.className = 'unified-toolbar';
  toolbarEl.setAttribute('role', 'toolbar');
  toolbarEl.setAttribute('aria-label', 'Drawing tools');

  toolbarEl.innerHTML = `
    <!-- Node type flyout (pops above toolbar) -->
    <div class="ut-flyout" id="utNodeFlyout">
      <button class="ut-btn" data-node-type="node" title="${t('modeNode') || 'Manhole'}">
        <span class="material-icons">radio_button_unchecked</span>
        <span class="ut-btn__label">${t('modeNode') || 'Manhole'}</span>
      </button>
      <button class="ut-btn" data-node-type="home" title="${t('modeHome') || 'House'}">
        <span class="material-icons">home</span>
        <span class="ut-btn__label">${t('modeHome') || 'House'}</span>
      </button>
      <button class="ut-btn" data-node-type="drainage" title="${t('modeDrainage') || 'Drainage'}">
        <span class="material-icons">water_drop</span>
        <span class="ut-btn__label">${t('modeDrainage') || 'Drainage'}</span>
      </button>
      <button class="ut-btn" data-node-type="issue" title="${t('modeIssue') || 'Issue'}">
        <span class="material-icons">warning</span>
        <span class="ut-btn__label">${t('modeIssue') || 'Issue'}</span>
      </button>
    </div>

    <!-- Left: Mode buttons -->
    <div class="ut-section ut-section--modes">
      <button class="ut-btn" id="utNodeBtn" title="${t('modeNode') || 'Node'}" aria-label="Node mode">
        <span class="material-icons">radio_button_unchecked</span>
        <span class="ut-btn__label">${t('modeNode') || 'Node'}</span>
      </button>
      <button class="ut-btn" id="utEdgeBtn" title="${t('modeEdge') || 'Edge'}" aria-label="Edge mode">
        <span class="material-icons">timeline</span>
        <span class="ut-btn__label">${t('modeEdge') || 'Edge'}</span>
      </button>
      <div class="ut-sep"></div>
      <button class="ut-btn" id="utUndoBtn" title="${t('undo.title') || 'Undo'}" aria-label="Undo" disabled>
        <span class="material-icons">undo</span>
      </button>
      <button class="ut-btn" id="utRedoBtn" title="${t('redo.title') || 'Redo'}" aria-label="Redo" disabled>
        <span class="material-icons">redo</span>
      </button>
    </div>

    <!-- Center: GPS Capture -->
    <div class="ut-section ut-section--center">
      <button class="ut-capture-btn hidden" id="utCaptureBtn" title="${t('gpsCapture.takeMeasure') || 'Take Measure'}" aria-label="Take Measure">
        <span class="material-icons">add_location_alt</span>
      </button>
      <button class="ut-btn" id="utLocationBtn" title="${t('location.myLocation') || 'My Location'}" aria-label="My Location">
        <span class="material-icons">my_location</span>
        <span class="ut-btn__label">${t('location.myLocation') || 'GPS'}</span>
      </button>
    </div>

    <!-- Right: Actions -->
    <div class="ut-section ut-section--actions">
      <button class="ut-btn" id="utZoomFitBtn" title="${t('zoomToFit') || 'Zoom to fit'}" aria-label="Zoom to fit">
        <span class="material-icons">fit_screen</span>
      </button>
      <button class="ut-btn" id="utZoomInBtn" title="${t('zoomIn') || 'Zoom in'}" aria-label="Zoom in">
        <span class="material-icons">add</span>
      </button>
      <button class="ut-btn" id="utZoomOutBtn" title="${t('zoomOut') || 'Zoom out'}" aria-label="Zoom out">
        <span class="material-icons">remove</span>
      </button>
      <div class="ut-sep"></div>
      <button class="ut-btn" id="utSidebarBtn" title="${t('sidebar.details') || 'Panel'}" aria-label="Toggle panel">
        <span class="material-icons">menu_open</span>
      </button>
    </div>
  `;

  container.appendChild(toolbarEl);
  flyoutEl = document.getElementById('utNodeFlyout');

  // Wire all events
  wireModeDelegation();
  wireActionDelegation();
  wireGPSCapture();
  wireFlyout();
  syncUndoRedoState();
  syncModeState();
}

/**
 * Delegate mode buttons to original canvas toolbar buttons
 */
function wireModeDelegation() {
  const utNodeBtn = document.getElementById('utNodeBtn');
  const utEdgeBtn = document.getElementById('utEdgeBtn');
  const origNodeBtn = document.getElementById('nodeModeBtn');
  const origEdgeBtn = document.getElementById('edgeModeBtn');

  if (utNodeBtn) {
    utNodeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // If already in node mode, toggle flyout; otherwise click original
      if (utNodeBtn.classList.contains('active') && flyoutEl) {
        toggleFlyout();
      } else {
        closeFlyout();
        origNodeBtn?.click();
      }
    });
  }

  if (utEdgeBtn && origEdgeBtn) {
    utEdgeBtn.addEventListener('click', () => {
      closeFlyout();
      origEdgeBtn.click();
    });
  }
}

/**
 * Wire node type flyout buttons
 */
function wireFlyout() {
  if (!flyoutEl) return;

  flyoutEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-node-type]');
    if (!btn) return;

    const type = btn.dataset.nodeType;
    const origButtons = {
      node: document.getElementById('nodeModeBtn'),
      home: document.getElementById('homeNodeModeBtn'),
      drainage: document.getElementById('drainageNodeModeBtn'),
      issue: document.getElementById('issueNodeModeBtn'),
    };

    origButtons[type]?.click();
    closeFlyout();

    // Update the main node button icon to match selected type
    const utNodeBtn = document.getElementById('utNodeBtn');
    if (utNodeBtn) {
      const icons = { node: 'radio_button_unchecked', home: 'home', drainage: 'water_drop', issue: 'warning' };
      const iconEl = utNodeBtn.querySelector('.material-icons');
      if (iconEl) iconEl.textContent = icons[type] || 'radio_button_unchecked';
    }
  });

  // Close flyout on outside click
  document.addEventListener('click', (e) => {
    if (flyoutOpen && !flyoutEl.contains(e.target) && e.target.id !== 'utNodeBtn' && !e.target.closest('#utNodeBtn')) {
      closeFlyout();
    }
  });
}

function toggleFlyout() {
  flyoutOpen = !flyoutOpen;
  flyoutEl?.classList.toggle('open', flyoutOpen);
}

function closeFlyout() {
  flyoutOpen = false;
  flyoutEl?.classList.remove('open');
}

/**
 * Wire action buttons (zoom, recenter, sidebar)
 */
function wireActionDelegation() {
  delegate('utZoomFitBtn', 'zoomToFitBtn');
  delegate('utZoomInBtn', 'canvasZoomInBtn');
  delegate('utZoomOutBtn', 'canvasZoomOutBtn');

  // Sidebar toggle
  const utSidebarBtn = document.getElementById('utSidebarBtn');
  if (utSidebarBtn) {
    utSidebarBtn.addEventListener('click', () => {
      // Import dynamically to avoid circular deps
      import('./unified-sidebar.js').then(({ toggleSidebar }) => {
        toggleSidebar();
      });
    });
  }

  // My Location delegates to original
  delegate('utLocationBtn', 'myLocationBtn');
}

/**
 * Wire GPS capture button — delegates to gpsQuickCaptureBtn or precision measure
 */
function wireGPSCapture() {
  const captureBtn = document.getElementById('utCaptureBtn');
  if (!captureBtn) return;

  captureBtn.addEventListener('click', () => {
    if (typeof window.__startPrecisionMeasure === 'function') {
      window.__startPrecisionMeasure();
    } else {
      document.getElementById('gpsQuickCaptureBtn')?.click();
    }
  });

  // Show/hide capture button based on GNSS state
  const updateCaptureVisibility = () => {
    const gnss = window.__gnssState || window.gnssState;
    if (!gnss) return;

    const pos = gnss.getPosition?.();
    const conn = gnss.getConnectionState?.();
    const isTracking = conn === 'connected';

    captureBtn.classList.toggle('hidden', !isTracking);

    if (isTracking && pos) {
      captureBtn.classList.remove('fix-rtk', 'fix-float', 'fix-dgps', 'fix-gps', 'waiting');
      const fq = pos.fixQuality;
      if (fq === 4) captureBtn.classList.add('fix-rtk');
      else if (fq === 5) captureBtn.classList.add('fix-float');
      else if (fq === 2) captureBtn.classList.add('fix-dgps');
      else if (fq === 1) captureBtn.classList.add('fix-gps');
      else captureBtn.classList.add('waiting');
    }
  };

  // Listen for GNSS events instead of polling
  const gnss = window.__gnssState || window.gnssState;
  if (gnss && typeof gnss.on === 'function') {
    gnss.on('position', updateCaptureVisibility);
    gnss.on('connection', updateCaptureVisibility);
  } else {
    // Fallback: poll if gnss not yet available
    setInterval(updateCaptureVisibility, 1000);
  }
}

/**
 * Sync undo/redo disabled state from original buttons
 */
function syncUndoRedoState() {
  syncDisabled('undoBtn', 'utUndoBtn');
  syncDisabled('redoBtn', 'utRedoBtn');

  // Also delegate clicks
  delegate('utUndoBtn', 'undoBtn');
  delegate('utRedoBtn', 'redoBtn');
}

/**
 * Sync mode active state from original mode buttons
 */
function syncModeState() {
  const origNodeBtn = document.getElementById('nodeModeBtn');
  const origEdgeBtn = document.getElementById('edgeModeBtn');
  const utNodeBtn = document.getElementById('utNodeBtn');
  const utEdgeBtn = document.getElementById('utEdgeBtn');

  if (!origNodeBtn || !origEdgeBtn) return;

  const sync = () => {
    const nodeActive = origNodeBtn.classList.contains('active');
    const edgeActive = origEdgeBtn.classList.contains('active');
    // Also check other node type buttons
    const homeActive = document.getElementById('homeNodeModeBtn')?.classList.contains('active');
    const drainActive = document.getElementById('drainageNodeModeBtn')?.classList.contains('active');
    const issueActive = document.getElementById('issueNodeModeBtn')?.classList.contains('active');
    const anyNodeActive = nodeActive || homeActive || drainActive || issueActive;

    utNodeBtn?.classList.toggle('active', anyNodeActive);
    utEdgeBtn?.classList.toggle('active', edgeActive);
  };

  // Observe class changes on all mode buttons
  const mo = new MutationObserver(sync);
  [origNodeBtn, origEdgeBtn,
    document.getElementById('homeNodeModeBtn'),
    document.getElementById('drainageNodeModeBtn'),
    document.getElementById('issueNodeModeBtn')
  ].forEach(btn => {
    if (btn) mo.observe(btn, { attributes: true, attributeFilter: ['class'] });
  });

  sync();
}

/**
 * Delegate click from new button to original button
 */
function delegate(newId, origId) {
  const newBtn = document.getElementById(newId);
  const origBtn = document.getElementById(origId);
  if (newBtn && origBtn) {
    newBtn.addEventListener('click', () => origBtn.click());
  }
}

/**
 * Tear down the unified toolbar and clean up event listeners
 */
export function destroyUnifiedToolbar() {
  toolbarEl?.remove();
  toolbarEl = null;
  flyoutEl = null;
  flyoutOpen = false;
}

/**
 * Sync disabled attribute from original to new button
 */
function syncDisabled(origId, newId) {
  const orig = document.getElementById(origId);
  const newBtn = document.getElementById(newId);
  if (!orig || !newBtn) return;

  const sync = () => { newBtn.disabled = orig.disabled; };
  const mo = new MutationObserver(sync);
  mo.observe(orig, { attributes: true, attributeFilter: ['disabled'] });
  sync();
}
