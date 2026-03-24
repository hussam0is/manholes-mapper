/**
 * Action Rail — Zone C of the Cockpit layout
 * Vertical toolbar that replaces the canvas toolbar and FAB in landscape mode.
 * Delegates actions to the existing menu-events system.
 *
 * The More Menu is a scrollable, sectioned panel with collapsible groups
 * that mirrors ALL features from the portrait hamburger menu.
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

  // ── 3D View button ────────────────────────────────────
  const threeDBtn = document.getElementById('rail3DBtn');
  if (threeDBtn) {
    threeDBtn.addEventListener('click', () => {
      document.getElementById('threeDViewBtn')?.click();
    });
    // Match visibility of original 3D button
    const orig3D = document.getElementById('threeDViewBtn');
    if (orig3D) {
      const syncVisibility = () => {
        const hidden = orig3D.style.display === 'none' || orig3D.hidden;
        threeDBtn.style.display = hidden ? 'none' : '';
      };
      syncVisibility();
      const obs = new MutationObserver(syncVisibility);
      obs.observe(orig3D, { attributes: true, attributeFilter: ['style', 'hidden'] });
    }
  }

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
  initMoreMenu();

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
 * Initialize the More Menu with collapsible groups and full feature delegation
 */
function initMoreMenu() {
  const moreBtn = document.getElementById('railMoreBtn');
  const moreMenu = document.getElementById('railMoreMenu');

  if (!moreBtn || !moreMenu) return;

  // ── Open/Close logic ─────────────────────────────────────
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenuOpen = !moreMenuOpen;
    moreMenu.classList.toggle('open', moreMenuOpen);
    moreBtn.setAttribute('aria-expanded', String(moreMenuOpen));
    document.body.classList.toggle('cockpit-more-open', moreMenuOpen);

    // Sync toggle states from originals when menu opens
    if (moreMenuOpen) {
      syncToggleStates();
      syncScaleDisplays();
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (moreMenuOpen && !moreMenu.contains(e.target) && !moreBtn.contains(e.target)) {
      closeMoreMenu();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && moreMenuOpen) {
      closeMoreMenu();
      moreBtn.focus();
    }
  });

  // ── Collapsible group headers ────────────────────────────
  initCollapsibleGroups(moreMenu);

  // ── Action delegation for items ──────────────────────────
  wireMoreMenuActions(moreMenu);

  // ── Toggle delegation ────────────────────────────────────
  wireMoreMenuToggles(moreMenu);

  // ── Scale/stretch controls delegation ────────────────────
  wireMoreMenuScaleControls(moreMenu);

  // ── Search input delegation ──────────────────────────────
  wireSearchInput();

  // ── Map type select delegation ───────────────────────────
  wireMapTypeSelect();

  // ── Sync ref layers section visibility ───────────────────
  syncRefLayersVisibility();
}

/**
 * Close the more menu
 */
function closeMoreMenu() {
  const moreMenu = document.getElementById('railMoreMenu');
  const moreBtn = document.getElementById('railMoreBtn');

  moreMenuOpen = false;
  moreMenu?.classList.remove('open');
  moreBtn?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('cockpit-more-open');
}

/**
 * Initialize collapsible group headers.
 * Persists expanded/collapsed state to localStorage.
 */
function initCollapsibleGroups(moreMenu) {
  const STORAGE_KEY = 'cockpitMoreCollapsed';
  const DEFAULT_EXPANDED = new Set(['settings']);

  let collapsedGroups;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    collapsedGroups = stored ? new Set(JSON.parse(stored)) : null;
  } catch {
    collapsedGroups = null;
  }

  // Default: collapse all groups except DEFAULT_EXPANDED
  if (collapsedGroups === null) {
    collapsedGroups = new Set();
    moreMenu.querySelectorAll('[data-more-group-toggle]').forEach(btn => {
      const group = btn.dataset.moreGroupToggle;
      if (!DEFAULT_EXPANDED.has(group)) {
        collapsedGroups.add(group);
      }
    });
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsedGroups]));
    } catch { /* ignore */ }
  }

  // Apply initial state
  moreMenu.querySelectorAll('[data-more-group-toggle]').forEach(headerBtn => {
    const group = headerBtn.dataset.moreGroupToggle;
    const itemsEl = moreMenu.querySelector(`[data-more-group-items="${group}"]`);
    const chevron = headerBtn.querySelector('.action-rail__more-chevron');
    const isCollapsed = collapsedGroups.has(group);

    if (itemsEl) {
      itemsEl.style.display = isCollapsed ? 'none' : '';
    }
    headerBtn.setAttribute('aria-expanded', String(!isCollapsed));
    if (chevron) {
      chevron.textContent = isCollapsed ? 'expand_more' : 'expand_less';
    }

    // Wire click
    headerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nowCollapsed = headerBtn.getAttribute('aria-expanded') === 'true';

      if (itemsEl) {
        itemsEl.style.display = nowCollapsed ? 'none' : '';
      }
      headerBtn.setAttribute('aria-expanded', String(!nowCollapsed));
      if (chevron) {
        chevron.textContent = nowCollapsed ? 'expand_more' : 'expand_less';
      }

      if (nowCollapsed) {
        collapsedGroups.add(group);
      } else {
        collapsedGroups.delete(group);
      }
      saveState();
    });
  });
}

