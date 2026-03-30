/**
 * import-legacy-sketch.js
 * 
 * Converts old manholes-mapper sketch + CSV coordinates into a single
 * new-format sketch.json that can be imported into the dev version.
 * 
 * Strategy for nodes WITHOUT coordinates:
 *   1. Mark them as schematic (accuracyLevel = 1)
 *   2. Approximate canvas position using edge graph topology:
 *      - Find a positioned neighbor (one with ITM coords)
 *      - Preserve the angle from original sketch layout
 *      - Scale distance using the ratio between ITM-world and old-sketch distances
 *      - Multi-pass BFS so chains of schematic nodes propagate outward
 * 
 * Usage: node scripts/import-legacy-sketch.js <sketch.json> <coords.csv> [output.json]
 */

const fs = require('fs');
const path = require('path');

// ── Parse CLI args ───────────────────────────────────────────────────────────
const sketchFile = process.argv[2] || path.join(__dirname, '..', 'data', 'old-sketch.json');
const cordsFile = process.argv[3] || path.join(__dirname, '..', 'data', 'old-cords.csv');
const outputFile = process.argv[4] || path.join(__dirname, '..', 'data', 'imported-sketch.json');

// ── Parse CSV ────────────────────────────────────────────────────────────────
function parseCoordsCSV(csvContent) {
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

// ── surveyToCanvas (same logic as coordinates.js) ────────────────────────────
function surveyToCanvas(surveyX, surveyY, bounds, canvasW, canvasH, pxPerMeter) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    x: canvasW / 2 + (surveyX - cx) * pxPerMeter,
    y: canvasH / 2 - (surveyY - cy) * pxPerMeter   // Y flipped
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  // 1. Load files
  const sketchData = JSON.parse(fs.readFileSync(sketchFile, 'utf8'));
  const csvContent = fs.readFileSync(cordsFile, 'utf8');
  const coordsMap = parseCoordsCSV(csvContent);

  const oldSketch = sketchData.sketch;
  const oldNodes = oldSketch.nodes;
  const oldEdges = oldSketch.edges;

  console.log(`Old sketch: ${oldNodes.length} nodes, ${oldEdges.length} edges`);
  console.log(`CSV coordinates: ${coordsMap.size} entries`);

  // 2. Match nodes → coordinates (case-insensitive lookup)
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
  console.log(`Matched: ${matched.length} nodes, Unmatched (schematic): ${unmatched.length} nodes`);

  // 3. Calculate ITM bounds from matched nodes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { coords } of matched) {
    if (coords.x < minX) minX = coords.x;
    if (coords.x > maxX) maxX = coords.x;
    if (coords.y < minY) minY = coords.y;
    if (coords.y > maxY) maxY = coords.y;
  }
  const bounds = { minX, maxX, minY, maxY };
  console.log(`ITM bounds: X [${minX.toFixed(1)} - ${maxX.toFixed(1)}], Y [${minY.toFixed(1)} - ${maxY.toFixed(1)}]`);

  // 4. Calculate scale: use the app's optimal scale (fits 80% of canvas)
  const canvasW = 1200, canvasH = 900;
  const surveyW = Math.max(maxX - minX, 1);
  const surveyH = Math.max(maxY - minY, 1);
  let pxPerMeter = Math.min((canvasW * 0.8) / surveyW, (canvasH * 0.8) / surveyH);
  pxPerMeter = Math.max(100, Math.min(200, pxPerMeter));
  console.log(`Scale: ${pxPerMeter.toFixed(1)} px/m`);

  // 5. Save original positions for angle/distance calculation, then position matched nodes
  const originalPos = new Map();
  for (const node of oldNodes) {
    originalPos.set(String(node.id), { x: node.x, y: node.y });
  }

  const nodeMap = new Map();
  const newNodes = [];

  for (const { node, coords } of matched) {
    const canvas = surveyToCanvas(coords.x, coords.y, bounds, canvasW, canvasH, pxPerMeter);
    const n = buildNewNode(node, canvas.x, canvas.y, {
      surveyX: coords.x,
      surveyY: coords.y,
      surveyZ: coords.z,
      hasCoordinates: true,
      accuracyLevel: 0, // Engineering
      gnssFixQuality: 4, // RTK Fixed (from survey file)
    });
    newNodes.push(n);
    nodeMap.set(String(n.id), n);
  }

  for (const node of unmatched) {
    const n = buildNewNode(node, 0, 0, {
      hasCoordinates: false,
      accuracyLevel: 1, // Schematic
      gnssFixQuality: 6, // Manual float
    });
    newNodes.push(n);
    nodeMap.set(String(n.id), n);
  }

  // 6. Approximate schematic node positions (same algorithm as coordinates.js)
  approximateSchematicPositions(newNodes, oldEdges, originalPos, nodeMap);

  // 7. Build new edges
  const newEdges = oldEdges.map(e => buildNewEdge(e));

  // 8. Assemble output sketch
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

  // 9. Write output
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(outputSketch, null, 2), 'utf8');
  console.log(`\n✅ Written to ${outputFile}`);
  console.log(`   ${newNodes.length} nodes (${matched.length} surveyed + ${unmatched.length} schematic)`);
  console.log(`   ${newEdges.length} edges`);
}

// ── Build a new-format node ──────────────────────────────────────────────────
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

// ── Build a new-format edge ──────────────────────────────────────────────────
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

// ── Approximate schematic positions (BFS propagation) ────────────────────────
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
  console.log(`Scale factor for schematic placement: ${avgScale.toFixed(4)} (from ${scaleFactors.length} edges)`);

  // Multi-pass BFS
  const positioned = new Set(nodes.filter(n => n.hasCoordinates).map(n => n.id));
  const MAX_ITER = 15;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let changed = false;
    for (const node of nodes) {
      if (positioned.has(node.id)) continue;

      const neighbors = adj.get(node.id) || [];
      // Find a positioned neighbor
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
        console.warn(`  ⚠ Node ${node.id} has no connected positioned neighbor — placed at centroid`);
      }
    }
  }

  const schematicCount = nodes.filter(n => !n.hasCoordinates).length;
  const placedByPropagation = nodes.filter(n => !n.hasCoordinates && positioned.has(n.id)).length;
  console.log(`Schematic placement: ${placedByPropagation}/${schematicCount} placed via neighbor propagation`);
}

main();
