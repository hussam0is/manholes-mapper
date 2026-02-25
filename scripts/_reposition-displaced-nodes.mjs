/**
 * Reposition displaced nodes in all DB sketches.
 *
 * "Displaced" = a node that was created without survey coordinates,
 * so its canvas x/y was inherited from another sketch that happened to
 * share the same node ID (all sketches use sequential IDs starting at 1).
 *
 * Strategy:
 * - "Anchor" nodes  = nodes appearing in the sketch's OWN-DATE cords file
 *                     (cords_<sketch-date>.csv) → trustworthy x/y
 * - "Displaced" nodes = all other nodes → wrong x/y, clear surveyX/Y and reposition
 *
 * Repositioning:
 * - BFS outward from all anchor nodes through the edge graph
 * - Each displaced node is placed at PLACEMENT_RADIUS canvas units from its BFS parent
 * - Chains of consecutive displaced nodes cascade: each 7m from the previous
 * - Multiple displaced siblings of the same parent fan out at 45° increments
 * - After placement, surveyX/Y for displaced nodes is null (yellow ! in issues panel)
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

config({ path: '.env.local' });
const sql = neon(process.env.POSTGRES_URL);

const dataDir = 'C:/Users/murjan.a/Desktop/App Data';
const ITM_E_MIN = 230000, ITM_E_MAX = 270000;
const PLACEMENT_RADIUS_M = 7;

// ── Load all cords files ──────────────────────────────────────────────────────
const cordsByDate = new Map(); // date → Set<nodeId>
for (const file of readdirSync(dataDir).filter(f => f.startsWith('cords_') && f.endsWith('.csv')).sort()) {
  const date = file.replace('cords_', '').replace('.csv', '');
  const ids = new Set();
  for (const line of readFileSync(join(dataDir, file), 'utf-8').trim().split('\n')) {
    const p = line.split(',');
    if (p.length < 3) continue;
    const id = p[0].trim();
    if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
    const e = parseFloat(p[1]);
    if (!isFinite(e) || e < ITM_E_MIN || e > ITM_E_MAX) continue;
    ids.add(id);
  }
  if (ids.size > 0) cordsByDate.set(date, ids);
}
console.log(`Loaded cords for ${cordsByDate.size} dates\n`);

// ── Derive ITM→canvas transform from a set of anchor nodes ───────────────────
// Returns { m_x, c_x, m_y, c_y } such that:
//   canvas_x = m_x * surveyX + c_x
//   canvas_y = m_y * surveyY + c_y
function deriveTransform(anchors) {
  const n = anchors.length;
  if (n < 2) return null;
  const meanSX = anchors.reduce((s, a) => s + a.surveyX, 0) / n;
  const meanX  = anchors.reduce((s, a) => s + a.x, 0) / n;
  const meanSY = anchors.reduce((s, a) => s + a.surveyY, 0) / n;
  const meanY  = anchors.reduce((s, a) => s + a.y, 0) / n;

  const varSX = anchors.reduce((s, a) => s + (a.surveyX - meanSX) ** 2, 0);
  const covSX = anchors.reduce((s, a) => s + (a.surveyX - meanSX) * (a.x - meanX), 0);
  const varSY = anchors.reduce((s, a) => s + (a.surveyY - meanSY) ** 2, 0);
  const covSY = anchors.reduce((s, a) => s + (a.surveyY - meanSY) * (a.y - meanY), 0);

  if (varSX === 0 || varSY === 0) return null;
  const m_x = covSX / varSX;
  const c_x = meanX - m_x * meanSX;
  const m_y = covSY / varSY;
  const c_y = meanY - m_y * meanSY;
  return { m_x, c_x, m_y, c_y };
}

// ── Process each sketch ───────────────────────────────────────────────────────
const sketches = await sql`SELECT id, name, nodes, edges FROM sketches ORDER BY name`;
console.log(`Processing ${sketches.length} sketches...\n`);

let totalRepositioned = 0;

for (const sketch of sketches) {
  const nodes = sketch.nodes;
  const edges = sketch.edges || [];

  // Extract date from sketch name  e.g. "me_rakat 2026-02-16" → "2026-02-16"
  const dateMatch = sketch.name?.match(/(\d{4}-\d{2}-\d{2})/);
  const sketchDate = dateMatch?.[1];
  const ownCords = sketchDate ? cordsByDate.get(sketchDate) : null;

  if (!ownCords) {
    console.log(`⚠ ${sketch.name}: no own-date cords file found — skipping`);
    continue;
  }

  // Separate anchor vs displaced nodes
  const nodeMap = new Map();
  for (const n of nodes) nodeMap.set(String(n.id), n);

  const anchorNodes   = nodes.filter(n => ownCords.has(String(n.id)) && n.surveyX != null && n.x != null);
  const displacedIds  = new Set(nodes.filter(n => !ownCords.has(String(n.id))).map(n => String(n.id)));

  if (displacedIds.size === 0) {
    console.log(`✓ ${sketch.name}: no displaced nodes`);
    continue;
  }

  if (anchorNodes.length < 2) {
    console.log(`⚠ ${sketch.name}: not enough anchors (${anchorNodes.length}) to derive transform — skipping`);
    continue;
  }

  // Derive scale for 7m placement
  const tf = deriveTransform(anchorNodes);
  if (!tf) {
    console.log(`⚠ ${sketch.name}: could not derive transform — skipping`);
    continue;
  }
  // meters per canvas unit (use average of x and y scales)
  const metersPerCU = 2 / (Math.abs(tf.m_x) + Math.abs(tf.m_y));
  const canvasRadius = PLACEMENT_RADIUS_M / metersPerCU;

  console.log(`→ ${sketch.name}: ${anchorNodes.length} anchors, ${displacedIds.size} displaced nodes, canvasRadius=${canvasRadius.toFixed(1)} cu (${metersPerCU.toFixed(4)} m/cu)`);

  // Build adjacency list
  const adj = new Map();
  for (const n of nodes) adj.set(String(n.id), new Set());
  for (const e of edges) {
    if (e.tail != null && e.head != null) {
      const t = String(e.tail), h = String(e.head);
      adj.get(t)?.add(h);
      adj.get(h)?.add(t);
    }
  }

  // BFS from all anchor nodes outward through displaced nodes
  // Track placed positions for displaced nodes
  const placed = new Map(); // displacedId → {x, y}
  const visited = new Set();

  // Seed BFS with all anchor nodes (they have correct positions)
  const queue = [];
  for (const n of anchorNodes) {
    visited.add(String(n.id));
    queue.push({ id: String(n.id), x: n.x, y: n.y });
  }

  let qi = 0;
  while (qi < queue.length) {
    const { id: parentId, x: parentX, y: parentY } = queue[qi++];
    const neighbors = [...(adj.get(parentId) || [])];

    // Fan displaced neighbors around parent
    const displacedNeighbors = neighbors.filter(nid => displacedIds.has(nid) && !visited.has(nid));

    for (let i = 0; i < displacedNeighbors.length; i++) {
      const nid = displacedNeighbors[i];
      visited.add(nid);

      // Base angle: point away from sketch centroid
      // Use a spread of 45° per sibling to avoid overlap
      const baseAngle = Math.PI / 4; // 45° default direction (NE in canvas)
      const angle = baseAngle + i * (Math.PI / 4);

      const newX = parentX + canvasRadius * Math.cos(angle);
      const newY = parentY + canvasRadius * Math.sin(angle);

      placed.set(nid, { x: newX, y: newY });
      queue.push({ id: nid, x: newX, y: newY });
    }

    // Non-displaced unvisited neighbors: add to BFS with their own position (for traversal)
    for (const nid of neighbors) {
      if (!visited.has(nid) && !displacedIds.has(nid)) {
        const n = nodeMap.get(nid);
        if (n && n.x != null) {
          visited.add(nid);
          queue.push({ id: nid, x: n.x, y: n.y });
        }
      }
    }
  }

  // Report any displaced nodes not reached by BFS (isolated, no edge connection to any anchor)
  const unreached = [...displacedIds].filter(id => !placed.has(id));
  if (unreached.length > 0) {
    console.log(`  ⚠ ${unreached.length} displaced nodes not connected to any anchor (will be placed near sketch center)`);
    // Place them near the sketch centroid
    const cx = anchorNodes.reduce((s, n) => s + n.x, 0) / anchorNodes.length;
    const cy = anchorNodes.reduce((s, n) => s + n.y, 0) / anchorNodes.length;
    unreached.forEach((id, i) => {
      const angle = i * (Math.PI / 4);
      placed.set(id, { x: cx + canvasRadius * Math.cos(angle), y: cy + canvasRadius * Math.sin(angle) });
    });
  }

  // Apply placements
  let repositioned = 0;
  for (const n of nodes) {
    const p = placed.get(String(n.id));
    if (!p) continue;
    n.x = p.x;
    n.y = p.y;
    // Clear survey coordinates — these nodes have no real GPS fix
    n.surveyX = null;
    n.surveyY = null;
    n.surveyZ = null;
    n.hasCoordinates = false;
    n.gnssFixQuality = null;
    repositioned++;
  }

  console.log(`  Repositioned: ${repositioned}. Saving...`);
  await sql`UPDATE sketches SET nodes = ${JSON.stringify(nodes)}::jsonb, updated_at = NOW() WHERE id = ${sketch.id}`;
  console.log(`  ✓ Saved`);
  totalRepositioned += repositioned;
}

console.log(`\n=== DONE: ${totalRepositioned} nodes repositioned across ${sketches.length} sketches ===`);

// ── Verification ──────────────────────────────────────────────────────────────
console.log('\n=== Post-fix coverage ===');
const final = await sql`
  SELECT
    name,
    COUNT(*) FILTER (WHERE (n->>'surveyX') IS NOT NULL) AS with_coords,
    COUNT(*) FILTER (WHERE (n->>'surveyX') IS NULL) AS without_coords,
    COUNT(*) AS total
  FROM sketches, jsonb_array_elements(nodes) n
  GROUP BY name ORDER BY name`;

for (const r of final) {
  const pct = Math.round((r.with_coords / r.total) * 100);
  const flag = r.without_coords > 0 ? ' ⚠' : ' ✓';
  console.log(`  ${(r.name || '(unnamed)').padEnd(30)} ${r.with_coords}/${r.total} (${pct}%) coords${flag}`);
}
