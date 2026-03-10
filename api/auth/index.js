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
 * Read the full request body from a Node.js IncomingMessage as a Buffer.
 * On Vercel's Rust runtime, the body stream may behave differently,
 * so we buffer everything first.
 */
function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Convert Node.js IncomingMessage to a Web API Request.
 * Reads the body into a buffer first to avoid Vercel's patched body getter
 * which throws "Invalid JSON".
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
    body = await collectBody(req);
    // Only include non-empty bodies
    if (body.length === 0) body = undefined;
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
      // Handle multiple Set-Cookie headers
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
  console.debug('[Auth API] Request:', req.method, req.url);

  if (handleCors(req, res)) return;

  const isSignOut = req.url?.includes('/sign-out');

  if (!isSignOut && applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
    return;
  }

  try {
    const webRequest = await toWebRequest(req);
    const webResponse = await auth.handler(webRequest);
    await writeWebResponse(webResponse, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: sanitizeErrorMessage(error),
      });
    }
  }
}
