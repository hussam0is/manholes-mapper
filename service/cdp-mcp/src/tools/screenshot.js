import { cdpClient } from '../cdp-client.js';

export const screenshotTools = [
  {
    name: 'cdp_screenshot',
    description:
      'Take a screenshot of the phone browser tab. Returns a base64-encoded image.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['png', 'jpeg'],
          description: 'Image format (default: png)',
        },
        quality: {
          type: 'number',
          description: 'JPEG quality 0-100 (only for jpeg format)',
        },
      },
    },
    handler: async ({ format = 'png', quality }) => {
      const data = await cdpClient.screenshot(format, quality);
      return {
        type: 'image',
        mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
        data,
      };
    },
  },
];
