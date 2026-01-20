/**
 * API Route: /api/user-role
 * 
 * GET - Get current user's role, permissions, and features
 *       Auto-creates user record on first access
 * 
 * Returns user info with effective features based on user and org settings.
 */

import { verifyToken } from '@clerk/backend';
import { 
  ensureDb, 
  getOrCreateUser, 
  getUserByClerkId,
  getEffectiveFeatures,
  DEFAULT_FEATURES 
} from '../_lib/db.js';

export const config = { runtime: 'nodejs' };

/**
 * Get header value from request
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

export default async function handler(req, res) {
  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.log(`[API /api/user-role] ${req.method} request started`);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize database
    await ensureDb();

    // Verify authentication
    const authHeader = getHeader(request, 'authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    
    if (!process.env.CLERK_SECRET_KEY) {
      console.error('CLERK_SECRET_KEY is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Verify token and get full session data
    const verifiedToken = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const userId = verifiedToken.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Extract user info from token claims
    // Clerk stores username in the token claims
    const username = verifiedToken.username || verifiedToken.user_username || null;
    const email = verifiedToken.email || verifiedToken.user_email || null;

    // Get or create user record
    const user = await getOrCreateUser(userId, { username, email });

    // Get effective features (combining org and user settings)
    const features = await getEffectiveFeatures(userId, user.organization_id);

    // Build response
    const response = {
      clerkId: user.clerk_id,
      username: user.clerk_username,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      isSuperAdmin: user.role === 'super_admin',
      isAdmin: user.role === 'admin' || user.role === 'super_admin',
      features,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };

    console.log(`[API /api/user-role] User ${userId} role: ${user.role}`);
    return res.status(200).json(response);

  } catch (error) {
    console.error(`[API /api/user-role] Error:`, error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
