/**
 * Authentication helper for Vercel API routes
 * 
 * Verifies Better Auth sessions and extracts user information.
 * Supports both Web API Request and Node.js IncomingMessage formats.
 */

import { auth } from '../../lib/auth.js';

/**
 * Sanitize error message for API response
 * In production, we don't expose internal error messages to prevent information leakage.
 * @param {Error|string} error - The error to sanitize
 * @param {string} defaultMessage - Default message to use in production
 * @returns {string} Sanitized error message
 */
export function sanitizeErrorMessage(error, defaultMessage = 'Internal server error') {
  const isDev = process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
  
  if (isDev) {
    // In development, return the actual error message for debugging
    return error?.message || String(error) || defaultMessage;
  }
  
  // In production, return generic message to avoid leaking internal details
  return defaultMessage;
}

/**
 * Get header value from request (handles both Web API and Node.js formats)
 * @param {Request|IncomingMessage} request
 * @param {string} name - Header name (case-insensitive)
 * @returns {string|null}
 */
function getHeader(request, name) {
  const normalizedName = name.toLowerCase();
  
  if (typeof request.headers?.get === 'function') {
    return request.headers.get(normalizedName);
  }
  
  if (request.headers) {
    return request.headers[normalizedName] || null;
  }
  
  return null;
}

/**
 * Get cookie value from request
 * @param {Request|IncomingMessage} request
 * @param {string} name - Cookie name
 * @returns {string|null}
 */
function getCookie(request, name) {
  const cookieHeader = getHeader(request, 'cookie');
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  
  return cookies[name] || null;
}

// Maximum request body size (5MB)
const MAX_BODY_SIZE = 5 * 1024 * 1024;

/**
 * Parse JSON body from request (handles both Web API and Node.js formats)
 * Includes protection against oversized payloads.
 * @param {Request|IncomingMessage} request
 * @param {number} maxSize - Maximum allowed body size in bytes
 * @returns {Promise<any>}
 * @throws {Error} If body exceeds maximum size
 */
export async function parseBody(request, maxSize = MAX_BODY_SIZE) {
  // Check Content-Length header if available
  const contentLength = parseInt(request.headers?.['content-length'] || '0', 10);
  if (contentLength > maxSize) {
    const error = new Error(`Request body too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`);
    error.status = 413;
    throw error;
  }

  if (typeof request.json === 'function') {
    // For Web API Request, we can't easily limit size, but Content-Length check helps
    return request.json();
  }
  if (request.body !== undefined) {
    return request.body;
  }
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    
    request.on('data', chunk => {
      size += chunk.length;
      
      // SECURITY: Check body size limit during streaming
      if (size > maxSize) {
        request.destroy();
        const error = new Error(`Request body too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`);
        error.status = 413;
        reject(error);
        return;
      }
      
      data += chunk;
    });
    
    request.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    
    request.on('error', reject);
  });
}

/**
 * Convert Node.js request headers to Web API Headers format
 * @param {Object} nodeHeaders - Node.js headers object
 * @returns {Headers}
 */
function convertHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      } else {
        headers.append(key, value);
      }
    }
  }
  return headers;
}

/**
 * Verify the request and extract user ID from Better Auth session
 * @param {Request|IncomingMessage} request - Incoming request
 * @returns {Promise<{userId: string|null, error: string|null, user: Object|null}>}
 */
export async function verifyAuth(request) {
  try {
    // Convert headers to Web API format if needed
    let headers;
    if (request.headers instanceof Headers) {
      headers = request.headers;
    } else if (request.headers) {
      headers = convertHeaders(request.headers);
    } else {
      headers = new Headers();
    }
    
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers,
    });
    
    if (!session || !session.user) {
      return { userId: null, error: 'Not authenticated', user: null };
    }

    return { 
      userId: session.user.id, 
      error: null,
      user: session.user,
    };
  } catch (error) {
    console.error('Auth verification failed:', error.message);
    return { userId: null, error: 'Authentication failed', user: null };
  }
}
