// Coordinate utilities for importing and managing survey coordinates
// CSV format: point_id, x, y, z

/**
 * Parse a coordinates CSV file
 * Expected format: point_id,x,y,z (with optional header row)
 * @param {string} csvContent - Raw CSV content
 * @returns {Map<string, {x: number, y: number, z: number}>} - Map of point_id to coordinates
 */
export function parseCoordinatesCsv(csvContent) {
  const coordinates = new Map();
  
  if (!csvContent || typeof csvContent !== 'string') {
    return coordinates;
  }
  
  // Split into lines and filter empty lines
  const lines = csvContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (lines.length === 0) {
    return coordinates;
  }
  
  // Check if first line is a header (contains non-numeric values in coordinate columns)
  const firstLine = lines[0];
  const firstFields = parseCSVLine(firstLine);
  const isHeader = firstFields.length >= 4 && 
    (isNaN(parseFloat(firstFields[1])) || isNaN(parseFloat(firstFields[2])));
  
  const startIndex = isHeader ? 1 : 0;
  
  for (let i = startIndex; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    
    if (fields.length >= 4) {
      const pointId = String(fields[0]).trim();
      const x = parseFloat(fields[1]);
      const y = parseFloat(fields[2]);
      const z = parseFloat(fields[3]);
      
      // Only add if we have valid coordinates
      if (pointId && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
        coordinates.set(pointId, { x, y, z });
      }
    }
  }
  
  return coordinates;
}

/**
 * Parse a single CSV line handling quoted values
 * @param {string} line - CSV line
 * @returns {string[]} - Array of field values
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  fields.push(current.trim());
  return fields;
}

/**
 * Import coordinates from a file
 * @param {File} file - The CSV file to import
 * @returns {Promise<Map<string, {x: number, y: number, z: number}>>}
 */
