/**
 * library-manager.js
 *
 * Extracted library/sketch management functions from src/legacy/main.js.
 * State via S proxy, cross-module calls via F registry.
 */

import { S, F } from './shared-state.js';
import { idbSaveRecordCompat, idbDeleteRecordCompat, STORAGE_KEYS } from '../state/persistence.js';
import {
  setReferenceLayers,
  clearReferenceLayers,
  loadRefLayerSettings,
  loadSectionSettings,
} from '../map/reference-layers.js';
import { updateLayersPanel } from '../map/layers-config.js';
import { getLastEditPosition, setLastEditPosition } from '../project/last-edit-tracker.js';
import { getAllSketches } from '../project/project-canvas-state.js';
import { getUsername as getAuthUsername } from '../auth/auth-guard.js';
import { DEFAULT_INPUT_FLOW_CONFIG } from '../state/constants.js';

const t = (...args) => F.t(...args);

// === Library management (multiple sketches) ===
// Cache for library to avoid repeated JSON.parse() on large datasets
let _libraryCache = null;
let _libraryCacheValid = false;

export function getLibrary() {
  if (_libraryCacheValid && _libraryCache !== null) {
    return _libraryCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.library);
    if (!raw) {
      _libraryCache = [];
      _libraryCacheValid = true;
      return [];
    }
    const lib = JSON.parse(raw);
    if (Array.isArray(lib)) {
      _libraryCache = lib;
      _libraryCacheValid = true;
      return lib;
    }
    _libraryCache = [];
    _libraryCacheValid = true;
    return [];
  } catch (e) {
    console.error('[App] Failed to parse library', e.message);
    _libraryCache = [];
    _libraryCacheValid = true;
    return [];
  }
}

// Pending localStorage write for library (to batch writes)
let _libraryWritePending = false;

export function setLibrary(list) {
  // Update cache immediately for responsive reads
  _libraryCache = list;
  _libraryCacheValid = true;

  // Defer the heavy localStorage write to avoid blocking UI
  if (!_libraryWritePending) {
    _libraryWritePending = true;
    const doWrite = () => {
      _libraryWritePending = false;
      // Use the cached version to ensure we write the latest state
      if (_libraryCache !== null) {
        localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(_libraryCache));
      }
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(doWrite, { timeout: 100 });
    } else {
      setTimeout(doWrite, 0);
    }
  }
}

export function invalidateLibraryCache() {
  _libraryCacheValid = false;
  _libraryCache = null;
}

/**
 * Sync project canvas sketches back to the localStorage library.
 * Called when leaving project-canvas mode so the home view shows
 * up-to-date node/edge counts and metadata for all project sketches.
 */
export function syncProjectSketchesToLibrary() {
  try {
    const projectSketchList = getAllSketches(); // from project-canvas-state
    if (!projectSketchList || projectSketchList.length === 0) return;

    const lib = getLibrary();
    let changed = false;

    for (const ps of projectSketchList) {
      // The active sketch's live data is in the globals, not the Map
      const sketchNodes = ps.isActive ? S.nodes : (ps.nodes || []);
      const sketchEdges = ps.isActive ? S.edges : (ps.edges || []);

      const idx = lib.findIndex(s => s.id === ps.id);
      if (idx >= 0) {
        // Update existing entry with fresh data from the project canvas
        lib[idx] = {
          ...lib[idx],
          nodes: sketchNodes,
          edges: sketchEdges,
          nodeCount: sketchNodes.length,
          edgeCount: sketchEdges.length,
          name: ps.name || lib[idx].name,
          adminConfig: ps.adminConfig || lib[idx].adminConfig || {},
          updatedAt: ps.updatedAt || lib[idx].updatedAt,
          metadataOnly: false,
        };
        changed = true;
      } else {
        // Sketch exists in project but not in library — add it
        lib.unshift({
          id: ps.id,
          name: ps.name || null,
          creationDate: ps.creationDate || ps.createdAt,
          createdAt: ps.createdAt,
          updatedAt: ps.updatedAt,
          projectId: ps.projectId,
          nodes: sketchNodes,
          edges: sketchEdges,
          nodeCount: sketchNodes.length,
          edgeCount: sketchEdges.length,
          adminConfig: ps.adminConfig || {},
          cloudSynced: true,
          metadataOnly: false,
          ownerId: ps.ownerId,
          ownerUsername: ps.ownerUsername,
          ownerEmail: ps.ownerEmail,
          isOwner: ps.isOwner,
          createdBy: ps.createdBy,
          lastEditedBy: ps.lastEditedBy,
        });
        changed = true;
      }
    }

    if (changed) {
      setLibrary(lib);
    }
  } catch (err) {
    console.warn('[App] Failed to sync project sketches to library:', err);
  }
}

