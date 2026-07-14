/**
 * Soak phase: core modules.
 *
 * Hammers the app's hot pure-logic paths in-process for a sustained period,
 * watching for memory leaks, throughput degradation, and correctness drift:
 *
 *  - NMEA parser (gnss/nmea-parser.js): one long-lived parser instance fed a
 *    continuous chunked stream of GGA/RMC/GST sentences (split mid-line to
 *    exercise buffering), garbage lines and bad checksums mixed in.
 *  - TSC3 parser (survey/tsc3-parser.js): parseSurveyLine over rotating
 *    delimiters, column orders, and malformed input.
 *  - Projections (map/projections.js): WGS84↔ITM round-trips across the
 *    Israel bounding box with round-trip error verification.
 *  - Spatial grid (utils/spatial-grid.js): build/query/clear cycles matching
 *    real per-frame viewport culling usage.
 */

import { NMEAParser } from '../../../frontend/src/gnss/nmea-parser.js';
import { parseSurveyLine } from '../../../frontend/src/survey/tsc3-parser.js';
import { wgs84ToItm, itmToWgs84 } from '../../../frontend/src/map/projections.js';
import { buildNodeGrid } from '../../../frontend/src/utils/spatial-grid.js';
import {
  now, makeRng, sampleHeap, classifyMemory, fmtBytes, fmtRate,
  buildResult, statusFromChecks,
} from '../lib/soak-utils.mjs';

// ── NMEA sentence generation ────────────────────────────────────────────────

function nmeaChecksum(body) {
  let cs = 0;
  for (let i = 0; i < body.length; i++) cs ^= body.charCodeAt(i);
  return cs.toString(16).toUpperCase().padStart(2, '0');
}

function makeSentence(body) {
  return `$${body}*${nmeaChecksum(body)}\r\n`;
}

function ggaSentence(rng) {
  const lat = 31 + rng() * 2; // Israel latitudes
  const lon = 34 + rng() * 2;
  const latDeg = Math.floor(lat);
  const latMin = ((lat - latDeg) * 60).toFixed(4).padStart(7, '0');
  const lonDeg = Math.floor(lon);
  const lonMin = ((lon - lonDeg) * 60).toFixed(4).padStart(7, '0');
  const quality = [1, 2, 4, 5][Math.floor(rng() * 4)];
  const sats = 6 + Math.floor(rng() * 20);
  const hdop = (0.5 + rng() * 2).toFixed(1);
  const alt = (rng() * 800).toFixed(1);
  const body = `GPGGA,123519.00,${latDeg}${latMin},N,0${lonDeg}${lonMin},E,${quality},${String(sats).padStart(2, '0')},${hdop},${alt},M,17.2,M,,`;
  return makeSentence(body);
}

function rmcSentence(rng) {
  const speed = (rng() * 10).toFixed(2);
  const course = (rng() * 360).toFixed(1);
  const body = `GPRMC,123519.00,A,3204.9500,N,03446.9000,E,${speed},${course},140726,,,A`;
  return makeSentence(body);
}

function gstSentence(rng) {
  const rms = (0.01 + rng() * 0.5).toFixed(3);
  const body = `GPGST,123519.00,${rms},0.02,0.01,45.0,0.015,0.012,0.030`;
  return makeSentence(body);
}

// ── Sub-benchmarks ──────────────────────────────────────────────────────────

function runNmeaSoak(durationMs, rng) {
  const parser = new NMEAParser();
  let updates = 0;
  parser.onUpdate(() => { updates++; });

  const samples = [sampleHeap()];
  const deadline = now() + durationMs;
  let ops = 0;
  let pending = '';
  const throughputWindows = [];
  let windowOps = 0;
  let windowStart = now();

  while (now() < deadline) {
    // Batch of ~200 sentences per loop tick, streamed in irregular chunks
    // so lines split across processData calls (exercises the line buffer).
    for (let i = 0; i < 200; i++) {
      const pick = rng();
      let s;
      if (pick < 0.5) s = ggaSentence(rng);
      else if (pick < 0.75) s = rmcSentence(rng);
      else if (pick < 0.9) s = gstSentence(rng);
      else if (pick < 0.95) s = '$GPGGA,garbage,with,bad*FF\r\n'; // bad checksum
      else s = 'not an nmea line at all\r\n'; // garbage

      pending += s;
      if (pending.length > 120) {
        const cut = Math.max(1, Math.floor(pending.length * rng()));
        parser.processData(pending.slice(0, cut));
        parser.processData(pending.slice(cut));
        pending = '';
      }
      ops++;
      windowOps++;
    }
    if (now() - windowStart > 1000) {
      throughputWindows.push(windowOps / ((now() - windowStart) / 1000));
      windowOps = 0;
      windowStart = now();
      samples.push(sampleHeap());
    }
  }
  if (pending) parser.processData(pending);
  samples.push(sampleHeap());

  const state = parser.getState();
  return {
    name: 'nmea-parser',
    ops,
    updates,
    samples,
    throughputWindows,
    finalStateValid: state.isValid === true && state.lat != null,
    listenersRetained: parser.listeners.length,
  };
}