export function importCoordinatesFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const coordinates = parseCoordinatesCsv(content);
        resolve(coordinates);
      } catch (error) {
        reject(new Error(`Failed to parse coordinates: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read coordinates file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Create a coordinate lookup helper
 * @param {Map<string, {x: number, y: number, z: number}>} coordinatesMap
 * @returns {Object} Helper object with lookup functions
 */
export function createCoordinateLookup(coordinatesMap) {
  return {
    /**
     * Check if a node has coordinates available
     * @param {string|number} nodeId
     * @returns {boolean}
     */
    hasCoordinates(nodeId) {
      return coordinatesMap.has(String(nodeId));
    },
    
    /**
     * Get coordinates for a node
     * @param {string|number} nodeId
     * @returns {{x: number, y: number, z: number}|null}
     */
    getCoordinates(nodeId) {
      return coordinatesMap.get(String(nodeId)) || null;
    },
    
    /**
     * Get all coordinate entries
     * @returns {Array<[string, {x: number, y: number, z: number}]>}
     */
    getAllEntries() {
      return Array.from(coordinatesMap.entries());
    },
    
    /**
     * Get count of coordinates
     * @returns {number}
     */
    count() {
      return coordinatesMap.size;
    }
  };
}

/**
 * Calculate bounds for coordinate transformation
 * Given survey coordinates, calculate min/max bounds
 * @param {Map<string, {x: number, y: number, z: number}>} coordinatesMap
 * @returns {{minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number}}
 */
export function calculateCoordinateBounds(coordinatesMap) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (const coords of coordinatesMap.values()) {
    minX = Math.min(minX, coords.x);
    maxX = Math.max(maxX, coords.x);
    minY = Math.min(minY, coords.y);
    maxY = Math.max(maxY, coords.y);
    minZ = Math.min(minZ, coords.z);
    maxZ = Math.max(maxZ, coords.z);
  }
  
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Transform survey coordinates to canvas coordinates
 * Survey coordinates typically have Y increasing northward, but canvas has Y increasing downward
 * @param {number} surveyX - X coordinate from survey
 * @param {number} surveyY - Y coordinate from survey
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} bounds - Coordinate bounds
 * @param {number} canvasWidth - Target canvas width
 * @param {number} canvasHeight - Target canvas height
 * @param {number} padding - Padding from edges (default 50)
 * @returns {{x: number, y: number}} - Canvas coordinates
 */
export function surveyToCanvas(surveyX, surveyY, bounds, canvasWidth, canvasHeight, padding = 50) {
  const surveyWidth = bounds.maxX - bounds.minX || 1;
  const surveyHeight = bounds.maxY - bounds.minY || 1;
  
  const availableWidth = canvasWidth - 2 * padding;
  const availableHeight = canvasHeight - 2 * padding;
  
  // Use aspect-ratio preserving scale
  const scale = Math.min(
    availableWidth / surveyWidth,
    availableHeight / surveyHeight
  );
  
  // Normalize to 0-1 range
  const normalizedX = (surveyX - bounds.minX) / surveyWidth;
  const normalizedY = (surveyY - bounds.minY) / surveyHeight;
  
  // Transform to canvas coordinates
  // Center the drawing
  const scaledWidth = surveyWidth * scale;
  const scaledHeight = surveyHeight * scale;
  const offsetX = (canvasWidth - scaledWidth) / 2;
  const offsetY = (canvasHeight - scaledHeight) / 2;
  
  return {
    x: offsetX + normalizedX * scaledWidth,
    // Flip Y axis: survey Y up -> canvas Y down
    y: canvasHeight - (offsetY + normalizedY * scaledHeight)
  };
}

/**
 * Apply coordinates to nodes array
 * @param {Array} nodes - Array of node objects
 * @param {Map<string, {x: number, y: number, z: number}>} coordinatesMap
 * @param {number} canvasWidth - Canvas width for transformation
 * @param {number} canvasHeight - Canvas height for transformation
 * @returns {{updatedNodes: Array, matchedCount: number, unmatchedCount: number}}
 */
export function applyCoordinatesToNodes(nodes, coordinatesMap, canvasWidth = 800, canvasHeight = 600) {
  if (!coordinatesMap || coordinatesMap.size === 0) {
    return { updatedNodes: nodes, matchedCount: 0, unmatchedCount: nodes.length };
  }
  
  // Calculate bounds from all coordinates
  const bounds = calculateCoordinateBounds(coordinatesMap);
  
  let matchedCount = 0;
  let unmatchedCount = 0;
  
  const updatedNodes = nodes.map(node => {
    const nodeId = String(node.id);
    const coords = coordinatesMap.get(nodeId);
    
    if (coords) {
      const canvasCoords = surveyToCanvas(coords.x, coords.y, bounds, canvasWidth, canvasHeight);
      matchedCount++;
      return {
        ...node,
        x: canvasCoords.x,
        y: canvasCoords.y,
        surveyX: coords.x,
        surveyY: coords.y,
        surveyZ: coords.z,
        hasCoordinates: true
      };
    } else {
      unmatchedCount++;
      return {
        ...node,
        hasCoordinates: false
      };
    }
  });
  
  return { updatedNodes, matchedCount, unmatchedCount, bounds };
}

/**
 * Storage key for coordinates
 */
export const COORDINATES_STORAGE_KEY = 'graphSketch.coordinates.v1';
export const COORDINATES_ENABLED_KEY = 'graphSketch.coordinatesEnabled.v1';

/**
 * Save coordinates to localStorage
 * @param {Map<string, {x: number, y: number, z: number}>} coordinatesMap
 */
export function saveCoordinatesToStorage(coordinatesMap) {
  try {
    const data = Array.from(coordinatesMap.entries());
    localStorage.setItem(COORDINATES_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save coordinates to storage', e);
  }
}

/**
 * Load coordinates from localStorage
 * @returns {Map<string, {x: number, y: number, z: number}>}
 */
export function loadCoordinatesFromStorage() {
  try {
    const raw = localStorage.getItem(COORDINATES_STORAGE_KEY);
    if (!raw) return new Map();
    const data = JSON.parse(raw);
    return new Map(data);
  } catch (e) {
    console.warn('Failed to load coordinates from storage', e);
    return new Map();
  }
}

/**
 * Save coordinates enabled state
 * @param {boolean} enabled
 */
export function saveCoordinatesEnabled(enabled) {
  try {
    localStorage.setItem(COORDINATES_ENABLED_KEY, JSON.stringify(enabled));
  } catch (e) {
    console.warn('Failed to save coordinates enabled state', e);
  }
}

/**
 * Load coordinates enabled state
 * @returns {boolean}
 */
export function loadCoordinatesEnabled() {
  try {
    const raw = localStorage.getItem(COORDINATES_ENABLED_KEY);
    if (!raw) return false;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load coordinates enabled state', e);
    return false;
  }
}
