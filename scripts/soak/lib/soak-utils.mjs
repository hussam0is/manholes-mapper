/**
 * Shared utilities for the soak testing suite.
 *
 * Provides memory sampling, leak-slope estimation (least-squares linear
 * regression), latency percentiles, deterministic PRNG, process helpers,
 * and result formatting used by every soak phase.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ── Timing ───────────────────────────────────────────────────────────────────

export const now = () => performance.now();

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Deterministic PRNG (mulberry32) ─────────────────────────────────────────

export function makeRng(seed = 0x5eed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Memory sampling & leak detection ────────────────────────────────────────

/**
 * Sample this process's heap. Runs global.gc() first when node is started
 * with --expose-gc, so samples reflect retained memory, not GC noise.
 */
export function sampleHeap() {
  if (typeof global.gc === 'function') {
    try { global.gc(); } catch { /* ignore */ }
  }
  const m = process.memoryUsage();
  return { t: now(), heapUsed: m.heapUsed, rss: m.rss, external: m.external };
}

/**
 * Least-squares slope of heapUsed over time, in bytes per second.
 * Only the second half of the samples is used so warmup allocation
 * (module caches, JIT, buffer pools) doesn't read as a leak.
 */
export function heapSlopeBytesPerSec(samples) {
  const half = samples.slice(Math.floor(samples.length / 2));
  if (half.length < 3) return 0;
  const t0 = half[0].t;
  const xs = half.map((s) => (s.t - t0) / 1000);
  const ys = half.map((s) => s.heapUsed);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Classify memory behavior from samples.
 * Returns { verdict: 'stable'|'growing'|'leaking', slopeBps, growthBytes }.
 * Thresholds are deliberately generous: a soak that legitimately accumulates
 * data (sketch nodes, undo stack) is 'growing', not 'leaking'. 'leaking'
 * requires a sustained slope AND meaningful absolute growth.
 */
export function classifyMemory(samples, { slopeLimitBps = 150 * 1024, growthLimitBytes = 30 * 1024 * 1024 } = {}) {
  if (samples.length < 3) return { verdict: 'stable', slopeBps: 0, growthBytes: 0 };
  const slopeBps = heapSlopeBytesPerSec(samples);
  const growthBytes = samples[samples.length - 1].heapUsed - samples[0].heapUsed;
  let verdict = 'stable';
  if (slopeBps > slopeLimitBps && growthBytes > growthLimitBytes) verdict = 'leaking';
  else if (growthBytes > growthLimitBytes) verdict = 'growing';
  return { verdict, slopeBps, growthBytes };
}

// ── Latency stats ────────────────────────────────────────────────────────────

export function percentiles(values, ps = [50, 95, 99]) {
  if (!values.length) return Object.fromEntries(ps.map((p) => [`p${p}`, null]));
  const sorted = [...values].sort((a, b) => a - b);
  const out = {};
  for (const p of ps) {
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    out[`p${p}`] = sorted[idx];
  }
  out.max = sorted[sorted.length - 1];
  out.min = sorted[0];
  out.mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return out;
}

// ── External process memory (Windows-aware) ─────────────────────────────────

/** Working set of another PID in bytes, or null if unavailable. */
export async function processWorkingSet(pid) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command', `(Get-Process -Id ${pid}).WorkingSet64`,
      ]);
      const v = parseInt(stdout.trim(), 10);
      return Number.isFinite(v) ? v : null;
    }
    const { stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', String(pid)]);
    const kb = parseInt(stdout.trim(), 10);
    return Number.isFinite(kb) ? kb * 1024 : null;
  } catch {
    return null;
  }
}

/** Kill a process tree (Windows-aware). Safe to call on already-dead PIDs. */
export async function killTree(pid) {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F']);
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch { /* already gone */ }
}

/** Poll an HTTP URL until it responds or the timeout elapses. */
export async function waitForHttp(url, { timeoutMs = 30000, intervalMs = 300 } = {}) {
  const deadline = now() + timeoutMs;
  let lastErr = null;
  while (now() < deadline) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok || res.status < 500) return true;
    } catch (e) {
      lastErr = e;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastErr?.message || 'no response'}`);
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function fmtBytes(bytes) {
  if (bytes == null) return 'n/a';
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs.toFixed(0)} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtMs(ms) {
  if (ms == null) return 'n/a';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function fmtRate(count, durationMs) {
  if (!durationMs) return 'n/a';
  return `${Math.round(count / (durationMs / 1000)).toLocaleString()}/s`;
}

/**
 * Standard phase result envelope. status: 'pass' | 'warn' | 'fail'.
 * checks: [{ name, ok, warn?, detail }]
 */
export function buildResult(name, { status, durationMs, metrics, checks, notes = [] }) {
  return { name, status, durationMs: Math.round(durationMs), metrics, checks, notes };
}

/** Derive an overall status from a list of checks. */
export function statusFromChecks(checks) {
  if (checks.some((c) => !c.ok && !c.warn)) return 'fail';
  if (checks.some((c) => !c.ok && c.warn)) return 'warn';
  return 'pass';
}
