/**
 * CSRF Protection — Double-Submit Cookie Pattern
 *
 * Mutating requests (POST, PUT, DELETE) must include an `x-csrf-token` header
 * whose value matches the `csrf_token` cookie.  If no cookie exists yet the
 * first call generates one, sets it, and rejects the request (the client will
 * read the cookie and retry with the header on the next call).
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed through.
 *
 * The cookie is intentionally NOT httpOnly so that client-side JS can read it
 * and attach the value as a request header.
 */

import { randomUUID } from 'node:crypto';

/**
 * Get a cookie value from the request.
 * @param {import('http').IncomingMessage} req
 * @param {string} name
 * @returns {string|null}
 */
function getCookie(req, name) {
  const cookieHeader =
    typeof req.headers?.get === 'function'
      ? req.headers.get('cookie')
      : req.headers?.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/**
 * Get a header value from the request (works with both Node IncomingMessage
 * and Web API Request objects).
 * @param {import('http').IncomingMessage|Request} req
 * @param {string} name
 * @returns {string|null}
 */
function getHeader(req, name) {
  const lower = name.toLowerCase();
  if (typeof req.headers?.get === 'function') return req.headers.get(lower);
  return req.headers?.[lower] || null;
}

/**
 * Verify CSRF token for mutating requests.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} `true` if the request should be blocked (response already
 *   sent).  `false` if the request is safe to proceed.
 */
export function verifyCsrf(req, res) {
  const method = (req.method || 'GET').toUpperCase();

  // Safe methods — skip check
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return false;
  }

  const cookieToken = getCookie(req, 'csrf_token');
  const headerToken = getHeader(req, 'x-csrf-token');

  // If there is no CSRF cookie yet, generate one and set it so the client can
  // read it for subsequent requests.  Reject this request since there is no
  // way the header could match a cookie that didn't exist.
  if (!cookieToken) {
    const newToken = randomUUID();
    res.setHeader('Set-Cookie', buildCsrfCookie(newToken));
    res.status(403).json({ error: 'CSRF token missing. Retry the request.' });
    return true;
  }

  // Validate: header must match cookie
  if (!headerToken || headerToken !== cookieToken) {
    res.status(403).json({ error: 'CSRF token mismatch' });
    return true;
  }

  return false;
}

/**
 * Build the Set-Cookie string for the CSRF token.
 * @param {string} token
 * @returns {string}
 */
function buildCsrfCookie(token) {
  return `csrf_token=${token}; Path=/; Secure; SameSite=None; Max-Age=604800`;
}
