import { cdpClient } from '../cdp-client.js';

export const consoleTools = [
  {
    name: 'cdp_get_console_logs',
    description:
      'Get recent console log entries from the phone browser. Captures console.log, warn, error, debug, and info.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of recent log entries to return (default: 50)',
        },
        level: {
          type: 'string',
          description: 'Filter by log level: log, warning, error, debug, info',
        },
      },
    },
    handler: async ({ count = 50, level }) => {
      const logs = cdpClient.getConsoleLogs(count, level);
      if (logs.length === 0) {
        return 'No console logs captured yet. Make sure you are connected (use cdp_connect first).';
      }
      const formatted = logs.map((l) => {
        const time = new Date(l.timestamp).toISOString().slice(11, 23);
        return `[${time}] ${l.level.toUpperCase().padEnd(7)} ${l.text}`;
      });
      return formatted.join('\n');
    },
  },
];
