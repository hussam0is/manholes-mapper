/**
 * Fix me_rakat 2026-01-05: 7 nodes captured at incorrect GPS positions (~1.1km from network).
 * Strategy:
 *   - Clear bad surveyX/Y/Z and set hasCoordinates=false, gnssFixQuality=0
 *   - Reposition canvas x/y to centroid of their normal (correctly-placed) neighbors
 * This preserves graph topology while removing the impossible 1km+ pipe spans visually.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const SKETCH_ID = '08505350-46cf-4cf6-9979-a76c747834fb'; // me_rakat 2026-01-05
const BAD_NODES = new Set(['79', '87', '88', '99', '139', '140', '141']);

const full = await sql`SELECT nodes, edges FROM sketches WHERE id = ${SKETCH_ID}`;
const nodes = full.rows[0].nodes;
const edges = full.rows[0].edges;

const nodeMap = {};
for (const n of nodes) nodeMap[n.id] = n;

// Build adjacency: for each bad node, find its NORMAL (non-bad) neighbors
const normalNeighbors = {};
for (const id of BAD_NODES) normalNeighbors[id] = [];

for (const e of edges) {
  if (BAD_NODES.has(e.tail) && !BAD_NODES.has(e.head)) {
    normalNeighbors[e.tail].push(e.head);
  }
  if (BAD_NODES.has(e.head) && !BAD_NODES.has(e.tail)) {
    normalNeighbors[e.head].push(e.tail);
  }
}

console.log('=== REPOSITIONING PLAN ===');
for (const [badId, neighborIds] of Object.entries(normalNeighbors)) {
  const badNode = nodeMap[badId];
  if (!badNode) continue;

  const neighborNodes = neighborIds.map(id => nodeMap[id]).filter(Boolean);
  if (neighborNodes.length === 0) {
    console.log(`  Node ${badId}: no normal neighbors — will zero coords but skip repositioning`);
    continue;
  }

  // Centroid of normal neighbors
  const centroidX = neighborNodes.reduce((s, n) => s + n.x, 0) / neighborNodes.length;
  const centroidY = neighborNodes.reduce((s, n) => s + n.y, 0) / neighborNodes.length;

  // Add small offset to avoid overlapping (based on node id parity)
  const offsetX = (parseInt(badId) % 3 - 1) * 200;
  const offsetY = (parseInt(badId) % 2 === 0 ? 1 : -1) * 200;

  console.log(`  Node ${badId}:`);
  console.log(`    Old pos: x=${Math.round(badNode.x)}, y=${Math.round(badNode.y)} (surveyX=${badNode.surveyX}, surveyY=${badNode.surveyY})`);
  console.log(`    Neighbors: ${neighborIds.join(', ')}`);
  console.log(`    New pos: x=${Math.round(centroidX + offsetX)}, y=${Math.round(centroidY + offsetY)}`);
}

// Apply the fix
let fixedCount = 0;
for (const n of nodes) {
  if (!BAD_NODES.has(n.id)) continue;

  const neighborIds = normalNeighbors[n.id] || [];
  const neighborNodes = neighborIds.map(id => nodeMap[id]).filter(Boolean);

  // Clear bad GPS data
  n.surveyX = null;
  n.surveyY = null;
  n.surveyZ = null;
  n.hasCoordinates = false;
  n.gnssFixQuality = 0;

  // Reposition to centroid of normal neighbors (if any)
  if (neighborNodes.length > 0) {
    const centroidX = neighborNodes.reduce((s, nn) => s + nn.x, 0) / neighborNodes.length;
    const centroidY = neighborNodes.reduce((s, nn) => s + nn.y, 0) / neighborNodes.length;
    const offsetX = (parseInt(n.id) % 3 - 1) * 200;
    const offsetY = (parseInt(n.id) % 2 === 0 ? 1 : -1) * 200;
    n.x = centroidX + offsetX;
    n.y = centroidY + offsetY;
  }

  fixedCount++;
}

// Also recompute edges lengths now that positions changed
// (nodes that only connected to other bad nodes might need special handling)
const CANVAS_SCALE = 50;
let edgesRecomputed = 0;
for (const e of edges) {
  const t = nodeMap[e.tail], h = nodeMap[e.head];
  if (!t || !h) continue;
  // For edges involving bad nodes (which now have no survey coords), use canvas distance
  if (BAD_NODES.has(e.tail) || BAD_NODES.has(e.head)) {
    const dx = h.x - t.x, dy = h.y - t.y;
    e.length = Math.round(Math.sqrt(dx*dx + dy*dy) / CANVAS_SCALE * 100) / 100;
    edgesRecomputed++;
  }
}

await sql`UPDATE sketches SET nodes = ${JSON.stringify(nodes)}::jsonb, edges = ${JSON.stringify(edges)}::jsonb WHERE id = ${SKETCH_ID}`;

console.log(`\n=== DONE ===`);
console.log(`Fixed ${fixedCount} bad nodes (cleared survey coords, repositioned to neighbor centroid)`);
console.log(`Recomputed ${edgesRecomputed} edge lengths involving bad nodes`);