export function generateSketchId() {
  return 'sk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function saveToLibrary() {
  const lib = getLibrary();
  const nowIso = new Date().toISOString();
  const sketchId = S.currentSketchId || generateSketchId();

  // Silently skip saving empty sketches (no nodes and no edges)
  if ((!S.nodes || S.nodes.length === 0) && (!S.edges || S.edges.length === 0)) {
    console.debug('[App] Skipping save of empty sketch:', sketchId);
    return;
  }

  const lastEdit = getLastEditPosition();
  const record = {
    id: sketchId,
    createdAt: S.creationDate || nowIso,
    updatedAt: nowIso,
    nodes: S.nodes,
    edges: S.edges,
    nodeCount: S.nodes.length,
    edgeCount: S.edges.length,
    nextNodeId: S.nextNodeId,
    creationDate: S.creationDate || nowIso,
    name: S.currentSketchName || null,
    projectId: S.currentProjectId || null,
    inputFlowConfig: S.currentInputFlowConfig || null,
    lastEditedBy: _getCurrentUsername(),
    metadataOnly: false,
    lastEditX: lastEdit?.x ?? null,
    lastEditY: lastEdit?.y ?? null,
  };
  const idx = lib.findIndex((s) => s.id === record.id);
  let finalRecord = record;
  if (idx >= 0) {
    // Preserve existing name if current is null, so we don't accidentally clear it
    const existing = lib[idx];
    const merged = { ...record };
    if ((record.name == null || record.name === '') && (existing.name != null && existing.name !== '')) {
      merged.name = existing.name;
      // Also update currentSketchName so subsequent syncs use the preserved name
      S.currentSketchName = existing.name;
      F.updateSketchNameDisplay();
    }
    lib[idx] = merged;
    finalRecord = merged;
  } else {
    lib.unshift(record);
  }
  setLibrary(lib);
  S.currentSketchId = finalRecord.id;
  // Mirror into IndexedDB (use finalRecord which has the merged/preserved name)
  idbSaveRecordCompat(finalRecord);
}

