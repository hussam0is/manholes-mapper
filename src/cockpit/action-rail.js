/**
 * Action Rail — Zone C of the Cockpit layout
 * Vertical toolbar that replaces the canvas toolbar and FAB in landscape mode.
 * Delegates actions to the existing menu-events system.
 */

let moreMenuOpen = false;

/**
 * Initialize Action Rail event bindings
 */
export function initActionRail() {
  const rail = document.getElementById('actionRail');
  if (!rail) return;

  // ── Mode buttons ────────────────────────────────────────
  rail.querySelectorAll('.action-rail__btn--mode').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      handleModeSwitch(mode);
    });
  });

  // ── GPS capture ─────────────────────────────────────────
  const gpsBtn = document.getElementById('railGpsBtn');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
      // Delegate to existing GPS quick capture button
      const origBtn = document.getElementById('gpsQuickCaptureBtn');
      if (origBtn) origBtn.click();
    });
  }

  // ── TSC3 Survey Controller ──────────────────────────────
  const tsc3Btn = document.getElementById('railTsc3Btn');
  if (tsc3Btn) {
    tsc3Btn.addEventListener('click', async () => {
      const { openDevicePickerDialog } = await import('../survey/device-picker-dialog.js');
      openDevicePickerDialog();
    });
  }

  // Listen for TSC3 connection state
  const tsc3Indicator = document.getElementById('tsc3Indicator');
  if (tsc3Indicator && window.menuEvents) {
    window.menuEvents.on('tsc3:connected', () => {
      tsc3Indicator.classList.add('connected');
    });
    window.menuEvents.on('tsc3:disconnected', () => {
      tsc3Indicator.classList.remove('connected');
    });
  }

  // ── Undo/Redo ───────────────────────────────────────────
  const undoBtn = document.getElementById('railUndoBtn');
  const redoBtn = document.getElementById('railRedoBtn');

  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      document.getElementById('undoBtn')?.click();
    });
  }
  if (redoBtn) {
    redoBtn.addEventListener('click', () => {
      document.getElementById('redoBtn')?.click();
    });
  }

  // Sync disabled state from original buttons
  const origUndo = document.getElementById('undoBtn');
  const origRedo = document.getElementById('redoBtn');

  if (origUndo && undoBtn) {
    const observer = new MutationObserver(() => {
      undoBtn.disabled = origUndo.disabled;
    });
    observer.observe(origUndo, { attributes: true, attributeFilter: ['disabled'] });
    undoBtn.disabled = origUndo.disabled;
  }

  if (origRedo && redoBtn) {
    const observer = new MutationObserver(() => {
      redoBtn.disabled = origRedo.disabled;
    });
    observer.observe(origRedo, { attributes: true, attributeFilter: ['disabled'] });
    redoBtn.disabled = origRedo.disabled;
  }

  // ── Zoom buttons ────────────────────────────────────────
  document.getElementById('railZoomInBtn')?.addEventListener('click', () => {
    document.getElementById('canvasZoomInBtn')?.click();
  });
  document.getElementById('railZoomOutBtn')?.addEventListener('click', () => {
    document.getElementById('canvasZoomOutBtn')?.click();
  });
  document.getElementById('railFitBtn')?.addEventListener('click', () => {
    document.getElementById('zoomToFitBtn')?.click();
  });

  // ── Progressive disclosure: hide gated features ─────────
  const isVisible = window.__isFeatureVisible || (() => true);
  if (!isVisible('heatmap')) {
    document.getElementById('railHeatmapBtn')?.style.setProperty('display', 'none');
  }
  if (!isVisible('tsc3')) {
    document.getElementById('railTsc3Btn')?.style.setProperty('display', 'none');
  }

  // ── Heat map toggle ─────────────────────────────────────
  const heatmapBtn = document.getElementById('railHeatmapBtn');
  if (heatmapBtn) {
    heatmapBtn.addEventListener('click', () => {
      const active = heatmapBtn.classList.toggle('active');
      heatmapBtn.setAttribute('aria-pressed', String(active));
      document.body.classList.toggle('heatmap-active', active);

      // Notify canvas to redraw with heat map coloring
      if (window.menuEvents) {
        window.menuEvents.emit('heatmap:toggle', active);
      }
      window.__scheduleDraw?.();
    });
  }

  // ── Collapse Zone A ─────────────────────────────────────
  const collapseBtn = document.getElementById('railCollapseBtn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      const strip = document.getElementById('intelStrip');
      if (!strip) return;

      const collapsed = strip.classList.toggle('intel-strip--collapsed');
      document.body.classList.toggle('zone-a-collapsed', collapsed);

      // Update grid to give canvas more space
      const cockpit = document.querySelector('.cockpit');
      if (cockpit) {
        cockpit.style.gridTemplateColumns = collapsed
          ? '0px 1fr var(--cockpit-zone-c, 56px)'
          : 'var(--cockpit-zone-a, 140px) 1fr var(--cockpit-zone-c, 56px)';
      }
    });
  }

  // ── More menu ───────────────────────────────────────────
  const moreBtn = document.getElementById('railMoreBtn');
  const moreMenu = document.getElementById('railMoreMenu');

  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moreMenuOpen = !moreMenuOpen;
      moreMenu.classList.toggle('open', moreMenuOpen);
      moreBtn.setAttribute('aria-expanded', String(moreMenuOpen));
      document.body.classList.toggle('cockpit-more-open', moreMenuOpen);
    });

    // Close on outside click (only when click is outside menu and button)
    document.addEventListener('click', (e) => {
      if (moreMenuOpen && !moreMenu.contains(e.target) && !moreBtn.contains(e.target)) {
        moreMenuOpen = false;
        moreMenu.classList.remove('open');
        moreBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('cockpit-more-open');
      }
    });

    // Handle more menu actions — delegate to original toolbar buttons
    // or emit the correct menuEvents event name (not the literal 'action')
    moreMenu.querySelectorAll('.action-rail__more-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        if (!action) return;

        // Map cockpit actions to original toolbar button IDs
        const buttonDelegationMap = {
          save: 'saveBtn',
          exportSketch: 'exportSketchBtn',
          exportNodes: 'exportNodesBtn',
          exportEdges: 'exportEdgesBtn',
          admin: 'adminBtn',
          mySketches: 'mySketchesBtn',
        };

        const delegateId = buttonDelegationMap[action];
        if (delegateId) {
          // Delegate to the original toolbar button (preserves legacy handlers)
          document.getElementById(delegateId)?.click();
        } else if (action === 'languageChange') {
          // Toggle language by cycling the original lang select
          const langSelect = document.getElementById('langSelect') || document.getElementById('mobileLangSelect');
          if (langSelect) {
            const newVal = langSelect.value === 'he' ? 'en' : 'he';
            langSelect.value = newVal;
            langSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else if (window.menuEvents) {
          // For actions with menuEvents listeners (mySketches, admin, etc.)
          window.menuEvents.emit(action, { element: item, originalEvent: e });
        }

        // Close menu
        moreMenuOpen = false;
        moreMenu.classList.remove('open');
        moreBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('cockpit-more-open');
      });
    });
  }

  // ── Sync active mode from original toolbar ──────────────
  syncModeFromOriginal();

  // Listen for mode changes
  if (window.menuEvents) {
    window.menuEvents.on('mode:changed', (mode) => {
      updateActiveMode(mode);
    });
  }

  // Update GPS button state based on GNSS
  const gnssState = window.__gnssState;
  if (gnssState) {
    gnssState.on('position', (pos) => {
      const gpsBtn = document.getElementById('railGpsBtn');
      if (gpsBtn) {
        gpsBtn.classList.toggle('has-fix', pos?.isValid && pos?.fixQuality >= 1);
      }
    });
  }
}

