// Persistence helpers that bridge IndexedDB data into localStorage for legacy code paths
// and provide thin wrappers used by legacy main.js during the migration to modules.

import { loadCurrentSketch, getAllSketches, saveCurrentSketch, saveSketch, deleteSketch } from '../db.js';

/** Canonical localStorage key names used throughout the app. */
export const STORAGE_KEYS = {
  sketch: 'graphSketch',
  library: 'graphSketch.library',
  autosave: 'graphSketch.autosave',
  sizeScale: 'graphSketch.sizeScale',
  lang: 'graphSketch.lang',
  adminConfig: 'graphSketch.adminConfig.v1',
  fieldHistory: 'graphSketch.fieldHistory',
  coordinateScale: 'graphSketch.coordinateScale.v1',
  viewStretch: 'graphSketch.viewStretch.v1',
  tsc3WsAddress: 'graphSketch.tsc3.wsAddress',
};

export async function restoreFromIndexedDbIfNeeded() {
  try {
    const [current, library] = await Promise.all([
      loadCurrentSketch().catch(() => null),
      getAllSketches().catch(() => []),
    ]);

    try {
      if (!localStorage.getItem(STORAGE_KEYS.sketch) && current) {
        localStorage.setItem(STORAGE_KEYS.sketch, JSON.stringify(current));
      }
    } catch (_) {}

    try {
      const existing = localStorage.getItem(STORAGE_KEYS.library);
      const hasExisting = existing && existing.length > 2;
      if (!hasExisting && Array.isArray(library) && library.length > 0) {
        localStorage.setItem(STORAGE_KEYS.library, JSON.stringify(library));
      }
    } catch (_) {}
  } catch (err) {
    console.warn('[State] restoreFromIndexedDbIfNeeded failed', err.message);
  }
}

// Back-compat thin wrappers to be used by legacy code while we migrate call sites.
export function idbSaveCurrentCompat(sketch) {
  try { saveCurrentSketch(sketch); } catch (_) {}
}

export function idbSaveRecordCompat(record) {
  try { saveSketch(record); } catch (_) {}
}

export function idbDeleteRecordCompat(id) {
  try { deleteSketch(id); } catch (_) {}
}


