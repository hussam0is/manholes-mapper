/**
 * Task 1: Find correct coords for corrupted nodes 272-278 in me_rakat 2026-02-03
 * and output the SQL to clear / reload them.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dataDir = 'C:/Users/murjan.a/Desktop/App Data';
const CORRUPTED_IDS = ['272', '273', '276', '277', '278', '279']; // surveyX ≈ 199,660 in DB
const ITM_E_MIN = 230000, ITM_E_MAX = 270000; // valid ITM easting range for Israel

// Build master cords from ALL files — only keep entries in valid ITM range
const masterCords = new Map(); // id -> [{ e, n, elev, date }]  (multiple dates)
for (const file of readdirSync(dataDir).filter(f => f.startsWith('cords_') && f.endsWith('.csv')).sort()) {
  const date = file.replace('cords_', '').replace('.csv', '');
  for (const line of readFileSync(join(dataDir, file), 'utf-8').trim().split('\n')) {
    const p = line.split(',');
    if (p.length < 3) continue;
    const id = p[0].trim();
    if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
    const e = parseFloat(p[1]), n = parseFloat(p[2]), elev = parseFloat(p[3]);
    if (!isFinite(e) || e < ITM_E_MIN || e > ITM_E_MAX) continue; // skip invalid
    if (!masterCords.has(id)) masterCords.set(id, []);
    masterCords.get(id).push({ e, n, elev, date });
  }
}

// Load the sketch JSON
const sketchRaw = JSON.parse(readFileSync(join(dataDir, 'sketch_2026-02-03.json'), 'utf-8'));
const sketchNodes = (sketchRaw.sketch || sketchRaw).nodes || [];
const nodeById = new Map(sketchNodes.map(n => [String(n.id), n]));

console.log('=== Corrupted Node Analysis ===\n');

const sqlUpdates = [];
const sqlClears = [];

for (const id of CORRUPTED_IDS) {
  const entries = masterCords.get(id) || [];
  const node = nodeById.get(id);
  console.log(`Node ${id} (${node ? `type=${node.nodeType}` : 'NOT IN JSON'}):`);

  if (entries.length === 0) {
    console.log(`  ✗ No valid ITM coordinates found in any cords file`);
    console.log(`  → Will CLEAR surveyX/Y only\n`);
    sqlClears.push(id);
  } else {
    // Use the most recent entry
    const best = entries[entries.length - 1];
    console.log(`  ✓ Found in cords_${best.date}: E${best.e.toFixed(3)} N${best.n.toFixed(3)} elev=${best.elev.toFixed(3)}`);
    if (entries.length > 1) {
      console.log(`  (Also in: ${entries.slice(0, -1).map(x => `cords_${x.date}`).join(', ')})`);
    }
    sqlUpdates.push({ id, e: best.e, n: best.n, elev: best.elev, date: best.date });
    console.log();
  }
}

// Output SQL
console.log('\n=== SQL to fix corrupted nodes in me_rakat 2026-02-03 ===\n');
console.log('-- Step 1: Capture the sketch ID');
console.log(`-- (Run this in postgres MCP with the actual sketch ID)`);
console.log();

const jsonbUpdates = [];
for (const u of sqlUpdates) {
  jsonbUpdates.push(
    `  WHEN (node->>'id') = '${u.id}' THEN jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(` +
    `node, '{surveyX}', '${u.e}'::jsonb), '{surveyY}', '${u.n}'::jsonb), ` +
    `'{surveyZ}', '${u.elev}'::jsonb), '{hasCoordinates}', 'true'), '{gnssFixQuality}', '4')`
  );
}
for (const id of sqlClears) {
  jsonbUpdates.push(
    `  WHEN (node->>'id') = '${id}' THEN jsonb_set(jsonb_set(jsonb_set(` +
    `node, '{surveyX}', 'null'::jsonb), '{surveyY}', 'null'::jsonb), '{hasCoordinates}', 'false')`
  );
}

if (jsonbUpdates.length > 0) {
  console.log(`UPDATE sketches
SET nodes = (
  SELECT jsonb_agg(
    CASE
${jsonbUpdates.join('\n')}
    ELSE node
    END
  )
  FROM jsonb_array_elements(nodes) AS node
)
WHERE name = 'me_rakat 2026-02-03';`);
}

console.log('\n-- Verify:');
console.log(`SELECT id, name, jsonb_array_length(nodes) AS node_count FROM sketches WHERE name = 'me_rakat 2026-02-03';`);
