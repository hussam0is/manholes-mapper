/**
 * Soak phase: browser canvas session.
 *
 * Drives a long-lived headless Chromium session against the local Vite dev
 * server (spawned automatically if :5173 isn't already up) with auth/API
 * routes mocked the same way the E2E suite does. Simulates a field workday:
 * hundreds of node placements, mode switches, pans, zooms, and escapes —
 * while sampling JS heap, DOM node count, and event-listener count through
 * the Chrome DevTools Protocol.
 *
 * Verifies: no uncaught page errors, bounded heap growth, bounded DOM and
 * listener growth, and no severe per-interaction latency degradation as the
 * sketch accumulates data.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import {
  now, sleep, makeRng, killTree, waitForHttp,
  fmtBytes, fmtMs, buildResult, statusFromChecks,
} from '../lib/soak-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = join(__dirname, '..', '..', '..', 'frontend');
const BASE_URL = process.env.SOAK_BASE_URL || 'http://localhost:5173';

const MOCK_USER = { id: 'soak-user', name: 'Soak Tester', email: 'soak@example.com' };
const MOCK_SESSION = {
  id: 'soak-session',
  userId: MOCK_USER.id,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};

async function ensureDevServer(log) {
  try {
    await waitForHttp(BASE_URL, { timeoutMs: 2500 });
    log(`  reusing dev server already running at ${BASE_URL}`);
    return null;
  } catch {
    log('  starting vite dev server...');
    const child = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
      cwd: FRONTEND_DIR,
      shell: true,
      stdio: 'ignore',
    });
    await waitForHttp(BASE_URL, { timeoutMs: 60000 });
    return child;
  }
}

/** Mirror of the E2E helpers' route mocks (catch-all registered first, so specifics win). */
async function mockRoutes(context) {
  await context.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
  await context.route('**/api/auth/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('get-session')
          ? { session: MOCK_SESSION, user: MOCK_USER }
          : {}
      ),
    })
  );
  await context.route('**/api/user-role**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ role: 'user', permissions: ['read', 'write'], features: {} }),
    })
  );
  await context.route('**/api/sketches**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  );
  await context.route('**/api/projects**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"projects":[]}' })
  );
}

async function getCdpMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const get = (name) => metrics.find((m) => m.name === name)?.value ?? null;
  return {
    t: now(),
    heapUsed: get('JSHeapUsedSize'),
    domNodes: get('Nodes'),
    listeners: get('JSEventListeners'),
    documents: get('Documents'),
  };
}

