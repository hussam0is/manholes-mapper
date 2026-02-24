/**
 * Mock TSC3 Receiver Server
 *
 * Emulates a Trimble TSC3 survey controller for testing the Manholes Mapper
 * WebSocket adapter (src/survey/tsc3-websocket-adapter.js).
 *
 * - WebSocket server (default 8765): broadcasts CSV survey point lines
 * - HTTP server (default 3001): control API + web UI
 *
 * Usage:
 *   node scripts/mock-tsc3/server.mjs
 *   WS_PORT=9000 HTTP_PORT=4000 node scripts/mock-tsc3/server.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WS_PORT = parseInt(process.env.WS_PORT || '8765', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3001', 10);

// --- Scenarios ---

const SCENARIOS = {
  basic: {
    description: '3 nodes (2 manholes + 1 drain) — standard quick test',
    points: [
      { pointName: 'MH-001', easting: 178500.0, northing: 650200.0, elevation: 102.5 },
      { pointName: 'MH-002', easting: 178520.0, northing: 650215.0, elevation: 101.8 },
      { pointName: 'DRAIN-01', easting: 178535.0, northing: 650225.0, elevation: 100.3 },
    ],
  },
  'chain-5': {
    description: '5-node chain — longer pipeline test',
    points: [
      { pointName: 'S-001', easting: 178500.0, northing: 650200.0, elevation: 105.0 },
      { pointName: 'S-002', easting: 178515.0, northing: 650210.0, elevation: 104.2 },
      { pointName: 'S-003', easting: 178530.0, northing: 650220.0, elevation: 103.5 },
      { pointName: 'S-004', easting: 178545.0, northing: 650230.0, elevation: 102.8 },
      { pointName: 'S-005', easting: 178560.0, northing: 650240.0, elevation: 102.0 },
    ],
  },
  'update-coords': {
    description: 'Sends MH-001 twice with different coords — tests silent coordinate update',
    points: [
      { pointName: 'MH-001', easting: 178500.0, northing: 650200.0, elevation: 102.5 },
      { pointName: 'MH-001', easting: 178501.5, northing: 650201.2, elevation: 102.8 },
    ],
  },
};

// --- State ---
const history = [];
let sentPointsCount = 0;

/** Tracks the currently running scenario, or null if idle. */
let runningScenario = null;

