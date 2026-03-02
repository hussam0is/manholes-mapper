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
  console.debug('[Auth API] Request:', req.method, req.url);

  if (handleCors(req, res)) return;

  // Sign-out is exempt from rate limiting — users must always be able to terminate their session
  const isSignOut = req.url?.includes('/sign-out');

  // All other auth endpoints get stricter rate limiting (20 req/min) to prevent brute-force
  if (!isSignOut && applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
    return;
  }

  try {
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    return res.status(500).json({
      error: sanitizeErrorMessage(error),
    });
  }
}
