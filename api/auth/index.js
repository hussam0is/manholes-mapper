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
  try {
    // Workaround: Vercel's Rust runtime patches IncomingMessage with a body
    // getter that throws "Invalid JSON" when better-call accesses it.
    // Shadow it with undefined so better-call reads the raw stream instead.
    try {
      Object.defineProperty(req, 'body', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    } catch {
      // If we can't override (non-configurable), try assignment
      try { req.body = undefined; } catch { /* ignore */ }
    }

    if (handleCors(req, res)) return;

    const isSignOut = req.url?.includes('/sign-out');
    if (!isSignOut && applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
      return;
    }

    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    console.error('[Auth API] Stack:', error.stack);
    if (!res.headersSent) {
      return res.status(500).json({
        error: sanitizeErrorMessage(error),
        _debug: error.message,
      });
    }
  }
}
