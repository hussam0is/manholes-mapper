import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const sketches = await sql`SELECT id, name, edges FROM sketches ORDER BY name`;

for (const sketch of sketches.rows) {
  const edges = sketch.edges || [];
  const bad = edges.filter(e => e.length != null && e.length > 1000);
  if (bad.length > 0) {
    console.log(`\n⚠️  ${sketch.name} — ${bad.length} edges with length > 1000m:`);
    bad.sort((a,b) => b.length - a.length).slice(0,5).forEach(e => {
      console.log(`   Edge ${e.tail}->${e.head}: ${e.length}m`);
    });
  }
}
console.log('\nCheck complete.');
