/**
 * Compute and store edge lengths for all sketches.
 * Uses surveyX/Y (ITM metres) when available on both endpoints.
 * Falls back to canvas-coord distance / 50 (canvas scale ≈ 50 px per metre).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

const CANVAS_SCALE = 50; // canvas units per ITM metre

function itmDist(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

const sketches = await sql`SELECT id, name, nodes, edges FROM sketches ORDER BY name`;

let totalEdges = 0, updatedEdges = 0, surveyBased = 0, canvasBased = 0, sketchesUpdated = 0;

for (const sketch of sketches.rows) {
  const nodes = sketch.nodes || [];
  const edges = sketch.edges || [];
  if (!edges.length) continue;

  const nodeMap = {};
  for (const n of nodes) nodeMap[n.id] = n;

  let changed = false;

  for (const e of edges) {
    totalEdges++;
    const t = nodeMap[e.tail];
    const h = nodeMap[e.head];
    if (!t || !h) continue;

    let len = null;

    if (t.surveyX != null && t.surveyY != null && h.surveyX != null && h.surveyY != null) {
      // Euclidean distance in ITM metres
      len = Math.round(itmDist(t.surveyX, t.surveyY, h.surveyX, h.surveyY) * 100) / 100;
      surveyBased++;
    } else {
      // Fallback: canvas distance ÷ scale
      len = Math.round(itmDist(t.x, t.y, h.x, h.y) / CANVAS_SCALE * 100) / 100;
      canvasBased++;
    }

    if (len !== null && len !== e.length) {
      e.length = len;
      changed = true;
      updatedEdges++;
    }
  }

  if (changed) {
    await sql`UPDATE sketches SET edges = ${JSON.stringify(edges)}::jsonb WHERE id = ${sketch.id}`;
    sketchesUpdated++;
    console.log(`✓ ${sketch.name} — updated ${edges.filter(e => e.length != null).length} edge lengths`);
  }
}

console.log(`\n=== DONE ===`);
console.log(`Sketches updated: ${sketchesUpdated}`);
console.log(`Edges updated: ${updatedEdges} / ${totalEdges}`);
console.log(`  Survey-based (ITM): ${surveyBased}`);
console.log(`  Canvas-based (fallback): ${canvasBased}`);
