import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const SKETCH_ID = '08505350-46cf-4cf6-9979-a76c747834fb'; // me_rakat 2026-01-05

const full = await sql`SELECT nodes, edges FROM sketches WHERE id = ${SKETCH_ID}`;
const nodes = full.rows[0].nodes || [];
const edges = full.rows[0].edges || [];

// Build node map
const nodeMap = {};
for (const n of nodes) nodeMap[n.id] = n;

// Compute all edge distances and find outliers
const dists = [];
for (const e of edges) {
  const t = nodeMap[e.tail], h = nodeMap[e.head];
  if (!t || !h) continue;
  const dist = Math.round(Math.sqrt((h.x - t.x) ** 2 + (h.y - t.y) ** 2));
  dists.push({ eid: e.id, tail: e.tail, head: e.head, dist });
}

// Identify nodes connected to suspicious edges
const threshold = 10000; // 10km in canvas units is clearly wrong
const suspNodes = new Set();
for (const d of dists) {
  if (d.dist > threshold) {
    suspNodes.add(d.tail);
    suspNodes.add(d.head);
    console.log(`⚠️  Edge ${d.tail}->${d.head} | dist: ${d.dist}m`);
  }
}

console.log('\n=== SUSPICIOUS NODES ===');
for (const nid of suspNodes) {
  const n = nodeMap[nid];
  console.log(`  Node ${nid} | x: ${n.x}, y: ${n.y} | hasCoords: ${n.hasCoordinates}`);
}

// Find all "normal" nodes — establish the bounding box of sane data
const normalNodes = nodes.filter(n => !suspNodes.has(n.id));
const xs = normalNodes.map(n => n.x);
const ys = normalNodes.map(n => n.y);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
const avgX = xs.reduce((s, v) => s + v, 0) / xs.length;
const avgY = ys.reduce((s, v) => s + v, 0) / ys.length;

console.log(`\n=== NORMAL NODE BOUNDS (${normalNodes.length} nodes) ===`);
console.log(`  X range: ${Math.round(minX)} - ${Math.round(maxX)}`);
console.log(`  Y range: ${Math.round(minY)} - ${Math.round(maxY)}`);
console.log(`  Centroid: (${Math.round(avgX)}, ${Math.round(avgY)})`);

// Check what other sketches look like — use 2026-01-08 which is similar and clean
const nearby = await sql`
  SELECT id, name, nodes FROM sketches
  WHERE name LIKE 'me_rakat 2026-01%' AND id != ${SKETCH_ID}
  ORDER BY name
`;

for (const s of nearby.rows) {
  const sns = s.nodes || [];
  if (sns.length === 0) continue;
  const sxs = sns.map(n => n.x);
  const sys = sns.map(n => n.y);
  console.log(`\nRef sketch "${s.name}" (${sns.length} nodes):`);
  console.log(`  X: ${Math.round(Math.min(...sxs))} - ${Math.round(Math.max(...sxs))}`);
  console.log(`  Y: ${Math.round(Math.min(...sys))} - ${Math.round(Math.max(...sys))}`);
}

console.log('\n=== FULL SUSPICIOUS NODE DATA ===');
for (const nid of suspNodes) {
  const n = { ...nodeMap[nid] };
  console.log(JSON.stringify({ id: n.id, x: n.x, y: n.y, hasCoordinates: n.hasCoordinates }));
}

// Check which nodes in 2026-01-05 are OUTSIDE the normal bounds (5x sigma)
const stdX = Math.sqrt(xs.map(x => (x - avgX) ** 2).reduce((s, v) => s + v, 0) / xs.length);
const stdY = Math.sqrt(ys.map(y => (y - avgY) ** 2).reduce((s, v) => s + v, 0) / ys.length);
console.log(`\nStdDev X: ${Math.round(stdX)}, Y: ${Math.round(stdY)}`);
console.log('All outlier nodes (>5 stddev from mean):');
for (const n of nodes) {
  const devX = Math.abs(n.x - avgX), devY = Math.abs(n.y - avgY);
  if (devX > 5 * stdX || devY > 5 * stdY) {
    console.log(`  Node ${n.id} | x: ${Math.round(n.x)}, y: ${Math.round(n.y)} | devX: ${Math.round(devX)}, devY: ${Math.round(devY)}`);
  }
}
