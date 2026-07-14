/**
 * Soak testing suite orchestrator.
 *
 * Runs long-duration endurance phases against the app's hot paths and
 * reports memory, throughput, and stability verdicts:
 *
 *   1. core-modules    — NMEA parser, TSC3 parser, ITM projections, spatial grid
 *   2. tsc3-websocket  — mock TSC3 server + multi-client WS streaming
 *   3. browser-canvas  — headless Chromium canvas session (Vite dev server)
 *
 * Usage:
 *   node --expose-gc scripts/soak/run-soak.mjs [quick|standard|extended] [--only=core,ws,browser]
 *   npm run soak            # standard (~4 min)
 *   npm run soak:quick      # smoke (~1.5 min)
 *   npm run soak:extended   # endurance (~40 min)
 *
 * Env:
 *   SOAK_DURATION_MS  — override per-phase duration for all phases
 *   SOAK_BASE_URL     — browser phase target (default http://localhost:5173)
 *
 * Exit code 1 if any phase fails. Reports written to soak-report/ (gitignored).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCoreModulesPhase } from './phases/core-modules.mjs';
import { runTsc3WebSocketPhase } from './phases/tsc3-websocket.mjs';
import { runBrowserCanvasPhase } from './phases/browser-canvas.mjs';
import { now, fmtMs, buildResult } from './lib/soak-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(__dirname, '..', '..', 'soak-report');

const PROFILES = {
  quick:    { 'core-modules': 12000,  'tsc3-websocket': 15000,  'browser-canvas': 30000 },
  standard: { 'core-modules': 40000,  'tsc3-websocket': 45000,  'browser-canvas': 90000 },
  extended: { 'core-modules': 240000, 'tsc3-websocket': 600000, 'browser-canvas': 900000 },
};

const PHASES = [
  { key: 'core-modules',   aliases: ['core'],            run: runCoreModulesPhase },
  { key: 'tsc3-websocket', aliases: ['ws', 'tsc3'],      run: runTsc3WebSocketPhase },
  { key: 'browser-canvas', aliases: ['browser', 'ui'],   run: runBrowserCanvasPhase },
];

function parseArgs(argv) {
  let profile = 'standard';
  let only = null;
  for (const arg of argv) {
    if (PROFILES[arg]) profile = arg;
    else if (arg.startsWith('--only=')) only = arg.slice(7).split(',').map((s) => s.trim());
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/soak/run-soak.mjs [quick|standard|extended] [--only=core,ws,browser]');
      process.exit(0);
    }
  }
  return { profile, only };
}

const STATUS_ICON = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };

function printPhaseResult(r) {
  console.log(`\n[${STATUS_ICON[r.status]}] ${r.name} (${fmtMs(r.durationMs)})`);
  for (const c of r.checks) {
    const mark = c.ok ? 'ok  ' : c.warn ? 'warn' : 'FAIL';
    console.log(`  ${mark}  ${c.name} — ${c.detail}`);
  }
  for (const n of r.notes || []) console.log(`  note: ${n}`);
}

async function main() {
  const { profile, only } = parseArgs(process.argv.slice(2));
  const durations = PROFILES[profile];
  const overrideMs = process.env.SOAK_DURATION_MS ? parseInt(process.env.SOAK_DURATION_MS, 10) : null;

  const selected = PHASES.filter((p) =>
    !only || only.includes(p.key) || p.aliases.some((a) => only.includes(a))
  );
  if (!selected.length) {
    console.error(`No phases matched --only=${only.join(',')}. Known: ${PHASES.map((p) => `${p.key} (${p.aliases.join('/')})`).join(', ')}`);
    process.exit(2);
  }

  if (typeof global.gc !== 'function') {
    console.log('note: run with --expose-gc for precise heap sampling (npm scripts do this automatically)');
  }

  console.log(`Soak suite — profile: ${profile}${overrideMs ? ` (duration override ${overrideMs}ms/phase)` : ''}`);
  console.log(`Phases: ${selected.map((p) => p.key).join(', ')}\n`);

  const suiteStart = now();
  const results = [];
  const log = (msg) => console.log(msg);

  for (const phase of selected) {
    const durationMs = overrideMs || durations[phase.key];
    console.log(`── ${phase.key} (${(durationMs / 1000).toFixed(0)}s) ${'─'.repeat(Math.max(0, 40 - phase.key.length))}`);
    try {
      const result = await phase.run({ durationMs, log });
      results.push(result);
      printPhaseResult(result);
    } catch (err) {
      const result = buildResult(phase.key, {
        status: 'fail',
        durationMs: 0,
        metrics: {},
        checks: [{ name: 'phase completed without crashing', ok: false, detail: String(err?.stack || err).slice(0, 500) }],
      });
      results.push(result);
      printPhaseResult(result);
    }
  }

  const summary = {
    passed: results.filter((r) => r.status === 'pass').length,
    warned: results.filter((r) => r.status === 'warn').length,
    failed: results.filter((r) => r.status === 'fail').length,
  };

  const report = {
    startedAt: new Date(Date.now() - (now() - suiteStart)).toISOString(),
    finishedAt: new Date().toISOString(),
    profile,
    durationMs: Math.round(now() - suiteStart),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    summary,
    phases: results,
  };

  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(REPORT_DIR, `soak-report-${stamp}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(join(REPORT_DIR, 'latest.json'), JSON.stringify(report, null, 2));

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Soak suite finished in ${fmtMs(report.durationMs)} — ${summary.passed} pass, ${summary.warned} warn, ${summary.failed} fail`);
  console.log(`Report: ${reportPath}`);

  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Soak suite crashed:', err);
  process.exit(1);
});