/**
 * Wire action buttons in the More Menu to their original counterparts.
 * Actions that should close the menu after firing are handled here.
 */
function wireMoreMenuActions(moreMenu) {
  // Map of data-action values to the original button IDs they delegate to
  const buttonDelegationMap = {
    save: 'saveBtn',
    exportSketch: 'exportSketchBtn',
    importSketch: 'importSketchBtn',
    exportNodes: 'exportNodesBtn',
    exportEdges: 'exportEdgesBtn',
    admin: 'adminBtn',
    mySketches: 'mySketchesBtn',
    help: 'helpBtn',
    projects: 'projectsBtn',
    importCoordinates: 'importCoordinatesBtn',
    resetStretch: 'resetStretchBtn',
    threeDView: 'threeDViewBtn',
    finishWorkday: 'finishWorkdayBtn',
    connectTMM: 'mobileConnectTMMBtn',
    connectSurveyBluetooth: 'mobileConnectSurveyBluetoothBtn',
    connectSurveyWebSocket: 'mobileConnectSurveyWebSocketBtn',
    disconnectSurvey: 'mobileDisconnectSurveyBtn',
  };

  // Actions that should NOT close the menu (interactive controls)
  const keepOpenActions = new Set([
    'scaleIncrease', 'scaleDecrease',
    'stretchXIncrease', 'stretchXDecrease',
    'stretchYIncrease', 'stretchYDecrease',
    'toggleCoordinates', 'toggleMapLayer', 'toggleRefLayers',
    'toggleLiveMeasure', 'toggleAutosave',
  ]);

  moreMenu.querySelectorAll('.action-rail__more-item[data-action]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      if (!action) return;

      const delegateId = buttonDelegationMap[action];
      if (delegateId) {
        const origBtn = document.getElementById(delegateId);
        if (origBtn) {
          origBtn.click();
        } else if (action === 'mySketches') {
          // Fallback: navigate directly if button not found
          window.location.hash = '#/';
        }
      } else if (action === 'languageChange') {
        // Toggle language
        const langSelect = document.getElementById('langSelect') || document.getElementById('mobileLangSelect');
        if (langSelect) {
          const newVal = langSelect.value === 'he' ? 'en' : 'he';
          langSelect.value = newVal;
          langSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (window.menuEvents) {
        window.menuEvents.emit(action, { element: item, originalEvent: e });
      }

      // Close menu unless the action is an interactive control
      if (!keepOpenActions.has(action)) {
        closeMoreMenu();
      }
    });
  });
}

/**
 * Wire toggle inputs (checkboxes) in the More Menu to their original counterparts.
 */
function wireMoreMenuToggles(_moreMenu) {
  // Map rail toggle IDs to original toggle IDs
  const toggleMap = {
    railCoordinatesToggle: ['coordinatesToggle', 'mobileCoordinatesToggle'],
    railMapLayerToggle: ['mapLayerToggle', 'mobileMapLayerToggle'],
    railRefLayersToggle: ['refLayersToggle', 'mobileRefLayersToggle'],
    railLiveMeasureToggle: ['liveMeasureToggle', 'mobileLiveMeasureToggle'],
    railAutosaveToggle: ['autosaveToggle', 'mobileAutosaveToggle'],
  };

  for (const [railId, origIds] of Object.entries(toggleMap)) {
    const railToggle = document.getElementById(railId);
    if (!railToggle) continue;

    railToggle.addEventListener('change', (e) => {
      e.stopPropagation();
      const checked = railToggle.checked;

      // Find the first original toggle and sync it
      for (const origId of origIds) {
        const orig = document.getElementById(origId);
        if (orig && orig.checked !== checked) {
          orig.checked = checked;
          orig.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    });

    // Observe original toggles for changes so rail toggle stays in sync
    for (const origId of origIds) {
      const orig = document.getElementById(origId);
      if (orig) {
        orig.addEventListener('change', () => {
          if (railToggle.checked !== orig.checked) {
            railToggle.checked = orig.checked;
          }
        });
      }
    }
  }
}

/**
 * Wire scale and stretch +/- buttons in the More Menu.
 * These delegate to the original mobile/desktop scale buttons.
 */
function wireMoreMenuScaleControls(moreMenu) {
  const scaleDelegation = {
    scaleDecrease: ['scaleDecreaseBtn', 'mobileScaleDecreaseBtn'],
    scaleIncrease: ['scaleIncreaseBtn', 'mobileScaleIncreaseBtn'],
    stretchXDecrease: ['stretchXDecreaseBtn', 'mobileStretchXDecreaseBtn'],
    stretchXIncrease: ['stretchXIncreaseBtn', 'mobileStretchXIncreaseBtn'],
    stretchYDecrease: ['stretchYDecreaseBtn', 'mobileStretchYDecreaseBtn'],
    stretchYIncrease: ['stretchYIncreaseBtn', 'mobileStretchYIncreaseBtn'],
  };

  moreMenu.querySelectorAll('.action-rail__more-scale-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const origIds = scaleDelegation[action];
      if (!origIds) return;

      for (const id of origIds) {
        const orig = document.getElementById(id);
        if (orig) {
          orig.click();
          break;
        }
      }

      // Update display values after a short delay to let state update
      setTimeout(syncScaleDisplays, 50);
    });
  });
}

