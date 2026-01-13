/**
 * Authentication helper for Vercel API routes
 * 
 * Verifies Clerk JWT tokens and extracts user information.
 */

import { createClerkClient } from '@clerk/clerk-sdk-node';

// Initialize Clerk client with secret key
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

/**
 * Verify the request and extract user ID from Clerk session
 * @param {Request} request - Incoming request
 * @returns {Promise<{userId: string|null, error: string|null}>}
 */
export async function verifyAuth(request) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { userId: null, error: 'Missing or invalid authorization header' };
    }

    const token = authHeader.substring(7);
    
    // Verify the token with Clerk
    const { sub: userId } = await clerk.verifyToken(token);
    
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
