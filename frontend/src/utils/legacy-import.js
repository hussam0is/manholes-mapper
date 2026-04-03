/**
 * legacy-import.js
 * 
 * Browser-compatible version of the legacy sketch import functionality.
 * Converts old manholes-mapper sketch + CSV coordinates into the new format.
 * 
 * This module runs entirely in the browser - no Node.js dependencies.
 */

/**
 * Parse CSV content containing node coordinates
 * @param {string} csvContent - Raw CSV content
 * @returns {Map<string, {x: number, y: number, z: number|null}>} - Map of node IDs to coordinates
 */
export function parseCoordsCSV(csvContent) {
  const coords = new Map();
  const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  
  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 3) continue;
    
    const id = parts[0];
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parts.length >= 4 && parts[3] !== '' ? parseFloat(parts[3]) : null;
    
    if (id && !isNaN(x) && !isNaN(y)) {
      coords.set(id, { x, y, z });
    }
  }
  return coords;
}

/**
 * Convert survey coordinates to canvas coordinates
 */
function surveyToCanvas(surveyX, surveyY, bounds, canvasW, canvasH, pxPerMeter) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    x: canvasW / 2 + (surveyX - cx) * pxPerMeter,
    y: canvasH / 2 - (surveyY - cy) * pxPerMeter  // Y flipped
  };
}

/**
 * Build a new-format node from old node data
 */
