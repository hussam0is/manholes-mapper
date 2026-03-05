/**
 * Full coordinate reupdate for all DB sketches.
 *
 * For each node in every sketch:
 *
 * ✅ Node found in compatible cords file(s):
 *    - surveyX/Y/Z = ITM coords from cords file
 *    - gnssFixQuality = 4 (RTK Fixed)
 *    - hasCoordinates = true
 *    - canvas x/y recomputed from surveyX/Y via sketch transform
 *
 * ⚠️ Node NOT in cords file:
 *    - surveyX/Y/Z = null
 *    - hasCoordinates = false
 *    - gnssFixQuality = 6 (manual float)
 *    - manualX/Y = ITM coords 7m from nearest graph-connected anchor (BFS)
 *    - canvas x/y recomputed from manualX/Y via sketch transform
 *
 * Cords compatibility: centroid of cords file must be within 1500m of sketch centroid.
 * Later-date cords win on ID collision.
 * RTCM* and PRS* IDs are skipped (base station references, not manholes).
 *
 * Also recomputes all edge lengths from surveyX/Y (preferring survey, fallback to canvas/scale).
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

config({ path: '.env.local' });
const sql = neon(process.env.POSTGRES_URL);

const DATA_DIR = 'C:/Users/murjan.a/Desktop/App Data';
const ITM_E_MIN = 230000, ITM_E_MAX = 270000;
const GEO_COMPAT_THRESHOLD = 1500; // metres — max centroid distance to accept a cords file
const PLACEMENT_RADIUS_M = 7;      // metres — distance from anchor for manual nodes

// ── Load all cords files ──────────────────────────────────────────────────────
// cordsByDate: date -> Map<id, {e, n, elev}>
// fileCentroids: date -> {e, n}
const cordsByDate = new Map();
const fileCentroids = new Map();

for (const file of readdirSync(DATA_DIR).filter(f => f.startsWith('cords_') && f.endsWith('.csv')).sort()) {
  const date = file.replace('cords_', '').replace('.csv', '');
  const entries = new Map();
  let sumE = 0, sumN = 0, cnt = 0;

  for (const line of readFileSync(join(DATA_DIR, file), 'utf-8').trim().split('\n')) {
    const p = line.split(',');
    if (p.length < 3) continue;
    const id = p[0].trim();
    if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
    const e = parseFloat(p[1]), n = parseFloat(p[2]), elev = parseFloat(p[3] ?? 'NaN');
    if (!isFinite(e) || e < ITM_E_MIN || e > ITM_E_MAX) continue;
    entries.set(id, { e, n, elev: isFinite(elev) ? elev : null });
    sumE += e; sumN += n; cnt++;
  }

  if (cnt > 0) {
    cordsByDate.set(date, entries);
    fileCentroids.set(date, { e: sumE / cnt, n: sumN / cnt });
    console.log(`  Loaded cords_${date}.csv — ${entries.size} valid points`);
  }
}
console.log(`\nTotal cords files loaded: ${cordsByDate.size}\n`);

// ── Geometry helpers ──────────────────────────────────────────────────────────
function dist2D(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

// Build master cords lookup for a sketch based on its ITM centroid.
// Returns Map<id, {e, n, elev}>, with later-date cords winning on collision.
function buildCompatibleCords(sketchCentroidITM) {
  const compatible = new Map();
  for (const [date, entries] of cordsByDate) {
    const fc = fileCentroids.get(date);
    if (dist2D(fc.e, fc.n, sketchCentroidITM.e, sketchCentroidITM.n) > GEO_COMPAT_THRESHOLD) continue;
    for (const [id, coords] of entries) {
      compatible.set(id, { ...coords, date }); // later dates overwrite (sorted asc)
    }
  }
  return compatible;
}

// ── Canvas ↔ ITM transform (fixed for all me_rakat sketches) ─────────────────
// All me_rakat sketches share a single reference point and scale.
// canvas_x = (surveyX - REF_X) * SCALE
// canvas_y = (REF_Y  - surveyY) * SCALE   ← Y is flipped (canvas Y↓, ITM N↑)
const REF_X = 245879.351;
const REF_Y = 740699.399;
const SCALE = 50; // canvas units per ITM metre

// Returns a fixed transform object (same for all sketches in this project).
function deriveTransform(_anchors) {
  return {
    refX: REF_X,
    refY: REF_Y,
    scaleX: SCALE,
    scaleY: SCALE,
    scale: SCALE,
  };
}

function itmToCanvas(surveyX, surveyY, t) {
  return {
    x: (surveyX - t.refX) * t.scaleX,
    y: (t.refY - surveyY) * t.scaleY,
  };
}

function canvasToITM(cx, cy, t) {
  return {
    e: t.refX + cx / t.scaleX,
    n: t.refY - cy / t.scaleY,
  };
}

// ── BFS: nearest anchor (by hop count) ───────────────────────────────────────
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
  return null; // no anchor reachable
}

// ── Manual placement: fan displaced nodes around their nearest anchor ─────────
// Each anchor collects its displaced nodes and fans them at equal angles (7m).
function computeManualPlacements(displacedIds, anchorIds, adj, nodeMap, transform) {
  const nearestAnchor = new Map();
  for (const id of displacedIds) {
    nearestAnchor.set(id, bfsNearestAnchor(id, anchorIds, adj));
  }

  // Group by anchor
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

  const canvasRadius = PLACEMENT_RADIUS_M * transform.scale;
  const placements = new Map(); // id → {cx, cy, manualX, manualY}

  for (const [ancId, group] of anchorGroups) {
    const anchor = nodeMap.get(ancId);
    const count = group.length;
    const startAngle = Math.PI / 4; // 45° (NE)
    const step = count === 1 ? 0 : (2 * Math.PI) / Math.min(count, 8);
    for (let i = 0; i < count; i++) {
      const angle = startAngle + i * step;
      const cx = anchor.x + canvasRadius * Math.cos(angle);
      const cy = anchor.y + canvasRadius * Math.sin(angle);
      const itm = canvasToITM(cx, cy, transform);
      placements.set(group[i], { cx, cy, manualX: itm.e, manualY: itm.n });
    }
  }

  // Nodes with no reachable anchor → place near most-central anchor
  if (noAnchorList.length > 0) {
    const allAnchors = [...anchorIds].map(id => nodeMap.get(id)).filter(Boolean);
    const sortedAnchors = allAnchors.sort((a, b) => a.x - b.x);
    const medianAnchor = sortedAnchors[Math.floor(sortedAnchors.length / 2)];
    const existingSlots = anchorGroups.get(String(medianAnchor.id))?.length ?? 0;
    for (let i = 0; i < noAnchorList.length; i++) {
      const slot = existingSlots + i;
      const angle = Math.PI / 4 + slot * (Math.PI / 4);
      const cx = medianAnchor.x + canvasRadius * Math.cos(angle);
      const cy = medianAnchor.y + canvasRadius * Math.sin(angle);
      const itm = canvasToITM(cx, cy, transform);
      placements.set(noAnchorList[i], { cx, cy, manualX: itm.e, manualY: itm.n });
    }
  }

  return placements;
}

// ── Edge length computation ───────────────────────────────────────────────────
function computeEdgeLengths(nodes, edges, transform) {
  const nodeMap = new Map(nodes.map(n => [String(n.id), n]));
  let surveyBased = 0, manualBased = 0, canvasBased = 0;

  for (const e of edges) {
    const t = nodeMap.get(String(e.tail));
    const h = nodeMap.get(String(e.head));
    if (!t || !h) continue;

    // Prefer survey coords, then manual coords, then canvas fallback
    const tX = t.surveyX ?? t.manualX;
    const tY = t.surveyY ?? t.manualY;
    const hX = h.surveyX ?? h.manualX;
    const hY = h.surveyY ?? h.manualY;

    if (tX != null && tY != null && hX != null && hY != null) {
      e.length = Math.round(dist2D(tX, tY, hX, hY) * 100) / 100;
      if (t.surveyX != null && h.surveyX != null) surveyBased++;
      else manualBased++;
    } else {
      // Pure canvas fallback
      e.length = Math.round(dist2D(t.x, t.y, h.x, h.y) / transform.scale * 100) / 100;
      canvasBased++;
    }
  }

  return { surveyBased, manualBased, canvasBased };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const sketches = await sql`SELECT id, name, nodes, edges FROM sketches ORDER BY name`;
console.log(`Processing ${sketches.length} sketches...\n`);

let totalSurvey = 0, totalManual = 0, totalSketches = 0;

for (const sketch of sketches) {
  const nodes = sketch.nodes || [];
  const edges = sketch.edges || [];
  if (nodes.length === 0) { console.log(`⊘ ${sketch.name}: no nodes — skipping`); continue; }

  // ── Step 1: Compute sketch ITM centroid from existing surveyX or from cords ──
  // First pass: use nodes that already have surveyX to find the centroid.
  // If none exist yet, we'll try all cords files and pick the most represented one.
  let sketchCentroid = null;
  const existingSurvey = nodes.filter(n => n.surveyX != null && n.surveyX > ITM_E_MIN);
  if (existingSurvey.length >= 3) {
    const sumE = existingSurvey.reduce((s, n) => s + n.surveyX, 0) / existingSurvey.length;
    const sumN = existingSurvey.reduce((s, n) => s + n.surveyY, 0) / existingSurvey.length;
    sketchCentroid = { e: sumE, n: sumN };
  } else {
    // Try to find centroid by matching node IDs to any cords file
    let bestDate = null, bestCount = 0;
    const nodeIdSet = new Set(nodes.map(n => String(n.id)));
    for (const [date, entries] of cordsByDate) {
      let hits = 0;
      for (const id of entries.keys()) { if (nodeIdSet.has(id)) hits++; }
      if (hits > bestCount) { bestCount = hits; bestDate = date; }
    }
    if (bestDate) {
      const fc = fileCentroids.get(bestDate);
      sketchCentroid = { e: fc.e, n: fc.n };
    }
  }

  if (!sketchCentroid) {
    console.log(`⚠ ${sketch.name}: cannot determine ITM centroid — skipping`);
    continue;
  }

  // ── Step 2: Build compatible cords master lookup ──────────────────────────
  const compatCords = buildCompatibleCords(sketchCentroid);
  if (compatCords.size === 0) {
    console.log(`⚠ ${sketch.name}: no compatible cords files found — skipping`);
    continue;
  }

  console.log(`\n─── ${sketch.name} (${nodes.length} nodes, ${edges.length} edges)`);
  console.log(`    Centroid: E${sketchCentroid.e.toFixed(0)} N${sketchCentroid.n.toFixed(0)}  ·  compatible cords: ${compatCords.size} points`);

  // ── Step 3: Assign surveyX/Y from cords ──────────────────────────────────
  const nodeMap = new Map(nodes.map(n => [String(n.id), n]));
  const anchorIds = new Set();
  const displacedIds = new Set();
  let surveyCount = 0;

  for (const n of nodes) {
    const id = String(n.id);
    const cord = compatCords.get(id);
    if (cord) {
      n.surveyX = cord.e;
      n.surveyY = cord.n;
      n.surveyZ = cord.elev;
      n.hasCoordinates = true;
      n.gnssFixQuality = 4; // RTK Fixed
      delete n.manualX;
      delete n.manualY;
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

  console.log(`    Survey coords: ${surveyCount}/${nodes.length}  ·  Manual (no cords): ${displacedIds.size}`);

  // ── Step 4: Derive canvas ↔ ITM transform from anchor nodes ───────────────
  const anchorNodes = [...anchorIds].map(id => nodeMap.get(id)).filter(Boolean);
  const transform = deriveTransform(anchorNodes);

  if (!transform) {
    console.log(`    ⚠ Cannot derive canvas transform (need ≥2 anchors) — canvas positions unchanged, no manualX/Y set`);
    // Still save survey coords even if transform fails
  } else {
    console.log(`    Scale: ${transform.scale.toFixed(2)} cu/m  ·  refX=${transform.refX.toFixed(1)}  refY=${transform.refY.toFixed(1)}`);

    // ── Step 5: Update canvas x/y for anchor (survey) nodes ─────────────────
    let canvasUpdated = 0;
    for (const id of anchorIds) {
      const n = nodeMap.get(id);
      if (!n) continue;
      const pos = itmToCanvas(n.surveyX, n.surveyY, transform);
      n.x = pos.x;
      n.y = pos.y;
      canvasUpdated++;
    }

    // ── Step 6: Compute manual placements for uncoordinated nodes ────────────
    if (displacedIds.size > 0) {
      const adj = buildAdjacency(nodes, edges);
      const placements = computeManualPlacements(displacedIds, anchorIds, adj, nodeMap, transform);

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
          // Edge-case: completely isolated node with no connections and no anchor
          // Keep canvas position as-is, just null out survey coords
          unplaceable++;
        }
      }
      console.log(`    Placed manual: ${placed}  ·  Unplaceable (isolated, no anchor): ${unplaceable}`);
    }

    console.log(`    Canvas updated: ${canvasUpdated + displacedIds.size} nodes`);

    // ── Step 7: Recompute edge lengths ───────────────────────────────────────
    const { surveyBased, manualBased, canvasBased } = computeEdgeLengths(nodes, edges, transform);
    console.log(`    Edge lengths: ${surveyBased} survey-based, ${manualBased} manual-based, ${canvasBased} canvas-fallback`);
  }

  // ── Step 8: Save to DB ────────────────────────────────────────────────────
  await sql`
    UPDATE sketches
    SET nodes = ${JSON.stringify(nodes)}::jsonb,
        edges = ${JSON.stringify(edges)}::jsonb,
        updated_at = NOW()
    WHERE id = ${sketch.id}
  `;
  console.log(`    ✓ Saved`);

  totalSurvey += surveyCount;
  totalManual += displacedIds.size;
  totalSketches++;
}

// ── Final summary ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`DONE: ${totalSketches} sketches updated`);
console.log(`  Total survey nodes (gnssFixQuality=4): ${totalSurvey}`);
console.log(`  Total manual nodes (gnssFixQuality=6): ${totalManual}`);
console.log('═'.repeat(60));

console.log('\n=== Post-update coverage per sketch ===');
const final = await sql`
  SELECT
    name,
    COUNT(*) FILTER (WHERE (n->>'surveyX') IS NOT NULL) AS survey,
    COUNT(*) FILTER (WHERE (n->>'manualX') IS NOT NULL) AS manual,
    COUNT(*) FILTER (WHERE (n->>'surveyX') IS NULL AND (n->>'manualX') IS NULL) AS neither,
    COUNT(*) AS total
  FROM sketches, jsonb_array_elements(nodes) n
  GROUP BY name ORDER BY name
`;
for (const r of final) {
  const pct = Math.round((r.survey / r.total) * 100);
  console.log(
    `  ${(r.name || '(unnamed)').padEnd(35)}`
    + ` survey=${r.survey}/${r.total} (${pct}%)`
    + `  manual=${r.manual}`
    + (r.neither > 0 ? `  ⚠ neither=${r.neither}` : '')
  );
}
