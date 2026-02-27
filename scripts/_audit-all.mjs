/**
 * Comprehensive Sketch Data Audit Script
 * Reads all App Data files (cords, nodes, edges, sketch JSON) for each date
 * and performs multi-dimensional analysis.
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = 'C:/Users/murjan.a/Desktop/App Data';
const DATES = [
  '2025-12-07', '2025-12-08', '2025-12-21', '2025-12-28',
  '2026-01-05', '2026-01-08', '2026-01-20', '2026-01-22',
  '2026-02-03', '2026-02-12', '2026-02-15', '2026-02-16',
];

const LONG_EDGE_THRESHOLD = 150; // meters
const CLUSTER_DISTANCE_THRESHOLD = 1500; // meters

// ─── File Readers ──────────────────────────────────────────────────────────────

function readCordsFile(date) {
  const file = path.join(DATA_DIR, `cords_${date}.csv`);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const entries = [];
  for (const line of text.split('\n')) {
    const parts = line.trim().split(',');
    if (parts.length < 4) continue;
    const [idRaw, eastingRaw, northingRaw, elevationRaw] = parts;
    const id = idRaw.trim();
    const easting = parseFloat(eastingRaw);
    const northing = parseFloat(northingRaw);
    const elevation = parseFloat(elevationRaw);
    if (!id || isNaN(easting) || isNaN(northing)) continue;
    entries.push({ id, easting, northing, elevation, date });
  }
  return entries;
}

function decodeUtf16Le(buf) {
  // Remove BOM if present
  const start = (buf[0] === 0xff && buf[1] === 0xfe) ? 2 : 0;
  return buf.slice(start).toString('utf16le');
}

function parseQuotedCsv(line) {
  const fields = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function readNodesFile(date) {
  const file = path.join(DATA_DIR, `nodes_${date}.csv`);
  if (!fs.existsSync(file)) return [];
  const buf = fs.readFileSync(file);
  let text;
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    text = decodeUtf16Le(buf);
  } else {
    text = buf.toString('utf8');
  }
  // Remove BOM character at start
  text = text.replace(/^\uFEFF/, '');
  // Skip sep= line if present
  const lines = text.split('\n').filter(l => l.trim());
  let dataLines = lines;
  if (lines[0] && lines[0].startsWith('sep=')) {
    dataLines = lines.slice(1);
  }
  if (dataLines.length === 0) return [];
  const header = parseQuotedCsv(dataLines[0]);
  const idIdx = header.findIndex(h => h.trim().toLowerCase() === 'id');
  if (idIdx === -1) return [];
  const nodes = [];
  for (let i = 1; i < dataLines.length; i++) {
    const fields = parseQuotedCsv(dataLines[i]);
    if (!fields[idIdx] || !fields[idIdx].trim()) continue;
    const obj = { date };
    header.forEach((h, idx) => {
      obj[h.trim()] = fields[idx] ? fields[idx].trim() : '';
    });
    obj.id = fields[idIdx].trim();
    nodes.push(obj);
  }
  return nodes;
}

function readEdgesFile(date) {
  const file = path.join(DATA_DIR, `edges_${date}.csv`);
  if (!fs.existsSync(file)) return { header: [], edges: [] };
  const buf = fs.readFileSync(file);
  let text;
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    text = decodeUtf16Le(buf);
  } else {
    text = buf.toString('utf8');
  }
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split('\n').filter(l => l.trim());
  let dataLines = lines;
  if (lines[0] && lines[0].startsWith('sep=')) {
    dataLines = lines.slice(1);
  }
  if (dataLines.length === 0) return { header: [], edges: [] };
  const header = parseQuotedCsv(dataLines[0]).map(h => h.trim());
  const edges = [];
  for (let i = 1; i < dataLines.length; i++) {
    const fields = parseQuotedCsv(dataLines[i]);
    const obj = { date };
    header.forEach((h, idx) => {
      obj[h] = fields[idx] ? fields[idx].trim() : '';
    });
    edges.push(obj);
  }
  return { header, edges };
}

function readSketchFile(date) {
  const file = path.join(DATA_DIR, `sketch_${date}.json`);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(text);
  return parsed.sketch || parsed;
}

// ─── Geometry ──────────────────────────────────────────────────────────────────

function computeCentroid(cords) {
  if (!cords.length) return null;
  const sumE = cords.reduce((s, c) => s + c.easting, 0);
  const sumN = cords.reduce((s, c) => s + c.northing, 0);
  return { easting: sumE / cords.length, northing: sumN / cords.length };
}

function distance2D(a, b) {
  return Math.sqrt((a.easting - b.easting) ** 2 + (a.northing - b.northing) ** 2);
}

function itm2D(cord) {
  return { easting: cord.easting, northing: cord.northing };
}

// ─── Cluster Assignment ────────────────────────────────────────────────────────

function assignClusters(centroidMap) {
  // centroidMap: date -> centroid {easting, northing}
  // Group dates into clusters where centroids are within CLUSTER_DISTANCE_THRESHOLD of each other
  const dates = Object.keys(centroidMap).filter(d => centroidMap[d] !== null);
  const clusterLabels = {}; // date -> cluster label (A, B, C, ...)
  const clusterCentroids = []; // [{centroid, label}]
  let nextLabel = 'A';

  for (const date of dates) {
    const centroid = centroidMap[date];
    let assigned = false;
    for (const cluster of clusterCentroids) {
      if (distance2D(centroid, cluster.centroid) <= CLUSTER_DISTANCE_THRESHOLD) {
        clusterLabels[date] = cluster.label;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusterLabels[date] = nextLabel;
      clusterCentroids.push({ centroid, label: nextLabel });
      nextLabel = String.fromCharCode(nextLabel.charCodeAt(0) + 1);
    }
  }

  return { clusterLabels, clusterCentroids };
}

// ─── Main Audit ────────────────────────────────────────────────────────────────

function main() {
  // Load all data
  const allData = {};
  for (const date of DATES) {
    allData[date] = {
      cords: readCordsFile(date),
      nodes: readNodesFile(date),
      edgesData: readEdgesFile(date),
      sketch: readSketchFile(date),
    };
  }

  // Compute centroid per date
  const centroidMap = {};
  for (const date of DATES) {
    centroidMap[date] = computeCentroid(allData[date].cords);
  }

  // Assign clusters
  const { clusterLabels, clusterCentroids } = assignClusters(centroidMap);

  // For each date's sketch, determine "home cluster" from same-date cords centroid
  // Then build master cords per cluster (all dates in same cluster)
  const cordsByCluster = {}; // label -> [{id, easting, northing, elevation, date}]
  for (const date of DATES) {
    const label = clusterLabels[date];
    if (!label) continue;
    if (!cordsByCluster[label]) cordsByCluster[label] = [];
    cordsByCluster[label].push(...allData[date].cords);
  }

  // Build master cords lookup per cluster: id -> cord
  const masterCordsByCluster = {};
  for (const [label, cords] of Object.entries(cordsByCluster)) {
    const map = new Map();
    for (const cord of cords) {
      if (!map.has(cord.id)) {
        map.set(cord.id, cord);
      }
    }
    masterCordsByCluster[label] = map;
  }

  // Per-date results
  const results = {};
  const allLongEdges = [];
  const allUncoveredNodes = [];

  // Track node IDs appearing in multiple clusters
  const nodeIdClusterMap = {}; // nodeId -> Set<clusterLabel>
  for (const [label, cords] of Object.entries(cordsByCluster)) {
    for (const cord of cords) {
      if (!nodeIdClusterMap[cord.id]) nodeIdClusterMap[cord.id] = new Set();
      nodeIdClusterMap[cord.id].add(label);
    }
  }

  console.log('='.repeat(70));
  console.log('MANHOLES MAPPER — COMPREHENSIVE DATA AUDIT');
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Dates audited: ${DATES.length}`);
  console.log('='.repeat(70));
  console.log();

  // Show cluster summary
  console.log('--- GEOGRAPHIC CLUSTERS ---');
  for (const { centroid, label } of clusterCentroids) {
    const datesInCluster = Object.entries(clusterLabels)
      .filter(([, l]) => l === label)
      .map(([d]) => d);
    console.log(`Cluster ${label}: centroid E${centroid.easting.toFixed(0)} N${centroid.northing.toFixed(0)} — dates: ${datesInCluster.join(', ')}`);
  }
  console.log();

  for (const date of DATES) {
    const { cords, nodes: nodesCSV, edgesData, sketch } = allData[date];
    const cluster = clusterLabels[date] || '?';
    const centroid = centroidMap[date];
    const masterCords = masterCordsByCluster[cluster] || new Map();

    const dateResult = {
      date, cluster, centroid, cords,
      longEdges: [], orphanedEdges: [], issues: [],
      coveredCount: 0, totalNodes: 0, uncoveredNodes: [],
    };

    console.log('='.repeat(70));
    console.log(`=== ${date} ===`);

    if (!sketch) {
      console.log('  ERROR: sketch JSON not found!');
      dateResult.issues.push('Missing sketch JSON');
      results[date] = dateResult;
      continue;
    }

    const sketchNodes = sketch.nodes || [];
    const sketchEdges = sketch.edges || [];
    dateResult.totalNodes = sketchNodes.length;

    console.log(`Sketch: ${sketchNodes.length} nodes, ${sketchEdges.length} edges`);

    if (centroid) {
      console.log(`Cords centroid: E${centroid.easting.toFixed(0)} N${centroid.northing.toFixed(0)}  [cluster: ${cluster}]`);
      console.log(`Cords count: ${cords.length} entries`);
    } else {
      console.log(`Cords: no entries found  [cluster: ${cluster}]`);
      dateResult.issues.push('No cords file entries');
    }

    // --- 1. Node coverage ---
    const sketchNodeIds = new Set(sketchNodes.map(n => String(n.id)));
    const coveredByDate = new Set();
    const coveredByMaster = new Set();

    // Same-date cords
    for (const cord of cords) {
      if (sketchNodeIds.has(String(cord.id))) {
        coveredByDate.add(String(cord.id));
      }
    }
    // Master cords (same cluster, any date)
    for (const [nodeId] of masterCords) {
      if (sketchNodeIds.has(String(nodeId))) {
        coveredByMaster.add(String(nodeId));
      }
    }

    const uncovered = sketchNodes
      .filter(n => !coveredByMaster.has(String(n.id)))
      .map(n => String(n.id));

    dateResult.coveredCount = coveredByMaster.size;
    dateResult.uncoveredNodes = uncovered;

    console.log(`Coverage: ${coveredByMaster.size}/${sketchNodes.length} nodes have coords from same-cluster cords`);
    if (coveredByDate.size !== coveredByMaster.size) {
      console.log(`  (same-date only: ${coveredByDate.size}/${sketchNodes.length}, extra from other cluster dates: ${coveredByMaster.size - coveredByDate.size})`);
    }
    if (uncovered.length > 0) {
      console.log(`  Uncovered nodes (no same-cluster coords): [${uncovered.join(', ')}]`);
      dateResult.issues.push(`${uncovered.length} nodes with no coordinates in any same-cluster cords file`);
    }

    // --- 2. Long edges ---
    for (const edge of sketchEdges) {
      const tailId = String(edge.tail);
      const headId = String(edge.head);
      const tailCord = masterCords.get(tailId);
      const headCord = masterCords.get(headId);

      if (tailCord && headCord) {
        const len = distance2D(itm2D(tailCord), itm2D(headCord));
        if (len > LONG_EDGE_THRESHOLD) {
          const edgeInfo = {
            date,
            edgeId: edge.id,
            tail: tailId,
            head: headId,
            computedLength: len.toFixed(1),
            storedLength: edge.length || edge.line_length || null,
          };
          dateResult.longEdges.push(edgeInfo);
          allLongEdges.push(edgeInfo);
          console.log(`  LONG EDGE: ${tailId}→${headId} = ${len.toFixed(1)}m  (edge id: ${edge.id})`);
        }
      }
    }
    if (dateResult.longEdges.length > 0) {
      dateResult.issues.push(`${dateResult.longEdges.length} long edges (>${LONG_EDGE_THRESHOLD}m)`);
    } else {
      console.log(`Long edges (>${LONG_EDGE_THRESHOLD}m): none`);
    }

    // --- 3. Orphaned edges ---
    for (const edge of sketchEdges) {
      const tailId = String(edge.tail);
      const headId = String(edge.head);
      const orphaned = [];
      if (!sketchNodeIds.has(tailId)) orphaned.push(`tail=${tailId}`);
      if (!sketchNodeIds.has(headId)) orphaned.push(`head=${headId}`);
      if (orphaned.length > 0) {
        const info = { edgeId: edge.id, tail: tailId, head: headId, problem: orphaned.join(', ') };
        dateResult.orphanedEdges.push(info);
        console.log(`  ORPHANED EDGE: id=${edge.id} tail=${tailId} head=${headId} — missing: ${orphaned.join(', ')}`);
      }
    }
    if (dateResult.orphanedEdges.length > 0) {
      dateResult.issues.push(`${dateResult.orphanedEdges.length} orphaned edges (referencing missing node IDs)`);
    } else {
      console.log(`Orphaned edges: none`);
    }

    // --- 4. CSV ↔ JSON consistency ---
    const csvNodeIds = new Set(nodesCSV.map(n => String(n.id)));
    const jsonOnlyIds = [...sketchNodeIds].filter(id => !csvNodeIds.has(id));
    const csvOnlyIds = [...csvNodeIds].filter(id => !sketchNodeIds.has(id));

    if (jsonOnlyIds.length > 0) {
      console.log(`  CSV↔JSON: nodes in sketch JSON but NOT in nodes CSV: [${jsonOnlyIds.join(', ')}]`);
      dateResult.issues.push(`${jsonOnlyIds.length} nodes in JSON but missing from nodes CSV`);
    }
    if (csvOnlyIds.length > 0) {
      console.log(`  CSV↔JSON: nodes in nodes CSV but NOT in sketch JSON: [${csvOnlyIds.join(', ')}]`);
      dateResult.issues.push(`${csvOnlyIds.length} nodes in nodes CSV but missing from sketch JSON`);
    }
    if (jsonOnlyIds.length === 0 && csvOnlyIds.length === 0) {
      console.log(`CSV↔JSON node consistency: OK (${sketchNodeIds.size} nodes match)`);
    }

    // --- 5. Edge CSV ↔ JSON consistency ---
    const { header: edgeHeader, edges: edgesCSV } = edgesData;
    // Detect from/to columns
    const fromCol = edgeHeader.find(h => h.toLowerCase() === 'from') || 'From';
    const toCol = edgeHeader.find(h => h.toLowerCase() === 'to') || 'To';

    const csvEdgePairs = new Set(edgesCSV.map(e => `${e[fromCol]}→${e[toCol]}`));
    const jsonEdgePairs = new Set(sketchEdges.map(e => `${e.tail}→${e.head}`));

    const csvEdgeCount = edgesCSV.length;
    const jsonEdgeCount = sketchEdges.length;

    if (csvEdgeCount !== jsonEdgeCount) {
      console.log(`  CSV↔JSON edge count mismatch: CSV=${csvEdgeCount}, JSON=${jsonEdgeCount}`);
      dateResult.issues.push(`Edge count mismatch: CSV has ${csvEdgeCount}, JSON has ${jsonEdgeCount}`);
    } else {
      console.log(`CSV↔JSON edge count: OK (${csvEdgeCount} edges)`);
    }

    // Check if any CSV edges reference nodes not in sketch
    for (const edge of edgesCSV) {
      const fromId = edge[fromCol];
      const toId = edge[toCol];
      if (fromId && !sketchNodeIds.has(fromId)) {
        console.log(`  CSV edge ${fromId}→${toId}: 'from' node ${fromId} not in sketch JSON`);
        dateResult.issues.push(`CSV edge references missing node: ${fromId}`);
      }
      if (toId && !sketchNodeIds.has(toId)) {
        console.log(`  CSV edge ${fromId}→${toId}: 'to' node ${toId} not in sketch JSON`);
        dateResult.issues.push(`CSV edge references missing node: ${toId}`);
      }
    }

    // Issues summary for this date
    if (dateResult.issues.length === 0) {
      console.log('Issues: NONE — data looks clean');
    } else {
      console.log(`Issues: ${dateResult.issues.join(' | ')}`);
    }

    results[date] = dateResult;
    allUncoveredNodes.push(...uncovered.map(id => ({ date, nodeId: id, cluster })));
    console.log();
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────

  console.log('='.repeat(70));
  console.log('=== SUMMARY ===');
  console.log('='.repeat(70));

  // Find contaminated cords files (dates whose centroid differs from main cluster)
  // Determine majority cluster
  const clusterCount = {};
  for (const [, label] of Object.entries(clusterLabels)) {
    clusterCount[label] = (clusterCount[label] || 0) + 1;
  }
  const majorityCluster = Object.entries(clusterCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  const majorityClusterCentroid = clusterCentroids.find(c => c.label === majorityCluster)?.centroid;

  console.log(`\nCluster distribution:`);
  for (const [label, count] of Object.entries(clusterCount)) {
    const centroid = clusterCentroids.find(c => c.label === label)?.centroid;
    const datesInCluster = Object.entries(clusterLabels).filter(([, l]) => l === label).map(([d]) => d);
    console.log(`  Cluster ${label}: ${count} dates, centroid E${centroid?.easting.toFixed(0)} N${centroid?.northing.toFixed(0)}`);
    console.log(`    Dates: ${datesInCluster.join(', ')}`);
  }

  console.log(`\nContaminated cords files (centroid >1500m from main cluster ${majorityCluster}):`);
  let contamCount = 0;
  for (const date of DATES) {
    const centroid = centroidMap[date];
    const label = clusterLabels[date];
    if (!centroid || !majorityClusterCentroid) continue;
    if (label !== majorityCluster) {
      const dist = distance2D(centroid, majorityClusterCentroid);
      console.log(`  cords_${date}.csv → centroid E${centroid.easting.toFixed(0)} N${centroid.northing.toFixed(0)} → ${dist.toFixed(0)}m from cluster ${majorityCluster} → cluster ${label}`);
      contamCount++;
    }
  }
  if (contamCount === 0) console.log('  None — all cords in same cluster');

  console.log(`\nNode IDs present in multiple clusters (contamination candidates):`);
  let multiClusterCount = 0;
  for (const [nodeId, clusters] of Object.entries(nodeIdClusterMap)) {
    if (clusters.size > 1) {
      const clusterList = [...clusters].join(', ');
      console.log(`  Node ID "${nodeId}" appears in clusters: ${clusterList}`);
      multiClusterCount++;
    }
  }
  if (multiClusterCount === 0) console.log('  None — no node ID collisions across clusters');
  else console.log(`  Total: ${multiClusterCount} node IDs appear in multiple clusters`);

  console.log(`\nTotal long edges across all sketches: ${allLongEdges.length}`);
  if (allLongEdges.length > 0) {
    for (const e of allLongEdges) {
      console.log(`  ${e.date}: ${e.tail}→${e.head} = ${e.computedLength}m`);
    }
  }

  console.log(`\nTotal truly uncovered nodes (no same-cluster coords): ${allUncoveredNodes.length}`);
  if (allUncoveredNodes.length > 0) {
    // Group by date
    const byDate = {};
    for (const n of allUncoveredNodes) {
      if (!byDate[n.date]) byDate[n.date] = [];
      byDate[n.date].push(n.nodeId);
    }
    for (const [date, ids] of Object.entries(byDate)) {
      console.log(`  ${date} (cluster ${results[date]?.cluster}): [${ids.join(', ')}]`);
    }
  }

  // Per-date issues table
  console.log('\n--- PER-DATE ISSUE SUMMARY ---');
  for (const date of DATES) {
    const r = results[date];
    if (!r) continue;
    const issueStr = r.issues.length > 0 ? r.issues.join('; ') : 'CLEAN';
    console.log(`  ${date} [${r.cluster}]: ${issueStr}`);
  }

  // Check for suspicious node IDs in cords that look like external refs
  // (e.g., PRS4892569386 — long alphanumeric IDs that don't match sketch node IDs)
  console.log('\n--- SUSPICIOUS CORD ENTRIES (non-numeric or very long IDs) ---');
  let suspCount = 0;
  for (const date of DATES) {
    for (const cord of allData[date].cords) {
      if (!/^\d+$/.test(cord.id)) {
        console.log(`  ${date}: cord id="${cord.id}" E${cord.easting.toFixed(0)} N${cord.northing.toFixed(0)} — non-numeric ID`);
        suspCount++;
      }
    }
  }
  if (suspCount === 0) console.log('  None');

  // Check ITM range validity
  console.log('\n--- OUT-OF-RANGE ITM COORDINATES ---');
  let oobCount = 0;
  for (const date of DATES) {
    for (const cord of allData[date].cords) {
      const itmOk = cord.easting >= 100000 && cord.easting <= 300000
        && cord.northing >= 400000 && cord.northing <= 800000;
      if (!itmOk) {
        console.log(`  ${date}: cord id="${cord.id}" E${cord.easting.toFixed(0)} N${cord.northing.toFixed(0)} — OUT OF ITM RANGE`);
        oobCount++;
      }
    }
  }
  if (oobCount === 0) console.log('  None — all coords in valid ITM range');

  console.log('\n' + '='.repeat(70));
  console.log('AUDIT COMPLETE');
  console.log('='.repeat(70));
}

main();