export async function loadFromLibrary(sketchId) {
  const lib = getLibrary();
  const rec = lib.find((r) => r.id === sketchId);
  if (!rec) return false;

  // Release lock on previous sketch if we held one
  if (S.currentSketchId && window.syncService?.releaseSketchLock) {
    await window.syncService.releaseSketchLock(S.currentSketchId).catch(() => {});
  }

  // Try to acquire lock on the new sketch
  if (window.syncService?.acquireSketchLock) {
    const lockResult = await window.syncService.acquireSketchLock(sketchId);
    if (!lockResult.success && !lockResult.offline) {
      // Show warning that sketch is locked
      const lockedBy = lockResult.lock?.lockedBy || 'another user';
      F.showToast(t('sketches.lockedByOther') || `Sketch is being edited by ${lockedBy}. Opening in view-only mode.`, 'warning');
      // Still allow opening in read-only mode
      window.__sketchReadOnly = true;
    } else {
      window.__sketchReadOnly = false;
    }
  }

  // Lazy-fetch full data from cloud if we only have metadata
  let sketchData = rec;
  if (rec.metadataOnly || (!rec.nodes?.length && !rec.edges?.length && rec.cloudSynced)) {
    try {
      F.showToast(t('sketches.loading') || 'Loading sketch data...', 'info');
      const fullSketch = await window.syncService?.fetchSketchFromCloud(sketchId);
      if (fullSketch && (fullSketch.nodes?.length || fullSketch.edges?.length)) {
        sketchData = { ...rec, ...fullSketch, metadataOnly: false };
        // Update localStorage cache with full data
        const lib2 = getLibrary();
        const idx = lib2.findIndex(r => r.id === sketchId);
        if (idx >= 0) { lib2[idx] = sketchData; setLibrary(lib2); }
      }
    } catch (e) {
      console.warn('[loadFromLibrary] Failed to fetch full sketch from cloud:', e.message);
    }
  }

  S.nodes = sketchData.nodes || [];
  S._nodeMapDirty = true;
  S._spatialGridDirty = true;
  S._dataVersion++;
  S.edges = sketchData.edges || [];
  F.clearUndoStack();
  F.markEdgeLabelCacheDirty(); // sketch record loaded
  // Normalize nodes and edges to canonical shape (single source of truth)
  F.normalizeLegacySketch(S.nodes, S.edges);
  S.nextNodeId = sketchData.nextNodeId || 1;
  S.creationDate = sketchData.creationDate || sketchData.createdAt || null;
  S.currentSketchId = sketchData.id;
  S.currentSketchName = sketchData.name || null;
  S.currentProjectId = sketchData.projectId || null;
  S.currentInputFlowConfig = sketchData.inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
  F.updateSketchNameDisplay();
  // Reset edge creation state
  S.pendingEdgeTail = null;
  S.pendingEdgePreview = null;
  S.pendingEdgeStartPosition = null;
  S.selectedNode = null;
  S.selectedEdge = null;
  F.computeNodeTypes();
  // Auto-reposition nodes from embedded geographic coordinates
  F.autoRepositionFromEmbeddedCoords();
  // Restore last edit position from library record
  if (sketchData.lastEditX != null && sketchData.lastEditY != null) {
    setLastEditPosition(sketchData.lastEditX, sketchData.lastEditY);
  }
  F.saveToStorage();
  F.draw();
  F.renderDetails();

  // If a last edit position exists, center on it at 20% zoom; otherwise recenter on sketch center
  const lastEdit = getLastEditPosition();
  if (lastEdit) {
    const targetScale = 0.2;
    const rect = S.canvas.getBoundingClientRect();
    const tx = rect.width / 2 - targetScale * S.viewStretchX * lastEdit.x;
    const ty = rect.height / 2 - targetScale * S.viewStretchY * lastEdit.y;
    window.__setViewState(targetScale, tx, ty);
  } else {
    try { F.recenterView(); } catch (_) { }
  }

  // Load reference layers for the project (if sketch belongs to one)
  loadProjectReferenceLayers(S.currentProjectId);
  F.updateCanvasEmptyState();

  return true;
}

/**
 * Fetch and load reference layers for a given project.
 * Layers are cached in localStorage keyed by projectId.
 * @param {string|null} projectId
 */
export async function loadProjectReferenceLayers(projectId) {
  if (!projectId) {
    clearReferenceLayers();
    F.scheduleDraw();
    return { layerCount: 0 };
  }

  try {
    // Check localStorage cache first
    const cacheKey = `refLayers_${projectId}`;
    let cached = null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const data = JSON.parse(raw);
        // Use cache if less than 1 hour old
        if (data.timestamp && Date.now() - data.timestamp < 3600000) {
          cached = data.layers;
        }
      }
    } catch (_) { /* ignore cache errors */ }

    if (cached) {
      setReferenceLayers(cached);
      loadRefLayerSettings();
      loadSectionSettings();
      F.renderRefLayerToggles();
      updateLayersPanel();
      F.scheduleDraw();
      console.debug(`[RefLayers] Loaded ${cached.length} layers from cache for project ${projectId}`);
      return { layerCount: cached.length }; // Skip server fetch when cache is fresh (< 1 hour)
    }

    // Cache miss or stale — fetch from server
    const response = await fetch(`/api/layers?projectId=${projectId}&full=true`);
    if (!response.ok) {
      console.warn('[RefLayers] Failed to fetch layers:', response.status);
      return { layerCount: 0 };
    }

    const data = await response.json();
    const layers = data.layers || [];

    setReferenceLayers(layers);
    loadRefLayerSettings();
    loadSectionSettings();
    F.renderRefLayerToggles();
    updateLayersPanel();
    F.scheduleDraw();

    // Cache in localStorage
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        layers
      }));
    } catch (_) { /* localStorage may be full */ }

    console.debug(`[RefLayers] Loaded ${layers.length} layers from server for project ${projectId}`);
    return { layerCount: layers.length };
  } catch (err) {
    console.warn('[RefLayers] Error loading reference layers:', err.message);
    return { layerCount: 0 };
  }
}

