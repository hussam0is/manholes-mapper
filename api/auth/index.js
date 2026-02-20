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

export const config = {
  runtime: 'nodejs',
};

// Create the node handler
const betterAuthHandler = toNodeHandler(auth);

export default async function authHandler(req, res) {
  console.debug('[Auth API] Request:', req.method, req.url);

  if (handleCors(req, res)) return;

  try {
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}