function runTsc3Soak(durationMs, rng) {
  const samples = [sampleHeap()];
  const deadline = now() + durationMs;
  let ops = 0;
  let parsed = 0;
  let rejected = 0;
  const throughputWindows = [];
  let windowOps = 0;
  let windowStart = now();

  const delims = [',', '\t', ' '];
  while (now() < deadline) {
    for (let i = 0; i < 500; i++) {
      const d = delims[Math.floor(rng() * 3)];
      const e = (100000 + rng() * 200000).toFixed(3);
      const n = (400000 + rng() * 400000).toFixed(3);
      const el = (rng() * 500).toFixed(3);
      const pick = rng();
      let line;
      if (pick < 0.45) line = `MH-${ops}${d}${e}${d}${n}${d}${el}`;       // NEN
      else if (pick < 0.9) line = `MH-${ops}${d}${n}${d}${e}${d}${el}`;   // NNE
      else if (pick < 0.95) line = `# comment line ${ops}`;
      else line = `broken${d}line`;

      const result = parseSurveyLine(line);
      if (result) parsed++; else rejected++;
      ops++;
      windowOps++;
    }
    if (now() - windowStart > 1000) {
      throughputWindows.push(windowOps / ((now() - windowStart) / 1000));
      windowOps = 0;
      windowStart = now();
      samples.push(sampleHeap());
    }
  }
  samples.push(sampleHeap());
  return { name: 'tsc3-parser', ops, parsed, rejected, samples, throughputWindows };
}

function runProjectionSoak(durationMs, rng) {
  const samples = [sampleHeap()];
  const deadline = now() + durationMs;
  let ops = 0;
  let maxRoundTripErrDeg = 0;
  const throughputWindows = [];
  let windowOps = 0;
  let windowStart = now();

  while (now() < deadline) {
    for (let i = 0; i < 500; i++) {
      const lat = 29.5 + rng() * 3.6; // Eilat → northern border
      const lon = 34.2 + rng() * 1.7;
      const itm = wgs84ToItm(lat, lon);
      const back = itmToWgs84(itm.x, itm.y);
      const err = Math.max(Math.abs(back.lat - lat), Math.abs(back.lon - lon));
      if (err > maxRoundTripErrDeg) maxRoundTripErrDeg = err;
      ops++;
      windowOps++;
    }
    if (now() - windowStart > 1000) {
      throughputWindows.push(windowOps / ((now() - windowStart) / 1000));
      windowOps = 0;
      windowStart = now();
      samples.push(sampleHeap());
    }
  }
  samples.push(sampleHeap());
  return { name: 'projections', ops, maxRoundTripErrDeg, samples, throughputWindows };
}

function runSpatialGridSoak(durationMs, rng) {
  const samples = [sampleHeap()];
  const deadline = now() + durationMs;
  let ops = 0; // one op = one build+query cycle
  let queried = 0;
  const throughputWindows = [];
  let windowOps = 0;
  let windowStart = now();

  // Simulated sketch: 2000 nodes scattered over a 20km ITM extent
  const nodes = Array.from({ length: 2000 }, (_, i) => ({
    id: String(i),
    x: rng() * 20000,
    y: rng() * 20000,
  }));

  // Long-lived grid reused across queries (mirrors render-loop retention)
  let grid = buildNodeGrid(nodes, 20);

  while (now() < deadline) {
    for (let i = 0; i < 20; i++) {
      // Pan/zoom session: 50 viewport queries at random positions/extents
      for (let q = 0; q < 50; q++) {
        const cx = rng() * 20000;
        const cy = rng() * 20000;
        const extent = 200 + rng() * 2000;
        const hits = grid.queryArray(cx - extent, cy - extent, cx + extent, cy + extent);
        queried += hits.length;
      }
      // Sketch edit: rebuild the grid (real usage rebuilds on data change)
      grid.clear();
      grid = buildNodeGrid(nodes, 20, 1 + rng() * 0.5, 1 + rng() * 0.5);
      ops++;
      windowOps++;
    }
    if (now() - windowStart > 1000) {
      throughputWindows.push(windowOps / ((now() - windowStart) / 1000));
      windowOps = 0;
      windowStart = now();
      samples.push(sampleHeap());
    }
  }
  samples.push(sampleHeap());
  return {
    name: 'spatial-grid', ops, queried, samples, throughputWindows,
    gridSize: grid.size, expectedSize: nodes.length,
  };
}

// ── Degradation check ───────────────────────────────────────────────────────

/** Ratio of last-quarter mean throughput to first-quarter mean. <0.6 = degraded. */
function degradationRatio(windows) {
  if (windows.length < 4) return 1;
  const q = Math.max(1, Math.floor(windows.length / 4));
  const first = windows.slice(0, q);
  const last = windows.slice(-q);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return mean(last) / mean(first);
}

