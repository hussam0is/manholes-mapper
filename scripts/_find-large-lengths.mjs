import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const sketches = await sql`SELECT id, name, nodes, edges FROM sketches ORDER BY name`;

// Check 1: Any edges with length > 500m
let found = false;
for (const sketch of sketches.rows) {
  const edges = sketch.edges || [];
  const nodes = sketch.nodes || [];
  const nm = {};
  for (const n of nodes) nm[n.id] = n;

  for (const e of edges) {
    if (e.length != null && e.length > 500) {
      console.log(`${sketch.name}: edge ${e.tail}->${e.head} = ${e.length}m`);
      found = true;
    }
  }
}
if (!found) console.log('No edges with length > 500m');

// Check 2: Look for nodes with canvas coords that would produce huge lengths
// Large canvas coords (abs > 100000) would give huge canvas-fallback lengths
console.log('\n--- Nodes with huge canvas coords (|x| or |y| > 100000) ---');
let bigNodes = 0;
for (const sketch of sketches.rows) {
  const nodes = sketch.nodes || [];
  for (const n of nodes) {
    if (Math.abs(n.x) > 100000 || Math.abs(n.y) > 100000) {
      console.log(`${sketch.name}: node ${n.id} x=${Math.round(n.x)} y=${Math.round(n.y)} surveyX=${n.surveyX}`);
      bigNodes++;
    }
  }
}
if (!bigNodes) console.log('None found');

// Check 3: Find which sketch has nodes 53, 42, 43 visible in canvas
console.log('\n--- Sketches with nodes 53, 42, 43 ---');
for (const sketch of sketches.rows) {
  const nodes = sketch.nodes || [];
  const ids = nodes.map(n => n.id);
  if (ids.includes('53') && ids.includes('42') && ids.includes('43')) {
    const n53 = nodes.find(n => n.id === '53');
    const n42 = nodes.find(n => n.id === '42');
    console.log(`${sketch.name}: node53 x=${Math.round(n53?.x)} y=${Math.round(n53?.y)} surveyX=${n53?.surveyX}, node42 x=${Math.round(n42?.x)} y=${Math.round(n42?.y)} surveyX=${n42?.surveyX}`);
  }
}
