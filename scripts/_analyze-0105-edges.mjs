import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const SKETCH_ID = '08505350-46cf-4cf6-9979-a76c747834fb'; // me_rakat 2026-01-05
const BAD_NODES = new Set(['79', '87', '88', '99', '139', '140', '141']);

const full = await sql`SELECT nodes, edges FROM sketches WHERE id = ${SKETCH_ID}`;
const nodes = full.rows[0].nodes || [];
const edges = full.rows[0].edges || [];
const nodeMap = {};
for (const n of nodes) nodeMap[n.id] = n;

// Find all edges involving bad nodes
const longEdges = edges.filter(e => BAD_NODES.has(e.tail) || BAD_NODES.has(e.head));

console.log(`=== EDGES INVOLVING BAD NODES (${longEdges.length} edges) ===`);
for (const e of longEdges) {
  const t = nodeMap[e.tail], h = nodeMap[e.head];
  if (!t || !h) continue;
  const dx = h.x - t.x, dy = h.y - t.y;
  const canvasDist = Math.sqrt(dx*dx + dy*dy);
  const realDist = canvasDist / 50;
  const isBadTail = BAD_NODES.has(e.tail), isBadHead = BAD_NODES.has(e.head);
  const type = (isBadTail && isBadHead) ? 'BAD-BAD' : 'BAD-NORMAL';
  console.log(`  [${type}] Edge ${e.tail}->${e.head} | real dist: ${realDist.toFixed(1)}m | stored length: ${e.length}m`);
  if (type === 'BAD-NORMAL') {
    const badNode = isBadTail ? t : h;
    const normalNode = isBadTail ? h : t;
    console.log(`    Bad node (${badNode.id}): surveyX=${badNode.surveyX}, surveyY=${badNode.surveyY}`);
    console.log(`    Normal node (${normalNode.id}): surveyX=${normalNode.surveyX}, surveyY=${normalNode.surveyY}`);
  }
}

// Count edges purely within bad cluster vs crossing to normal
const badBad = longEdges.filter(e => BAD_NODES.has(e.tail) && BAD_NODES.has(e.head));
const crossEdges = longEdges.filter(e => !(BAD_NODES.has(e.tail) && BAD_NODES.has(e.head)));

console.log(`\n=== SUMMARY ===`);
console.log(`  Bad-to-bad edges (within cluster): ${badBad.length}`);
console.log(`  Cross edges (bad to normal): ${crossEdges.length}`);

// Show bad-bad edges with distances
console.log(`\n=== BAD-TO-BAD EDGES (internal cluster connections) ===`);
for (const e of badBad) {
  const t = nodeMap[e.tail], h = nodeMap[e.head];
  if (!t || !h) continue;
  const dx = h.x - t.x, dy = h.y - t.y;
  const realDist = Math.sqrt(dx*dx + dy*dy) / 50;
  console.log(`  Edge ${e.tail}->${e.head}: ${realDist.toFixed(1)}m`);
}

// Compute bounding box of bad nodes in survey space
const badNodeList = [...BAD_NODES].map(id => nodeMap[id]).filter(Boolean).filter(n => n.surveyX != null);
const sxs = badNodeList.map(n => n.surveyX);
const sys = badNodeList.map(n => n.surveyY);
console.log(`\n=== BAD NODE CLUSTER ===`);
console.log(`  Survey X range: ${Math.min(...sxs).toFixed(1)} - ${Math.max(...sxs).toFixed(1)}`);
console.log(`  Survey Y range: ${Math.min(...sys).toFixed(1)} - ${Math.max(...sys).toFixed(1)}`);
console.log(`  Cluster span: ${((Math.max(...sxs) - Math.min(...sxs))**2 + (Math.max(...sys) - Math.min(...sys))**2)**0.5 .toFixed(1)}m`);
