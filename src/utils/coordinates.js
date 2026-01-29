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
 * Transform survey coordinates to world/canvas coordinates
 * Survey coordinates (ITM) typically have Y increasing northward, but canvas has Y increasing downward
 * 
 * This uses a FIXED SCALE (pixels per meter) for consistent node spacing,
 * rather than fitting to canvas size. The user can pan/zoom to navigate.
 * 
 * @param {number} surveyX - X coordinate from survey (ITM easting)
 * @param {number} surveyY - Y coordinate from survey (ITM northing)
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} bounds - Coordinate bounds
 * @param {number} canvasWidth - Target canvas width (used for centering)
 * @param {number} canvasHeight - Target canvas height (used for centering)
 * @param {Object} options - Transformation options
 * @param {number} options.pixelsPerMeter - Scale factor (default: 3 pixels per meter)
 * @returns {{x: number, y: number}} - World coordinates
 */
export function surveyToCanvas(surveyX, surveyY, bounds, canvasWidth, canvasHeight, options = {}) {
  // Handle edge cases for canvas dimensions
  if (!canvasWidth || canvasWidth <= 0) canvasWidth = 800;
  if (!canvasHeight || canvasHeight <= 0) canvasHeight = 600;
  
  // Default scale: 3 pixels per meter gives good spacing for typical networks
  // This means a 100m distance in survey = 300 pixels on screen
  const pixelsPerMeter = options.pixelsPerMeter || 3;
  
  // Calculate survey extent
  const surveyWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const surveyHeight = Math.max(bounds.maxY - bounds.minY, 1);
  
  // Calculate center of survey coordinates
  const surveyCenterX = (bounds.minX + bounds.maxX) / 2;
  const surveyCenterY = (bounds.minY + bounds.maxY) / 2;
  
  // Canvas center (where we want the survey center to appear)
  const canvasCenterX = canvasWidth / 2;
  const canvasCenterY = canvasHeight / 2;
  
  // Transform: offset from survey center, scaled, then positioned at canvas center
  // X: east is right (same direction as canvas X)
  const canvasX = canvasCenterX + (surveyX - surveyCenterX) * pixelsPerMeter;
  
  // Y: north is up in survey, but down is positive in canvas, so we flip
  const canvasY = canvasCenterY - (surveyY - surveyCenterY) * pixelsPerMeter;
  
  return { x: canvasX, y: canvasY };
}

/**
 * Calculate optimal pixels-per-meter scale based on survey extent and canvas size
 * Ensures the network fills a reasonable portion of the visible area
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} bounds
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} fillRatio - How much of the canvas to fill (0.0-1.0, default 0.7)
 * @returns {number} - Recommended pixels per meter
 */
export function calculateOptimalScale(bounds, canvasWidth, canvasHeight, fillRatio = 0.7) {
  const surveyWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const surveyHeight = Math.max(bounds.maxY - bounds.minY, 1);
  
  const targetWidth = canvasWidth * fillRatio;
  const targetHeight = canvasHeight * fillRatio;
  
  // Calculate scale that would fit the survey in the target area
  const scaleX = targetWidth / surveyWidth;
  const scaleY = targetHeight / surveyHeight;
  
  // Use the smaller scale to preserve aspect ratio
  let scale = Math.min(scaleX, scaleY);
  
  // Clamp scale to reasonable range
  // Min: 1 pixel/meter (zoomed out, 1km = 1000px)
  // Max: 20 pixels/meter (zoomed in, 10m = 200px)
  scale = Math.max(1, Math.min(20, scale));
  
  return scale;
}

/**
 * Position nodes without coordinates based on their connected neighbors
 * Uses a simple averaging approach: place unpositioned nodes at the centroid of their neighbors
 * @param {Array} nodes - Array of node objects (some with hasCoordinates: true)
 * @param {Array} edges - Array of edge objects with tail and head properties
 * @returns {Array} - Updated nodes array with approximated positions for uncoordinated nodes
 */
