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
 * Parse JSON body from request (handles both Web API and Node.js formats)
 * @param {Request|IncomingMessage} request
 * @returns {Promise<any>}
 */
export async function parseBody(request) {
  if (typeof request.json === 'function') {
    return request.json();
  }
  if (request.body !== undefined) {
    return request.body;
  }
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
    
    if (!process.env.CLERK_SECRET_KEY) {
      console.error('CLERK_SECRET_KEY is not set');
      return { userId: null, error: 'Server configuration error' };
    }
    
    // Verify the token with Clerk
    const { sub: userId } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    
    if (!userId) {
      return { userId: null, error: 'Invalid token' };
    }

    return { userId, error: null };
  } catch (error) {
    console.error('Auth verification failed:', error.message);
    return { userId: null, error: 'Authentication failed' };
  }
}
