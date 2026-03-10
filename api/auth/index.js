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
 * Convert Node.js IncomingMessage to a Web API Request.
 * Avoids Vercel's patched req.body getter which can throw "Invalid JSON"
 * by reading the raw stream directly.
 */
function toWebRequest(req) {
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

  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? readStream(req) : undefined,
    duplex: hasBody ? 'half' : undefined,
  });
}

/**
 * Read a Node.js readable stream into a ReadableStream.
 */
function readStream(nodeStream) {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      });
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
  });
}

/**
 * Write a Web API Response back to Node.js ServerResponse.
 */
async function writeWebResponse(webResponse, res) {
  res.statusCode = webResponse.status;
  res.statusMessage = webResponse.statusText;

  for (const [key, value] of webResponse.headers.entries()) {
    // Handle multiple Set-Cookie headers
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
  console.debug('[Auth API] Request:', req.method, req.url);

  if (handleCors(req, res)) return;

  // Sign-out is exempt from rate limiting — users must always be able to terminate their session
  const isSignOut = req.url?.includes('/sign-out');

  // All other auth endpoints get stricter rate limiting (20 req/min) to prevent brute-force
  if (!isSignOut && applyRateLimit(req, res, MAX_REQUESTS_AUTH)) {
    return;
  }

  try {
    // Convert to Web Request to bypass Vercel's patched body getter
    const webRequest = toWebRequest(req);
    const webResponse = await auth.handler(webRequest);
    await writeWebResponse(webResponse, res);
  } catch (error) {
    console.error('[Auth API] Error:', error.message || error);
    return res.status(500).json({
      error: sanitizeErrorMessage(error),
    });
  }
}
