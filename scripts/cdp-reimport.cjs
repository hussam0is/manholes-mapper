/**
 * Re-import with corrected scaling.
 * The previous import used 100px/m which spread nodes over ~42K pixels.
 * The app's fit-to-screen doesn't handle that well.
 * 
 * New approach: use a scale that puts the network in a ~2000x2000 px area.
 * Survey extent: ~212m x 235m → use ~8 px/m → ~1700x1880 px
 */

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

// Re-read and reprocess the sketch with better scaling
const sketchData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'old-sketch.json'), 'utf8'));
const csvContent = fs.readFileSync(path.join(__dirname, '..', 'data', 'old-cords.csv'), 'utf8');

// Parse CSV
const coordsMap = new Map();
for (const line of csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l)) {
  const parts = line.split(',').map(p => p.trim());
  if (parts.length < 3) continue;
  const x = parseFloat(parts[1]), y = parseFloat(parts[2]), z = parts[3] ? parseFloat(parts[3]) : null;
  if (!isNaN(x) && !isNaN(y)) coordsMap.set(parts[0], { x, y, z });
}

const oldNodes = sketchData.sketch.nodes;
const oldEdges = sketchData.sketch.edges;

// Match nodes to coords
const matched = [], unmatched = [];
const coordsLower = new Map();
for (const [k, v] of coordsMap) coordsLower.set(k.toLowerCase(), v);

for (const node of oldNodes) {
  const id = String(node.id);
  const coords = coordsMap.get(id) || coordsLower.get(id.toLowerCase());
  if (coords) matched.push({ node, coords });
  else unmatched.push(node);
}

// ITM bounds from matched
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const { coords } of matched) {
  if (coords.x < minX) minX = coords.x;
  if (coords.x > maxX) maxX = coords.x;
  if (coords.y < minY) minY = coords.y;
  if (coords.y > maxY) maxY = coords.y;
}
const bounds = { minX, maxX, minY, maxY };
const surveyW = maxX - minX; // ~212m
const surveyH = maxY - minY; // ~235m
console.log(`Survey extent: ${surveyW.toFixed(1)}m x ${surveyH.toFixed(1)}m`);

// Use 8 px/m → fits in ~1700x1880 area, centered at (1000, 1000)
const PX_PER_M = 8;
const canvasW = 2000, canvasH = 2000;

function surveyToCanvas(sx, sy) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    x: canvasW / 2 + (sx - cx) * PX_PER_M,
    y: canvasH / 2 - (sy - cy) * PX_PER_M
  };
}

// Save original positions
const originalPos = new Map();
for (const node of oldNodes) originalPos.set(String(node.id), { x: node.x, y: node.y });

// Build new nodes
const nodeMap = new Map();
const newNodes = [];

for (const { node, coords } of matched) {
  const pos = surveyToCanvas(coords.x, coords.y);
  const n = {
    id: String(node.id),
    x: pos.x, y: pos.y,
    note: node.note || '',
    material: node.material || 'לא ידוע',
    coverDiameter: node.coverDiameter || '',
    type: node.type || 'type1',
    nodeType: node.nodeType || 'Manhole',
    access: node.access ?? 0,
    accuracyLevel: 0,
    nodeEngineeringStatus: node.nodeEngineeringStatus ?? 0,
    maintenanceStatus: node.maintenanceStatus ?? 0,
    hasCoordinates: true,
    surveyX: coords.x, surveyY: coords.y, surveyZ: coords.z,
    gnssFixQuality: 4,
    createdAt: new Date().toISOString(),
  };
  if (node.directConnection !== undefined) n.directConnection = node.directConnection;
  newNodes.push(n);
  nodeMap.set(n.id, n);
}

for (const node of unmatched) {
  const n = {
    id: String(node.id),
    x: 0, y: 0,
    note: node.note || '',
    material: node.material || 'לא ידוע',
    coverDiameter: node.coverDiameter || '',
    type: node.type || 'type1',
    nodeType: node.nodeType || 'Manhole',
    access: node.access ?? 0,
    accuracyLevel: 1, // Schematic
    nodeEngineeringStatus: node.nodeEngineeringStatus ?? 0,
    maintenanceStatus: node.maintenanceStatus ?? 0,
    hasCoordinates: false,
    gnssFixQuality: 6,
    createdAt: new Date().toISOString(),
  };
  if (node.directConnection !== undefined) n.directConnection = node.directConnection;
  newNodes.push(n);
  nodeMap.set(n.id, n);
}

// Approximate schematic positions
const adj = new Map();
for (const n of newNodes) adj.set(n.id, []);
for (const e of oldEdges) {
  const t = String(e.tail), h = e.head ? String(e.head) : null;
  if (h && adj.has(t)) adj.get(t).push(h);
  if (h && adj.has(h)) adj.get(h).push(t);
}

// Scale factor
const scaleFactors = [];
for (const e of oldEdges) {
  const tn = nodeMap.get(String(e.tail)), hn = e.head ? nodeMap.get(String(e.head)) : null;
  if (!tn || !hn || !tn.hasCoordinates || !hn.hasCoordinates) continue;
  const oT = originalPos.get(tn.id), oH = originalPos.get(hn.id);
  if (!oT || !oH) continue;
  const oldD = Math.hypot(oH.x - oT.x, oH.y - oT.y);
  const newD = Math.hypot(hn.x - tn.x, hn.y - tn.y);
  if (oldD > 1) scaleFactors.push(newD / oldD);
}
const avgScale = scaleFactors.length > 0 ? scaleFactors.reduce((a, b) => a + b) / scaleFactors.length : 1;
console.log(`Scale factor: ${avgScale.toFixed(4)} from ${scaleFactors.length} edges`);

