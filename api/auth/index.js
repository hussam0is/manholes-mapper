import { auth } from "../../lib/auth.js";

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      return res.status(204).end();
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value && typeof value === 'string') {
        try { headers.set(key, value); } catch (_) {}
      }
    }

    const init = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    let webReq;
    try {
      webReq = new Request(url, init);
    } catch (e) {
      return res.status(500).json({ error: 'Request construction failed', detail: e.message });
    }

    let webRes;
    try {
      webRes = await auth.handler(webReq);
    } catch (e) {
      return res.status(500).json({ error: 'auth.handler threw', detail: e.message, stack: e.stack?.split('\n').slice(0,4) });
    }

    // Read response body first before writing anything
    let body;
    try {
      body = await webRes.text();
    } catch (e) {
      return res.status(500).json({ error: 'Response read failed', detail: e.message });
    }

    // Now write everything
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') {
        res.setHeader(key, value);
      }
    });
    if (webRes.headers.getSetCookie) {
      const cookies = webRes.headers.getSetCookie();
      if (cookies.length) res.setHeader('set-cookie', cookies);
    }
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.end(body);
  } catch (error) {
    console.error('[Auth] UNCAUGHT:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Uncaught: ' + (error?.message || 'unknown') }));
    }
  }
}
