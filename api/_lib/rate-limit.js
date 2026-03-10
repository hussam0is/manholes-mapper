/**
 * Rate limiting middleware for API routes
 *
 * Two layers of rate limiting:
 *
 * 1. In-memory sliding window (best-effort on serverless):
 *    Each Vercel serverless instance has its own memory, so the in-memory
 *    `requestStore` only limits requests that happen to hit the same warm
 *    instance. An attacker sending rapid requests may bypass this entirely
 *    if requests are spread across cold-started instances. This layer is
 *    kept as a fast, zero-latency first line of defense for warm instances.
 *
 * 2. Database-backed rate limiting (for auth routes):
 *    Uses a `rate_limit_log` Postgres table to track requests across all
 *    serverless instances. Applied to abuse-sensitive auth endpoints where
 *    the extra DB round-trip is acceptable. This provides reliable cross-
 *    instance rate limiting.
 */

// Rate limit configuration
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_DEFAULT = 100; // Default: 100 requests per minute per IP
const MAX_REQUESTS_AUTH = 20; // Stricter limit for auth-related endpoints

// In-memory store for request counts
// Map<IP, Array<timestamp>>
const requestStore = new Map();

// Cleanup old entries periodically to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
let lastCleanup = Date.now();

/**
 * Clean up expired entries from the store
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  lastCleanup = now;
  const windowStart = now - WINDOW_MS;
  
  for (const [ip, timestamps] of requestStore.entries()) {
    const valid = timestamps.filter(t => t > windowStart);
    if (valid.length === 0) {
      requestStore.delete(ip);
    } else {
      requestStore.set(ip, valid);
    }
  }
}

/**
 * Extract client IP from request headers
 * @param {Object} req - Request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  // Vercel provides the real client IP in x-forwarded-for
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs; the first is the client
    return forwarded.split(',')[0].trim();
  }
  
  // Fallback headers
  return req.headers['x-real-ip'] || 
         req.headers['cf-connecting-ip'] ||  // Cloudflare
         req.connection?.remoteAddress || 
         'unknown';
}

/**
 * Check rate limit for a request
 * @param {Object} req - Request object
 * @param {number} maxRequests - Maximum requests allowed in the window
 * @returns {{ allowed: boolean, remaining: number, limit: number, retryAfter?: number }}
 */
export function checkRateLimit(req, maxRequests = MAX_REQUESTS_DEFAULT) {
  cleanupExpiredEntries();
  
  const ip = getClientIP(req);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  
  // Get existing requests for this IP
  const requests = requestStore.get(ip) || [];
  
  // Filter to only requests within the window
  const recentRequests = requests.filter(t => t > windowStart);
  
  const requestCount = recentRequests.length + 1;
  const remaining = Math.max(0, maxRequests - requestCount);
  
  if (requestCount > maxRequests) {
    // Add current request to the list for calculation but DO NOT save to store
    // This prevents blocked requests from "pushing" the window further
    const allRequests = [...recentRequests, now];
    
    // Calculate when the oldest request in the window will expire
    const oldestRequest = allRequests[0];
    const retryAfter = Math.ceil((oldestRequest + WINDOW_MS - now) / 1000);
    
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
      limit: maxRequests,
    };
  }
  
  // Within limit, add current request and save to store
  recentRequests.push(now);
  requestStore.set(ip, recentRequests);
  
  return {
    allowed: true,
    remaining,
    limit: maxRequests,
  };
}

/**
 * Apply rate limit check and return 429 if exceeded
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {number} maxRequests - Maximum requests allowed
 * @returns {boolean} True if rate limited (response already sent), false if allowed
 */
export function applyRateLimit(req, res, maxRequests = MAX_REQUESTS_DEFAULT) {
  const result = checkRateLimit(req, maxRequests);
  
  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  
  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter);
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: result.retryAfter,
    });
    return true; // Rate limited
  }
  
  return false; // Allowed
}

/**
 * Database-backed rate limit check for cross-instance enforcement.
 *
 * Logs the current request, prunes stale entries, and counts recent
 * requests from the same IP + endpoint within the sliding window.
 *
 * @param {string} ip - Client IP address
 * @param {string} endpoint - Logical endpoint identifier (e.g. '/api/auth')
 * @param {number} maxRequests - Maximum requests allowed in the window
 * @param {number} windowSeconds - Sliding window duration in seconds
 * @returns {Promise<{ allowed: boolean, remaining: number }>}
 */
export async function checkDbRateLimit(ip, endpoint, maxRequests = 20, windowSeconds = 60) {
  // Lazy-import to avoid circular dependency (db.js may import from here in the future)
  const { sql } = await import('./db.js');

  // Single transaction: insert current request, prune old entries, count recent.
  // Using a CTE keeps this to one round-trip.
  // We multiply windowSeconds by '1 second'::interval for parameterized interval math.
  const result = await sql`
    WITH insert_entry AS (
      INSERT INTO rate_limit_log (ip, endpoint)
      VALUES (${ip}, ${endpoint})
    ),
    cleanup AS (
      DELETE FROM rate_limit_log
      WHERE created_at < NOW() - (${windowSeconds} * INTERVAL '1 second')
    )
    SELECT COUNT(*)::int AS request_count
    FROM rate_limit_log
    WHERE ip = ${ip}
      AND endpoint = ${endpoint}
      AND created_at >= NOW() - (${windowSeconds} * INTERVAL '1 second')
  `;

  // The CTE INSERT is invisible to the SELECT (same snapshot), so request_count
  // reflects previous requests only. The current request is request_count + 1.
  const previousCount = result.rows[0]?.request_count ?? 0;
  const totalCount = previousCount + 1;
  const remaining = Math.max(0, maxRequests - totalCount);

  return {
    allowed: totalCount <= maxRequests,
    remaining,
  };
}

/**
 * Extract client IP from request headers (re-exported for use by callers of checkDbRateLimit)
 */
export { getClientIP };

// Export constants for use in routes
export { MAX_REQUESTS_DEFAULT, MAX_REQUESTS_AUTH };
