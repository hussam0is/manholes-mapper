/**
 * Correct consistency check using the ACTUAL project reference point.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const SKETCH_ID = '08505350-46cf-4cf6-9979-a76c747834fb';
const FIXED_NODES = new Set(['79', '87', '88', '99', '139', '140', '141']);

const r = await sql`SELECT nodes, edges FROM sketches WHERE id = ${SKETCH_ID}`;
const nodes = r.rows[0].nodes;
const edges = r.rows[0].edges;
const nm = {};
for (const n of nodes) nm[n.id] = n;

// Derive the actual reference point from nodes WITH survey coords
const withCoords = nodes.filter(n => !FIXED_NODES.has(n.id) && n.surveyX && n.surveyY);
const refXs = withCoords.map(n => n.surveyX - n.x/50);
const refYs = withCoords.map(n => n.surveyY + n.y/50);
const REF_X = refXs.reduce((s,v) => s+v, 0) / refXs.length;
const REF_Y = refYs.reduce((s,v) => s+v, 0) / refYs.length;
console.log(`Actual reference point: refX=${REF_X.toFixed(3)}, refY=${REF_Y.toFixed(3)}`);

// Consistency check with actual reference
let badCount = 0;
for (const n of withCoords) {
  const expectedX = (n.surveyX - REF_X) * 50;
  const expectedY = (REF_Y - n.surveyY) * 50;
  const dxErr = Math.abs(n.x - expectedX);
  const dyErr = Math.abs(n.y - expectedY);
  if (dxErr > 2 || dyErr > 2) { badCount++; }
}
console.log(`Canvas coords consistent with actual refPoint: ${withCoords.length - badCount}/${withCoords.length} ✓`);

// Fixed nodes - check their derived ITM position
console.log('\n=== FIXED NODES - DERIVED ITM POSITIONS ===');
for (const id of FIXED_NODES) {
  const n = nm[id];
  if (!n) continue;
  const itmE = REF_X + n.x / 50;
  const itmN = REF_Y - n.y / 50;
  const neighborEdges = edges.filter(e => e.tail === id || e.head === id);
  const neighborIds = neighborEdges.map(e => e.tail === id ? e.head : e.tail);
  const neighborITM = neighborIds.map(nid => {
    const nb = nm[nid];
    if (!nb || !nb.surveyX) return null;
    return { id: nid, itmE: nb.surveyX, itmN: nb.surveyY };
  }).filter(Boolean);

  console.log(`  Node ${id}: derived ITM E=${itmE.toFixed(1)}, N=${itmN.toFixed(1)}`);
  for (const nb of neighborITM) {
    const dist = Math.sqrt((itmE - nb.itmE)**2 + (itmN - nb.itmN)**2);
    console.log(`    → neighbor ${nb.id}: ITM E=${nb.itmE.toFixed(1)}, N=${nb.itmN.toFixed(1)} (dist: ${dist.toFixed(1)}m)`);
  }
}

// Check for any suspicious long edges
console.log('\n=== ALL EDGES > 50m ===');
const longEdges = edges.filter(e => e.length > 50).sort((a,b) => b.length - a.length);
for (const e of longEdges) {
  console.log(`  Edge ${e.tail}->${e.head}: ${e.length}m`);
}
if (longEdges.length === 0) console.log('  None');

// Total km
const totalKm = edges.reduce((s,e) => s + (e.length||0), 0) / 1000;
console.log(`\nTotal km: ${totalKm.toFixed(3)} km (${edges.length} edges)`);
