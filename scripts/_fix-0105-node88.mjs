/**
 * Fix node 88 in me_rakat 2026-01-05.
 * Node 88 had no normal neighbors so it wasn't repositioned.
 * Place it near node 87 (which is now at the correct location).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const SKETCH_ID = '08505350-46cf-4cf6-9979-a76c747834fb';

const full = await sql`SELECT nodes, edges FROM sketches WHERE id = ${SKETCH_ID}`;
const nodes = full.rows[0].nodes;
const edges = full.rows[0].edges;
const nodeMap = {};
for (const n of nodes) nodeMap[n.id] = n;

const node87 = nodeMap['87'];
const node88 = nodeMap['88'];

console.log('Node 87 current pos:', { x: Math.round(node87.x), y: Math.round(node87.y) });
console.log('Node 88 current pos:', { x: Math.round(node88.x), y: Math.round(node88.y) });

// Place node 88 near node 87 with a small offset
node88.x = node87.x + 300;
node88.y = node87.y - 100;

// Recompute 88->87 edge length
const e8887 = edges.find(e => (e.tail === '88' && e.head === '87') || (e.tail === '87' && e.head === '88'));
if (e8887) {
  const t = nodeMap[e8887.tail], h = nodeMap[e8887.head];
  const dx = h.x - t.x, dy = h.y - t.y;
  e8887.length = Math.round(Math.sqrt(dx*dx + dy*dy) / 50 * 100) / 100;
  console.log(`Recomputed edge 88→87 length: ${e8887.length}m`);
}

console.log('Node 88 new pos:', { x: Math.round(node88.x), y: Math.round(node88.y) });

await sql`UPDATE sketches SET nodes = ${JSON.stringify(nodes)}::jsonb, edges = ${JSON.stringify(edges)}::jsonb WHERE id = ${SKETCH_ID}`;
console.log('Done.');
