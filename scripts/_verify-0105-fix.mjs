import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const r = await sql`SELECT nodes, edges FROM sketches WHERE id = '08505350-46cf-4cf6-9979-a76c747834fb'`;
const nodes = r.rows[0].nodes;
const edges = r.rows[0].edges;
const nm = {};
for (const n of nodes) nm[n.id] = n;

const dists = edges.map(e => {
  const t = nm[e.tail], h = nm[e.head];
  if (!t || !h) return null;
  const d = Math.sqrt((h.x-t.x)**2+(h.y-t.y)**2)/50;
  return { t: e.tail, h: e.head, d: d.toFixed(1), stored: e.length };
}).filter(Boolean).sort((a,b) => b.d - a.d);

console.log('Top 10 longest edges after fix:');
dists.slice(0,10).forEach(d => console.log(`  ${d.t}->${d.h}: real_dist=${d.d}m, stored=${d.stored}m`));
console.log(`\nMax dist: ${dists[0]?.d}m`);
console.log(`All edges <= 100m: ${dists.filter(d => parseFloat(d.d) > 100).length} edges > 100m`);
