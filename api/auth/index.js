/**
 * API Route: /api/auth/*
 * 
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 * Handles: signIn, signUp, signOut, session, etc.
 */

import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";

export const config = {
  runtime: 'nodejs',
};

// Create the node handler
const betterAuthHandler = toNodeHandler(auth);

export default async function authHandler(req, res) {
  console.log('[Auth API] Request:', req.method, req.url);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(204).end();
  }

  // Set CORS headers for all requests
  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  try {
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
    });
  }
}
