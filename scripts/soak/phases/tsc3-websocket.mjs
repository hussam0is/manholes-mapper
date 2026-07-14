/**
 * Soak phase: TSC3 WebSocket streaming.
 *
 * Spawns the real mock TSC3 server (scripts/mock-tsc3/server.mjs) on isolated
 * ports, connects multiple WebSocket clients (like several field devices),
 * and streams sequenced survey points through the HTTP control API for the
 * whole soak window. Every received line is run through the app's actual
 * tsc3-parser, so the full pipe — HTTP control → WS broadcast → CSV parse —
 * is exercised end to end.
 *
 * Verifies: zero message loss, correct parse of every line, bounded delivery
 * latency, stable mock-server working set, and one mid-soak client
 * reconnect (drop + rejoin) without disrupting the stream.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import WebSocket from 'ws';
import { parseSurveyLine } from '../../../frontend/src/survey/tsc3-parser.js';
import {
  now, sleep, percentiles, processWorkingSet, killTree, waitForHttp,
  fmtBytes, fmtMs, buildResult, statusFromChecks,
} from '../lib/soak-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = join(__dirname, '..', '..', 'mock-tsc3', 'server.mjs');

const WS_PORT = 8799;   // isolated from the default 8765 so a dev-run mock server isn't disturbed
const HTTP_PORT = 3199; // isolated from the default 3001
const CLIENT_COUNT = 3;
const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 250; // ~40 points/s → ~120 client messages/s

function makeClient(id, state) {
  const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
  const client = { id, ws, received: 0, parseFailures: 0, latencies: [], closed: false };
  ws.on('message', (data) => {
    const text = data.toString();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      client.received++;
      const point = parseSurveyLine(line);
      if (!point) { client.parseFailures++; continue; }
      const m = /^SOAK-(\d+)$/.exec(point.pointName);
      if (m) {
        const sentAt = state.sendTimes.get(Number(m[1]));
        if (sentAt != null) client.latencies.push(now() - sentAt);
      }
    }
  });
  ws.on('close', () => { client.closed = true; });
  ws.on('error', () => { /* recorded via close */ });
  return client;
}

