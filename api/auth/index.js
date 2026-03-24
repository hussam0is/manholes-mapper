/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 * Handles: signIn, signUp, signOut, session, etc.
 *
 * Uses dynamic imports to catch and surface module-level errors
 * instead of silently crashing with FUNCTION_INVOCATION_FAILED.
 */

export const config = {
  runtime: 'nodejs',
};

let _handler = null;
let _initError = null;

async function getHandler() {
  if (_handler) return _handler;
  if (_initError) throw _initError;

  try {
    const [authMod, betterAuthNode, corsMod, authHelpers, rateLimitMod, dbMod] = await Promise.all([
      import('../../lib/auth.js'),
      import('better-auth/node'),
      import('../_lib/cors.js'),
      import('../_lib/auth.js'),
      import('../_lib/rate-limit.js'),
      import('../_lib/db.js'),
    ]);

    const betterAuthHandler = betterAuthNode.toNodeHandler(authMod.auth);

    _handler = {
      betterAuthHandler,
      handleCors: corsMod.handleCors,
      sanitizeErrorMessage: authHelpers.sanitizeErrorMessage,
      applyRateLimit: rateLimitMod.applyRateLimit,
      checkDbRateLimit: rateLimitMod.checkDbRateLimit,
      getClientIP: rateLimitMod.getClientIP,
      MAX_REQUESTS_AUTH: rateLimitMod.MAX_REQUESTS_AUTH,
      ensureDb: dbMod.ensureDb,
    };
    return _handler;
  } catch (err) {
    _initError = err;
    throw err;
  }
}

export default async function authHandler(req, res) {
  let h;
  try {
    h = await getHandler();
  } catch (err) {
    // Surface the actual import/init error instead of silent crash
    console.error('[Auth API] Init failed:', err.message, err.stack);
    return res.status(500).json({
      error: 'Auth initialization failed',
      detail: err.message,
      stack: process.env.NODE_ENV !== 'production' ? err.stack?.split('\n').slice(0, 5) : undefined,
    });
  }

  if (h.handleCors(req, res)) return;

  const isSignOut = req.url?.includes('/sign-out');

  if (!isSignOut) {
    if (h.applyRateLimit(req, res, h.MAX_REQUESTS_AUTH)) {
      return;
    }

    try {
      await h.ensureDb();
      const ip = h.getClientIP(req);
      const dbResult = await h.checkDbRateLimit(ip, '/api/auth', h.MAX_REQUESTS_AUTH, 60);
      if (!dbResult.allowed) {
        res.setHeader('X-RateLimit-Limit', h.MAX_REQUESTS_AUTH);
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
    return await h.betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: h.sanitizeErrorMessage(error),
      });
    }
  }
}
