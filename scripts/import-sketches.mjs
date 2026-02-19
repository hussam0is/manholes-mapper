/**
 * Import sketch JSON files into the me_rakat project.
 * Run: node scripts/import-sketches.mjs
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

config({ path: '.env.local' });

const sql = neon(process.env.POSTGRES_URL);

const PROJECT_ID = '386f545b-5558-4508-8f8e-d345e6189476';
const ADMIN_USER_ID = '6414c7d8-81ff-4367-b090-fe9d10527e5a';

const SKETCH_FILES = [
  'G:/My Drive/GIS DRIVE/me_rakat/app sketches and cords/sketch_2025-12-21.json',
  'G:/My Drive/GIS DRIVE/me_rakat/app sketches and cords/sketch_2026-01-05 (1).json',
];

async function main() {
  for (const file of SKETCH_FILES) {
    console.log('Importing:', file);
    const raw = readFileSync(file, 'utf-8');
    const data = JSON.parse(raw);
    const sketch = data.sketch;

    const id = randomUUID();
    const name = sketch.name || `me_rakat ${sketch.creationDate || 'imported'}`;
    const nodes = JSON.stringify(sketch.nodes || []);
    const edges = JSON.stringify(sketch.edges || []);
    const adminConfig = JSON.stringify(sketch.adminConfig || {});
    const creationDate = sketch.creationDate || null;

    await sql`
      INSERT INTO sketches (id, user_id, name, creation_date, nodes, edges, admin_config, project_id, created_by, last_edited_by)
      VALUES (${id}, ${ADMIN_USER_ID}, ${name}, ${creationDate}, ${nodes}::jsonb, ${edges}::jsonb, ${adminConfig}::jsonb, ${PROJECT_ID}, ${'admin@geopoint.me'}, ${'admin@geopoint.me'})
    `;

    const nodeCount = (sketch.nodes || []).length;
    const edgeCount = (sketch.edges || []).length;
    console.log(`  Imported: ${name} (${nodeCount} nodes, ${edgeCount} edges) → ${id}`);
  }

  console.log('\nDone! Imported', SKETCH_FILES.length, 'sketches into project', PROJECT_ID);
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
