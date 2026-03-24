/**
 * Backup Manager for Manholes Mapper
 * 
 * Provides automatic 3-hour backups and daily backup functionality.
 * Backups are stored in IndexedDB and can be cleared on "Finish Work Day".
 */

import { saveBackup, getBackups, clearBackupsByType, deleteBackup } from '../db.js';

// Backup interval: 3 hours in milliseconds
const BACKUP_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

// Timer reference for auto-backup
let backupIntervalId = null;

// Track if backup manager is initialized
let isInitialized = false;

// Function to get current sketch data (set during initialization)
let getSketchDataFn = null;

/**
 * Generate a unique backup ID
 * @param {string} type - 'hourly' or 'daily'
 * @returns {string}
 */
function generateBackupId(type) {
  return `backup_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a backup of the current sketch
 * @param {string} type - 'hourly' or 'daily'
 * @returns {Promise<object|null>} The created backup or null if no data to backup
 */
export async function createBackup(type = 'hourly') {
  if (!getSketchDataFn) {
    console.warn('[Backup] Not initialized — no sketch data function provided');
    return null;
  }

  try {
    const sketchData = getSketchDataFn();
    
    if (!sketchData || (!sketchData.nodes?.length && !sketchData.edges?.length)) {
      console.debug('[Backup] No sketch data to backup');
      return null;
    }

    const backup = {
      id: generateBackupId(type),
      type: type,
      timestamp: new Date().toISOString(),
      sketchId: sketchData.sketchId || null,
      sketchName: sketchData.sketchName || null,
      sketchData: {
        nodes: sketchData.nodes || [],
        edges: sketchData.edges || [],
        creationDate: sketchData.creationDate || null,
        nextNodeId: sketchData.nextNodeId || 1,
        createdBy: sketchData.createdBy || null,
        lastEditedBy: sketchData.lastEditedBy || null,
      }
    };

    await saveBackup(backup);
    console.debug(`[Backup] Created ${type} backup:`, backup.id);
    
    // Notify listeners
    notifyBackupCreated(backup);
    
    return backup;
  } catch (error) {
    console.error('[Backup] Failed to create backup:', error.message);
    return null;
  }
}

/**
 * Start the automatic 3-hour backup timer
 */
export function startAutoBackup() {
  if (backupIntervalId) {
    console.debug('[Backup] Auto-backup already running');
    return;
  }

  console.debug('[Backup] Starting auto-backup (every 3 hours)');
  
  // Create initial backup after a short delay (5 seconds) to allow app to fully load
  setTimeout(() => {
    createBackup('hourly').catch(err => console.error('[Backup] Initial backup failed:', err.message));
  }, 5000);

  // Set up the 3-hour interval
  backupIntervalId = setInterval(() => {
    createBackup('hourly').catch(err => console.error('[Backup] Auto-backup failed:', err.message));
  }, BACKUP_INTERVAL_MS);
}

/**
 * Stop the automatic backup timer
 */
export function stopAutoBackup() {
  if (backupIntervalId) {
    clearInterval(backupIntervalId);
    backupIntervalId = null;
    console.debug('[Backup] Auto-backup stopped');
  }
}

/**
 * Get all hourly backups
 * @returns {Promise<any[]>}
 */
export async function getHourlyBackups() {
  return getBackups('hourly');
}

/**
 * Get all daily backups
 * @returns {Promise<any[]>}
 */
export async function getDailyBackups() {
  return getBackups('daily');
}

/**
 * Get all backups (both hourly and daily)
 * @returns {Promise<any[]>}
 */
export async function getAllBackups() {
  return getBackups();
}

/**
 * Clear all hourly backups (called on "Finish Work Day")
 * @returns {Promise<number>} Number of backups cleared
 */
export async function clearHourlyBackups() {
  const count = await clearBackupsByType('hourly');
  console.debug(`[Backup] Cleared ${count} hourly backups`);
  return count;
}

/**
 * Save a daily backup (called on "Finish Work Day")
 * This creates a permanent backup that persists after clearing hourly backups.
 * @returns {Promise<object|null>}
 */
export async function saveDailyBackup() {
  return createBackup('daily');
}

/**
 * Delete a specific backup
 * @param {string} backupId
 * @returns {Promise<void>}
 */
export async function removeBackup(backupId) {
  await deleteBackup(backupId);
  console.debug('[Backup] Deleted backup:', backupId);
}

/**
 * Get the most recent backup of any type
 * @returns {Promise<object|null>}
 */
export async function getMostRecentBackup() {
  const allBackups = await getAllBackups();
  if (allBackups.length === 0) return null;
  
  // Sort by timestamp descending and return the first one
  allBackups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return allBackups[0];
}

// ============================================
// Backup Event Listeners
// ============================================

const backupListeners = new Set();

/**
 * Subscribe to backup creation events
 * @param {Function} callback - Called with backup object when a backup is created
 * @returns {Function} Unsubscribe function
 */
export function onBackupCreated(callback) {
  backupListeners.add(callback);
  return () => backupListeners.delete(callback);
}

/**
 * Notify all listeners that a backup was created
 * @param {object} backup
 */
function notifyBackupCreated(backup) {
  backupListeners.forEach(cb => {
    try { cb(backup); } catch (e) { console.warn('[Backup] Listener error:', e); }
  });
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize the backup manager
 * @param {Function} getSketchData - Function that returns current sketch data
 */
export function initBackupManager(getSketchData) {
  if (isInitialized) {
    console.debug('[Backup] Already initialized');
    return;
  }

  getSketchDataFn = getSketchData;
  isInitialized = true;
  
  // Start auto-backup
  startAutoBackup();
  
  console.debug('[Backup] Initialized');
}

/**
 * Cleanup the backup manager (call on app shutdown)
 */
export function cleanupBackupManager() {
  stopAutoBackup();
  getSketchDataFn = null;
  isInitialized = false;
  backupListeners.clear();
  console.debug('[Backup] Cleaned up');
}

// Export for global access
if (typeof window !== 'undefined') {
  window.backupManager = {
    initBackupManager,
    cleanupBackupManager,
    createBackup,
    startAutoBackup,
    stopAutoBackup,
    getHourlyBackups,
    getDailyBackups,
    getAllBackups,
    clearHourlyBackups,
    saveDailyBackup,
    removeBackup,
    getMostRecentBackup,
    onBackupCreated,
  };
}
