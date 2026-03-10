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
  console.log('[Auth API] Request:', req.method, req.url);

  if (handleCors(req, res)) return;

  const isSignOut = req.url?.includes('/sign-out');

  if (!isSignOut && applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
    return;
  }

  try {
    // Workaround: Vercel's Rust runtime patches req.body with a getter
    // that throws "Invalid JSON". Override it with own property before
    // better-call tries to access it via the getter.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        // Try to safely read Vercel's pre-parsed body
        const existingBody = req.body;
        // If we get here, the getter worked — re-assign as own property
        Object.defineProperty(req, 'body', {
          value: existingBody,
          writable: true,
          configurable: true,
        });
      } catch {
        // Getter threw — read body from stream and set as own property
        const rawBody = await new Promise((resolve, reject) => {
          const chunks = [];
          req.on('data', c => chunks.push(c));
          req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          req.on('error', reject);
          // Timeout fallback
          setTimeout(() => resolve(chunks.length ? Buffer.concat(chunks).toString('utf8') : ''), 3000);
        });
        Object.defineProperty(req, 'body', {
          value: rawBody ? JSON.parse(rawBody) : undefined,
          writable: true,
          configurable: true,
        });
      }
    }

    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    console.error('[Auth API] Stack:', error.stack);
    if (!res.headersSent) {
      return res.status(500).json({
        error: sanitizeErrorMessage(error),
        _debug: error.message,
        _stack: (error.stack || '').split('\n').slice(0, 5),
      });
    }
  }
}
