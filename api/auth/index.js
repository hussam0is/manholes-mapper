/**
 * API Route: /api/auth/*
 *
 * Handler for Better Auth endpoints.
 * Uses Vercel rewrites to catch all /api/auth/* paths.
 * Handles: signIn, signUp, signOut, session, etc.
 */

import { auth } from "../../lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { sanitizeErrorMessage } from "../_lib/auth.js";
import { applyRateLimit, MAX_REQUESTS_AUTH } from "../_lib/rate-limit.js";

export const config = {
  runtime: 'nodejs',
};

/**
 * Get the request body, handling Vercel's Rust runtime quirks.
 * Vercel may pre-consume the body stream and expose it via a patched
 * req.body getter. Try multiple methods to read the body.
 */
async function getBody(req) {
  // Method 1: Try Vercel's req.body getter (may throw or return parsed object)
  try {
    const body = req.body;
    if (body !== undefined && body !== null) {
      // If already parsed as object, stringify it for the Web Request
      if (typeof body === 'object') {
        return JSON.stringify(body);
      }
      return String(body);
    }
  } catch {
    // Getter threw (e.g., "Invalid JSON") — try other methods
  }

  // Method 2: Read from stream (works in standard Node.js, may not on Vercel)
  return new Promise((resolve, reject) => {
    const chunks = [];
    let resolved = false;

    // Timeout after 3 seconds in case stream events never fire
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : '');
      }
    }, 3000);

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : '');
      }
    });
    req.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

/**
 * Convert Node.js IncomingMessage to a Web API Request.
 */
async function toWebRequest(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const url = `${protocol}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      } else {
        headers.append(key, value);
      }
    }
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let body = undefined;
  if (hasBody) {
    const rawBody = await getBody(req);
    if (rawBody && rawBody.length > 0) {
      body = rawBody;
    }
  }

  return new Request(url, {
    method: req.method,
    headers,
    body,
  });
}

/**
 * Write a Web API Response back to Node.js ServerResponse.
 */
async function writeWebResponse(webResponse, res) {
  res.statusCode = webResponse.status;

  for (const [key, value] of webResponse.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      const cookies = webResponse.headers.getSetCookie
        ? webResponse.headers.getSetCookie()
        : [value];
      res.setHeader('set-cookie', cookies);
    } else {
      res.setHeader(key, value);
    }
  }

  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

export default async function authHandler(req, res) {
  console.log('[Auth API] Request:', req.method, req.url);

  if (handleCors(req, res)) return;

  const isSignOut = req.url?.includes('/sign-out');

  if (!isSignOut && applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
    return;
  }

  try {
    const webRequest = await toWebRequest(req);
    console.log('[Auth API] Web Request URL:', webRequest.url, 'Method:', webRequest.method);
    const webResponse = await auth.handler(webRequest);
    console.log('[Auth API] Response status:', webResponse.status);
    await writeWebResponse(webResponse, res);
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
