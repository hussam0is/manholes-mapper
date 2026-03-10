/**
 * Shared CORS helper for Vercel API routes.
 *
 * Resolves the allowed origin from the request and sets appropriate headers.
 * Supports the Capacitor native app (https://localhost) and the web app.
 */

// Capacitor WebView origin
const CAPACITOR_ORIGIN = 'https://localhost';

/**
 * Get the list of allowed origins from env + built-in Capacitor origin.
 * @returns {string[]|null} Array of origins, or null to allow any.
 */
function getAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null;

  if (!envOrigins) return null; // dev mode — allow any

  // Always include Capacitor origin
  if (!envOrigins.includes(CAPACITOR_ORIGIN)) {
    envOrigins.push(CAPACITOR_ORIGIN);
  }
  return envOrigins;
}

/**
 * Resolve the Access-Control-Allow-Origin value for a request.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function resolveOrigin(req) {
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.headers.origin;

  if (!allowedOrigins) {
    // Dev mode: reflect request origin (or * if no origin header)
    return requestOrigin || '*';
  }

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Fallback to first allowed origin
  return allowedOrigins[0];
}

/**
 * Handle CORS for a Vercel API route.
 * Call at the top of every handler. Returns true if the request was a
 * preflight OPTIONS request (already responded — caller should return).
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if preflight was handled (caller should return)
 */
export function handleCors(req, res) {
  const origin = resolveOrigin(req);

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, x-csrf-token');
    res.status(204).end();
    return true;
  }

  return false;
}
