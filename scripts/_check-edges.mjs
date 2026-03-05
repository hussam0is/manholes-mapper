import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dataDir = 'C:/Users/murjan.a/Desktop/App Data';

// ── 1. Build master cords map from ALL date files (latest wins) ───────────────
const cordsFiles = readdirSync(dataDir).filter(f => f.startsWith('cords_') && f.endsWith('.csv')).sort();

const masterCords = new Map(); // nodeId -> { easting, northing, elev, date }
for (const file of cordsFiles) {
  const date = file.replace('cords_', '').replace('.csv', '');
  const text = readFileSync(join(dataDir, file), 'utf-8');
  for (const line of text.trim().split('\n')) {
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const id = parts[0].trim();
    if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
    masterCords.set(id, {
      easting: parseFloat(parts[1]),
      northing: parseFloat(parts[2]),
      elev: parseFloat(parts[3]),
      date,
    });
  }
}
console.log(`Master cords across all dates: ${masterCords.size} unique node IDs\n`);

// ── 2. Check each sketch ──────────────────────────────────────────────────────
const sketchFiles = readdirSync(dataDir).filter(f => f.startsWith('sketch_') && f.endsWith('.json')).sort();

for (const sf of sketchFiles) {
  const date = sf.replace('sketch_', '').replace('.json', '');
  const d = JSON.parse(readFileSync(join(dataDir, sf), 'utf-8'));
  const nodes = (d.sketch || d).nodes || [];
  if (nodes.length === 0) continue;

  // Same-date cords
  const dateCords = new Map();
  try {
    const text = readFileSync(join(dataDir, `cords_${date}.csv`), 'utf-8');
    for (const line of text.trim().split('\n')) {
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const id = parts[0].trim();
      if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
      dateCords.set(id, { easting: parseFloat(parts[1]), northing: parseFloat(parts[2]) });
    }
  } catch {}

  const noMatchSameDate = nodes.filter(n => !dateCords.has(String(n.id)));
  const foundInOtherDate = noMatchSameDate.filter(n => masterCords.has(String(n.id)));
  const trulyMissing = noMatchSameDate.filter(n => !masterCords.has(String(n.id)));

  console.log(`--- ${sf} (${nodes.length} nodes, ${dateCords.size} cords) ---`);
  if (noMatchSameDate.length === 0) {
    console.log('  All nodes covered by same-date cords.\n');
    continue;
  }
  console.log(`  Missing in same-date cords: ${noMatchSameDate.length}`);
  console.log(`    In other-date cords: ${foundInOtherDate.length} [${foundInOtherDate.map(n=>n.id).slice(0,20).join(', ')}]`);
  if (trulyMissing.length > 0) {
    console.log(`    Truly missing (no cords anywhere): ${trulyMissing.length} [${trulyMissing.map(n=>n.id).slice(0,20).join(', ')}]`);
    // Show canvas positions of truly missing nodes
    trulyMissing.slice(0, 5).forEach(n => {
      console.log(`      node ${n.id}: x=${n.x?.toFixed(1)}, y=${n.y?.toFixed(1)}, type=${n.nodeType}`);
    });
  }
  console.log();
}
