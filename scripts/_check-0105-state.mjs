/**
 * Comprehensive check of me_rakat 2026-01-05 sketch state post-fix.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const SKETCH_ID = '08505350-46cf-4cf6-9979-a76c747834fb';
const FIXED_NODES = ['79', '87', '88', '99', '139', '140', '141'];

const r = await sql`SELECT nodes, edges FROM sketches WHERE id = ${SKETCH_ID}`;
const nodes = r.rows[0].nodes;
const edges = r.rows[0].edges;
const nm = {};
for (const n of nodes) nm[n.id] = n;

console.log(`=== SKETCH STATE: me_rakat 2026-01-05 ===`);
console.log(`Nodes: ${nodes.length}, Edges: ${edges.length}`);

// 1. Check the fixed nodes' current state
console.log('\n=== FIXED NODES CURRENT STATE ===');
for (const id of FIXED_NODES) {
  const n = nm[id];
  if (!n) { console.log(`  Node ${id}: MISSING`); continue; }
  console.log(`  Node ${id}: x=${Math.round(n.x)}, y=${Math.round(n.y)} | surveyX=${n.surveyX} | hasCoords=${n.hasCoordinates}`);
}

// 2. Check all edges involving fixed nodes
console.log('\n=== EDGES INVOLVING FIXED NODES ===');
for (const e of edges) {
  if (!FIXED_NODES.includes(e.tail) && !FIXED_NODES.includes(e.head)) continue;
  const t = nm[e.tail], h = nm[e.head];
  if (!t || !h) { console.log(`  Edge ${e.tail}->${e.head}: MISSING NODE`); continue; }
  const dx = h.x - t.x, dy = h.y - t.y;
  const canvasDist = Math.sqrt(dx*dx + dy*dy);
  const realDist = canvasDist / 50;
  console.log(`  Edge ${e.tail}->${e.head}: canvas_dist=${canvasDist.toFixed(0)} | real_dist=${realDist.toFixed(1)}m | stored_len=${e.length}m`);
}

// 3. Check ITM coordinate consistency for normal nodes
console.log('\n=== ITM CONSISTENCY CHECK (normal nodes with survey coords) ===');
const REF_X = 249965.884, REF_Y = 744832.146;
let inconsistent = 0;
for (const n of nodes) {
  if (FIXED_NODES.includes(n.id)) continue; // skip fixed nodes
  if (!n.surveyX || !n.surveyY) continue;
  const expectedX = (n.surveyX - REF_X) * 50;
  const expectedY = (REF_Y - n.surveyY) * 50;
  const dxErr = Math.abs(n.x - expectedX);
  const dyErr = Math.abs(n.y - expectedY);
  if (dxErr > 1 || dyErr > 1) {
    console.log(`  Node ${n.id}: canvas(${Math.round(n.x)},${Math.round(n.y)}) vs expected(${Math.round(expectedX)},${Math.round(expectedY)}) err=(${dxErr.toFixed(1)},${dyErr.toFixed(1)})`);
    inconsistent++;
  }
}
if (inconsistent === 0) console.log('  All normal nodes consistent with reference point ✓');
else console.log(`  ${inconsistent} nodes inconsistent!`);

// 4. Compute total km
const totalKm = edges.reduce((s, e) => s + (e.length || 0), 0) / 1000;
console.log(`\n=== TOTAL KM ===`);
console.log(`  Sum of stored lengths: ${totalKm.toFixed(3)} km`);
console.log(`  Edge length range: min=${Math.min(...edges.filter(e=>e.length).map(e=>e.length)).toFixed(2)}m, max=${Math.max(...edges.filter(e=>e.length).map(e=>e.length)).toFixed(2)}m`);

// 5. Check for nodes at same position (near-duplicate positions)
console.log('\n=== NEAR-DUPLICATE NODE POSITIONS (< 5m apart) ===');
let dupes = 0;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i+1; j < nodes.length; j++) {
    const n1 = nodes[i], n2 = nodes[j];
    const dist = Math.sqrt((n1.x-n2.x)**2 + (n1.y-n2.y)**2) / 50;
    if (dist < 5) {
      console.log(`  Nodes ${n1.id} & ${n2.id}: ${dist.toFixed(1)}m apart (canvas dist=${Math.sqrt((n1.x-n2.x)**2 + (n1.y-n2.y)**2).toFixed(0)})`);
      dupes++;
    }
  }
}
if (dupes === 0) console.log('  No near-duplicates found ✓');

// 6. Check the reference point derivation from normal nodes
const normalNodesWithCoords = nodes.filter(n => !FIXED_NODES.includes(n.id) && n.surveyX && n.surveyY);
const derivedRefXs = normalNodesWithCoords.map(n => n.surveyX - n.x/50);
const derivedRefYs = normalNodesWithCoords.map(n => n.surveyY + n.y/50);
const avgRefX = derivedRefXs.reduce((s,v)=>s+v,0)/derivedRefXs.length;
const avgRefY = derivedRefYs.reduce((s,v)=>s+v,0)/derivedRefYs.length;
console.log(`\n=== DERIVED REFERENCE POINT ===`);
console.log(`  Derived refX: ${avgRefX.toFixed(3)} (expected ~${REF_X})`);
console.log(`  Derived refY: ${avgRefY.toFixed(3)} (expected ~${REF_Y})`);