/**
 * Handle mode switch from Action Rail buttons
 */
function handleModeSwitch(mode) {
  // Map cockpit modes to original button IDs
  const modeMap = {
    node: 'nodeModeBtn',
    edge: 'edgeModeBtn',
    home: 'homeNodeModeBtn',
    drainage: 'drainageNodeModeBtn'
  };

  const btnId = modeMap[mode];
  if (btnId) {
    document.getElementById(btnId)?.click();
  }

  updateActiveMode(mode);

  // Update body class for border glow
  document.body.classList.remove('mode-node', 'mode-edge', 'mode-gps');
  if (mode === 'node' || mode === 'home' || mode === 'drainage') {
    document.body.classList.add('mode-node');
  } else if (mode === 'edge') {
    document.body.classList.add('mode-edge');
  }
}

/**
 * Update which Action Rail button shows as active
 */
function updateActiveMode(mode) {
  const rail = document.getElementById('actionRail');
  if (!rail) return;

  rail.querySelectorAll('.action-rail__btn--mode').forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

/**
 * Read the current mode from the original toolbar and sync it
 */
function syncModeFromOriginal() {
  const modeButtons = [
    { id: 'nodeModeBtn', mode: 'node' },
    { id: 'edgeModeBtn', mode: 'edge' },
    { id: 'homeNodeModeBtn', mode: 'home' },
    { id: 'drainageNodeModeBtn', mode: 'drainage' }
  ];

  for (const { id, mode } of modeButtons) {
    const btn = document.getElementById(id);
    if (btn?.classList.contains('active')) {
      updateActiveMode(mode);
      return;
    }
  }
}