// BFS propagation
const positioned = new Set(newNodes.filter(n => n.hasCoordinates).map(n => n.id));
for (let iter = 0; iter < 15; iter++) {
  let changed = false;
  for (const node of newNodes) {
    if (positioned.has(node.id)) continue;
    const anchor = (adj.get(node.id) || []).map(id => nodeMap.get(id)).find(n => n && positioned.has(n.id));
    if (!anchor) continue;
    const nO = originalPos.get(node.id), aO = originalPos.get(anchor.id);
    if (!nO || !aO) continue;
    const dx = nO.x - aO.x, dy = nO.y - aO.y;
    const angle = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy) * avgScale;
    node.x = anchor.x + Math.cos(angle) * dist;
    node.y = anchor.y + Math.sin(angle) * dist;
    positioned.add(node.id);
    changed = true;
  }
  if (!changed) break;
}

// Orphans → centroid
const posNodes = newNodes.filter(n => positioned.has(n.id));
const cx = posNodes.reduce((s, n) => s + n.x, 0) / posNodes.length;
const cy = posNodes.reduce((s, n) => s + n.y, 0) / posNodes.length;
for (const n of newNodes) {
  if (!positioned.has(n.id)) {
    n.x = cx + (Math.random() - 0.5) * 50;
    n.y = cy + (Math.random() - 0.5) * 50;
  }
}

const xs = newNodes.map(n => n.x);
const ys = newNodes.map(n => n.y);
console.log(`X range: [${Math.min(...xs).toFixed(0)}, ${Math.max(...xs).toFixed(0)}]`);
console.log(`Y range: [${Math.min(...ys).toFixed(0)}, ${Math.max(...ys).toFixed(0)}]`);

// Build edges
const newEdges = oldEdges.map(e => ({
  id: Date.now() + Math.random(),
  tail: String(e.tail),
  head: e.head ? String(e.head) : null,
  tail_measurement: e.tail_measurement || '',
  head_measurement: e.head_measurement || '',
  fall_depth: e.fall_depth || '',
  fall_position: e.fall_position ?? 0,
  line_diameter: e.line_diameter || '',
  edge_type: e.edge_type || 'קו ראשי',
  material: e.material || 'פי. וי. סי. לפי ת',
  maintenanceStatus: e.maintenanceStatus ?? 0,
  engineeringStatus: e.engineeringStatus ?? 0,
  createdAt: new Date().toISOString(),
}));

const outputSketch = {
  version: '1.1',
  exportDate: new Date().toISOString(),
  sketch: {
    id: null,
    name: 'Legacy Import — ' + (sketchData.sketch.creationDate || 'unknown'),
    creationDate: sketchData.sketch.creationDate || new Date().toISOString().slice(0, 10),
    nextNodeId: sketchData.sketch.nextNodeId || 85,
    nodes: newNodes,
    edges: newEdges,
  }
};

// Save updated file
const outPath = path.join(__dirname, '..', 'data', 'imported-sketch.json');
fs.writeFileSync(outPath, JSON.stringify(outputSketch, null, 2));
console.log(`Written ${outPath}: ${newNodes.length} nodes, ${newEdges.length} edges`);

// Now inject via CDP
(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  const sketchJson = JSON.stringify(outputSketch);
  await Runtime.evaluate({ expression: `window.__importSketchData = ${sketchJson};` });

  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        const data = window.__importSketchData;
        const sketch = data.sketch;
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('graphSketchDB', 2);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const sketchId = 'sk_' + Math.random().toString(36).substr(2, 14);
        await new Promise((res, rej) => {
          const tx = db.transaction('currentSketch', 'readwrite');
          tx.objectStore('currentSketch').put({
            key: 'current', sketchId, sketchName: sketch.name,
            creationDate: sketch.creationDate, nextNodeId: sketch.nextNodeId,
            nodes: sketch.nodes, edges: sketch.edges, adminConfig: {},
            lastSaved: new Date().toISOString()
          });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        await new Promise((res, rej) => {
          const tx = db.transaction('sketches', 'readwrite');
          tx.objectStore('sketches').put({
            id: sketchId, name: sketch.name,
            creation_date: sketch.creationDate,
            nodes: sketch.nodes, edges: sketch.edges, admin_config: {},
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            version: 0, node_count: sketch.nodes.length, edge_count: sketch.edges.length
          });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        delete window.__importSketchData;
        return 'OK: ' + sketchId + ' | ' + sketch.nodes.length + ' nodes';
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 15000
  });
  console.log('Import:', result.value);

  await Page.reload();
  await new Promise(r => setTimeout(r, 4000));

  // Fit to screen
  await Runtime.evaluate({
    expression: `
      (function() {
        const btns = [...document.querySelectorAll('button')];
        for (const btn of btns) {
          if (btn.textContent.includes('fit_screen')) { btn.click(); return 'fitted'; }
        }
        return 'no fit btn';
      })()
    `,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1500));

  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-reimport.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  await client.close();
})().catch(e => console.log('CDP err:', e.message));
