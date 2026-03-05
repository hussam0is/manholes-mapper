/**
 * Fix long edges (>150m) caused by cross-date coordinate contamination.
 *
 * Strategy:
 *   1. For each sketch, extract the own-date from the sketch name (e.g. "me_rakat 2026-01-22" → "2026-01-22")
 *   2. Assign surveyX/Y ONLY from the OWN-DATE cords file (no cross-date overrides)
 *   3. Nodes not found in own-date cords → surveyX/Y/Z=null, gnssFixQuality=6
 *      → manualX/Y placed at 7m from nearest BFS anchor (canvas x/y updated too)
 *   4. Recompute all edge lengths from surveyX/Y (preferred) → manualX/Y → canvas fallback
 *   5. For any edge still >150m where EITHER endpoint has surveyX=null → force length = 7
 *   6. Save to DB
 *
 * This replaces the cross-date-compatible assignment in _update-all-coords.mjs with a
 * strict own-date match, eliminating phantom long edges from ID collisions across dates.
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

config({ path: '.env.local' });
const sql = neon(process.env.POSTGRES_URL);

const DATA_DIR = 'C:/Users/murjan.a/Desktop/App Data';
const ITM_E_MIN = 230000, ITM_E_MAX = 270000;
const PLACEMENT_RADIUS_M = 7;
const LONG_EDGE_THRESHOLD = 150; // metres

// ── Canvas ↔ ITM transform (fixed for all me_rakat sketches) ─────────────────
const REF_X = 245879.351;
const REF_Y = 740699.399;
const SCALE = 50; // canvas units per ITM metre

function itmToCanvas(surveyX, surveyY) {
  return {
    x: (surveyX - REF_X) * SCALE,
    y: (REF_Y - surveyY) * SCALE,
  };
}

function canvasToITM(cx, cy) {
  return {
    e: REF_X + cx / SCALE,
    n: REF_Y - cy / SCALE,
  };
}

function dist2D(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

// ── Load all cords files into Map<date, Map<id, {e,n,elev}>> ─────────────────
const cordsByDate = new Map();

for (const file of readdirSync(DATA_DIR).filter(f => f.startsWith('cords_') && f.endsWith('.csv')).sort()) {
  const date = file.replace('cords_', '').replace('.csv', '');
  const entries = new Map();

  for (const line of readFileSync(join(DATA_DIR, file), 'utf-8').trim().split('\n')) {
    const p = line.split(',');
    if (p.length < 3) continue;
    const id = p[0].trim();
    if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
    const e = parseFloat(p[1]), n = parseFloat(p[2]), elev = parseFloat(p[3] ?? 'NaN');
    if (!isFinite(e) || e < ITM_E_MIN || e > ITM_E_MAX) continue;
    entries.set(id, { e, n, elev: isFinite(elev) ? elev : null });
  }

  if (entries.size > 0) {
    cordsByDate.set(date, entries);
    console.log(`  Loaded cords_${date}.csv — ${entries.size} points`);
  }
}
console.log(`\nTotal cords files: ${cordsByDate.size}\n`);

// ── BFS helpers ───────────────────────────────────────────────────────────────
function buildAdjacency(nodes, edges) {
  const adj = new Map(nodes.map(n => [String(n.id), new Set()]));
  for (const e of edges) {
    if (e.tail != null && e.head != null) {
      adj.get(String(e.tail))?.add(String(e.head));
      adj.get(String(e.head))?.add(String(e.tail));
    }
  }
  return adj;
}

function bfsNearestAnchor(startId, anchorIds, adj) {
  const visited = new Set([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const nb of (adj.get(cur) || [])) {
      if (visited.has(nb)) continue;
      visited.add(nb);
      if (anchorIds.has(nb)) return nb;
      queue.push(nb);
    }
  }
  return null;
}

function computeManualPlacements(displacedIds, anchorIds, adj, nodeMap) {
  const nearestAnchor = new Map();
  for (const id of displacedIds) {
    nearestAnchor.set(id, bfsNearestAnchor(id, anchorIds, adj));
  }

  // Group displaced nodes by their nearest anchor
  const anchorGroups = new Map();
  const noAnchorList = [];
  for (const [dispId, ancId] of nearestAnchor) {
    if (ancId) {
      if (!anchorGroups.has(ancId)) anchorGroups.set(ancId, []);
      anchorGroups.get(ancId).push(dispId);
    } else {
      noAnchorList.push(dispId);
    }
  }

  const canvasRadius = PLACEMENT_RADIUS_M * SCALE;
  const placements = new Map();

  for (const [ancId, group] of anchorGroups) {
    const anchor = nodeMap.get(ancId);
    if (!anchor) continue;
    const count = group.length;
    const step = count === 1 ? 0 : (2 * Math.PI) / Math.min(count, 8);
    for (let i = 0; i < count; i++) {
      const angle = Math.PI / 4 + i * step; // start NE
      const cx = anchor.x + canvasRadius * Math.cos(angle);
      const cy = anchor.y + canvasRadius * Math.sin(angle);
      const itm = canvasToITM(cx, cy);
      placements.set(group[i], { cx, cy, manualX: itm.e, manualY: itm.n });
    }
  }

  // Isolated displaced nodes (no anchor reachable via edges) → use median anchor
  if (noAnchorList.length > 0 && anchorIds.size > 0) {
    const allAnchors = [...anchorIds].map(id => nodeMap.get(id)).filter(Boolean);
    const sortedAnchors = allAnchors.sort((a, b) => a.x - b.x);
    const medianAnchor = sortedAnchors[Math.floor(sortedAnchors.length / 2)];
    const existingSlots = anchorGroups.get(String(medianAnchor.id))?.length ?? 0;
    const canvasRadius2 = PLACEMENT_RADIUS_M * SCALE;
    for (let i = 0; i < noAnchorList.length; i++) {
      const slot = existingSlots + i;
      const angle = Math.PI / 4 + slot * (Math.PI / 4);
      const cx = medianAnchor.x + canvasRadius2 * Math.cos(angle);
      const cy = medianAnchor.y + canvasRadius2 * Math.sin(angle);
      const itm = canvasToITM(cx, cy);
      placements.set(noAnchorList[i], { cx, cy, manualX: itm.e, manualY: itm.n });
    }
  }

  return placements;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const sketches = await sql`SELECT id, name, nodes, edges FROM sketches ORDER BY name`;
console.log(`Processing ${sketches.length} sketches...\n`);

let totalForcedTo7 = 0;
let totalEdgesRecomputed = 0;
let sketchesUpdated = 0;

for (const sketch of sketches) {
  const nodes = sketch.nodes || [];
  const edges = sketch.edges || [];
  if (nodes.length === 0) {
    console.log(`⊘ ${sketch.name}: no nodes — skipping`);
    continue;
  }

  // ── Extract own-date from sketch name ──────────────────────────────────────
  const dateMatch = (sketch.name || '').match(/(\d{4}-\d{2}-\d{2})/);
  const sketchDate = dateMatch?.[1];

  if (!sketchDate) {
    console.log(`⚠ ${sketch.name}: cannot extract date from name — skipping`);
    continue;
  }

  const ownCords = cordsByDate.get(sketchDate);
  if (!ownCords) {
    console.log(`⚠ ${sketch.name}: no own-date cords file (${sketchDate}) — skipping`);
    continue;
  }

  console.log(`\n─── ${sketch.name} (${nodes.length} nodes, ${edges.length} edges)`);
  console.log(`    Own-date cords (${sketchDate}): ${ownCords.size} points`);

  // ── Assign surveyX/Y from OWN-DATE cords only ──────────────────────────────
  const nodeMap = new Map(nodes.map(n => [String(n.id), n]));
  const anchorIds = new Set();
  const displacedIds = new Set();
  let surveyCount = 0;

  for (const n of nodes) {
    const id = String(n.id);
    const cord = ownCords.get(id);
    if (cord) {
      n.surveyX = cord.e;
      n.surveyY = cord.n;
      n.surveyZ = cord.elev;
      n.hasCoordinates = true;
      n.gnssFixQuality = 4; // RTK Fixed
      delete n.manualX;
      delete n.manualY;
      // Update canvas position from survey coords
      const pos = itmToCanvas(cord.e, cord.n);
      n.x = pos.x;
      n.y = pos.y;
      anchorIds.add(id);
      surveyCount++;
    } else {
      n.surveyX = null;
      n.surveyY = null;
      n.surveyZ = null;
      n.hasCoordinates = false;
      n.gnssFixQuality = 6; // manual float
      displacedIds.add(id);
    }
  }

  console.log(`    Survey (own-date): ${surveyCount}/${nodes.length}  ·  Displaced: ${displacedIds.size}`);

  // ── Place displaced nodes at 7m from nearest BFS anchor ────────────────────
  if (displacedIds.size > 0 && anchorIds.size > 0) {
    const adj = buildAdjacency(nodes, edges);
    const placements = computeManualPlacements(displacedIds, anchorIds, adj, nodeMap);

    let placed = 0, unplaceable = 0;
    for (const id of displacedIds) {
      const n = nodeMap.get(id);
      if (!n) continue;
      const p = placements.get(id);
      if (p) {
        n.x = p.cx;
        n.y = p.cy;
        n.manualX = Math.round(p.manualX * 1000) / 1000;
        n.manualY = Math.round(p.manualY * 1000) / 1000;
        placed++;
      } else {
        // Completely isolated, no anchors — keep canvas position, clear manualX/Y
        delete n.manualX;
        delete n.manualY;
        unplaceable++;
      }
    }
    console.log(`    Manual placed: ${placed}  ·  Unplaceable: ${unplaceable}`);
  } else if (displacedIds.size > 0) {
    console.log(`    ⚠ No anchors available — ${displacedIds.size} displaced nodes kept at canvas position`);
  }

  // ── Recompute edge lengths ─────────────────────────────────────────────────
  let surveyBased = 0, manualBased = 0, canvasBased = 0;
  let forcedTo7 = 0;

  for (const e of edges) {
    const t = nodeMap.get(String(e.tail));
    const h = nodeMap.get(String(e.head));
    if (!t || !h) continue;

    // Prefer survey coords, fallback to manual, then canvas
    const tX = t.surveyX ?? t.manualX;
    const tY = t.surveyY ?? t.manualY;
    const hX = h.surveyX ?? h.manualX;
    const hY = h.surveyY ?? h.manualY;

    let newLen;
    if (tX != null && tY != null && hX != null && hY != null) {
      newLen = Math.round(dist2D(tX, tY, hX, hY) * 100) / 100;
      if (t.surveyX != null && h.surveyX != null) surveyBased++;
      else manualBased++;
    } else {
      newLen = Math.round(dist2D(t.x, t.y, h.x, h.y) / SCALE * 100) / 100;
      canvasBased++;
    }

    // ── Rule: if edge >150m and either endpoint lacks surveyX → force 7m ──────
    if (newLen > LONG_EDGE_THRESHOLD && (t.surveyX == null || h.surveyX == null)) {
      newLen = 7;
      forcedTo7++;
    }

    e.length = newLen;
    totalEdgesRecomputed++;
  }

  console.log(`    Edge lengths: ${surveyBased} survey, ${manualBased} manual, ${canvasBased} canvas-fallback`);
  if (forcedTo7 > 0) {
    console.log(`    ⬇ Forced to 7m: ${forcedTo7} edges (>150m with ≥1 non-survey endpoint)`);
  }

  totalForcedTo7 += forcedTo7;

  // ── Save to DB ─────────────────────────────────────────────────────────────
  await sql`
    UPDATE sketches
    SET nodes = ${JSON.stringify(nodes)}::jsonb,
        edges = ${JSON.stringify(edges)}::jsonb,
        updated_at = NOW()
    WHERE id = ${sketch.id}
  `;
  console.log(`    ✓ Saved`);
  sketchesUpdated++;
}

// ── Final summary ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`DONE: ${sketchesUpdated} sketches updated`);
console.log(`  Total edges recomputed: ${totalEdgesRecomputed}`);
console.log(`  Edges forced to 7m:     ${totalForcedTo7}`);
console.log('═'.repeat(60));

// ── Post-run validation ───────────────────────────────────────────────────────
console.log('\n=== Edge length distribution after fix ===');
const dist = await sql`
  SELECT
    CASE
      WHEN (e->>'length')::numeric >  500 THEN '>500m'
      WHEN (e->>'length')::numeric >  150 THEN '150–500m'
      WHEN (e->>'length')::numeric >   50 THEN '50–150m'
      ELSE '≤50m'
    END AS bucket,
    COUNT(*) AS cnt
  FROM sketches, jsonb_array_elements(edges) e
  WHERE (e->>'length') IS NOT NULL
  GROUP BY 1 ORDER BY 1
`;
for (const r of dist) console.log(`  ${r.bucket.padEnd(12)} : ${r.cnt}`);

console.log('\n=== Sketches with remaining long edges (>150m) ===');
const longEdges = await sql`
  SELECT s.name,
         COUNT(*) AS long_cnt,
         MAX((e->>'length')::numeric) AS max_len
  FROM sketches s, jsonb_array_elements(s.edges) e
  WHERE (e->>'length')::numeric > 150
  GROUP BY s.name ORDER BY max_len DESC
`;
if (longEdges.length === 0) {
  console.log('  ✓ No long edges remaining!');
} else {
  for (const r of longEdges) {
    console.log(`  ${r.name.padEnd(35)} ${r.long_cnt} edges, max=${Math.round(r.max_len)}m`);
  }
}