export function approximateUncoordinatedNodePositions(nodes, edges) {
  // Build adjacency map: nodeId -> list of connected nodeIds
  const adjacency = new Map();
  
  nodes.forEach(node => {
    adjacency.set(String(node.id), []);
  });
  
  edges.forEach(edge => {
    const tail = String(edge.tail);
    const head = String(edge.head);
    if (adjacency.has(tail) && head) {
      adjacency.get(tail).push(head);
    }
    if (adjacency.has(head) && tail) {
      adjacency.get(head).push(tail);
    }
  });
  
  // Create a map for quick node lookup
  const nodeMap = new Map();
  nodes.forEach(node => {
    nodeMap.set(String(node.id), node);
  });
  
  // Identify nodes that need positioning (no coordinates)
  const unpositionedNodes = nodes.filter(n => !n.hasCoordinates);
  const positionedNodes = nodes.filter(n => n.hasCoordinates);
  
  if (positionedNodes.length === 0 || unpositionedNodes.length === 0) {
    return nodes; // Nothing to do
  }
  
  console.log(`Approximating positions for ${unpositionedNodes.length} nodes without coordinates`);
  
  // Calculate centroid of positioned nodes as fallback
  const centroid = {
    x: positionedNodes.reduce((sum, n) => sum + n.x, 0) / positionedNodes.length,
    y: positionedNodes.reduce((sum, n) => sum + n.y, 0) / positionedNodes.length
  };
  
  // Multiple passes to propagate positions from neighbors
  const maxIterations = 5;
  let updated = true;
  let iteration = 0;
  
  while (updated && iteration < maxIterations) {
    updated = false;
    iteration++;
    
    unpositionedNodes.forEach(node => {
      if (node._positionApproximated) return; // Already positioned
      
      const neighbors = adjacency.get(String(node.id)) || [];
      const positionedNeighbors = neighbors
        .map(nid => nodeMap.get(nid))
        .filter(n => n && (n.hasCoordinates || n._positionApproximated));
      
      if (positionedNeighbors.length > 0) {
        // Position at centroid of positioned neighbors with small offset
        const avgX = positionedNeighbors.reduce((sum, n) => sum + n.x, 0) / positionedNeighbors.length;
        const avgY = positionedNeighbors.reduce((sum, n) => sum + n.y, 0) / positionedNeighbors.length;
        
        // Add small random offset to prevent exact overlap
        const offset = 30;
        node.x = avgX + (Math.random() - 0.5) * offset;
        node.y = avgY + (Math.random() - 0.5) * offset;
        node._positionApproximated = true;
        updated = true;
      }
    });
  }
  
  // Position any remaining unpositioned nodes at centroid
  unpositionedNodes.forEach(node => {
    if (!node._positionApproximated) {
      node.x = centroid.x + (Math.random() - 0.5) * 50;
      node.y = centroid.y + (Math.random() - 0.5) * 50;
      node._positionApproximated = true;
    }
  });
  
  // Clean up temporary flags
  nodes.forEach(node => {
    delete node._positionApproximated;
  });
  
  return nodes;
}

/**
 * Apply coordinates to nodes array
 * Transforms ITM survey coordinates to canvas positions while preserving spatial relationships
 * @param {Array} nodes - Array of node objects
 * @param {Map<string, {x: number, y: number, z: number}>} coordinatesMap
 * @param {number} canvasWidth - Canvas width for transformation
 * @param {number} canvasHeight - Canvas height for transformation
 * @returns {{updatedNodes: Array, matchedCount: number, unmatchedCount: number, bounds: object}}
 */