function buildNewNode(old, x, y, overrides = {}) {
  return {
    id: String(old.id),
    x,
    y,
    note: old.note || '',
    material: old.material || 'לא ידוע',
    coverDiameter: old.coverDiameter || '',
    type: old.type || 'type1',
    nodeType: old.nodeType || 'Manhole',
    access: old.access ?? 0,
    accuracyLevel: overrides.accuracyLevel ?? (old.accuracyLevel ?? 0),
    nodeEngineeringStatus: old.nodeEngineeringStatus ?? 0,
    maintenanceStatus: old.maintenanceStatus ?? 0,
    directConnection: old.directConnection ?? undefined,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Build a new-format edge from old edge data
 */
function buildNewEdge(old) {
  return {
    id: Date.now() + Math.random(),
    tail: String(old.tail),
    head: old.head ? String(old.head) : null,
    tail_measurement: old.tail_measurement || '',
    head_measurement: old.head_measurement || '',
    fall_depth: old.fall_depth || '',
    fall_position: old.fall_position ?? 0,
    line_diameter: old.line_diameter || '',
    edge_type: old.edge_type || 'קו ראשי',
    material: old.material || 'פי. וי. סי. לפי ת',
    maintenanceStatus: old.maintenanceStatus ?? 0,
    engineeringStatus: old.engineeringStatus ?? 0,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Approximate schematic node positions using BFS propagation
 */
function approximateSchematicPositions(nodes, edges, originalPos, nodeMap) {
  // Build adjacency
  const adj = new Map();
  for (const n of nodes) adj.set(String(n.id), []);
  for (const e of edges) {
    const t = String(e.tail), h = e.head ? String(e.head) : null;
    if (h && adj.has(t)) adj.get(t).push(h);
    if (h && adj.has(h)) adj.get(h).push(t);
  }

  // Calculate average scale factor from edges between two surveyed nodes
  const scaleFactors = [];
  for (const e of edges) {
    const tn = nodeMap.get(String(e.tail));
    const hn = e.head ? nodeMap.get(String(e.head)) : null;
    if (!tn || !hn || !tn.hasCoordinates || !hn.hasCoordinates) continue;

    const oldT = originalPos.get(tn.id), oldH = originalPos.get(hn.id);
    if (!oldT || !oldH) continue;

    const oldDist = Math.hypot(oldH.x - oldT.x, oldH.y - oldT.y);
    const newDist = Math.hypot(hn.x - tn.x, hn.y - tn.y);
    if (oldDist > 1) scaleFactors.push(newDist / oldDist);
  }
  
  const avgScale = scaleFactors.length > 0
    ? scaleFactors.reduce((a, b) => a + b, 0) / scaleFactors.length
    : 1;

  // Multi-pass BFS
  const positioned = new Set(nodes.filter(n => n.hasCoordinates).map(n => n.id));
  const MAX_ITER = 15;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let changed = false;
    for (const node of nodes) {
      if (positioned.has(node.id)) continue;

      const neighbors = adj.get(node.id) || [];
      const anchor = neighbors.map(nid => nodeMap.get(nid)).find(n => n && positioned.has(n.id));
      if (!anchor) continue;

      const nodeOrig = originalPos.get(node.id);
      const anchorOrig = originalPos.get(anchor.id);
      if (!nodeOrig || !anchorOrig) continue;

      const dx = nodeOrig.x - anchorOrig.x;
      const dy = nodeOrig.y - anchorOrig.y;
      const angle = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy) * avgScale;

      node.x = anchor.x + Math.cos(angle) * dist;
      node.y = anchor.y + Math.sin(angle) * dist;
      positioned.add(node.id);
      changed = true;
    }
    if (!changed) break;
  }

  // Fallback: anything still unpositioned → centroid
  const posNodes = nodes.filter(n => positioned.has(n.id));
  if (posNodes.length > 0) {
    const cx = posNodes.reduce((s, n) => s + n.x, 0) / posNodes.length;
    const cy = posNodes.reduce((s, n) => s + n.y, 0) / posNodes.length;
    for (const node of nodes) {
      if (!positioned.has(node.id)) {
        node.x = cx + (Math.random() - 0.5) * 50;
        node.y = cy + (Math.random() - 0.5) * 50;
        console.warn(`[LegacyImport] Node ${node.id} has no connected positioned neighbor — placed at centroid`);
      }
    }
  }
}

/**
 * Import a legacy sketch with CSV coordinates
 * @param {Object} sketchData - Old sketch JSON
 * @param {string} csvContent - CSV coordinate data
 * @returns {Object} - New format sketch
 */
export function importLegacySketch(sketchData, csvContent) {
  const coordsMap = parseCoordsCSV(csvContent);
  const oldSketch = sketchData.sketch || sketchData;
  const oldNodes = oldSketch.nodes || [];
  const oldEdges = oldSketch.edges || [];

  console.log(`[LegacyImport] Old sketch: ${oldNodes.length} nodes, ${oldEdges.length} edges`);
  console.log(`[LegacyImport] CSV coordinates: ${coordsMap.size} entries`);

  // Match nodes → coordinates (case-insensitive lookup)
  const coordsLower = new Map();
  for (const [k, v] of coordsMap) coordsLower.set(k.toLowerCase(), v);

  const matched = [];
  const unmatched = [];
  
  for (const node of oldNodes) {
    const id = String(node.id);
    const coords = coordsMap.get(id) || coordsLower.get(id.toLowerCase());
    if (coords) {
      matched.push({ node, coords });
    } else {
      unmatched.push(node);
    }
  }
  
  console.log(`[LegacyImport] Matched: ${matched.length} nodes, Unmatched (schematic): ${unmatched.length} nodes`);

  // Calculate ITM bounds from matched nodes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { coords } of matched) {
    if (coords.x < minX) minX = coords.x;
    if (coords.x > maxX) maxX = coords.x;
    if (coords.y < minY) minY = coords.y;
    if (coords.y > maxY) maxY = coords.y;
  }
  
  // Handle case where no coordinates matched
  if (minX === Infinity) {
    minX = maxX = minY = maxY = 0;
  }
  
  const bounds = { minX, maxX, minY, maxY };
  console.log(`[LegacyImport] ITM bounds: X [${minX.toFixed(1)} - ${maxX.toFixed(1)}], Y [${minY.toFixed(1)} - ${maxY.toFixed(1)}]`);

  // Calculate scale
  const canvasW = 1200, canvasH = 900;
  const surveyW = Math.max(maxX - minX, 1);
  const surveyH = Math.max(maxY - minY, 1);
  let pxPerMeter = Math.min((canvasW * 0.8) / surveyW, (canvasH * 0.8) / surveyH);
  pxPerMeter = Math.max(100, Math.min(200, pxPerMeter));
  console.log(`[LegacyImport] Scale: ${pxPerMeter.toFixed(1)} px/m`);

  // Save original positions for angle/distance calculation
  const originalPos = new Map();
  for (const node of oldNodes) {
    originalPos.set(String(node.id), { x: node.x, y: node.y });
  }

  const nodeMap = new Map();
  const newNodes = [];

  // Create positioned nodes (with coordinates)
  for (const { node, coords } of matched) {
    const canvas = surveyToCanvas(coords.x, coords.y, bounds, canvasW, canvasH, pxPerMeter);
    const n = buildNewNode(node, canvas.x, canvas.y, {
      surveyX: coords.x,
      surveyY: coords.y,
      surveyZ: coords.z,
      hasCoordinates: true,
      accuracyLevel: 0, // Engineering
      gnssFixQuality: 4, // RTK Fixed
    });
    newNodes.push(n);
    nodeMap.set(String(n.id), n);
  }

  // Create schematic nodes (without coordinates)
  for (const node of unmatched) {
    const n = buildNewNode(node, 0, 0, {
      hasCoordinates: false,
      accuracyLevel: 1, // Schematic
      gnssFixQuality: 6, // Manual float
    });
    newNodes.push(n);
    nodeMap.set(String(n.id), n);
  }

  // Approximate schematic node positions
  approximateSchematicPositions(newNodes, oldEdges, originalPos, nodeMap);

  // Build new edges
  const newEdges = oldEdges.map(e => buildNewEdge(e));

  // Assemble output sketch
  const outputSketch = {
    version: '1.1',
    exportDate: new Date().toISOString(),
    sketch: {
      id: null, // will get new ID on import
      name: 'Legacy Import — ' + (oldSketch.creationDate || 'unknown'),
      creationDate: oldSketch.creationDate || new Date().toISOString().slice(0, 10),
      nextNodeId: oldSketch.nextNodeId || 85,
      projectId: null,
      inputFlowConfig: null,
      nodes: newNodes,
      edges: newEdges,
    }
  };

  console.log(`[LegacyImport] Complete: ${newNodes.length} nodes (${matched.length} surveyed + ${unmatched.length} schematic), ${newEdges.length} edges`);
  
  return outputSketch;
}

/**
 * Read a file as text
 * @param {File} file - Browser File object
 * @returns {Promise<string>} - File contents
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Read a file as JSON
 * @param {File} file - Browser File object
 * @returns {Promise<Object>} - Parsed JSON
 */
export async function readFileAsJson(file) {
  const text = await readFileAsText(file);
  return JSON.parse(text);
}