export function deleteFromLibrary(sketchId) {
  const lib = getLibrary();
  const filtered = lib.filter((r) => r.id !== sketchId);
  setLibrary(filtered);
  if (S.currentSketchId === sketchId) {
    S.currentSketchId = null;
  }
  // Remove from IndexedDB
  idbDeleteRecordCompat(sketchId);
  // Remove from cloud if sync service is available
  if (window.syncService?.deleteSketchEverywhere) {
    window.syncService.deleteSketchEverywhere(sketchId).catch(err => console.error('[Sync] Failed to delete sketch everywhere:', err.message));
  }
}

export function migrateSingleSketchToLibraryIfNeeded() {
  const lib = getLibrary();
  if (lib.length > 0) return; // already migrated or has sketches
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sketch);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.nodes || !parsed.edges) return;
    const id = parsed.sketchId || generateSketchId();
    const nowIso = new Date().toISOString();
    const record = {
      id,
      createdAt: parsed.creationDate || nowIso,
      updatedAt: nowIso,
      nodes: parsed.nodes,
      edges: parsed.edges,
      nextNodeId: parsed.nextNodeId || 1,
      creationDate: parsed.creationDate || nowIso,
      name: parsed.sketchName || null,
    };
    setLibrary([record]);
    S.currentSketchId = id;
    F.saveToStorage();
    // Also populate IndexedDB with the migrated record
    idbSaveRecordCompat(record);
  } catch (e) {
    console.warn('[App] Migration skipped', e.message);
  }
}

// Sync status UI elements (queried lazily to avoid DOM-not-ready issues)
const _getSyncStatusBar = () => document.getElementById('syncStatusBar');
const _getSyncStatusText = () => document.getElementById('syncStatusText');
const _getSyncStatusIcon = () => _getSyncStatusBar()?.querySelector('.sync-icon');
const _getHeaderSyncEl = () => document.getElementById('headerSyncIndicator');
const _getHeaderSyncIcon = () => _getHeaderSyncEl()?.querySelector('.header-sync-indicator__icon');

