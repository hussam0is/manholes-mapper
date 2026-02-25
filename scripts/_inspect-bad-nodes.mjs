import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const SKETCH_ID = '08505350-46cf-4cf6-9979-a76c747834fb'; // me_rakat 2026-01-05

const full = await sql`SELECT nodes, edges FROM sketches WHERE id = ${SKETCH_ID}`;
const nodes = full.rows[0].nodes || [];
const edges = full.rows[0].edges || [];
const nodeMap = {};
for (const n of nodes) nodeMap[n.id] = n;

// The outlier node IDs
const BAD_NODES = ['79', '87', '88', '99', '139', '140', '141'];

console.log('=== RAW JSON OF BAD NODES ===');
for (const id of BAD_NODES) {
  const n = nodeMap[id];
  if (n) {
    console.log(`\nNode ${id}:`);
    console.log(JSON.stringify(n, null, 2));
  }
}

// Also show neighboring nodes they connect to
console.log('\n=== NEIGHBOR NODES (what they connect to) ===');
const neighborIds = new Set();
for (const e of edges) {
  if (BAD_NODES.includes(e.tail) && !BAD_NODES.includes(e.head)) neighborIds.add(e.head);
  if (BAD_NODES.includes(e.head) && !BAD_NODES.includes(e.tail)) neighborIds.add(e.tail);
}
for (const id of neighborIds) {
  const n = nodeMap[id];
  if (n) {
    console.log(`Node ${id}: x=${Math.round(n.x)}, y=${Math.round(n.y)} | surveyX=${n.surveyX} surveyY=${n.surveyY} | itmE=${n.itmEasting} itmN=${n.itmNorthing}`);
  }
}

// Check what coordinate fields exist in the sketch data
const allKeys = new Set();
for (const n of nodes) {
  for (const k of Object.keys(n)) allKeys.add(k);
}
console.log('\n=== ALL NODE FIELD NAMES IN SKETCH ===');
console.log([...allKeys].sort().join(', '));

// Now look at a GOOD reference sketch from similar date to compare node layout
// Check me_rakat 2026-01-08 and look for nodes in the same area
const refSketch = await sql`SELECT nodes FROM sketches WHERE name = 'me_rakat 2026-01-08'`;
const refNodes = refSketch.rows[0]?.nodes || [];
const refKeys = new Set();
for (const n of refNodes) for (const k of Object.keys(n)) refKeys.add(k);
console.log('\n=== FIELD NAMES IN 2026-01-08 SKETCH ===');
console.log([...refKeys].sort().join(', '));
console.log('\nFirst 3 nodes of 2026-01-08:');
for (const n of refNodes.slice(0, 3)) {
  console.log(JSON.stringify(n, null, 2));
}
