import { auth } from "../../lib/auth.js";

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Step 1: Can we even respond to POST?
  if (req.headers['x-echo'] === '1') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ echo: true, method: req.method, url: req.url }));
  }

  // Step 2: Try auth.handler
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = `${protocol}://${host}${req.url}`;

  const headers = new Headers();
  Object.entries(req.headers).forEach(([k, v]) => {
    if (v && typeof v === 'string') try { headers.set(k, v); } catch(_) {}
  });

  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const webRes = await auth.handler(new Request(url, init));
    const body = await webRes.text();
    
    res.statusCode = webRes.status;
    webRes.headers.forEach((v, k) => {
      if (k.toLowerCase() !== 'set-cookie') res.setHeader(k, v);
    });
    if (webRes.headers.getSetCookie) {
      const c = webRes.headers.getSetCookie();
      if (c.length) res.setHeader('set-cookie', c);
    }
    res.setHeader('access-control-allow-origin', req.headers.origin || '*');
    res.setHeader('access-control-allow-credentials', 'true');
    res.end(body);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ step: 'auth.handler', error: e.message }));
  }
}
