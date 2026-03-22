/**
 * field-history.js
 *
 * Extracted Field History Tracking System from src/legacy/main.js.
 *
 * Tracks user field value selections to provide smart sorting in dropdowns.
 * Reads shared state through the S proxy and calls cross-module functions
 * through the F registry.
 */

import { S, F } from './shared-state.js';
import { STORAGE_KEYS } from '../state/persistence.js';
import { getLibrary } from './library-manager.js';

const FIELD_HISTORY_KEY = STORAGE_KEYS.fieldHistory;

// Load field history from localStorage
export function loadFieldHistory() {
  try {
    const raw = localStorage.getItem(FIELD_HISTORY_KEY);
    if (!raw) return { nodes: {}, edges: {} };
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[App] Failed to load field history', e.message);
    return { nodes: {}, edges: {} };
  }
}

// Save field history to localStorage
export function saveFieldHistory(history) {
  try {
    localStorage.setItem(FIELD_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn('[App] Failed to save field history', e.message);
  }
}

// Map pipe diameter (mm) to a color on a blue→cyan→green→yellow→red gradient.
// Returns null when no diameter is set so the caller falls back to edge-type color.
export function diameterToColor(lineDiameter) {
  const d = parseFloat(lineDiameter);
  if (!(d > 0)) return null;
  // Normalize 0–2000 mm to 0–1
  const t = Math.min(d, 2000) / 2000;
  // Five-stop gradient: blue(0) → cyan(0.25) → green(0.5) → yellow(0.75) → red(1)
  let r, g, b;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 0; g = Math.round(180 * s); b = Math.round(220 - 40 * s);
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = 0; g = Math.round(180 + 20 * s); b = Math.round(180 - 180 * s);
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(230 * s); g = 200; b = 0;
  } else {
    const s = (t - 0.75) / 0.25;
    r = 230; g = Math.round(200 - 200 * s); b = 0;
  }
  return `rgb(${r},${g},${b})`;
}

// Track a field value selection - increment usage count
export function trackFieldUsage(scope, fieldName, value) {
  if (value === null || value === undefined || value === '') return;
  const history = loadFieldHistory();
  if (!history[scope]) history[scope] = {};
  if (!history[scope][fieldName]) history[scope][fieldName] = {};
  const key = String(value);
  history[scope][fieldName][key] = (history[scope][fieldName][key] || 0) + 1;
  saveFieldHistory(history);
}

// Get sorted options based on usage history
// Returns options sorted by: most used first, then original order for unused
export function getSortedOptions(scope, fieldName, originalOptions) {
  const history = loadFieldHistory();
  const fieldHistory = history[scope]?.[fieldName] || {};

  // Create a map of value -> usage count
  const usageMap = new Map();
  for (const [key, count] of Object.entries(fieldHistory)) {
    usageMap.set(key, count);
  }

  // Sort options: first by usage count (descending), then by original order
  const sorted = [...originalOptions].sort((a, b) => {
    const aKey = a.code !== undefined ? String(a.code) : (a.label !== undefined ? a.label : String(a));
    const bKey = b.code !== undefined ? String(b.code) : (b.label !== undefined ? b.label : String(b));
    const aCount = usageMap.get(aKey) || 0;
    const bCount = usageMap.get(bKey) || 0;
    if (aCount !== bCount) return bCount - aCount; // Higher count first
    return 0; // Keep original order for equal counts
  });

  return sorted;
}

// Import field history from a specific sketch
export function importFieldHistoryFromSketch(sketchRec) {
  if (!sketchRec || !sketchRec.nodes) return 0;
  const history = loadFieldHistory();
  let imported = 0;

  // Process nodes from the sketch
  (sketchRec.nodes || []).forEach(node => {
    if (node.material && node.material !== 'לא ידוע') {
      if (!history.nodes) history.nodes = {};
      if (!history.nodes.material) history.nodes.material = {};
      history.nodes.material[node.material] = (history.nodes.material[node.material] || 0) + 1;
      imported++;
    }
    if (node.access !== undefined && node.access !== 0) {
      if (!history.nodes.access) history.nodes.access = {};
      history.nodes.access[String(node.access)] = (history.nodes.access[String(node.access)] || 0) + 1;
      imported++;
    }
    if (node.maintenanceStatus !== undefined && node.maintenanceStatus !== 0) {
      if (!history.nodes.maintenance_status) history.nodes.maintenance_status = {};
      history.nodes.maintenance_status[String(node.maintenanceStatus)] = (history.nodes.maintenance_status[String(node.maintenanceStatus)] || 0) + 1;
      imported++;
    }
    if (node.coverDiameter !== undefined && node.coverDiameter !== '') {
      if (!history.nodes.cover_diameter) history.nodes.cover_diameter = {};
      history.nodes.cover_diameter[String(node.coverDiameter)] = (history.nodes.cover_diameter[String(node.coverDiameter)] || 0) + 1;
      imported++;
    }
  });

  // Process edges from the sketch
  (sketchRec.edges || []).forEach(edge => {
    if (!history.edges) history.edges = {};
    if (edge.material && edge.material !== 'לא ידוע') {
      if (!history.edges.material) history.edges.material = {};
      history.edges.material[edge.material] = (history.edges.material[edge.material] || 0) + 1;
      imported++;
    }
    if (edge.line_diameter !== undefined && edge.line_diameter !== '') {
      if (!history.edges.line_diameter) history.edges.line_diameter = {};
      history.edges.line_diameter[String(edge.line_diameter)] = (history.edges.line_diameter[String(edge.line_diameter)] || 0) + 1;
      imported++;
    }
    if (edge.edge_type) {
      if (!history.edges.edge_type) history.edges.edge_type = {};
      history.edges.edge_type[edge.edge_type] = (history.edges.edge_type[edge.edge_type] || 0) + 1;
      imported++;
    }
    if (edge.engineeringStatus !== undefined && edge.engineeringStatus !== 0) {
      if (!history.edges.engineering_status) history.edges.engineering_status = {};
      history.edges.engineering_status[String(edge.engineeringStatus)] = (history.edges.engineering_status[String(edge.engineeringStatus)] || 0) + 1;
      imported++;
    }
    if (edge.fall_position !== undefined && edge.fall_position !== '') {
      if (!history.edges.fall_position) history.edges.fall_position = {};
      history.edges.fall_position[String(edge.fall_position)] = (history.edges.fall_position[String(edge.fall_position)] || 0) + 1;
      imported++;
    }
  });

  saveFieldHistory(history);
  return imported;
}

// Get library sketches for history import
export function getSketchesForHistoryImport() {
  return getLibrary();
}

// Format sketch display name - use name if available, otherwise format creation date
export function formatSketchDisplayName(rec) {
  if (rec.name && rec.name.trim()) {
    return rec.name;
  }
  // Format creation date as display name
  try {
    const date = new Date(rec.createdAt || rec.creationDate);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString(S.currentLang === 'he' ? 'he-IL' : 'en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  } catch (e) {}
  // Fallback to shortened ID
  return rec.id ? rec.id.replace('sk_', '#') : 'Sketch';
}
