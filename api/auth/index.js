/**
 * API Route: /api/auth/*
 * Better Auth handler with Web API Request conversion.
 */

import { auth } from "../../lib/auth.js";

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      return res.status(204).end();
    }

    // Build URL
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `${protocol}://${host}${req.url}`;

    // Build headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value && typeof value === 'string') {
        try { headers.set(key, value); } catch (_) { /* skip invalid headers */ }
      }
    }

    // Build request init
    const init = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    // Create Web Request and call auth.handler
    const webReq = new Request(url, init);
    const webRes = await auth.handler(webReq);

    // Write status
    res.statusCode = webRes.status;

    // Write headers
    const cookies = webRes.headers.getSetCookie ? webRes.headers.getSetCookie() : [];
    webRes.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        res.setHeader(key, value);
      }
    });
    if (cookies.length > 0) {
      res.setHeader('set-cookie', cookies);
    }

    // CORS
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Write body
    const body = await webRes.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (error) {
    console.error('[Auth API] CAUGHT:', error?.message, error?.stack);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: error?.message || 'Unknown error', stack: error?.stack?.split('\n').slice(0, 3) }));
    }
  }
}
