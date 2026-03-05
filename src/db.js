/*
 * Lightweight IndexedDB wrapper for the Graph Sketcher PWA.
 *
 * This module provides a simple promise‑based API around the browser's
 * IndexedDB API. It manages a small set of object stores used by the app:
 *   - `sketches`: holds persistent sketch records (id, metadata, nodes, edges).
 *   - `currentSketch`: holds a single key/value pair representing the
 *     currently edited sketch. This replaces the previous use of
 *     localStorage['graphSketch'] for autosave.
 *   - `syncQueue`: an optional queue of operations that need to be synced
 *     to a backend when online. Currently unused, but created for future
 *     extensibility.
 *
 * The database schema is versioned. When bumping DB_VERSION you must add
 * appropriate upgrade logic inside `openDb()`'s `onupgradeneeded` handler.
 */

const DB_NAME = 'graphSketchDB';
const DB_VERSION = 2; // Version 2: Added backups store

// Cached IDBDatabase handle — reused across calls to avoid leaking connections.
// Each openDb() previously created a new handle that was never closed, leading to
// unbounded connection growth over long field sessions.
let _cachedDb = null;

/**
 * Open the IndexedDB database and upgrade schema if necessary.
 * Returns a cached connection when available to prevent connection leaks.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function openDb() {
  // Return the cached handle if it is still usable
  if (_cachedDb) {
    try {
      // Accessing objectStoreNames throws if the db was force-closed
      if (_cachedDb.objectStoreNames.length >= 0) {
        return Promise.resolve(_cachedDb);
      }
    } catch {
      _cachedDb = null;
    }
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = /** @type {IDBDatabase} */ (event.target.result);
      // Create object store for persistent sketches if it doesn't exist
      if (!db.objectStoreNames.contains('sketches')) {
        db.createObjectStore('sketches', { keyPath: 'id' });
      }
      // Create object store for the current unsaved sketch
      if (!db.objectStoreNames.contains('currentSketch')) {
        db.createObjectStore('currentSketch', { keyPath: 'key' });
      }
      // Create a syncQueue for future background sync operations
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { autoIncrement: true });
      }
      // Create backups store for 3-hour automatic backups and daily backups
      if (!db.objectStoreNames.contains('backups')) {
        const backupsStore = db.createObjectStore('backups', { keyPath: 'id' });
        backupsStore.createIndex('type', 'type', { unique: false });
        backupsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // If another tab triggers a version upgrade, close gracefully and
      // invalidate the cache so the next call opens a fresh connection.
      db.onversionchange = () => {
        db.close();
        _cachedDb = null;
      };
      _cachedDb = db;
      resolve(db);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Save the currently edited sketch into the dedicated currentSketch store.
 *
 * @param {object|null} sketch A plain object representing the sketch to save. If null, the entry is removed.
 * @returns {Promise<void>}
 */
export async function saveCurrentSketch(sketch) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('currentSketch', 'readwrite');
    const store = tx.objectStore('currentSketch');
    if (sketch == null) {
      store.delete('current');
    } else {
      store.put({ key: 'current', value: sketch });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load the currently edited sketch from the database.
 *
 * @returns {Promise<object|null>} The stored sketch or null if not present.
 */
export async function loadCurrentSketch() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('currentSketch', 'readonly');
    const store = tx.objectStore('currentSketch');
    const req = store.get('current');
    req.onsuccess = () => {
      resolve(req.result ? req.result.value : null);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist or update a sketch in the library. If the sketch id already exists,
 * it will be replaced; otherwise a new record is added. The sketch object
 * should include an `id` property to serve as the primary key.
 *
 * @param {object} sketch
 * @returns {Promise<void>}
 */
export async function saveSketch(sketch) {
  if (!sketch || !sketch.id) throw new Error('saveSketch requires a sketch with an id');
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sketches', 'readwrite');
    tx.objectStore('sketches').put(sketch);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve all sketches from the library.
 *
 * @returns {Promise<any[]>}
 */
export async function getAllSketches() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sketches', 'readonly');
    const store = tx.objectStore('sketches');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve a single sketch by id.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getSketch(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sketches', 'readonly');
    const store = tx.objectStore('sketches');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a sketch from the library.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteSketch(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sketches', 'readwrite');
    tx.objectStore('sketches').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Queue a sync operation for later processing. Accepts any plain object.
 *
 * Currently unused but implemented for future background sync support. The
 * service worker can consume this queue and attempt to POST the operations
 * when connectivity returns.
 *
 * @param {any} op
 * @returns {Promise<void>}
 */
export async function enqueueSyncOperation(op) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    tx.objectStore('syncQueue').add(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve and clear all queued sync operations. The array is returned in
 * insertion order. Callers should attempt to process these operations and
 * re‑enqueue on failure.
 *
 * @returns {Promise<any[]>}
 */
export async function drainSyncQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.getAll();
    req.onsuccess = () => {
      store.clear();
      resolve(req.result || []);
    };
    req.onerror = () => reject(req.error);
  });
}

// ============================================
// Backup Functions
// ============================================

/**
 * Save a backup of the current sketch.
 * @param {object} backup - Backup object with id, type ('hourly'|'daily'), timestamp, sketchData
 * @returns {Promise<void>}
 */
export async function saveBackup(backup) {
  if (!backup || !backup.id) throw new Error('saveBackup requires a backup with an id');
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('backups', 'readwrite');
    tx.objectStore('backups').put(backup);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all backups, optionally filtered by type.
 * @param {string} [type] - Optional filter: 'hourly' or 'daily'
 * @returns {Promise<any[]>}
 */
export async function getBackups(type = null) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('backups', 'readonly');
    const store = tx.objectStore('backups');
    let req;
    if (type) {
      const index = store.index('type');
      req = index.getAll(type);
    } else {
      req = store.getAll();
    }
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a specific backup by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteBackup(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('backups', 'readwrite');
    tx.objectStore('backups').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all backups of a specific type.
 * @param {string} type - 'hourly' or 'daily'
 * @returns {Promise<number>} Number of backups deleted
 */
export async function clearBackupsByType(type) {
  const backups = await getBackups(type);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('backups', 'readwrite');
    const store = tx.objectStore('backups');
    let deletedCount = 0;
    for (const backup of backups) {
      store.delete(backup.id);
      deletedCount++;
    }
    tx.oncomplete = () => resolve(deletedCount);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all backups (both hourly and daily).
 * @returns {Promise<void>}
 */
export async function clearAllBackups() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('backups', 'readwrite');
    tx.objectStore('backups').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}