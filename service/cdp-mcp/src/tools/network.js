import { cdpClient } from '../cdp-client.js';

export const networkTools = [
  {
    name: 'cdp_network_log',
    description:
      'Get recent network requests from the phone browser. Useful for debugging API calls.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of recent requests to return (default: 30)',
        },
        urlFilter: {
          type: 'string',
          description: 'Filter requests by URL substring (e.g. "/api/" or "sketches")',
        },
      },
    },
    handler: async ({ count = 30, urlFilter }) => {
      const reqs = cdpClient.getNetworkLog(count, urlFilter);
      if (reqs.length === 0) {
        return 'No network requests captured yet. Make sure you are connected (use cdp_connect first).';
      }
      const formatted = reqs.map((r) => {
        const time = new Date(r.timestamp).toISOString().slice(11, 23);
        return `[${time}] ${r.method} ${r.status || '...'} ${r.url}`;
      });
      return formatted.join('\n');
    },
  },
];
