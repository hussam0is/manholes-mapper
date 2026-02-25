import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

config({ path: '.env.local' });
const sql = neon(process.env.POSTGRES_URL);

const dataDir = 'C:/Users/murjan.a/Desktop/App Data';
const ITM_E_MIN = 230000, ITM_E_MAX = 270000;

// ── Build master cords (valid ITM only) ──────────────────────────────────────
const masterCords = new Map();
for (const file of readdirSync(dataDir).filter(f => f.startsWith('cords_') && f.endsWith('.csv')).sort()) {
  const date = file.replace('cords_', '').replace('.csv', '');
  for (const line of readFileSync(join(dataDir, file), 'utf-8').trim().split('\n')) {
    const p = line.split(',');
    if (p.length < 3) continue;
    const id = p[0].trim();
    if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
    const e = parseFloat(p[1]), n = parseFloat(p[2]), elev = parseFloat(p[3]);
    if (!isFinite(e) || e < ITM_E_MIN || e > ITM_E_MAX) continue;
    masterCords.set(id, { e, n, elev, date });
  }
}
console.log(`Master cords loaded: ${masterCords.size} entries\n`);

// ─────────────────────────────────────────────────────────────────────────────
// TASK 1: Fix corrupted nodes 272-279 in me_rakat 2026-02-03
// ─────────────────────────────────────────────────────────────────────────────
console.log('=== TASK 1: Fix corrupted nodes in me_rakat 2026-02-03 ===');

const CORRUPTED_IDS = ['272', '273', '276', '277', '278', '279'];

// Fetch the sketch
const [sketch] = await sql`SELECT id, name, nodes FROM sketches WHERE name = 'me_rakat 2026-02-03' LIMIT 1`;
if (!sketch) { console.error('Sketch not found!'); process.exit(1); }
console.log(`Sketch ID: ${sketch.id}, nodes before: ${sketch.nodes.length}`);

let nodes = sketch.nodes;
let fixedCount = 0;
let skippedCount = 0;

for (const node of nodes) {
  const id = String(node.id);
  if (!CORRUPTED_IDS.includes(id)) continue;

  const cords = masterCords.get(id);
  const currentE = node.surveyX;
  console.log(`  Node ${id}: current surveyX=${currentE} → ${cords ? `E${cords.e.toFixed(3)} (from cords_${cords.date})` : 'NO VALID CORDS — clearing'}`);

  if (cords) {
    node.surveyX = cords.e;
    node.surveyY = cords.n;
    node.surveyZ = cords.elev;
    node.hasCoordinates = true;
    node.gnssFixQuality = 4;
    // Clear any bad manual coords
    delete node.manualX;
    delete node.manualY;
    fixedCount++;
  } else {
    // Clear bad coords
    delete node.surveyX;
    delete node.surveyY;
    delete node.surveyZ;
    node.hasCoordinates = false;
    skippedCount++;
  }
}

await sql`UPDATE sketches SET nodes = ${JSON.stringify(nodes)}::jsonb, updated_at = NOW() WHERE id = ${sketch.id}`;
console.log(`✓ Updated: ${fixedCount} fixed, ${skippedCount} cleared\n`);

// ─────────────────────────────────────────────────────────────────────────────
// TASK 4: Delete unnamed sketches with < 20 nodes
// ─────────────────────────────────────────────────────────────────────────────
console.log('=== TASK 4: Delete unnamed sketches with < 20 nodes ===');

const toDelete = await sql`
  SELECT id, name, jsonb_array_length(nodes) AS node_count, created_at
  FROM sketches
  WHERE name IS NULL AND jsonb_array_length(nodes) < 20
  ORDER BY node_count ASC`;

if (toDelete.length === 0) {
  console.log('  No unnamed sketches with < 20 nodes found.');
} else {
  console.log(`  Found ${toDelete.length} sketches to delete:`);
  for (const s of toDelete) {
    console.log(`    id=${s.id}  nodes=${s.node_count}  created=${s.created_at}`);
  }
  const ids = toDelete.map(s => s.id);
  await sql`DELETE FROM sketches WHERE id = ANY(${ids}::uuid[])`;
  console.log(`  ✓ Deleted ${ids.length} sketches\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY
// ─────────────────────────────────────────────────────────────────────────────
console.log('=== VERIFY ===');
const allSketches = await sql`
  SELECT name, jsonb_array_length(nodes) AS nodes, jsonb_array_length(edges) AS edges, creation_date
  FROM sketches ORDER BY creation_date, name NULLS LAST`;
console.log('Remaining sketches:');
for (const s of allSketches) {
  console.log(`  ${(s.name || '(unnamed)').padEnd(30)} nodes=${String(s.nodes).padStart(3)}  edges=${String(s.edges).padStart(3)}  created=${s.creation_date || '—'}`);
}

const [fixedSketch] = await sql`
  SELECT nodes FROM sketches WHERE name = 'me_rakat 2026-02-03'`;
const badNodes = fixedSketch.nodes.filter(n =>
  CORRUPTED_IDS.includes(String(n.id)) && n.surveyX != null && Math.abs(n.surveyX - 199660) < 1000
);
console.log(`\nme_rakat 2026-02-03 corrupted nodes still present: ${badNodes.length} (expected 0)`);
const fixedNodes = fixedSketch.nodes.filter(n => CORRUPTED_IDS.includes(String(n.id)));
for (const n of fixedNodes) {
  console.log(`  Node ${n.id}: surveyX=${n.surveyX?.toFixed(3) ?? 'null'}  gnssFixQuality=${n.gnssFixQuality}`);
}