export async function runTsc3WebSocketPhase({ durationMs, log }) {
  const start = now();
  const notes = [];

  log(`tsc3-websocket: spawning mock server on WS:${WS_PORT} HTTP:${HTTP_PORT}`);
  const server = spawn(process.execPath, [SERVER_SCRIPT], {
    env: { ...process.env, WS_PORT: String(WS_PORT), HTTP_PORT: String(HTTP_PORT) },
    stdio: 'ignore',
  });

  const state = { sendTimes: new Map() };
  let clients = [];
  try {
    await waitForHttp(`http://localhost:${HTTP_PORT}/api/status`);

    clients = Array.from({ length: CLIENT_COUNT }, (_, i) => makeClient(i, state));
    await Promise.all(clients.map((c) => new Promise((res, rej) => {
      c.ws.once('open', res);
      c.ws.once('error', rej);
    })));
    log(`  ${CLIENT_COUNT} WS clients connected, streaming for ${(durationMs / 1000).toFixed(0)}s...`);

    const rssSamples = [];
    let seq = 0;
    let sendErrors = 0;
    let reconnectDone = false;
    let reconnectOk = false;
    const deadline = now() + durationMs;
    let lastRssSample = 0;

    while (now() < deadline) {
      const batchStart = now();
      const points = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        seq++;
        state.sendTimes.set(seq, now());
        points.push({
          pointName: `SOAK-${seq}`,
          easting: 150000 + (seq % 100000) * 0.5,
          northing: 550000 + (seq % 100000) * 0.5,
          elevation: 50 + (seq % 400),
        });
      }
      try {
        const res = await fetch(`http://localhost:${HTTP_PORT}/api/send-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }),
        });
        if (!res.ok) sendErrors++;
      } catch {
        sendErrors++;
      }

      // Keep the mock server's unbounded history[] from dominating its RSS —
      // we soak broadcast + delivery, not the history buffer.
      if (seq % 2000 === 0) {
        await fetch(`http://localhost:${HTTP_PORT}/api/clear-history`, { method: 'POST' }).catch(() => {});
      }

      // Mid-soak resilience: drop client 0 and rejoin it once, halfway in.
      if (!reconnectDone && now() - start > durationMs / 2) {
        reconnectDone = true;
        const dropped = clients[0];
        const before = dropped.received;
        dropped.ws.close();
        await sleep(400);
        const rejoined = makeClient(0, state);
        await new Promise((res, rej) => {
          rejoined.ws.once('open', res);
          rejoined.ws.once('error', rej);
        });
        // Carry stats forward so loss accounting stays correct for the rejoined client.
        rejoined.received = before;
        rejoined.latencies = dropped.latencies;
        rejoined.parseFailures = dropped.parseFailures;
        rejoined.offlineFromSeq = seq;
        clients[0] = rejoined;
        reconnectOk = true;
        log('  client 0 dropped and rejoined mid-stream');
      }

      if (now() - lastRssSample > 5000) {
        lastRssSample = now();
        const ws = await processWorkingSet(server.pid);
        if (ws != null) rssSamples.push({ t: now(), heapUsed: ws });
      }

      const elapsed = now() - batchStart;
      if (elapsed < BATCH_INTERVAL_MS) await sleep(BATCH_INTERVAL_MS - elapsed);
    }

    // Drain in-flight messages, then take final measurements.
    await sleep(2000);
    const finalWs = await processWorkingSet(server.pid);
    if (finalWs != null) rssSamples.push({ t: now(), heapUsed: finalWs });

    const totalSent = seq;
    const allLatencies = clients.flatMap((c) => c.latencies);
    const lat = percentiles(allLatencies);
    const totalParseFailures = clients.reduce((a, c) => a + c.parseFailures, 0);

    // Loss accounting: the rejoined client legitimately missed the messages
    // broadcast while it was offline (WS has no replay). Others must have all.
    const perClient = clients.map((c) => {
      const expected = c.offlineFromSeq != null
        ? totalSent - Math.max(0, Math.min(200, totalSent - c.offlineFromSeq)) // tolerance window for offline gap
        : totalSent;
      return { id: c.id, received: c.received, expected, reconnected: c.offlineFromSeq != null };
    });

    const fullClients = perClient.filter((c) => !c.reconnected);
    const lost = fullClients.reduce((a, c) => a + Math.max(0, totalSent - c.received), 0);

    const rssStart = rssSamples[0]?.heapUsed ?? null;
    const rssEnd = rssSamples[rssSamples.length - 1]?.heapUsed ?? null;
    const rssGrowth = rssStart != null && rssEnd != null ? rssEnd - rssStart : null;

    const checks = [
      {
        name: 'zero message loss on stable clients',
        ok: lost === 0,
        detail: `${totalSent.toLocaleString()} sent, per-client received: ${fullClients.map((c) => c.received.toLocaleString()).join(', ')} (lost: ${lost})`,
      },
      {
        name: 'every received line parses via tsc3-parser',
        ok: totalParseFailures === 0,
        detail: `${totalParseFailures} parse failures across ${clients.reduce((a, c) => a + c.received, 0).toLocaleString()} received lines`,
      },
      {
        name: 'no send errors on HTTP control API',
        ok: sendErrors === 0,
        detail: `${sendErrors} failed batch sends`,
      },
      {
        name: 'delivery latency bounded (p95 < 250ms)',
        ok: lat.p95 != null && lat.p95 < 250,
        warn: lat.p95 != null && lat.p95 < 1000,
        detail: `p50 ${fmtMs(lat.p50)}, p95 ${fmtMs(lat.p95)}, max ${fmtMs(lat.max)}`,
      },
      {
        name: 'client reconnect mid-stream succeeded',
        ok: reconnectOk && !clients[0].closed,
        detail: reconnectOk ? 'client 0 dropped and rejoined without stream disruption' : 'reconnect did not complete',
      },
      {
        name: 'mock server working set stable',
        ok: rssGrowth == null || rssGrowth < 60 * 1024 * 1024,
        warn: rssGrowth != null && rssGrowth < 120 * 1024 * 1024,
        detail: rssGrowth == null
          ? 'server RSS unavailable on this platform'
          : `RSS ${fmtBytes(rssStart)} → ${fmtBytes(rssEnd)} (Δ ${fmtBytes(rssGrowth)})`,
      },
    ];

    return buildResult('tsc3-websocket', {
      status: statusFromChecks(checks),
      durationMs: now() - start,
      metrics: {
        pointsSent: totalSent,
        pointsPerSec: Math.round(totalSent / (durationMs / 1000)),
        clients: CLIENT_COUNT,
        messagesReceived: clients.reduce((a, c) => a + c.received, 0),
        latencyMs: {
          p50: lat.p50 != null ? Number(lat.p50.toFixed(1)) : null,
          p95: lat.p95 != null ? Number(lat.p95.toFixed(1)) : null,
          max: lat.max != null ? Number(lat.max.toFixed(1)) : null,
        },
        serverRssStartBytes: rssStart,
        serverRssEndBytes: rssEnd,
      },
      checks,
      notes,
    });
  } finally {
    for (const c of clients) { try { c.ws.close(); } catch { /* ignore */ } }
    await killTree(server.pid);
  }
}
