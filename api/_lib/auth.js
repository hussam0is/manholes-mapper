/**
 * Authentication helper for Vercel API routes
 * 
 * Verifies Clerk JWT tokens and extracts user information.
 * Supports both Web API Request and Node.js IncomingMessage formats.
 */

import { verifyToken } from '@clerk/backend';

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
 * Verify the request and extract user ID from Clerk session
 * @param {Request|IncomingMessage} request - Incoming request
 * @returns {Promise<{userId: string|null, error: string|null}>}
 */
export async function verifyAuth(request) {
  try {
    const authHeader = getHeader(request, 'authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { userId: null, error: 'Missing or invalid authorization header' };
    }

    const token = authHeader.substring(7);
    
    if (!process.env.CLERK_SECRET_KEY) {
      console.error('CLERK_SECRET_KEY is not set');
      return { userId: null, error: 'Server configuration error' };
    }
    
    // Build verification options
    const verifyOptions = {
      secretKey: process.env.CLERK_SECRET_KEY,
    };
    
    // SECURITY: Add authorized parties if configured
    // This validates the 'azp' (authorized party) claim in the JWT
    if (process.env.CLERK_AUTHORIZED_PARTIES) {
      verifyOptions.authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES.split(',').map(s => s.trim());
    }
    
    // Verify the token with Clerk
    const { sub: userId } = await verifyToken(token, verifyOptions);
    
    if (!userId) {
      return { userId: null, error: 'Invalid token' };
    }

    return { userId, error: null };
  } catch (error) {
    console.error('Auth verification failed:', error.message);
    return { userId: null, error: 'Authentication failed' };
  }
}
