/**
 * Authentication helper for Vercel API routes
 * 
 * Verifies Clerk JWT tokens and extracts user information.
 * Supports both Web API Request and Node.js IncomingMessage formats.
 */

import { verifyToken } from '@clerk/backend';

/**
 * Get header value from request (handles both Web API and Node.js formats)
 * @param {Request|IncomingMessage} request
 * @param {string} name - Header name (case-insensitive)
 * @returns {string|null}
 */
function getHeader(request, name) {
  // Normalize header name to lowercase for consistent handling across runtimes
  const normalizedName = name.toLowerCase();
  
  // Web API Request (Edge Runtime) - Headers.get() is case-insensitive
  if (typeof request.headers?.get === 'function') {
    return request.headers.get(normalizedName);
  }
  
  // Node.js IncomingMessage - headers are always normalized to lowercase
  if (request.headers) {
    return request.headers[normalizedName] || null;
  }
  
  return null;
}

/**
 * Parse JSON body from request (handles both Web API and Node.js formats)
 * @param {Request|IncomingMessage} request
 * @returns {Promise<any>}
 */
export async function parseBody(request) {
  // Web API Request
  if (typeof request.json === 'function') {
    return request.json();
  }
  // Node.js IncomingMessage - body is already parsed by Vercel
  if (request.body !== undefined) {
    return request.body;
  }
  // Fallback: read stream
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', chunk => { data += chunk; });
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
    
    // Use only secretKey for verification (automatically fetches JWKS from Clerk)
    // Note: Do NOT use CLERK_JWT_KEY unless you have the actual PEM public key
    if (!process.env.CLERK_SECRET_KEY) {
      console.error('CLERK_SECRET_KEY is not set');
      return { userId: null, error: 'Server configuration error' };
    }
    
    // Verify the token with Clerk using secretKey only
    const { sub: userId } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    
    if (!userId) {
      return { userId: null, error: 'Invalid token' };
    }

    return { userId, error: null };
  } catch (error) {
    console.error('Auth verification failed:', error);
    return { userId: null, error: 'Authentication failed' };
  }
}

/**
 * Create an unauthorized response
 * @param {string} message - Error message
 * @returns {Response}
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create a JSON response
 * @param {any} data - Response data
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Create an error response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
export function errorResponse(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
