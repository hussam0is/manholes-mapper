/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 *
 * bodyParser: false is critical — Vercel normally pre-parses the body,
 * consuming the stream before toNodeHandler can read it.
 */

import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";
import { handleCors } from "../_lib/cors.js";
import { applyRateLimit, checkDbRateLimit, getClientIP, MAX_REQUESTS_AUTH } from "../_lib/rate-limit.js";
import { ensureDb } from "../_lib/db.js";

export const config = {
  runtime: 'nodejs',
  api: {
    bodyParser: false,
  },
};

const betterAuthHandler = toNodeHandler(auth);

export default async function authHandler(req, res) {
  if (handleCors(req, res)) return;

  const isSignOut = req.url?.includes('/sign-out');

  if (!isSignOut) {
    if (applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
      return;
    }

    try {
      await ensureDb();
      const ip = getClientIP(req);
      const dbResult = await checkDbRateLimit(ip, '/api/auth', MAX_REQUESTS_AUTH, 60);
      if (!dbResult.allowed) {
        res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_AUTH);
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
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error, error.stack);
    if (!res.headersSent) {
      return res.status(500).json({
        error: error.message || 'Internal server error',
        code: error.code || undefined,
      });
    }
  }
}
