/**
 * Backfill surveyX/Y/Z and measure_precision on existing sketches in the cloud DB.
 * Reads cords_*.csv files from the App Data directory and updates matching nodes.
 *
 * Run: node scripts/backfill-measured-coords.mjs
 *      node scripts/backfill-measured-coords.mjs --dry-run
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

config({ path: '.env.local' });

const sql = neon(process.env.POSTGRES_URL);
const DRY_RUN = process.argv.includes('--dry-run');

const DATA_DIR = 'C:/Users/murjan.a/Desktop/App Data';

/** Mapping: cords CSV filename → sketch creation date (used to match DB rows) */
const CORDS_TO_DATE = {
  'cords_2025-12-07.csv': '2025-12-07',
  'cords_2025-12-08.csv': '2025-12-08',
  'cords_2025-12-21.csv': '2025-12-21',
  'cords_2025-12-28.csv': '2025-12-28',
  'cords_2026-01-05.csv': '2026-01-05',
  'cords_2026-01-08.csv': '2026-01-08',
  'cords_2026-01-20.csv': '2026-01-20',
  'cords_2026-01-22.csv': '2026-01-22',
  'cords_2026-02-12.csv': '2026-02-12',
};

/**
 * Parse a coordinates CSV file.
 * Format: nodeId,ITM_X,ITM_Y,elevation[,]
 * Skips lines starting with PRS or RTCM (reference points).
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

async function main() {
  if (DRY_RUN) console.log('=== DRY RUN (no DB writes) ===\n');

  let totalNodesUpdated = 0;
  let totalSketchesUpdated = 0;

  for (const [cordsFile, creationDate] of Object.entries(CORDS_TO_DATE)) {
    const filePath = join(DATA_DIR, cordsFile);
    if (!existsSync(filePath)) {
      console.log(`Skip: ${cordsFile} — file not found`);
      continue;
    }

    const coords = parseCoordinatesCSV(filePath);
    console.log(`\n${cordsFile}: ${coords.size} coordinate points`);

    // Find all sketches matching this date (both project-linked and orphans)
    const sketches = await sql`
      SELECT id, nodes, name
      FROM sketches
      WHERE creation_date::date = ${creationDate}::date
        AND name LIKE 'me_rakat%'
    `;

    if (sketches.length === 0) {
      console.log(`  No sketches found for date ${creationDate}`);
      continue;
    }

    for (const sketch of sketches) {
      const nodes = sketch.nodes || [];
      let updated = 0;

      for (const node of nodes) {
        const coord = coords.get(String(node.id));
        if (coord) {
          node.surveyX = coord.x;
          node.surveyY = coord.y;
          node.surveyZ = coord.z;
          node.hasCoordinates = true;
          node.measure_precision = 0.02; // TSC3 RTK default
          updated++;
        }
      }

      console.log(`  ${sketch.id} (${sketch.name}): ${updated}/${nodes.length} nodes updated`);

      if (updated > 0 && !DRY_RUN) {
        await sql`
          UPDATE sketches
          SET nodes = ${JSON.stringify(nodes)}::jsonb,
              updated_at = NOW()
          WHERE id = ${sketch.id}
        `;
        console.log(`    -> DB updated`);
        totalSketchesUpdated++;
      }

      totalNodesUpdated += updated;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Total nodes updated: ${totalNodesUpdated}, Sketches updated: ${totalSketchesUpdated}`);
  if (DRY_RUN) console.log('(dry run — no changes written)');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
