/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 * Handles: signIn, signUp, signOut, session, etc.
 *
 * Uses auth.handler (Web API) instead of toNodeHandler to avoid
 * body parsing issues on Vercel serverless (toNodeHandler fails
 * with "Invalid JSON" when Vercel's runtime pre-parses the body).
 */

export const config = {
  runtime: 'nodejs',
};

let _deps = null;
let _initError = null;

async function getDeps() {
  if (_deps) return _deps;
  if (_initError) throw _initError;

  try {
    const [authMod, corsMod, rateLimitMod, dbMod] = await Promise.all([
      import('../../lib/auth.js'),
      import('../_lib/cors.js'),
      import('../_lib/rate-limit.js'),
      import('../_lib/db.js'),
    ]);

    _deps = {
      auth: authMod.auth,
      handleCors: corsMod.handleCors,
      applyRateLimit: rateLimitMod.applyRateLimit,
      checkDbRateLimit: rateLimitMod.checkDbRateLimit,
      getClientIP: rateLimitMod.getClientIP,
      MAX_REQUESTS_AUTH: rateLimitMod.MAX_REQUESTS_AUTH,
      ensureDb: dbMod.ensureDb,
    };
    return _deps;
  } catch (err) {
    _initError = err;
    throw err;
  }
}

export default async function authHandler(req, res) {
  let d;
  try {
    d = await getDeps();
  } catch (err) {
    console.error('[Auth API] Init failed:', err.message, err.stack);
    return res.status(500).json({
      error: 'Auth initialization failed',
      detail: err.message,
    });
  }

  if (d.handleCors(req, res)) return;

  const isSignOut = req.url?.includes('/sign-out');

  if (!isSignOut) {
    if (d.applyRateLimit(req, res, d.MAX_REQUESTS_AUTH)) {
      return;
    }

    try {
      await d.ensureDb();
      const ip = d.getClientIP(req);
      const dbResult = await d.checkDbRateLimit(ip, '/api/auth', d.MAX_REQUESTS_AUTH, 60);
      if (!dbResult.allowed) {
        res.setHeader('X-RateLimit-Limit', d.MAX_REQUESTS_AUTH);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('Retry-After', 60);
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: 60,
        });
      }
    } catch (dbError) {
      console.warn('[Auth API] DB rate limit check failed:', dbError.message);
    }
  }

  try {
    // Build a Web API Request from the Node.js req
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let body = undefined;
    if (hasBody) {
      // Vercel may have already parsed the body into req.body
      if (req.body !== undefined && req.body !== null) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      } else {
        // Read raw body from stream
        body = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => resolve(data || undefined));
          req.on('error', reject);
        });
      }
    }

    const init = { method: req.method, headers };
    if (body !== undefined) {
      init.body = body;
    }
    const webRequest = new Request(url, init);

    // Use Better Auth's Web API handler
    console.log('[Auth API] Request:', req.method, req.url, 'body-type:', typeof body, 'body-len:', body?.length, 'body-preview:', body?.substring(0, 100));
    const webResponse = await d.auth.handler(webRequest);

    // Convert Web API Response back to Node.js res
    res.status(webResponse.status);

    for (const [key, value] of webResponse.headers.entries()) {
      // Handle multiple Set-Cookie headers
      if (key.toLowerCase() === 'set-cookie') {
        const cookies = webResponse.headers.getSetCookie
          ? webResponse.headers.getSetCookie()
          : [value];
        cookies.forEach(c => res.appendHeader('Set-Cookie', c));
      } else {
        res.setHeader(key, value);
      }
    }

    const responseBody = await webResponse.text();
    res.end(responseBody);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error, error.stack);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal server error',
        _debug: error.message,
        _bodyType: typeof body,
        _bodyPreview: typeof body === 'string' ? body.substring(0, 200) : String(body),
        _reqBody: req.body !== undefined ? typeof req.body : 'undefined',
      });
    }
  }
}
