/**
 * Shared CORS helper for Vercel API routes.
 *
 * Resolves the allowed origin from the request and sets appropriate headers.
 * Supports the Capacitor native app (https://localhost) and the web app.
 */

// Capacitor WebView origin
const CAPACITOR_ORIGIN = 'https://localhost';

// Preview/prod Vercel domain patterns (glob-style). Used when ALLOWED_ORIGINS
// is unset but we're in a deployed env — mirrors lib/auth.js trustedOrigins.
const VERCEL_PREVIEW_PATTERNS = [
  /^https:\/\/manholes-mapper-three\.vercel\.app$/,
  /^https:\/\/manholes-mapper-ten\.vercel\.app$/,
  /^https:\/\/manholes-mapper-[a-z0-9-]+-gis-6579s-projects\.vercel\.app$/,
  /^https:\/\/manholes-mapper-git-[a-z0-9/-]+-gis-6579s-projects\.vercel\.app$/,
  /^https:\/\/manholes-mapper-[a-z0-9-]+-dev-geopoint\.vercel\.app$/,
  /^https:\/\/manholes-mapper-git-[a-z0-9/-]+-dev-geopoint\.vercel\.app$/,
];

function isDeployedEnv() {
  return Boolean(
    process.env.VERCEL_ENV ||
    process.env.VERCEL_URL ||
    process.env.NODE_ENV === 'production'
  );
}

/**
 * Get the list of allowed origins from env + built-in Capacitor origin.
 * In deployed environments we NEVER return null (which would reflect any
 * origin with credentials). Instead we auto-derive from VERCEL_URL and the
 * known Vercel preview/prod domain patterns.
 * @returns {{origins: string[]|null, patterns: RegExp[]}}
 */
function getAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [];

  const deployed = isDeployedEnv();

  if (envOrigins.length === 0 && !deployed) {
    // Local dev only — allow any origin
    return { origins: null, patterns: [] };
  }

  const origins = [...envOrigins];

  if (deployed) {
    if (process.env.VERCEL_URL) {
      const url = `https://${process.env.VERCEL_URL}`;
      if (!origins.includes(url)) origins.push(url);
    }
    // Always trust the canonical production aliases in deployed envs
    for (const alias of ['https://manholes-mapper-three.vercel.app', 'https://manholes-mapper-ten.vercel.app']) {
      if (!origins.includes(alias)) origins.push(alias);
    }
  }

  // Always include Capacitor origin
  if (!origins.includes(CAPACITOR_ORIGIN)) {
    origins.push(CAPACITOR_ORIGIN);
  }

  return { origins, patterns: deployed ? VERCEL_PREVIEW_PATTERNS : [] };
}

/**
 * Resolve the Access-Control-Allow-Origin value for a request.
 * Never reflects an arbitrary origin in a deployed environment.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function resolveOrigin(req) {
  const { origins, patterns } = getAllowedOrigins();
  const requestOrigin = req.headers.origin;

  // Local dev fallback — no allowlist configured
  if (origins === null) {
    return requestOrigin || '*';
  }

  if (requestOrigin) {
    if (origins.includes(requestOrigin)) return requestOrigin;
    if (patterns.some(p => p.test(requestOrigin))) return requestOrigin;
  }

  // Fallback to first allowed origin (caller is not in allowlist)
  return origins[0];
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