export function applyCoordinatesToNodes(nodes, coordinatesMap, canvasWidth = 800, canvasHeight = 600) {
  if (!coordinatesMap || coordinatesMap.size === 0) {
    return { updatedNodes: nodes, matchedCount: 0, unmatchedCount: nodes.length, bounds: null };
  }
  
  // Ensure valid canvas dimensions
  if (!canvasWidth || canvasWidth <= 0) canvasWidth = 800;
  if (!canvasHeight || canvasHeight <= 0) canvasHeight = 600;
  
  // First, find which nodes have matching coordinates
  const matchedNodeCoords = [];
  nodes.forEach(node => {
    const nodeId = String(node.id);
    const coords = coordinatesMap.get(nodeId);
    if (coords) {
      matchedNodeCoords.push({ nodeId, coords });
    }
  });
  
  console.log('=== COORDINATE APPLICATION DEBUG ===');
  console.log(`Found ${matchedNodeCoords.length} nodes with matching coordinates`);
  
  // If no matches, return early
  if (matchedNodeCoords.length === 0) {
    console.log('No coordinate matches found!');
    return { 
      updatedNodes: nodes.map(n => ({ ...n, hasCoordinates: false })), 
      matchedCount: 0, 
      unmatchedCount: nodes.length, 
      bounds: null 
    };
  }
  
  // Calculate bounds ONLY from matched node coordinates (not all coordinates in map)
  // This ensures we use the actual extent of the nodes we're placing
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  matchedNodeCoords.forEach(({ coords }) => {
    minX = Math.min(minX, coords.x);
    maxX = Math.max(maxX, coords.x);
    minY = Math.min(minY, coords.y);
    maxY = Math.max(maxY, coords.y);
  });
  
  const bounds = { minX, maxX, minY, maxY };
  const surveyWidth = maxX - minX;
  const surveyHeight = maxY - minY;
  
  // Log bounds for debugging
  console.log('Matched coordinate bounds:', bounds);
  console.log('Survey extent (meters):', { width: surveyWidth, height: surveyHeight });
  console.log('Canvas dimensions (pixels):', { width: canvasWidth, height: canvasHeight });
  
  // Warn if extent is very small (less than 1 meter)
  if (surveyWidth < 1 || surveyHeight < 1) {
    console.warn('⚠️ WARNING: Coordinate extent is very small! All points may cluster together.');
    console.warn('This could mean all your coordinates are nearly identical.');
  }
  
  // Calculate optimal scale for this network
  const pixelsPerMeter = calculateOptimalScale(bounds, canvasWidth, canvasHeight, 0.8);
  console.log('Calculated scale:', pixelsPerMeter.toFixed(2), 'pixels/meter');
  
  // Log sample coordinates
  console.log('Sample matched coordinates:');
  matchedNodeCoords.slice(0, 5).forEach(({ nodeId, coords }) => {
    console.log(`  Node ${nodeId}: ITM(${coords.x.toFixed(2)}, ${coords.y.toFixed(2)})`);
  });
  
  let matchedCount = 0;
  let unmatchedCount = 0;
  
  const updatedNodes = nodes.map(node => {
    const nodeId = String(node.id);
    const coords = coordinatesMap.get(nodeId);
    
    if (coords) {
      const canvasCoords = surveyToCanvas(coords.x, coords.y, bounds, canvasWidth, canvasHeight, { pixelsPerMeter });
      matchedCount++;
      
      // Log first few transformations
      if (matchedCount <= 3) {
        console.log(`Transform node ${nodeId}: ITM(${coords.x.toFixed(2)}, ${coords.y.toFixed(2)}) -> Canvas(${canvasCoords.x.toFixed(2)}, ${canvasCoords.y.toFixed(2)})`);
      }
      
      // Validate the computed coordinates
      if (!Number.isFinite(canvasCoords.x) || !Number.isFinite(canvasCoords.y)) {
        console.warn(`Invalid canvas coordinates for node ${nodeId}:`, canvasCoords);
        return {
          ...node,
          hasCoordinates: true,
          surveyX: coords.x,
          surveyY: coords.y,
          surveyZ: coords.z
          // Keep original x, y positions
        };
      }
      
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
  
  // Log final position spread
  const matchedNodes = updatedNodes.filter(n => n.hasCoordinates);
  if (matchedNodes.length > 0) {
    const xs = matchedNodes.map(n => n.x);
    const ys = matchedNodes.map(n => n.y);
    console.log('Canvas position spread:', {
      xMin: Math.min(...xs).toFixed(2),
      xMax: Math.max(...xs).toFixed(2),
      xRange: (Math.max(...xs) - Math.min(...xs)).toFixed(2),
      yMin: Math.min(...ys).toFixed(2),
      yMax: Math.max(...ys).toFixed(2),
      yRange: (Math.max(...ys) - Math.min(...ys)).toFixed(2)
    });
  }
  
  console.log(`Applied coordinates: ${matchedCount} matched, ${unmatchedCount} unmatched`);
  console.log('=== END COORDINATE DEBUG ===');
  
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
