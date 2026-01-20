/**
 * Rate limiting middleware for API routes
 * 
 * Implements a simple in-memory rate limiter using a sliding window.
 * Note: In serverless environments like Vercel, each function instance has its own memory,
 * so this provides per-instance rate limiting. For strict rate limiting across all instances,
 * consider using Vercel's Edge Config or an external store like Redis.
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
 * @returns {{ allowed: boolean, remaining: number, retryAfter?: number }}
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
  
  // Add current request
  recentRequests.push(now);
  requestStore.set(ip, recentRequests);
  
  const requestCount = recentRequests.length;
  const remaining = Math.max(0, maxRequests - requestCount);
  
  if (requestCount > maxRequests) {
    // Calculate when the oldest request in the window will expire
    const oldestRequest = recentRequests[0];
    const retryAfter = Math.ceil((oldestRequest + WINDOW_MS - now) / 1000);
    
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
      limit: maxRequests,
    };
  }
  
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

// Export constants for use in routes
export { MAX_REQUESTS_DEFAULT, MAX_REQUESTS_AUTH };