/**
 * Wire the search input to delegate to the original search input.
 */
function wireSearchInput() {
  const railSearch = document.getElementById('railSearchNodeInput');
  if (!railSearch) return;

  railSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = railSearch.value.trim();
      if (!value) return;

      // Delegate to the original search input's behavior
      const origSearch = document.getElementById('searchNodeInput') || document.getElementById('mobileSearchNodeInput');
      if (origSearch) {
        origSearch.value = value;
        origSearch.dispatchEvent(new Event('input', { bubbles: true }));
        origSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }

      railSearch.value = '';
      closeMoreMenu();
    }
  });
}

/**
 * Wire the map type select to delegate to the original.
 */
function wireMapTypeSelect() {
  const railSelect = document.getElementById('railMapTypeSelect');
  if (!railSelect) return;

  railSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    const value = railSelect.value;

    // Sync to original selects
    const origIds = ['mapTypeSelect', 'mobileMapTypeSelect'];
    for (const id of origIds) {
      const orig = document.getElementById(id);
      if (orig && orig.value !== value) {
        orig.value = value;
        orig.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  });

  // Sync from originals
  ['mapTypeSelect', 'mobileMapTypeSelect'].forEach(id => {
    const orig = document.getElementById(id);
    if (orig) {
      orig.addEventListener('change', () => {
        if (railSelect.value !== orig.value) {
          railSelect.value = orig.value;
        }
      });
    }
  });
}

/**
 * Sync the ref layers section visibility from the original.
 */
function syncRefLayersVisibility() {
  const railSection = document.getElementById('railRefLayersSection');
  const origSection = document.getElementById('refLayersSection') || document.getElementById('mobileRefLayersSection');

  if (!railSection || !origSection) return;

  const sync = () => {
    const isHidden = origSection.style.display === 'none';
    railSection.style.display = isHidden ? 'none' : '';
  };

  sync();

  // Observe for changes
  const observer = new MutationObserver(sync);
  observer.observe(origSection, { attributes: true, attributeFilter: ['style'] });
}

/**
 * Sync toggle states from original checkboxes to rail toggles.
 * Called when the More Menu opens.
 */
function syncToggleStates() {
  const syncPairs = [
    ['railCoordinatesToggle', 'coordinatesToggle', 'mobileCoordinatesToggle'],
    ['railMapLayerToggle', 'mapLayerToggle', 'mobileMapLayerToggle'],
    ['railRefLayersToggle', 'refLayersToggle', 'mobileRefLayersToggle'],
    ['railLiveMeasureToggle', 'liveMeasureToggle', 'mobileLiveMeasureToggle'],
    ['railAutosaveToggle', 'autosaveToggle', 'mobileAutosaveToggle'],
  ];

  for (const [railId, ...origIds] of syncPairs) {
    const railEl = document.getElementById(railId);
    if (!railEl) continue;

    for (const origId of origIds) {
      const orig = document.getElementById(origId);
      if (orig) {
        railEl.checked = orig.checked;
        break;
      }
    }
  }

  // Sync map type select
  const railMapType = document.getElementById('railMapTypeSelect');
  const origMapType = document.getElementById('mapTypeSelect') || document.getElementById('mobileMapTypeSelect');
  if (railMapType && origMapType) {
    railMapType.value = origMapType.value;
  }
}

/**
 * Sync scale and stretch display values from originals.
 */
function syncScaleDisplays() {
  const displays = {
    railScaleValueDisplay: ['scaleValueDisplay', 'mobileScaleValueDisplay'],
    railStretchXValueDisplay: ['stretchXValueDisplay', 'mobileStretchXValueDisplay'],
    railStretchYValueDisplay: ['stretchYValueDisplay', 'mobileStretchYValueDisplay'],
  };

  for (const [railId, origIds] of Object.entries(displays)) {
    const railEl = document.getElementById(railId);
    if (!railEl) continue;

    for (const origId of origIds) {
      const orig = document.getElementById(origId);
      if (orig && orig.textContent) {
        railEl.textContent = orig.textContent;
        break;
      }
    }
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
