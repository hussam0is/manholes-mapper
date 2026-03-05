import { readFileSync } from 'fs';
import { join } from 'path';

const dataDir = 'C:\\Users\\murjan.a\\Desktop\\App Data';
const sketchPath = join(dataDir, 'sketch_2026-02-16.json');
const cordsPath = join(dataDir, 'cords_2026-02-16.csv');

const raw = readFileSync(sketchPath, 'utf-8');
const d = JSON.parse(raw);
console.log('Top-level keys:', Object.keys(d));

// Find nodes - could be d.nodes or nested
let n = d.nodes || [];
if (n.length === 0 && d.sketch) n = d.sketch.nodes || [];
if (n.length === 0) {
  // Try to find nodes in any nested structure
  const str = JSON.stringify(d).slice(0, 2000);
  console.log('First 2000 chars of JSON:', str);
}

console.log('Total nodes:', n.length);

// Show first 10 nodes
n.slice(0, 10).forEach(x => {
  const sx = x.surveyX !== undefined && x.surveyX !== null ? x.surveyX : 'NONE';
  const gq = x.gnssFixQuality !== undefined && x.gnssFixQuality !== null ? x.gnssFixQuality : 'NONE';
  const hc = x.hasCoordinates ? true : false;
  console.log(`  id=${x.id}  surveyX=${sx}  gnssFixQ=${gq}  hasCoords=${hc}  type=${x.type}  nodeType=${x.nodeType}`);
});

// Unique gnssFixQuality values
const qualities = [...new Set(n.map(x => x.gnssFixQuality))];
console.log('\nUnique gnssFixQuality values:', qualities);

// Count with/without surveyX
const withSurvey = n.filter(x => x.surveyX !== undefined && x.surveyX !== null).length;
console.log('Nodes with surveyX:', withSurvey, '/', n.length);

// Parse cords file
const cordsText = readFileSync(cordsPath, 'utf-8');
const cordsLines = cordsText.trim().split('\n').filter(l => l.trim());
const cordsMap = new Map();
for (const line of cordsLines) {
  const parts = line.split(',');
  if (parts.length >= 3) {
    const id = parts[0].trim();
    // Skip RTCM control points
    if (id.startsWith('RTCM')) continue;
    cordsMap.set(id, { easting: parseFloat(parts[1]), northing: parseFloat(parts[2]), elev: parseFloat(parts[3]) });
  }
}
console.log('\nCords file entries (non-RTCM):', cordsMap.size);

// Check: how many sketch nodes have matching cords entries
let matchCount = 0;
let noMatch = [];
for (const node of n) {
  if (cordsMap.has(String(node.id))) {
    matchCount++;
  } else {
    noMatch.push(node.id);
  }
}
console.log('Nodes with matching cords entry:', matchCount, '/', n.length);
if (noMatch.length > 0) {
  console.log('Nodes WITHOUT cords match (first 20):', noMatch.slice(0, 20));
}

// Check: cords entries without matching nodes
const nodeIds = new Set(n.map(x => String(x.id)));
const cordsOnly = [...cordsMap.keys()].filter(k => !nodeIds.has(k));
if (cordsOnly.length > 0) {
  console.log('Cords entries without node match (first 20):', cordsOnly.slice(0, 20));
}
