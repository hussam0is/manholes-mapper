/**
 * Rate limiting middleware for API routes
 *
 * In-memory sliding window rate limiting (best-effort on serverless):
 * Each Vercel serverless instance has its own memory, so the in-memory
 * requestStore only limits requests that happen to hit the same warm
 * instance. An attacker sending rapid requests may bypass this entirely
 * if requests are spread across cold-started instances. This layer is
 * kept as a fast, zero-latency first line of defense for warm instances.
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
 * Database-backed rate limit check (cross-instance, reliable).
 * Uses the rate_limits table to track request counts across all serverless instances.
 * @param {string} ip - Client IP address
 * @param {string} endpoint - API endpoint being rate limited
 * @param {number} maxRequests - Maximum requests allowed in the window
 * @param {number} windowSeconds - Time window in seconds
 * @returns {Promise<{ allowed: boolean, remaining: number }>}
 */
export async function checkDbRateLimit(ip, endpoint, maxRequests = MAX_REQUESTS_DEFAULT, windowSeconds = 60) {
  try {
    const { sql } = await import('@vercel/postgres');
    
    // Create rate_limits table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id SERIAL PRIMARY KEY,
        ip TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    
    // Count recent requests within the window
    const result = await sql`
      SELECT COUNT(*) as count FROM rate_limits
      WHERE ip = ${ip} AND endpoint = ${endpoint}
      AND created_at > NOW() - INTERVAL '1 second' * ${windowSeconds}
    `;
    
    const count = parseInt(result.rows[0]?.count || '0', 10);
    
    if (count >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }
    
    // Record this request
    await sql`INSERT INTO rate_limits (ip, endpoint) VALUES (${ip}, ${endpoint})`;
    
    // Periodically clean old entries (1% chance per request)
    if (Math.random() < 0.01) {
      sql`DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '5 minutes'`.catch(() => {});
    }
    
    return { allowed: true, remaining: maxRequests - count - 1 };
  } catch (err) {
    // If DB is unavailable, allow the request (fail open)
    console.warn('[RateLimit] DB check failed:', err.message);
    return { allowed: true, remaining: maxRequests };
  }
}

// Export constants and helpers for use in routes
export { MAX_REQUESTS_DEFAULT, MAX_REQUESTS_AUTH, getClientIP };
