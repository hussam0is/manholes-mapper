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
  if (!isSignOut && applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
    return;
  }

  try {
    // Workaround for Vercel's Rust runtime body parsing issue:
    // The runtime patches req.body with a getter that may throw "Invalid JSON"
    // when better-call accesses it, while also consuming the raw stream.
    // Try to safely read req.body and re-assign as own property so better-call
    // can use it without triggering the getter again.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      let parsedBody;
      try {
        parsedBody = req.body;
      } catch {
        // Getter threw — body is inaccessible, set to empty string
        // so better-call creates a Request with an empty body
        parsedBody = '';
      }
      // Re-assign as own property to shadow the prototype getter
      Object.defineProperty(req, 'body', {
        value: parsedBody,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

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
