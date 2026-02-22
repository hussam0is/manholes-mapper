/**
 * Import sketch JSON files into the me_rakat project.
 * Merges coordinates from matching cords_*.csv files into node surveyX/Y/Z.
 * Run: node scripts/import-sketches.mjs
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

config({ path: '.env.local' });

const sql = neon(process.env.POSTGRES_URL);

const PROJECT_ID = '386f545b-5558-4508-8f8e-d345e6189476';
const ADMIN_USER_ID = '6414c7d8-81ff-4367-b090-fe9d10527e5a';

const DATA_DIR = process.argv[2] || 'C:/Users/murjan.a/Desktop/App Data';

/**
 * Parse a coordinates CSV file.
 * Format: nodeId,ITM_X,ITM_Y,elevation
 * Lines starting with PRS or RTCM are reference points (skipped).
 * Returns Map<nodeId, { x, y, z }>
 */
function parseCoordinatesCSV(filePath) {
  const coords = new Map();
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('PRS') || trimmed.startsWith('RTCM')) continue;
    const parts = trimmed.split(',');
    if (parts.length < 4) continue;
    const nodeId = parts[0].trim();
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);
    if (isNaN(x) || isNaN(y)) continue;
    coords.set(nodeId, { x, y, z: isNaN(z) ? 0 : z });
  }
  return coords;
}

/**
 * Find the matching coordinates file for a sketch file.
 * sketch_2025-12-28-2.json → cords_2025-12-28.csv
 */
function findCoordsFile(sketchFile) {
  const dateMatch = sketchFile.match(/sketch_(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return null;
  const cordsFile = `cords_${dateMatch[1]}.csv`;
  const fullPath = join(DATA_DIR, cordsFile);
  return existsSync(fullPath) ? fullPath : null;
}

/**
 * Merge coordinates into sketch nodes.
 * Sets surveyX, surveyY, surveyZ, hasCoordinates on each node that has a match.
 */
function mergeCoordinates(nodes, coords) {
  let merged = 0;
  for (const node of nodes) {
    const coord = coords.get(String(node.id));
    if (coord) {
      node.surveyX = coord.x;
      node.surveyY = coord.y;
      node.surveyZ = coord.z;
      node.hasCoordinates = true;
      merged++;
    }
  }
  return merged;
}

async function main() {
  const files = readdirSync(DATA_DIR)
    .filter(f => f.startsWith('sketch_') && f.endsWith('.json'))
    .sort();

  console.log(`Found ${files.length} sketch files in ${DATA_DIR}\n`);

  // Check existing sketches in this project to avoid duplicates
  const existing = await sql`SELECT name FROM sketches WHERE project_id = ${PROJECT_ID}`;
  const existingNames = new Set(existing.map(r => r.name));
  console.log(`Existing sketches in project: ${existingNames.size}\n`);

  let imported = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = join(DATA_DIR, file);
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const sketch = data.sketch;

    // Extract date from filename for naming
    const dateMatch = file.match(/sketch_(\d{4}-\d{2}-\d{2})/);
    const name = sketch.name || `me_rakat ${dateMatch?.[1] || 'imported'}`;

    // Skip if already imported
    if (existingNames.has(name)) {
      console.log(`Skip: ${file} (already exists as "${name}")`);
      skipped++;
      continue;
    }

    // Merge coordinates from matching CSV
    const cordsFile = findCoordsFile(file);
    let coordsMerged = 0;
    if (cordsFile) {
      const coords = parseCoordinatesCSV(cordsFile);
      coordsMerged = mergeCoordinates(sketch.nodes || [], coords);
    }

    const id = randomUUID();
    const nodes = JSON.stringify(sketch.nodes || []);
    const edges = JSON.stringify(sketch.edges || []);
    const adminConfig = JSON.stringify(sketch.adminConfig || {});
    const creationDate = sketch.creationDate || dateMatch?.[1] || null;

    await sql`
      INSERT INTO sketches (id, user_id, name, creation_date, nodes, edges, admin_config, project_id, created_by, last_edited_by)
      VALUES (${id}, ${ADMIN_USER_ID}, ${name}, ${creationDate}, ${nodes}::jsonb, ${edges}::jsonb, ${adminConfig}::jsonb, ${PROJECT_ID}, ${'admin@geopoint.me'}, ${'admin@geopoint.me'})
    `;

    const nodeCount = (sketch.nodes || []).length;
    const edgeCount = (sketch.edges || []).length;
    console.log(`${file}: ${name} (${nodeCount} nodes, ${edgeCount} edges, ${coordsMerged}/${nodeCount} coords) -> ${id}`);
    imported++;
  }

  console.log(`\n=== Done ===`);
  console.log(`Imported: ${imported}, Skipped: ${skipped}, Total files: ${files.length}`);

  // Verify final count
  const total = await sql`SELECT COUNT(*) as cnt FROM sketches WHERE project_id = ${PROJECT_ID}`;
  console.log(`Total sketches in me_rakat project: ${total[0].cnt}`);
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
