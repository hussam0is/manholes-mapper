/**
 * API Route: /api/users
 * 
 * GET - List users (super admin: all, admin: org only)
 * 
 * Requires admin role.
 */

import { verifyAuth, sanitizeErrorMessage } from '../_lib/auth.js';
import { 
  ensureDb, 
  getUserByClerkId,
  getAllUsers,
  getUsersByOrganization
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.log(`[API /api/users] ${req.method} request started`);

  // Apply rate limiting
  if (applyRateLimit(req, res)) {
    return; // Rate limited, response already sent
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize database
    await ensureDb();

    // Verify authentication
    const { userId, error: authError } = await verifyAuth(request);
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    // Check if user is admin
    const currentUser = await getUserByClerkId(userId);
    if (!currentUser) {
      return res.status(403).json({ error: 'User not found' });
    }

    const isSuperAdmin = currentUser.role === 'super_admin';
    const isAdmin = currentUser.role === 'admin' || isSuperAdmin;

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get users based on role
    let users;
    if (isSuperAdmin) {
      // Super admin sees all users
      users = await getAllUsers();
    } else {
      // Org admin sees only users in their organization
      if (!currentUser.organization_id) {
        return res.status(200).json({ users: [] });
      }
      users = await getUsersByOrganization(currentUser.organization_id);
    }

    // Transform response
    const transformed = users.map(u => ({
      clerkId: u.clerk_id,
      username: u.clerk_username,
      email: u.email,
      role: u.role,
      organizationId: u.organization_id,
      organizationName: u.organization_name,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    }));

    console.log(`[API /api/users] Returning ${transformed.length} users`);
    return res.status(200).json({ users: transformed });

  } catch (error) {
    console.error(`[API /api/users] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
