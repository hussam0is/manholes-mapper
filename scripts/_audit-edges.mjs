import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

// List all sketches with names + dates
const sketches = await sql`
  SELECT id, name, creation_date, project_id, updated_at,
         jsonb_array_length(nodes) as node_count,
         jsonb_array_length(edges) as edge_count
  FROM sketches ORDER BY name
`;

console.log('=== ALL SKETCHES ===');
for (const s of sketches.rows) {
  console.log(`  ${s.name || '(null)'} | nodes: ${s.node_count} | edges: ${s.edge_count} | id: ${s.id}`);
}

// Find sketch closest to 5-1-2026 (January 5 2026) by name
const target = sketches.rows.find(s =>
  s.name && (s.name.includes('2026-01-05') || s.name.includes('05-01-2026') || s.name.includes('05.01.26') || s.name.includes('2026-01') || s.name.includes('01-2026'))
);
console.log('\nTarget sketch (Jan 2026):', target?.name, target?.id);

// For each sketch, check edges with missing length and compute distances from canvas coords
for (const sketch of sketches.rows) {
  const full = await sql`SELECT nodes, edges FROM sketches WHERE id = ${sketch.id}`;
  const nodes = full.rows[0].nodes || [];
  const edges = full.rows[0].edges || [];

  // Build node map for quick lookup
  const nodeMap = {};
  for (const n of nodes) nodeMap[n.id] = n;

  // Count edges missing length, compute distances
  let missingLength = 0;
  let hasLength = 0;
  let distances = [];

  for (const e of edges) {
    if (e.length != null) {
      hasLength++;
    } else {
      missingLength++;
    }

    // Compute euclidean distance from canvas coords
    const tail = nodeMap[e.tail];
    const head = nodeMap[e.head];
    if (tail && head) {
      const dx = head.x - tail.x;
      const dy = head.y - tail.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      distances.push({ eid: e.id, tail: e.tail, head: e.head, dist: Math.round(dist), storedLen: e.length });
    }
  }

  if (edges.length > 0) {
    console.log(`\n--- ${sketch.name || sketch.id} ---`);
    console.log(`  Edges: ${edges.length} | with length: ${hasLength} | missing: ${missingLength}`);
    if (distances.length > 0) {
      const sorted = distances.sort((a, b) => b.dist - a.dist);
      console.log(`  Longest 5 (by canvas distance):`);
      for (const d of sorted.slice(0, 5)) {
        console.log(`    Edge ${d.tail}->${d.head} | canvas dist: ${d.dist}m | stored length: ${d.storedLen ?? 'NONE'}`);
      }
      console.log(`  Shortest 5:`);
      for (const d of sorted.slice(-5).reverse()) {
        console.log(`    Edge ${d.tail}->${d.head} | canvas dist: ${d.dist}m | stored length: ${d.storedLen ?? 'NONE'}`);
      }

      // Flag suspiciously long edges (potential wrong node positions)
      const avg = distances.reduce((s, d) => s + d.dist, 0) / distances.length;
      const suspicious = distances.filter(d => d.dist > avg * 5);
      if (suspicious.length > 0) {
        console.log(`  ⚠️  SUSPICIOUS edges (>5x avg ${Math.round(avg)}m):`);
        for (const d of suspicious) {
          console.log(`    Edge ${d.tail}->${d.head} | dist: ${d.dist}m`);
        }
      }
    }
  }
}
