import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cdpClient } from './cdp-client.js';

const execFileAsync = promisify(execFile);

const server = new McpServer({
  name: 'phone-debug',
  version: '1.0.0',
});

// ─── CDP Core Tools ───────────────────────────────────────────

server.tool('cdp_list_tabs', 'List all open Chrome tabs on the connected phone', {}, async () => {
  try {
    const tabs = await cdpClient.listTabs();
    return { content: [{ type: 'text', text: JSON.stringify(tabs, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}\n\nMake sure ADB forwarding is set up:\n  adb forward tcp:9222 localabstract:chrome_devtools_remote` }], isError: true };
  }
});

server.tool(
  'cdp_connect',
  'Connect to a Chrome tab on the phone. Auto-detects the manholes-mapper PWA if no tabId is specified.',
  { tabId: z.string().optional().describe('Optional tab ID. Omit to auto-detect the PWA tab.') },
  async ({ tabId }) => {
    try {
      const tab = await cdpClient.connect(tabId);
      return { content: [{ type: 'text', text: JSON.stringify({ connected: true, ...tab }, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'cdp_evaluate',
  'Execute JavaScript in the phone browser page context and return the result.',
  { expression: z.string().describe('JavaScript expression to evaluate in the page context') },
  async ({ expression }) => {
    try {
      const result = await cdpClient.evaluate(expression);
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text: text ?? 'undefined' }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Evaluation error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'cdp_get_console_logs',
  'Get recent console log entries from the phone browser.',
  {
    count: z.number().optional().describe('Number of recent log entries (default: 50)'),
    level: z.string().optional().describe('Filter by level: log, warning, error, debug, info'),
  },
  async ({ count = 50, level }) => {
    const logs = cdpClient.getConsoleLogs(count, level);
    if (logs.length === 0) {
      return { content: [{ type: 'text', text: 'No console logs captured yet. Use cdp_connect first.' }] };
    }
    const formatted = logs.map((l) => {
      const time = new Date(l.timestamp).toISOString().slice(11, 23);
      return `[${time}] ${l.level.toUpperCase().padEnd(7)} ${l.text}`;
    });
    return { content: [{ type: 'text', text: formatted.join('\n') }] };
  }
);

server.tool(
  'cdp_screenshot',
  'Take a screenshot of the phone browser tab. Returns a base64-encoded image.',
  {
    format: z.enum(['png', 'jpeg']).optional().describe('Image format (default: png)'),
    quality: z.number().optional().describe('JPEG quality 0-100 (only for jpeg)'),
  },
  async ({ format = 'png', quality }) => {
    try {
      const data = await cdpClient.screenshot(format, quality);
      return {
        content: [{ type: 'image', data, mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png' }],
      };
    } catch (e) {
      return { content: [{ type: 'text', text: `Screenshot error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'adb_screenshot',
  'Take a full-screen screenshot of the phone via ADB. Captures everything: status bar, app, nav bar. Does NOT require CDP connection.',
  {
    format: z.enum(['png', 'jpeg']).optional().describe('Image format (default: png)'),
    quality: z.number().optional().describe('JPEG quality 0-100 (only for jpeg, default: 80)'),
  },
  async ({ format = 'png', quality = 80 }) => {
    try {
      // Use adb exec-out screencap to get raw PNG bytes directly
      const { stdout } = await execFileAsync('adb', ['exec-out', 'screencap', '-p'], {
        encoding: 'buffer',
        maxBuffer: 20 * 1024 * 1024, // 20 MB for high-res screens
      });
      let imageBuffer = stdout;
      let mimeType = 'image/png';

      if (format === 'jpeg') {
        // For JPEG, we still get PNG from screencap, return as PNG
        // (JPEG conversion would require sharp/jimp — not worth the dependency)
        mimeType = 'image/png';
      }

      const data = imageBuffer.toString('base64');
      return {
        content: [{ type: 'image', data, mimeType }],
      };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `ADB screenshot error: ${e.message}\n\nMake sure a device is connected:\n  adb devices` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'cdp_network_log',
  'Get recent network requests from the phone browser.',
  {
    count: z.number().optional().describe('Number of recent requests (default: 30)'),
    urlFilter: z.string().optional().describe('Filter by URL substring (e.g. "/api/")'),
  },
  async ({ count = 30, urlFilter }) => {
    const reqs = cdpClient.getNetworkLog(count, urlFilter);
    if (reqs.length === 0) {
      return { content: [{ type: 'text', text: 'No network requests captured yet. Use cdp_connect first.' }] };
    }
    const formatted = reqs.map((r) => {
      const time = new Date(r.timestamp).toISOString().slice(11, 23);
      return `[${time}] ${r.method} ${r.status || '...'} ${r.url}`;
    });
    return { content: [{ type: 'text', text: formatted.join('\n') }] };
  }
);

// ─── GNSS-Specific Tools ──────────────────────────────────────

async function evalGnss(expression) {
  const result = await cdpClient.evaluate(expression);
  return JSON.stringify(result, null, 2);
}

server.tool('gnss_get_state', 'Get the full GNSS state snapshot (connection, position, captures).', {}, async () => {
  try {
    const text = await evalGnss('window.__gnssState.getStatus()');
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

server.tool('gnss_get_position', 'Get current GNSS position with fix quality, satellites, HDOP, staleness.', {}, async () => {
  try {
    const text = await evalGnss('window.__gnssState.getPosition()');
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

server.tool('gnss_get_connection_info', 'Get GNSS connection details: state, type, device name, errors.', {}, async () => {
  try {
    const text = await evalGnss('window.__gnssState.getConnectionInfo()');
    return { content: [{ type: 'text', text }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

server.tool(
  'gnss_watch_position',
  'Collect multiple GNSS position updates over a time window.',
  {
    count: z.number().optional().describe('Number of updates to collect (default: 5)'),
    durationMs: z.number().optional().describe('Max collection time in ms (default: 10000)'),
  },
  async ({ count = 5, durationMs = 10000 }) => {
    try {
      const expression = `
        new Promise((resolve) => {
          const positions = [];
          const maxCount = ${count};
          const timeout = setTimeout(() => { cleanup(); resolve(positions); }, ${durationMs});
          function onPosition(pos) {
            positions.push({ ...pos, collectedAt: Date.now() });
            if (positions.length >= maxCount) { cleanup(); resolve(positions); }
          }
          function cleanup() { clearTimeout(timeout); window.__gnssState.off('position', onPosition); }
          window.__gnssState.on('position', onPosition);
        })
      `;
      const result = await cdpClient.evaluate(expression);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'gnss_trigger_mock',
  'Start the mock GNSS adapter for testing without a real receiver.',
  {
    lat: z.number().optional().describe('Latitude (default: 32.0853 Tel Aviv)'),
    lon: z.number().optional().describe('Longitude (default: 34.7818 Tel Aviv)'),
    fixQuality: z.number().optional().describe('Fix quality 0-8 (default: 4 = RTK Fixed)'),
  },
  async ({ lat, lon, fixQuality }) => {
    try {
      await cdpClient.evaluate('window.__gnssConnection.connectMock()');

      if (lat !== undefined || lon !== undefined || fixQuality !== undefined) {
        const updates = [];
        if (lat !== undefined) updates.push(`adapter.basePosition.lat = ${lat}`);
        if (lon !== undefined) updates.push(`adapter.basePosition.lon = ${lon}`);
        if (fixQuality !== undefined) updates.push(`adapter.fixQuality = ${fixQuality}`);
        await cdpClient.evaluate(`(() => { const adapter = window.__gnssConnection.mockAdapter; if (adapter) { ${updates.join('; ')}; } })()`);
      }

      await new Promise((r) => setTimeout(r, 1500));
      const text = await evalGnss('window.__gnssState.getStatus()');
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'gnss_capture_point',
  'Capture the current GNSS position and associate it with a node ID.',
  { nodeId: z.string().describe('The node ID to associate the captured point with') },
  async ({ nodeId }) => {
    try {
      const safeId = nodeId.replace(/'/g, "\\'");
      const result = await cdpClient.evaluate(`window.__gnssState.capturePoint('${safeId}')`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// ─── App-Level Tools ──────────────────────────────────────────

server.tool(
  'app_get_state',
  'Get comprehensive app state: auth, sync, current sketch info, language, and route.',
  {},
  async () => {
    try {
      const result = await cdpClient.evaluate(`(() => {
        const auth = window.authGuard?.getAuthState?.() || {};
        const sync = window.syncService?.getSyncState?.() || {};
        const lang = window.currentLang || 'unknown';
        const route = window.location.hash || '#/';
        const gnss = window.__gnssState?.getStatus?.() || {};
        const sketch = (() => {
          try {
            const raw = window.localStorage.getItem('graphSketch');
            if (!raw) return null;
            const s = JSON.parse(raw);
            return { id: s.id, name: s.name, nodeCount: s.nodes?.length || 0, edgeCount: s.edges?.length || 0 };
          } catch { return null; }
        })();
        return { auth, sync, language: lang, route, gnss, currentSketch: sketch };
      })()`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'app_navigate',
  'Navigate the SPA to a hash route (e.g. #/login, #/home, #/admin).',
  { route: z.string().describe('Hash route to navigate to (e.g. "#/login", "#/home", "#/admin")') },
  async ({ route }) => {
    try {
      const safeRoute = route.replace(/'/g, "\\'");
      await cdpClient.evaluate(`window.location.hash = '${safeRoute}'`);
      await new Promise((r) => setTimeout(r, 500));
      const currentHash = await cdpClient.evaluate('window.location.hash');
      return { content: [{ type: 'text', text: `Navigated to: ${currentHash}` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'app_toast',
  'Show a toast notification in the app UI.',
  { message: z.string().describe('Toast message to display') },
  async ({ message }) => {
    try {
      const safeMsg = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      await cdpClient.evaluate(`window.showToast?.('${safeMsg}')`);
      return { content: [{ type: 'text', text: `Toast shown: "${message}"` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'app_get_sketch_info',
  'Get current sketch data: id, name, nodes, edges, adminConfig.',
  {},
  async () => {
    try {
      const result = await cdpClient.evaluate(`(() => {
        try {
          const raw = window.localStorage.getItem('graphSketch');
          if (!raw) return { error: 'No current sketch in localStorage' };
          const s = JSON.parse(raw);
          return {
            id: s.id, name: s.name, creationDate: s.creationDate,
            nodeCount: s.nodes?.length || 0, edgeCount: s.edges?.length || 0,
            nodes: (s.nodes || []).map(n => ({ id: n.id, label: n.label, x: n.x, y: n.y, itmE: n.itmE, itmN: n.itmN })),
            edges: (s.edges || []).map(e => ({ id: e.id, from: e.from, to: e.to })),
            hasAdminConfig: !!s.adminConfig,
          };
        } catch (e) { return { error: e.message }; }
      })()`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'app_trigger_sync',
  'Trigger cloud sync (fetch sketches from cloud or process sync queue).',
  { direction: z.enum(['from_cloud', 'process_queue']).optional().describe('Sync direction (default: from_cloud)') },
  async ({ direction = 'from_cloud' }) => {
    try {
      const fn = direction === 'process_queue' ? 'processSyncQueue' : 'syncFromCloud';
      const result = await cdpClient.evaluate(`window.syncService?.${fn}?.().then(r => ({ success: true, count: r?.length })).catch(e => ({ error: e.message }))`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'app_set_language',
  'Switch the app language between English and Hebrew.',
  { lang: z.enum(['en', 'he']).describe('Language code: "en" for English, "he" for Hebrew') },
  async ({ lang }) => {
    try {
      await cdpClient.evaluate(`(() => {
        window.currentLang = '${lang}';
        window.localStorage.setItem('graphSketch.lang', '${lang}');
        document.documentElement.dir = '${lang === 'he' ? 'rtl' : 'ltr'}';
        document.documentElement.lang = '${lang}';
        document.dir = '${lang === 'he' ? 'rtl' : 'ltr'}';
      })()`);
      return { content: [{ type: 'text', text: `Language set to: ${lang} (${lang === 'he' ? 'RTL' : 'LTR'})` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'app_center_map',
  'Center the map on given WGS84 coordinates.',
  {
    lat: z.number().describe('Latitude in decimal degrees'),
    lon: z.number().describe('Longitude in decimal degrees'),
  },
  async ({ lat, lon }) => {
    try {
      const result = await cdpClient.evaluate(`(() => {
        if (window.centerOnGpsLocation) {
          window.centerOnGpsLocation(${lat}, ${lon});
          return { success: true, lat: ${lat}, lon: ${lon} };
        }
        return { error: 'centerOnGpsLocation not available' };
      })()`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'app_toggle_live_measure',
  'Toggle Live Measure mode on or off.',
  { enabled: z.boolean().describe('true to enable, false to disable') },
  async ({ enabled }) => {
    try {
      const result = await cdpClient.evaluate(`(() => {
        if (window.setLiveMeasureMode) {
          window.setLiveMeasureMode(${enabled});
          return { success: true, liveMeasureEnabled: ${enabled} };
        }
        return { error: 'setLiveMeasureMode not available' };
      })()`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'app_redraw',
  'Force a canvas redraw of the map.',
  {},
  async () => {
    try {
      await cdpClient.evaluate('window.scheduleDraw?.()');
      return { content: [{ type: 'text', text: 'Canvas redraw scheduled' }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// ─── Start Server ─────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
