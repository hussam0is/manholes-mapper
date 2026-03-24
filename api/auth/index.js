import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";

export const config = { runtime: 'nodejs' };

const betterAuthHandler = toNodeHandler(auth);

export default async function handler(req, res) {
  // Debug mode
  if (req.headers['x-debug-auth'] === '1') {
    return res.status(200).json({
      url: req.url,
      method: req.method,
      contentType: req.headers['content-type'],
      bodyType: typeof req.body,
      hasBody: req.body !== undefined && req.body !== null,
    });
  }

  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(204).end();
  }

  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  try {
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth] Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
}