// --- WebSocket Server ---
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws, req) => {
  const addr = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${addr} (total: ${wss.clients.size})`);

  ws.on('close', () => {
    console.log(`[WS] Client disconnected (remaining: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Client error:`, err.message);
  });
});

/**
 * Broadcast a raw CSV line to all connected WebSocket clients.
 * The line is sent with a trailing newline so the parser can split on it.
 */
function broadcast(csvLine) {
  const data = csvLine.endsWith('\n') ? csvLine : csvLine + '\n';
  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
      sent++;
    }
  }
  return sent;
}

// --- Validation ---

/** ITM coordinate ranges matching tsc3-parser.js */
function validatePoint(point) {
  const errors = [];
  if (!point.pointName || typeof point.pointName !== 'string' || !point.pointName.trim()) {
    errors.push('pointName is required');
  }
  const e = Number(point.easting);
  const n = Number(point.northing);
  const el = Number(point.elevation ?? 0);
  if (isNaN(e) || e < 100000 || e > 300000) {
    errors.push(`easting must be 100000–300000 (got ${point.easting})`);
  }
  if (isNaN(n) || n < 400000 || n > 800000) {
    errors.push(`northing must be 400000–800000 (got ${point.northing})`);
  }
  if (isNaN(el)) {
    errors.push(`elevation must be a number (got ${point.elevation})`);
  }
  return errors;
}

/**
 * Format a point as a CSV line in NEN order (name,easting,northing,elevation).
 * This matches the default format that tsc3-parser.js auto-detects.
 */
function formatCsvLine(point) {
  const e = Number(point.easting).toFixed(3);
  const n = Number(point.northing).toFixed(3);
  const el = Number(point.elevation ?? 0).toFixed(3);
  return `${point.pointName.trim()},${e},${n},${el}`;
}

// --- HTTP Server ---

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...corsHeaders(),
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // --- API Routes ---

  if (url.pathname === '/api/status' && method === 'GET') {
    return jsonResponse(res, 200, {
      connectedClients: wss.clients.size,
      sentPointsCount,
      historyLength: history.length,
      wsPort: WS_PORT,
      httpPort: HTTP_PORT,
      runningScenario,
    });
  }

  if (url.pathname === '/api/send-point' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const errors = validatePoint(body);
      if (errors.length > 0) {
        return jsonResponse(res, 400, { error: 'Validation failed', details: errors });
      }

      const csvLine = formatCsvLine(body);
      const clientsSent = broadcast(csvLine);
      sentPointsCount++;

      const entry = {
        id: history.length + 1,
        timestamp: new Date().toISOString(),
        pointName: body.pointName.trim(),
        easting: Number(body.easting),
        northing: Number(body.northing),
        elevation: Number(body.elevation ?? 0),
        csvLine,
        clientsSent,
      };
      history.push(entry);

      return jsonResponse(res, 200, { ok: true, entry });
    } catch (e) {
      return jsonResponse(res, 400, { error: 'Invalid JSON', message: e.message });
    }
  }

  if (url.pathname === '/api/send-batch' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const points = Array.isArray(body) ? body : body.points;
      if (!Array.isArray(points) || points.length === 0) {
        return jsonResponse(res, 400, { error: 'Expected array of points' });
      }

      // Validate all first
      for (let i = 0; i < points.length; i++) {
        const errors = validatePoint(points[i]);
        if (errors.length > 0) {
          return jsonResponse(res, 400, {
            error: `Validation failed for point[${i}]`,
            details: errors,
          });
        }
      }

      const results = [];
      for (const point of points) {
        const csvLine = formatCsvLine(point);
        const clientsSent = broadcast(csvLine);
        sentPointsCount++;

        const entry = {
          id: history.length + 1,
          timestamp: new Date().toISOString(),
          pointName: point.pointName.trim(),
          easting: Number(point.easting),
          northing: Number(point.northing),
          elevation: Number(point.elevation ?? 0),
          csvLine,
          clientsSent,
        };
        history.push(entry);
        results.push(entry);
      }

      return jsonResponse(res, 200, { ok: true, count: results.length, entries: results });
    } catch (e) {
      return jsonResponse(res, 400, { error: 'Invalid JSON', message: e.message });
    }
  }

  if (url.pathname === '/api/history' && method === 'GET') {
    return jsonResponse(res, 200, { history });
  }

  if (url.pathname === '/api/clear-history' && method === 'POST') {
    const cleared = history.length;
    history.length = 0;
    sentPointsCount = 0;
    return jsonResponse(res, 200, { ok: true, cleared });
  }

  if (url.pathname === '/api/scenarios' && method === 'GET') {
    const list = Object.entries(SCENARIOS).map(([name, s]) => ({
      name,
      description: s.description,
      pointCount: s.points.length,
    }));
    return jsonResponse(res, 200, { scenarios: list });
  }

  if (url.pathname === '/api/run-scenario' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const scenarioName = body.scenario;
      const delayMs = Number.isFinite(Number(body.delayMs)) ? Number(body.delayMs) : 1500;

      if (!scenarioName || !SCENARIOS[scenarioName]) {
        return jsonResponse(res, 400, {
          error: 'Unknown scenario',
          available: Object.keys(SCENARIOS),
        });
      }

      const scenario = SCENARIOS[scenarioName];
      const points = scenario.points;
      const pointCount = points.length;
      // Total delay: (N-1) gaps between points
      const estimatedDurationMs = (pointCount - 1) * delayMs;

      // Record that a scenario is now running
      runningScenario = { name: scenarioName, startedAt: new Date().toISOString(), pointCount, delayMs };

      // Fire-and-forget: send points sequentially with delayMs between each
      (async () => {
        for (let i = 0; i < points.length; i++) {
          const point = points[i];
          const csvLine = formatCsvLine(point);
          const clientsSent = broadcast(csvLine);
          sentPointsCount++;

          const entry = {
            id: history.length + 1,
            timestamp: new Date().toISOString(),
            pointName: point.pointName.trim(),
            easting: Number(point.easting),
            northing: Number(point.northing),
            elevation: Number(point.elevation ?? 0),
            csvLine,
            clientsSent,
            scenario: scenarioName,
          };
          history.push(entry);

          console.log(`[scenario:${scenarioName}] Sent point ${i + 1}/${pointCount}: ${point.pointName} (${clientsSent} clients)`);

          if (i < points.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
        console.log(`[scenario:${scenarioName}] Done. ${pointCount} points sent.`);
        runningScenario = null;
      })();

      return jsonResponse(res, 200, {
        ok: true,
        scenario: scenarioName,
        pointCount,
        delayMs,
        estimatedDurationMs,
      });
    } catch (e) {
      return jsonResponse(res, 400, { error: 'Invalid JSON', message: e.message });
    }
  }

  // --- Web UI ---
  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = await readFile(join(__dirname, 'index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html', ...corsHeaders() });
      res.end(html);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Failed to load index.html');
    }
    return;
  }

  // 404
  jsonResponse(res, 404, { error: 'Not found' });
});

// --- Startup ---

function getLanIp() {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

httpServer.listen(HTTP_PORT, () => {
  const lanIp = getLanIp();
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         Mock TSC3 Receiver Server                ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  WebSocket:  ws://localhost:${WS_PORT}                 ║`);
  console.log(`║  HTTP API:   http://localhost:${HTTP_PORT}               ║`);
  console.log(`║  Web UI:     http://localhost:${HTTP_PORT}               ║`);
  console.log(`║  LAN IP:     ${lanIp.padEnd(36)}║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Phone connection:                               ║');
  console.log(`║    ws://${lanIp}:${WS_PORT}`.padEnd(53) + '║');
  console.log('║  Or via ADB reverse:                             ║');
  console.log(`║    adb reverse tcp:${WS_PORT} tcp:${WS_PORT}`.padEnd(53) + '║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});
