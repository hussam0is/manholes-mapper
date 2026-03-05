import { cdpClient } from '../cdp-client.js';

/**
 * Helper to evaluate a GNSS expression and return the result as formatted JSON
 */
async function evalGnss(expression) {
  const result = await cdpClient.evaluate(expression);
  return JSON.stringify(result, null, 2);
}

export const gnssTools = [
  {
    name: 'gnss_get_state',
    description:
      'Get the full GNSS state snapshot including connection info, position, and capture stats.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return await evalGnss('window.__gnssState.getStatus()');
    },
  },
  {
    name: 'gnss_get_position',
    description:
      'Get the current GNSS position with lat, lon, alt, fix quality, satellites, HDOP, speed, course, and staleness.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return await evalGnss('window.__gnssState.getPosition()');
    },
  },
  {
    name: 'gnss_get_connection_info',
    description:
      'Get GNSS connection details: state (disconnected/connecting/connected/error), type, device name, errors.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      return await evalGnss('window.__gnssState.getConnectionInfo()');
    },
  },
  {
    name: 'gnss_watch_position',
    description:
      'Collect multiple GNSS position updates over a time window. Useful for observing accuracy drift or fix transitions.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of position updates to collect (default: 5)',
        },
        durationMs: {
          type: 'number',
          description: 'Max time to collect updates in milliseconds (default: 10000)',
        },
      },
    },
    handler: async ({ count = 5, durationMs = 10000 }) => {
      // Inject a temporary collector into the page
      const expression = `
        new Promise((resolve) => {
          const positions = [];
          const maxCount = ${count};
          const timeout = setTimeout(() => {
            cleanup();
            resolve(positions);
          }, ${durationMs});

          function onPosition(pos) {
            positions.push({ ...pos, collectedAt: Date.now() });
            if (positions.length >= maxCount) {
              cleanup();
              resolve(positions);
            }
          }

          function cleanup() {
            clearTimeout(timeout);
            window.__gnssState.off('position', onPosition);
          }

          window.__gnssState.on('position', onPosition);
        })
      `;
      const result = await cdpClient.evaluate(expression);
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'gnss_trigger_mock',
    description:
      'Start the mock GNSS adapter for testing. Simulates GPS data without a real receiver.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Latitude for mock position (default: Tel Aviv 32.0853)',
        },
        lon: {
          type: 'number',
          description: 'Longitude for mock position (default: Tel Aviv 34.7818)',
        },
        fixQuality: {
          type: 'number',
          description: 'Fix quality 0-8 (default: 4 = RTK Fixed)',
        },
      },
    },
    handler: async ({ lat, lon, fixQuality }) => {
      // Connect mock adapter
      await cdpClient.evaluate('window.__gnssConnection.connectMock()');

      // If custom position/quality requested, update mock adapter config
      if (lat !== undefined || lon !== undefined || fixQuality !== undefined) {
        const updates = [];
        if (lat !== undefined) updates.push(`adapter.basePosition.lat = ${lat}`);
        if (lon !== undefined) updates.push(`adapter.basePosition.lon = ${lon}`);
        if (fixQuality !== undefined) updates.push(`adapter.fixQuality = ${fixQuality}`);

        await cdpClient.evaluate(`
          (() => {
            const adapter = window.__gnssConnection.mockAdapter;
            if (adapter) { ${updates.join('; ')}; }
          })()
        `);
      }

      // Return current state after a brief delay for the first update
      await new Promise((r) => setTimeout(r, 1500));
      return await evalGnss('window.__gnssState.getStatus()');
    },
  },
  {
    name: 'gnss_capture_point',
    description:
      'Trigger a GNSS point capture for a specific node ID. Captures the current position and associates it with the node.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'The node ID to associate the captured point with',
        },
      },
      required: ['nodeId'],
    },
    handler: async ({ nodeId }) => {
      const result = await cdpClient.evaluate(
        `window.__gnssState.capturePoint('${nodeId.replace(/'/g, "\\'")}')`
      );
      return JSON.stringify(result, null, 2);
    },
  },
];