// ── Console muting ──────────────────────────────────────────────────────────

/**
 * The soaked modules log rejected input (e.g. NMEA checksum failures) on the
 * hot path. That's expected app behavior, but at soak volume it floods the
 * terminal — so console output is counted instead of printed while a
 * sub-soak runs.
 */
function withMutedConsole(fn) {
  const orig = { error: console.error, warn: console.warn, log: console.log };
  let suppressed = 0;
  console.error = console.warn = console.log = () => { suppressed++; };
  try {
    const result = fn();
    return { result, suppressed };
  } finally {
    Object.assign(console, orig);
  }
}

// ── Phase entry point ───────────────────────────────────────────────────────

export async function runCoreModulesPhase({ durationMs, log }) {
  const start = now();
  const rng = makeRng(0xc0ffee);
  const perSub = Math.max(3000, Math.floor(durationMs / 4));
  const subs = [];

  log(`core-modules: 4 sub-soaks × ${(perSub / 1000).toFixed(0)}s each`);
  for (const [label, fn] of [
    ['nmea-parser', runNmeaSoak],
    ['tsc3-parser', runTsc3Soak],
    ['projections', runProjectionSoak],
    ['spatial-grid', runSpatialGridSoak],
  ]) {
    log(`  soaking ${label}...`);
    const { result: r, suppressed } = withMutedConsole(() => fn(perSub, rng));
    r.suppressedLogs = suppressed;
    r.memory = classifyMemory(r.samples);
    r.degradation = degradationRatio(r.throughputWindows);
    subs.push(r);
    log(`  ${label}: ${r.ops.toLocaleString()} ops (${fmtRate(r.ops, perSub)}), heap Δ ${fmtBytes(r.memory.growthBytes)}, verdict: ${r.memory.verdict}`);
    // Yield to the event loop between CPU-bound sub-soaks
    await new Promise((res) => setImmediate(res));
  }

  const checks = [];
  for (const s of subs) {
    checks.push({
      name: `${s.name}: no memory leak`,
      ok: s.memory.verdict !== 'leaking',
      detail: `heap Δ ${fmtBytes(s.memory.growthBytes)}, slope ${fmtBytes(s.memory.slopeBps)}/s (${s.memory.verdict})`,
    });
    checks.push({
      name: `${s.name}: no throughput degradation`,
      ok: s.degradation >= 0.6,
      warn: s.degradation >= 0.4, // 0.4–0.6 = warn, below = fail
      detail: `end/start throughput ratio ${s.degradation.toFixed(2)}`,
    });
  }

  const nmea = subs.find((s) => s.name === 'nmea-parser');
  checks.push({
    name: 'nmea-parser: state valid after stream',
    ok: nmea.finalStateValid,
    detail: `updates fired: ${nmea.updates.toLocaleString()}, listeners retained: ${nmea.listenersRetained}`,
  });
  checks.push({
    name: 'nmea-parser: listener list did not grow',
    ok: nmea.listenersRetained === 1,
    detail: `${nmea.listenersRetained} listener(s) after soak (expected 1)`,
  });

  const tsc3 = subs.find((s) => s.name === 'tsc3-parser');
  checks.push({
    name: 'tsc3-parser: valid lines parsed',
    ok: tsc3.parsed > 0 && tsc3.rejected > 0,
    detail: `${tsc3.parsed.toLocaleString()} parsed, ${tsc3.rejected.toLocaleString()} rejected (garbage correctly refused)`,
  });

  const proj = subs.find((s) => s.name === 'projections');
  checks.push({
    name: 'projections: round-trip accuracy stable',
    ok: proj.maxRoundTripErrDeg < 1e-7,
    detail: `max WGS84 round-trip error ${proj.maxRoundTripErrDeg.toExponential(2)}°`,
  });

  const gridSub = subs.find((s) => s.name === 'spatial-grid');
  checks.push({
    name: 'spatial-grid: index consistent after rebuild cycles',
    ok: gridSub.gridSize === gridSub.expectedSize,
    detail: `grid size ${gridSub.gridSize} (expected ${gridSub.expectedSize}), ${gridSub.queried.toLocaleString()} items returned by queries`,
  });

  return buildResult('core-modules', {
    status: statusFromChecks(checks),
    durationMs: now() - start,
    metrics: Object.fromEntries(subs.map((s) => [s.name, {
      ops: s.ops,
      opsPerSec: Math.round(s.ops / (perSub / 1000)),
      heapGrowthBytes: s.memory.growthBytes,
      heapSlopeBytesPerSec: Math.round(s.memory.slopeBps),
      memoryVerdict: s.memory.verdict,
      throughputEndOverStart: Number(s.degradation.toFixed(3)),
    }])),
    checks,
  });
}
