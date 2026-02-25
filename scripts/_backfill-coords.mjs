/**
 * Backfill missing surveyX/Y on all DB sketch nodes from App Data cords files.
 *
 * Rules:
 * - Only apply cords that are geographically compatible with the sketch
 *   (centroid distance < 1500m from the sketch's existing coord cluster)
 * - Set gnssFixQuality=4 for all cords-sourced coordinates
 * - Also backfill gnssFixQuality=4 on nodes that already have surveyX but missing it
 * - Never overwrite surveyX that is already valid (only fill nulls)
 * - Skip schematic nodes (accuracyLevel===1) and Home nodes for missing-coords
 *   — but still apply coords if found in cords
 */
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

config({ path: '.env.local' });
const sql = neon(process.env.POSTGRES_URL);

const dataDir = 'C:/Users/murjan.a/Desktop/App Data';
const ITM_E_MIN = 230000, ITM_E_MAX = 270000;
const GEO_COMPAT_THRESHOLD = 1500; // metres

// ── Load all cords files with per-file centroid ───────────────────────────────
const cordsByDate = new Map(); // date -> Map<id, {e,n,elev}>
const fileCentroids = new Map(); // date -> {e, n}

for (const file of readdirSync(dataDir).filter(f => f.startsWith('cords_') && f.endsWith('.csv')).sort()) {
  const date = file.replace('cords_', '').replace('.csv', '');
  const entries = new Map();
  let sumE = 0, sumN = 0, cnt = 0;

  for (const line of readFileSync(join(dataDir, file), 'utf-8').trim().split('\n')) {
    const p = line.split(',');
    if (p.length < 3) continue;
    const id = p[0].trim();
    if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
    const e = parseFloat(p[1]), n = parseFloat(p[2]), elev = parseFloat(p[3]);
    if (!isFinite(e) || e < ITM_E_MIN || e > ITM_E_MAX) continue;
    entries.set(id, { e, n, elev });
    sumE += e; sumN += n; cnt++;
  }

  if (cnt > 0) {
    cordsByDate.set(date, entries);
    fileCentroids.set(date, { e: sumE / cnt, n: sumN / cnt });
  }
}
console.log(`Loaded cords for ${cordsByDate.size} dates\n`);

// ── Helper: compute centroid of a node list (only nodes with surveyX) ─────────
function sketchCentroid(nodes) {
  let sumE = 0, sumN = 0, cnt = 0;
  for (const n of nodes) {
    if (n.surveyX != null && isFinite(n.surveyX) && n.surveyX > ITM_E_MIN) {
      sumE += n.surveyX; sumN += n.surveyY; cnt++;
    }
  }
  return cnt > 0 ? { e: sumE / cnt, n: sumN / cnt, cnt } : null;
}

function dist(a, b) {
  return Math.sqrt((a.e - b.e) ** 2 + (a.n - b.n) ** 2);
}

// ── Build compatible master cords per sketch ──────────────────────────────────
function buildCompatibleCords(sketchCentroid) {
  const compatible = new Map(); // id -> {e,n,elev,date}
  for (const [date, entries] of cordsByDate) {
    const fc = fileCentroids.get(date);
    if (dist(fc, sketchCentroid) > GEO_COMPAT_THRESHOLD) continue;
    for (const [id, coords] of entries) {
      // Later dates win (dates are sorted ascending)
      compatible.set(id, { ...coords, date });
    }
  }
  return compatible;
}

// ── Process each sketch ───────────────────────────────────────────────────────
const sketches = await sql`SELECT id, name, nodes FROM sketches ORDER BY name`;
console.log(`Processing ${sketches.length} sketches...\n`);

let totalUpdated = 0;
let totalSkipped = 0;

for (const sketch of sketches) {
  const nodes = sketch.nodes;
  const centroid = sketchCentroid(nodes);

  // Count nodes needing fix before
  const missingBefore = nodes.filter(n => n.surveyX == null).length;
  const missingQuality = nodes.filter(n => n.surveyX != null && n.gnssFixQuality == null).length;

  if (missingBefore === 0 && missingQuality === 0) {
    console.log(`✓ ${sketch.name || '(unnamed)'}: all coords present, gnssFixQuality backfill: 0 — skipping`);
    continue;
  }

  if (!centroid) {
    console.log(`⚠ ${sketch.name || '(unnamed)'}: no existing coords to anchor cluster — skipping`);
    continue;
  }

  const compatCords = buildCompatibleCords(centroid);
  console.log(`\n→ ${sketch.name || '(unnamed)'} (${nodes.length} nodes, centroid E${centroid.e.toFixed(0)} N${centroid.n.toFixed(0)}, compatible cords: ${compatCords.size})`);
  console.log(`  Missing surveyX: ${missingBefore}, Missing gnssFixQuality: ${missingQuality}`);

  let filled = 0, qualityFixed = 0, noMatch = 0;
  let changed = false;

  for (const node of nodes) {
    const id = String(node.id);

    // Backfill gnssFixQuality on nodes that already have valid surveyX from cords
    if (node.surveyX != null && node.gnssFixQuality == null) {
      // Only set Fixed if surveyX looks like it came from a cords file (not GNSS capture)
      if (compatCords.has(id)) {
        node.gnssFixQuality = 4;
        qualityFixed++;
        changed = true;
      }
    }

    // Backfill missing surveyX from compatible cords
    if (node.surveyX == null) {
      const cords = compatCords.get(id);
      if (cords) {
        node.surveyX = cords.e;
        node.surveyY = cords.n;
        node.surveyZ = cords.elev;
        node.hasCoordinates = true;
        node.gnssFixQuality = 4;
        filled++;
        changed = true;
      } else {
        noMatch++;
      }
    }
  }

  console.log(`  Filled: ${filled}, Quality fixed: ${qualityFixed}, Still missing (no cords match): ${noMatch}`);

  if (changed) {
    await sql`UPDATE sketches SET nodes = ${JSON.stringify(nodes)}::jsonb, updated_at = NOW() WHERE id = ${sketch.id}`;
    console.log(`  ✓ Saved to DB`);
    totalUpdated++;
  } else {
    totalSkipped++;
  }
}

console.log(`\n=== DONE: ${totalUpdated} sketches updated, ${totalSkipped} already complete ===`);

// ── Final verification ────────────────────────────────────────────────────────
console.log('\n=== Final node coordinate coverage per sketch ===');
const final = await sql`
  SELECT
    name,
    COUNT(*) FILTER (WHERE (n->>'surveyX') IS NOT NULL) AS with_coords,
    COUNT(*) FILTER (WHERE (n->>'surveyX') IS NULL) AS without_coords,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE (n->>'gnssFixQuality') IS NULL AND (n->>'surveyX') IS NOT NULL) AS missing_quality
  FROM sketches, jsonb_array_elements(nodes) n
  GROUP BY name ORDER BY name`;

for (const r of final) {
  const pct = Math.round((r.with_coords / r.total) * 100);
  const flag = r.without_coords > 0 ? ' ⚠' : ' ✓';
  console.log(`  ${(r.name || '(unnamed)').padEnd(30)} ${r.with_coords}/${r.total} (${pct}%) coords${flag}  missing_quality=${r.missing_quality}`);
}
