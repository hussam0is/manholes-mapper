/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 *
 * On Vercel, req.body may be pre-parsed (object), but toNodeHandler
 * expects to read the raw body stream. We re-attach the raw JSON
 * to the request stream when needed.
 */

import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";
import { handleCors } from "../_lib/cors.js";
import { applyRateLimit, checkDbRateLimit, getClientIP, MAX_REQUESTS_AUTH } from "../_lib/rate-limit.js";
import { ensureDb } from "../_lib/db.js";
import { Readable } from "node:stream";

export const config = {
  runtime: 'nodejs',
};

const betterAuthHandler = toNodeHandler(auth);

/**
 * Wrap the Node request so toNodeHandler can read the body.
 * Vercel may pre-parse req.body, consuming the stream.
 */
function ensureReadableBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return req;
  if (req.body === undefined || req.body === null) return req;

  // If body is already parsed (object), re-serialize and re-attach as a stream
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const json = JSON.stringify(req.body);
    const readable = Readable.from([json]);

    // Copy all properties from original req to the readable stream
    Object.assign(readable, {
      method: req.method,
      url: req.url,
      headers: { ...req.headers, 'content-length': Buffer.byteLength(json).toString() },
      connection: req.connection,
      socket: req.socket,
    });

    return readable;
  }

  return req;
}

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
    const wrappedReq = ensureReadableBody(req);
    return await betterAuthHandler(wrappedReq, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal server error',
        _debug: error.message,
      });
    }
  }
}
