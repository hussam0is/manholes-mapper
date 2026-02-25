import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { sql } from '@vercel/postgres';

const result = await sql`
  SELECT id, name, creation_date, project_id, updated_at, nodes, edges
  FROM sketches
  ORDER BY updated_at DESC
`;

for (const sketch of result.rows) {
  console.log('\n========================================');
  console.log('Sketch:', sketch.id);
  console.log('Name:', sketch.name, '| Creation date:', sketch.creation_date, '| Updated:', sketch.updated_at);
  console.log('Project:', sketch.project_id);
  console.log('Nodes (' + (sketch.nodes?.length || 0) + '):');
  for (const n of (sketch.nodes || [])) {
    console.log('  Node', n.id, '| canvas(', Math.round(n.x||0), ',', Math.round(n.y||0), ') | ITM E:', n.itmEasting, 'N:', n.itmNorthing, '| hasCoords:', n.hasCoordinates);
  }
  console.log('Edges (' + (sketch.edges?.length || 0) + '):');
  for (const e of (sketch.edges || [])) {
    console.log('  Edge', e.id, ':', e.tail, '->', e.head, '| length:', e.length, '| material:', e.material, '| diameter:', e.diameter);
  }
}

console.log('\n=== SUMMARY ===');
console.log('Total sketches:', result.rows.length);
let totalNodes = 0, totalEdges = 0, nodesWithCoords = 0, edgesWithLength = 0;
for (const s of result.rows) {
  totalNodes += s.nodes?.length || 0;
  totalEdges += s.edges?.length || 0;
  nodesWithCoords += (s.nodes||[]).filter(n => n.hasCoordinates || n.itmEasting).length;
  edgesWithLength += (s.edges||[]).filter(e => e.length != null).length;
}
console.log('Total nodes:', totalNodes, '| with ITM coords:', nodesWithCoords);
console.log('Total edges:', totalEdges, '| with length field:', edgesWithLength);
