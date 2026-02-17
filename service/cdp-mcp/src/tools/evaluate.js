import { cdpClient } from '../cdp-client.js';

export const evaluateTools = [
  {
    name: 'cdp_list_tabs',
    description: 'List all open Chrome tabs on the connected phone',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const tabs = await cdpClient.listTabs();
      return JSON.stringify(tabs, null, 2);
    },
  },
  {
    name: 'cdp_connect',
    description:
      'Connect to a Chrome tab on the phone. Auto-detects the manholes-mapper PWA if no tabId is specified.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'Optional tab ID. Omit to auto-detect the PWA tab.',
        },
      },
    },
    handler: async ({ tabId }) => {
      const tab = await cdpClient.connect(tabId);
      return JSON.stringify({ connected: true, ...tab });
    },
  },
  {
    name: 'cdp_evaluate',
    description:
      'Execute JavaScript in the phone browser page context and return the result. Use for inspecting app state, calling functions, or debugging.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript expression to evaluate in the page context',
        },
      },
      required: ['expression'],
    },
    handler: async ({ expression }) => {
      const result = await cdpClient.evaluate(expression);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    },
  },
];
