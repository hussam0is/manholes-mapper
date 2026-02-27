import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
config({ path: '.env.local' });
const sql = neon(process.env.POSTGRES_URL);
const rows = await sql`SELECT id, name, updated_at, jsonb_array_length(nodes) AS n FROM sketches ORDER BY name`;
for (const r of rows) console.log(`${r.name.padEnd(35)} nodes:${r.n} updated:${r.updated_at}`);