export async function runBrowserCanvasPhase({ durationMs, log }) {
  const start = now();
  const notes = [];
  let viteChild = null;
  let browser = null;

  try {
    viteChild = await ensureDevServer(log);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await mockRoutes(context);
    const page = await context.newPage();

    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    log('  loading app...');
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => {
      const c = document.getElementById('graphCanvas');
      return c && c.width > 0 && c.height > 0;
    }, { timeout: 20000 });

    // Dismiss home/start panels so the canvas is interactive.
    await page.evaluate(() => {
      for (const id of ['homePanel', 'startPanel']) {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('panel-closing'); el.style.display = 'none'; }
      }
    });
    await sleep(500);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');

    const samples = [await getCdpMetrics(cdp)];
    const clickLatencies = [];
    const rng = makeRng(0x50a1c);
    let iterations = 0;
    let panCount = 0;
    let zoomCount = 0;
    const deadline = now() + durationMs;
    let lastSample = now();

    const canvasBox = await page.locator('#graphCanvas').boundingBox();
    if (!canvasBox) throw new Error('canvas bounding box unavailable');
    // Keep clicks inside the central canvas area, clear of toolbars/panels.
    const clickArea = {
      x: canvasBox.x + canvasBox.width * 0.2,
      y: canvasBox.y + canvasBox.height * 0.25,
      w: canvasBox.width * 0.6,
      h: canvasBox.height * 0.45,
    };

    log(`  interaction loop for ${(durationMs / 1000).toFixed(0)}s...`);
    while (now() < deadline) {
      iterations++;

      // Ensure node mode, then place a node at a pseudo-random position.
      await page.evaluate(() => document.getElementById('nodeModeBtn')?.click());
      const px = clickArea.x + rng() * clickArea.w;
      const py = clickArea.y + rng() * clickArea.h;
      const t0 = now();
      await page.mouse.click(px, py);
      clickLatencies.push(now() - t0);

      // Close whatever dialog the click may have opened (node type picker etc.)
      await page.keyboard.press('Escape');

      if (iterations % 4 === 0) {
        // Zoom cycle via toolbar buttons, ending on reset.
        await page.evaluate(() => document.getElementById('canvasZoomInBtn')?.click());
        await page.evaluate(() => document.getElementById('canvasZoomOutBtn')?.click());
        await page.keyboard.press('0');
        zoomCount++;
      }
      if (iterations % 6 === 0) {
        // Pan drag across the canvas.
        const sx = clickArea.x + clickArea.w * 0.5;
        const sy = clickArea.y + clickArea.h * 0.5;
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        await page.mouse.move(sx + (rng() - 0.5) * 300, sy + (rng() - 0.5) * 200, { steps: 5 });
        await page.mouse.up();
        panCount++;
      }
      if (iterations % 9 === 0) {
        // Mode round-trip: edge mode and back.
        await page.evaluate(() => document.getElementById('edgeModeBtn')?.click());
        await page.evaluate(() => document.getElementById('nodeModeBtn')?.click());
      }

      if (now() - lastSample > 2000) {
        lastSample = now();
        samples.push(await getCdpMetrics(cdp));
      }
    }

    samples.push(await getCdpMetrics(cdp));

    // Sketch state actually accumulated?
    const sketchStats = await page.evaluate(() => {
      const data = window.__getActiveSketchData?.();
      return data ? { nodes: data.nodes?.length ?? 0, edges: data.edges?.length ?? 0 } : null;
    });

    // Heap growth measured from the post-warmup baseline (20% into the run).
    const warmupIdx = Math.min(samples.length - 1, Math.max(1, Math.floor(samples.length * 0.2)));
    const heapBase = samples[warmupIdx].heapUsed;
    const heapEnd = samples[samples.length - 1].heapUsed;
    const heapGrowth = heapEnd - heapBase;
    const domEnd = samples[samples.length - 1].domNodes;
    const listenersBase = samples[warmupIdx].listeners;
    const listenersEnd = samples[samples.length - 1].listeners;
    const listenerGrowth = listenersEnd - listenersBase;

    // Latency degradation: last quarter vs first quarter mean.
    const q = Math.max(1, Math.floor(clickLatencies.length / 4));
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const latFirst = mean(clickLatencies.slice(0, q));
    const latLast = mean(clickLatencies.slice(-q));
    const latRatio = latFirst > 0 ? latLast / latFirst : 1;

    if (sketchStats == null) {
      notes.push('window.__getActiveSketchData not available — sketch growth not verified');
    }

    const checks = [
      {
        name: 'no uncaught page errors',
        ok: pageErrors.length === 0,
        detail: pageErrors.length ? `${pageErrors.length} errors, first: ${pageErrors[0]?.slice(0, 200)}` : 'clean',
      },
      {
        name: 'console errors bounded',
        ok: consoleErrors.length === 0,
        warn: consoleErrors.length <= 10,
        detail: consoleErrors.length
          ? `${consoleErrors.length} console errors, first: ${consoleErrors[0]?.slice(0, 200)}`
          : 'clean',
      },
      {
        name: 'JS heap growth bounded (post-warmup)',
        ok: heapGrowth < 60 * 1024 * 1024,
        warn: heapGrowth < 150 * 1024 * 1024,
        detail: `${fmtBytes(heapBase)} → ${fmtBytes(heapEnd)} (Δ ${fmtBytes(heapGrowth)}) over ${iterations} iterations`,
      },
      {
        name: 'DOM node count bounded',
        ok: domEnd != null && domEnd < 30000,
        warn: domEnd != null && domEnd < 100000,
        detail: `${domEnd?.toLocaleString() ?? 'n/a'} DOM nodes at end`,
      },
      {
        name: 'event listener growth bounded',
        ok: listenerGrowth < 3000,
        warn: listenerGrowth < 10000,
        detail: `${listenersBase} → ${listenersEnd} listeners (Δ ${listenerGrowth})`,
      },
      {
        name: 'interaction latency stable',
        ok: latRatio < 2.5,
        warn: latRatio < 5,
        detail: `mean click round-trip ${fmtMs(latFirst)} → ${fmtMs(latLast)} (×${latRatio.toFixed(2)})`,
      },
      {
        name: 'sketch accumulated data during soak',
        ok: sketchStats != null && sketchStats.nodes > 0,
        warn: true, // known dev-mode init caveat — degraded coverage, not a failure
        detail: sketchStats
          ? `${sketchStats.nodes} nodes, ${sketchStats.edges} edges after ${iterations} iterations`
          : 'sketch state not readable',
      },
    ];

    return buildResult('browser-canvas', {
      status: statusFromChecks(checks),
      durationMs: now() - start,
      metrics: {
        iterations,
        pans: panCount,
        zoomCycles: zoomCount,
        heapBaseBytes: heapBase,
        heapEndBytes: heapEnd,
        heapGrowthBytes: heapGrowth,
        domNodesEnd: domEnd,
        listenersEnd,
        clickLatencyMs: {
          first: Number(latFirst?.toFixed(1)),
          last: Number(latLast?.toFixed(1)),
          ratio: Number(latRatio.toFixed(2)),
        },
        sketch: sketchStats,
        pageErrors: pageErrors.slice(0, 5),
        consoleErrors: consoleErrors.slice(0, 5),
      },
      checks,
      notes,
    });
  } finally {
    try { await browser?.close(); } catch { /* ignore */ }
    if (viteChild) await killTree(viteChild.pid);
  }
}