// Update sync status UI — both the home-panel bar AND the header indicator
export function updateSyncStatusUI(state) {
  const authState = window.authGuard?.getAuthState?.() || {};
  const signedIn = authState.isSignedIn;

  const headerSyncEl = _getHeaderSyncEl();
  const headerSyncIcon = _getHeaderSyncIcon();

  // ── Header indicator (always visible when signed in) ──
  if (headerSyncEl) {
    if (!signedIn) {
      headerSyncEl.style.display = 'none';
    } else {
      headerSyncEl.style.display = '';
      // Reset classes
      headerSyncEl.classList.remove(
        'header-sync-indicator--syncing',
        'header-sync-indicator--synced',
        'header-sync-indicator--offline',
        'header-sync-indicator--error',
      );

      if (!state.isOnline) {
        headerSyncEl.classList.add('header-sync-indicator--offline');
        if (headerSyncIcon) headerSyncIcon.textContent = 'cloud_off';
        headerSyncEl.title = t('auth.offline');
      } else if (state.isSyncing) {
        headerSyncEl.classList.add('header-sync-indicator--syncing');
        if (headerSyncIcon) headerSyncIcon.textContent = 'sync';
        headerSyncEl.title = t('auth.syncing');
      } else if (state.error) {
        headerSyncEl.classList.add('header-sync-indicator--error');
        if (headerSyncIcon) headerSyncIcon.textContent = 'cloud_off';
        // Show descriptive error message based on HTTP status code
        const code = state.errorStatusCode;
        if (code === 401) {
          headerSyncEl.title = t('errors.sessionExpired');
        } else if (code === 429) {
          headerSyncEl.title = t('errors.rateLimited');
        } else if (code >= 500) {
          headerSyncEl.title = t('errors.serverError');
        } else {
          headerSyncEl.title = t('auth.syncError');
        }
      } else {
        headerSyncEl.classList.add('header-sync-indicator--synced');
        if (headerSyncIcon) headerSyncIcon.textContent = 'cloud_done';
        const hdrPending = state.pendingChanges || 0;
        if (hdrPending > 0) {
          headerSyncEl.title = t('auth.pendingChanges', hdrPending);
        } else {
          headerSyncEl.title = state.lastSyncTime
            ? t('auth.lastSynced', formatTimeAgo(state.lastSyncTime))
            : t('auth.synced');
        }
      }
    }
  }

  // ── Home-panel status bar (only visible when home panel is open) ──
  const syncStatusBar = _getSyncStatusBar();
  const syncStatusText = _getSyncStatusText();
  const syncStatusIcon = _getSyncStatusIcon();

  if (!syncStatusBar) return;

  if (!signedIn) {
    syncStatusBar.style.display = 'none';
    return;
  }

  syncStatusBar.style.display = 'flex';

  // Remove all state classes
  syncStatusBar.classList.remove('syncing', 'offline', 'error');
  if (syncStatusIcon) syncStatusIcon.classList.remove('spin');

  if (!state.isOnline) {
    syncStatusBar.classList.add('offline');
    if (syncStatusIcon) syncStatusIcon.textContent = 'cloud_off';
    if (syncStatusText) {
      const pending = state.pendingChanges || 0;
      syncStatusText.textContent = pending > 0
        ? t('auth.offlinePending', pending)
        : t('auth.offline');
    }
  } else if (state.isSyncing) {
    syncStatusBar.classList.add('syncing');
    if (syncStatusIcon) {
      syncStatusIcon.textContent = 'sync';
      syncStatusIcon.classList.add('spin');
    }
    if (syncStatusText) syncStatusText.textContent = t('auth.syncing');
  } else if (state.error) {
    syncStatusBar.classList.add('error');
    if (syncStatusIcon) syncStatusIcon.textContent = 'cloud_off';
    // Show descriptive error message based on HTTP status code
    if (syncStatusText) {
      const code = state.errorStatusCode;
      let errMsg;
      if (code === 401) {
        errMsg = t('errors.sessionExpired');
      } else if (code === 429) {
        errMsg = t('errors.rateLimited');
      } else if (code >= 500) {
        errMsg = t('errors.serverError');
      } else {
        errMsg = t('auth.syncError');
      }
      const pending = state.pendingChanges || 0;
      syncStatusText.textContent = pending > 0
        ? `${errMsg} — ${t('auth.pendingChanges', pending)}`
        : errMsg;
    }
  } else {
    if (syncStatusIcon) syncStatusIcon.textContent = 'cloud_done';
    const pending = state.pendingChanges || 0;
    if (pending > 0) {
      if (syncStatusText) syncStatusText.textContent = t('auth.pendingChanges', pending);
    } else if (state.lastSyncTime) {
      const timeAgo = formatTimeAgo(state.lastSyncTime);
      if (syncStatusText) syncStatusText.textContent = t('auth.lastSynced', timeAgo);
    } else {
      if (syncStatusText) syncStatusText.textContent = t('auth.synced');
    }
  }
}

// Format time ago string
export function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('timeAgo.justNow');
  if (mins < 60) return t('timeAgo.minutesAgo', mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('timeAgo.hoursAgo', hours);
  return new Date(date).toLocaleDateString(S.currentLang === 'he' ? 'he-IL' : 'en-GB');
}

// Internal helper — wraps getAuthUsername with a fallback
function _getCurrentUsername() {
  try {
    const username = getAuthUsername();
    return username || 'anonymous';
  } catch (_) {
    return 'anonymous';
  }
}
