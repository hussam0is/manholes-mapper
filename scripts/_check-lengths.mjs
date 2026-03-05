import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dataDir = 'C:/Users/murjan.a/Desktop/App Data';

// Build master cords WITH source date
const masterCords = new Map();   // id -> { e, n, elev, date, file }
for (const file of readdirSync(dataDir).filter(f => f.startsWith('cords_') && f.endsWith('.csv')).sort()) {
  const date = file.replace('cords_', '').replace('.csv', '');
  for (const line of readFileSync(join(dataDir, file), 'utf-8').trim().split('\n')) {
    const p = line.split(',');
    if (p.length < 3) continue;
    const id = p[0].trim();
    if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
    masterCords.set(id, { e: parseFloat(p[1]), n: parseFloat(p[2]), elev: parseFloat(p[3]), date, file });
  }
}

// Load sketch
const raw = readFileSync(join(dataDir, 'sketch_2026-01-05.json'), 'utf-8');
const sketch = (JSON.parse(raw).sketch || JSON.parse(raw));
const nodes = sketch.nodes || [];
const edges = sketch.edges || [];
const nodeById = new Map(nodes.map(n => [String(n.id), n]));

// Compute all edge lengths using master cords
const suspicious = []; // edges > 200m
for (const e of edges) {
  const tId = String(e.tail ?? e.from);
  const hId = String(e.head ?? e.to);
  const tc = masterCords.get(tId);
  const hc = masterCords.get(hId);
  if (!tc || !hc) continue;
  const len = Math.sqrt((hc.e - tc.e) ** 2 + (hc.n - tc.n) ** 2);
  if (len > 200) suspicious.push({ tId, hId, len: Math.round(len), tc, hc });
}
suspicious.sort((a, b) => b.len - a.len);

// Find all unique "far" node IDs (those with E~250xxx)
const farNodeIds = new Set();
for (const s of suspicious) {
  if (s.tc.e > 250000) farNodeIds.add(s.tId);
  if (s.hc.e > 250000) farNodeIds.add(s.hId);
}

console.log('=== Suspicious long edges (>200m) ===');
for (const s of suspicious) {
  console.log(`  ${s.tId} [E${s.tc.e.toFixed(0)} N${s.tc.n.toFixed(0)} from ${s.tc.date}]`);
  console.log(`   → ${s.hId} [E${s.hc.e.toFixed(0)} N${s.hc.n.toFixed(0)} from ${s.hc.date}]`);
  console.log(`   distance: ${s.len}m\n`);
}

console.log('\n=== "Far" nodes (Easting > 250000) ===');
for (const id of [...farNodeIds].sort((a, b) => Number(a) - Number(b))) {
  const c = masterCords.get(id);
  console.log(`  node ${id}: E${c.e.toFixed(3)} N${c.n.toFixed(3)} elev=${c.elev} — from cords file: ${c.file}`);
}

console.log('\n=== Easting distribution of ALL nodes in sketch ===');
const bins = { '248xxx': 0, '249xxx': 0, '250xxx': 0, '251xxx': 0, other: 0 };
for (const n of nodes) {
  const c = masterCords.get(String(n.id));
  if (!c) { bins.other++; continue; }
  const bin = Math.floor(c.e / 1000);
  if (bin === 248) bins['248xxx']++;
  else if (bin === 249) bins['249xxx']++;
  else if (bin === 250) bins['250xxx']++;
  else if (bin === 251) bins['251xxx']++;
  else bins.other++;
}
console.log('  ', bins);

// Check if the "far" cords file has a systematic offset vs same-date cords for shared nodes
console.log('\n=== Check if far-node cords file covers other nodes too ===');
const farFiles = new Set([...farNodeIds].map(id => masterCords.get(id).file));
for (const ff of farFiles) {
  const date = ff.replace('cords_', '').replace('.csv', '');
  // load that file
  const fileContent = readFileSync(join(dataDir, ff), 'utf-8');
  const entries = [];
  for (const line of fileContent.trim().split('\n')) {
    const p = line.split(',');
    if (p.length < 3) continue;
    const id = p[0].trim();
    if (!id || id.startsWith('RTCM') || id.startsWith('PRS')) continue;
    entries.push({ id, e: parseFloat(p[1]), n: parseFloat(p[2]) });
  }
  const inSketch = entries.filter(x => nodeById.has(x.id));
  const normal = inSketch.filter(x => x.e < 250000);
  const far = inSketch.filter(x => x.e >= 250000);
  console.log(`  ${ff}: ${entries.length} total, ${inSketch.length} in sketch → ${normal.length} normal (E249xxx), ${far.length} far (E250xxx+)`);
  if (far.length > 0) {
    console.log('    Far entries:', far.map(x => `${x.id}:E${x.e.toFixed(0)}`).join(', '));
  }
}
