/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 * Handles: signIn, signUp, signOut, session, etc.
 */

import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";
import { handleCors } from "../_lib/cors.js";
import { sanitizeErrorMessage } from "../_lib/auth.js";
import { applyRateLimit, MAX_REQUESTS_AUTH } from "../_lib/rate-limit.js";

export const config = {
  runtime: 'nodejs',
};

// Create the node handler
const betterAuthHandler = toNodeHandler(auth);

export default async function authHandler(req, res) {
  if (handleCors(req, res)) return;

  const isSignOut = req.url?.includes('/sign-out');

  if (!isSignOut) {
    // In-memory rate limit (fast, zero DB overhead)
    if (applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
      return;
    }
  }

  try {
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: sanitizeErrorMessage(error),
      });
    }
  }
}/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 * Handles: signIn, signUp, signOut, session, etc.
 */

import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";
import { handleCors } from "../_lib/cors.js";
import { sanitizeErrorMessage } from "../_lib/auth.js";
import { applyRateLimit, checkDbRateLimit, getClientIP, MAX_REQUESTS_AUTH } from "../_lib/rate-limit.js";
import { ensureDb } from "../_lib/db.js";

export const config = {
  runtime: 'nodejs',
};

// Create the node handler
const betterAuthHandler = toNodeHandler(auth);

export default async function authHandler(req, res) {
  if (handleCors(req, res)) return;

  const isSignOut = req.url?.includes('/sign-out');

  if (!isSignOut) {
    // Layer 1: In-memory rate limit (fast, best-effort per warm instance)
    if (applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
      return;
    }

    // Layer 2: Database-backed rate limit (cross-instance, reliable)
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
      // Database rate limit is best-effort — if DB is unreachable, fall through
      // to in-memory limit which already passed above
      console.warn('[Auth API] DB rate limit check failed:', dbError.message);
    }
  }

  try {
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: sanitizeErrorMessage(error),
      });
    }
  }
}
