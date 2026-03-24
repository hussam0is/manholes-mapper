/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses auth.handler (Web API Request/Response) to avoid
 * body parsing conflicts with Vercel's Node.js runtime.
 *
 * Vercel pre-parses req.body as an object, which confuses
 * toNodeHandler. Instead, we construct a Web API Request
 * from the Node.js req and use auth.handler directly.
 */

import { auth } from "../../lib/auth.js";

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(204).end();
  }

  try {
    // Build Web API Request from Node.js req
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value && typeof value === 'string') {
        headers.set(key, value);
      }
    }

    const init = { method: req.method, headers };

    // For POST/PUT/PATCH, include the body
    // Use req.body (already parsed by Vercel) re-serialized as string
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body !== undefined && req.body !== null) {
        init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }

    const webRequest = new Request(url, init);
    const webResponse = await auth.handler(webRequest);

    // Convert Web API Response back to Node.js res
    res.status(webResponse.status);

    // Copy headers
    for (const [key, value] of webResponse.headers.entries()) {
      if (key.toLowerCase() === 'set-cookie') {
        // Handle multiple Set-Cookie headers
        const cookies = webResponse.headers.getSetCookie
          ? webResponse.headers.getSetCookie()
          : [value];
        for (const c of cookies) {
          res.appendHeader('set-cookie', c);
        }
      } else {
        res.setHeader(key, value);
      }
    }

    // Add CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const body = await webResponse.text();
    return res.end(body);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error, error.stack);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
}
