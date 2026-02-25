/**
 * Reposition displaced nodes in all DB sketches.
 *
 * "Displaced" = a node not in the sketch's own-date cords file, whose canvas
 * x/y was inherited from another sketch sharing the same sequential node ID.
 *
 * Strategy:
 * - "Anchor" nodes = nodes in sketch's OWN-DATE cords file → trustworthy x/y
 * - "Displaced" nodes = all others → wrong x/y, need repositioning
 *
 * For each displaced node:
 *   1. BFS from that node through ALL edges to find its NEAREST anchor
 *      (shortest graph-hop distance). This ensures every displaced node is
 *      placed at exactly 7m from a real survey point, never cascading.
 *   2. Place at PLACEMENT_RADIUS from that anchor. Multiple displaced nodes
 *      sharing the same nearest anchor fan out at equal angular increments.
 *   3. If no anchor is reachable at all, place near sketch centroid.
 *
 * After placement: surveyX/Y = null (shows as missing-coords yellow ! in issues).
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

// ── Load own-date cords (Set of nodeIds per date) ────────────────────────────
const cordsByDate = new Map();
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

// ── Derive canvas-units-per-meter from anchor nodes (linear regression) ──────
function canvasUnitsPerMeter(anchors) {
  const n = anchors.length;
  if (n < 2) return null;
  const meanSX = anchors.reduce((s, a) => s + a.surveyX, 0) / n;
  const meanX  = anchors.reduce((s, a) => s + a.x, 0) / n;
  const meanSY = anchors.reduce((s, a) => s + a.surveyY, 0) / n;
  const meanY  = anchors.reduce((s, a) => s + a.y, 0) / n;
  const varSX  = anchors.reduce((s, a) => s + (a.surveyX - meanSX) ** 2, 0);
  const covSX  = anchors.reduce((s, a) => s + (a.surveyX - meanSX) * (a.x - meanX), 0);
  const varSY  = anchors.reduce((s, a) => s + (a.surveyY - meanSY) ** 2, 0);
  const covSY  = anchors.reduce((s, a) => s + (a.surveyY - meanSY) * (a.y - meanY), 0);
  if (varSX === 0 || varSY === 0) return null;
  const mX = Math.abs(covSX / varSX); // canvas units per meter (x)
  const mY = Math.abs(covSY / varSY); // canvas units per meter (y)
  return (mX + mY) / 2;
}

// ── Process each sketch ───────────────────────────────────────────────────────
const sketches = await sql`SELECT id, name, nodes, edges FROM sketches ORDER BY name`;
console.log(`Processing ${sketches.length} sketches...\n`);

let totalRepositioned = 0;

for (const sketch of sketches) {
  const nodes = sketch.nodes;
  const edges = sketch.edges || [];

  const dateMatch = sketch.name?.match(/(\d{4}-\d{2}-\d{2})/);
  const ownCords = dateMatch ? cordsByDate.get(dateMatch[1]) : null;

  const nodeMap = new Map(nodes.map(n => [String(n.id), n]));

  let anchorIds, displacedIds;
  if (ownCords) {
    // Primary: nodes in own-date cords file with surveyX are anchors
    anchorIds    = new Set(nodes.filter(n => ownCords.has(String(n.id)) && n.surveyX != null).map(n => String(n.id)));
    displacedIds = new Set(nodes.filter(n => !ownCords.has(String(n.id))).map(n => String(n.id)));
  } else {
    // Fallback: no own-date cords file — use surveyX presence as anchor criterion
    console.log(`  (no own-date cords for ${sketch.name} — using surveyX presence as anchors)`);
    anchorIds    = new Set(nodes.filter(n => n.surveyX != null).map(n => String(n.id)));
    displacedIds = new Set(nodes.filter(n => n.surveyX == null).map(n => String(n.id)));
  }

  if (displacedIds.size === 0) { console.log(`✓ ${sketch.name}: no displaced nodes`); continue; }

  const anchorNodes = [...anchorIds].map(id => nodeMap.get(id));
  if (anchorNodes.length < 2) { console.log(`⚠ ${sketch.name}: not enough anchors — skipping`); continue; }

  const cuPerM = canvasUnitsPerMeter(anchorNodes);
  if (!cuPerM) { console.log(`⚠ ${sketch.name}: cannot derive scale — skipping`); continue; }
  const canvasRadius = PLACEMENT_RADIUS_M * cuPerM;

  // Build adjacency list (all nodes, not just anchors)
  const adj = new Map(nodes.map(n => [String(n.id), new Set()]));
  for (const e of edges) {
    if (e.tail != null && e.head != null) {
      adj.get(String(e.tail))?.add(String(e.head));
      adj.get(String(e.head))?.add(String(e.tail));
    }
  }

  // For each displaced node: BFS to find nearest anchor (hop count)
  // nearestAnchor[displacedId] = anchorId of nearest anchor
  const nearestAnchor = new Map();

  for (const displacedId of displacedIds) {
    // BFS from this displaced node outward until we hit an anchor
    const visited = new Set([displacedId]);
    const queue = [displacedId];
    let found = null;
    outer: while (queue.length > 0) {
      const cur = queue.shift();
      for (const nb of (adj.get(cur) || [])) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        if (anchorIds.has(nb)) { found = nb; break outer; }
        queue.push(nb);
      }
    }
    nearestAnchor.set(displacedId, found); // null if no anchor reachable
  }

  // Group displaced nodes by their nearest anchor, assign fan angles
  // anchorGroups: anchorId → [displacedId, ...]
  const anchorGroups = new Map();
  const noAnchorNodes = [];
  for (const [dispId, ancId] of nearestAnchor) {
    if (ancId) {
      if (!anchorGroups.has(ancId)) anchorGroups.set(ancId, []);
      anchorGroups.get(ancId).push(dispId);
    } else {
      noAnchorNodes.push(dispId);
    }
  }

  // Compute placement positions
  const placements = new Map(); // displacedId → {x, y}

  for (const [ancId, group] of anchorGroups) {
    const anchor = nodeMap.get(ancId);
    const count = group.length;
    // Fan evenly around the anchor, starting from 45° (NE)
    const startAngle = Math.PI / 4;
    const step = count === 1 ? 0 : (2 * Math.PI) / Math.min(count, 8);
    for (let i = 0; i < count; i++) {
      const angle = startAngle + i * step;
      placements.set(group[i], {
        x: anchor.x + canvasRadius * Math.cos(angle),
        y: anchor.y + canvasRadius * Math.sin(angle),
      });
    }
  }

  // Nodes with no reachable anchor: find physically nearest anchor (Euclidean)
  // and place at 7m from it. Since displaced x/y are from another sketch we
  // cannot use them — instead use the anchor with the median canvas position
  // (most central anchor) to avoid stacking on a single busy anchor.
  if (noAnchorNodes.length > 0) {
    console.log(`  ⚠ ${noAnchorNodes.length} displaced nodes unreachable from any anchor → placed near nearest anchor`);

    // Sort anchors by x to pick median (most central)
    const sortedAnchors = [...anchorNodes].sort((a, b) => a.x - b.x);
    const medianAnchor = sortedAnchors[Math.floor(sortedAnchors.length / 2)];

    for (let i = 0; i < noAnchorNodes.length; i++) {
      // Count how many displaced nodes are already being placed near this anchor
      const existingCount = anchorGroups.get(String(medianAnchor.id))?.length ?? 0;
      const slot = existingCount + i;
      const angle = (Math.PI / 4) + slot * (Math.PI / 4);
      placements.set(noAnchorNodes[i], {
        x: medianAnchor.x + canvasRadius * Math.cos(angle),
        y: medianAnchor.y + canvasRadius * Math.sin(angle),
      });
    }
  }

  // Apply
  let repositioned = 0;
  for (const n of nodes) {
    const p = placements.get(String(n.id));
    if (!p) continue;
    n.x = p.x;
    n.y = p.y;
    n.surveyX = null;
    n.surveyY = null;
    n.surveyZ = null;
    n.hasCoordinates = false;
    n.gnssFixQuality = 6; // manual float — estimated position, not surveyed
    repositioned++;
  }

  console.log(`→ ${sketch.name}: ${anchorNodes.length} anchors, ${displacedIds.size} displaced, canvasRadius=${canvasRadius.toFixed(1)} cu. Repositioned: ${repositioned}`);
  await sql`UPDATE sketches SET nodes = ${JSON.stringify(nodes)}::jsonb, updated_at = NOW() WHERE id = ${sketch.id}`;
  console.log(`  ✓ Saved`);
  totalRepositioned += repositioned;
}

console.log(`\n=== DONE: ${totalRepositioned} nodes repositioned ===`);

// Verify
console.log('\n=== Post-fix coverage ===');
const final = await sql`
  SELECT name,
    COUNT(*) FILTER (WHERE (n->>'surveyX') IS NOT NULL) AS with_coords,
    COUNT(*) FILTER (WHERE (n->>'surveyX') IS NULL)     AS without_coords,
    COUNT(*) AS total
  FROM sketches, jsonb_array_elements(nodes) n
  GROUP BY name ORDER BY name`;
for (const r of final) {
  const pct = Math.round((r.with_coords / r.total) * 100);
  console.log(`  ${(r.name || '(unnamed)').padEnd(30)} ${r.with_coords}/${r.total} (${pct}%)`);
}
