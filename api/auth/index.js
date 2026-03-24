/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 *
 * IMPORTANT: Vercel rewrites /api/auth/:path* → /api/auth
 * This means req.url loses the sub-path. We must reconstruct
 * the original URL from x-forwarded headers or the :path param.
 */

import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";

export const config = {
  runtime: 'nodejs',
};

const betterAuthHandler = toNodeHandler(auth);

export default async function authHandler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(204).end();
  }

  // Set CORS headers
  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Vercel rewrites /api/auth/:path* → /api/auth, losing the sub-path.
  // Reconstruct original URL from x-matched-path or x-invoke-path headers.
  const originalUrl = req.headers['x-matched-path']
    || req.headers['x-invoke-path']
    || req.headers['x-original-url']
    || req.url;

  // If Vercel stripped the path, try to reconstruct from query params
  // (Vercel sometimes passes path as query: /api/auth?path=sign-in/email)
  if (req.url === '/api/auth' && req.query?.path) {
    req.url = `/api/auth/${Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path}`;
  } else if (originalUrl !== req.url) {
    req.url = originalUrl;
  }

  // TEMP DEBUG: return request info to diagnose routing
  if (req.headers['x-debug-auth'] === '1') {
    return res.status(200).json({
      url: req.url,
      method: req.method,
      originalUrl: originalUrl,
      query: req.query,
      headers: {
        'x-matched-path': req.headers['x-matched-path'],
        'x-invoke-path': req.headers['x-invoke-path'],
        'x-original-url': req.headers['x-original-url'],
        'x-forwarded-host': req.headers['x-forwarded-host'],
        'x-vercel-forwarded-for': req.headers['x-vercel-forwarded-for'],
      },
      bodyType: typeof req.body,
      bodyIsNull: req.body === null,
      bodyIsUndef: req.body === undefined,
      hasOnData: typeof req.on === 'function',
    });
  }

  try {
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: error.message || 'Internal server error',
      });
    }
  }
}
