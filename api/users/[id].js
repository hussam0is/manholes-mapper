/**
 * API Route: /api/users/:id
 * 
 * GET - Get a specific user
 * PUT - Update user role/organization
 * 
 * Requires admin role.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { 
  ensureDb, 
  getUserByClerkId,
  updateUser
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { VALID_ROLES } from '../_lib/validators.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  const { id: targetUserId } = req.query;
  console.log(`[API /api/users/${targetUserId}] ${req.method} request started`);

  // Apply rate limiting
  if (applyRateLimit(req, res)) {
    return; // Rate limited, response already sent
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

    // Get target user
    const targetUser = await getUserByClerkId(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Org admins can only manage users in their organization
    if (!isSuperAdmin) {
      if (targetUser.organization_id !== currentUser.organization_id) {
        return res.status(403).json({ error: 'Cannot manage users outside your organization' });
      }
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        user: {
          clerkId: targetUser.clerk_id,
          username: targetUser.clerk_username,
          email: targetUser.email,
          role: targetUser.role,
          organizationId: targetUser.organization_id,
          createdAt: targetUser.created_at,
          updatedAt: targetUser.updated_at,
        }
      });
    }

    if (req.method === 'PUT') {
      const body = await parseBody(request);
      const { role, organizationId } = body;

      // Validation: Ensure role is a valid value
      if (role !== undefined && !VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      }

      // Validation: Only super admin can change roles to/from super_admin or admin
      if (role) {
        if (!isSuperAdmin && (role === 'super_admin' || role === 'admin')) {
          return res.status(403).json({ error: 'Only super admin can assign admin roles' });
        }
        if (!isSuperAdmin && targetUser.role === 'super_admin') {
          return res.status(403).json({ error: 'Cannot modify super admin' });
        }
        // Prevent demoting self from super_admin
        if (userId === targetUserId && currentUser.role === 'super_admin' && role !== 'super_admin') {
          return res.status(400).json({ error: 'Cannot demote yourself from super admin' });
        }
      }

      // Org admins cannot change organization assignment
      if (!isSuperAdmin && organizationId !== undefined) {
        return res.status(403).json({ error: 'Only super admin can change organization assignment' });
      }

      const updates = {};
      if (role !== undefined) updates.role = role;
      if (organizationId !== undefined) updates.organizationId = organizationId;

      const updatedUser = await updateUser(targetUserId, updates);

      console.log(`[API /api/users/${targetUserId}] Updated by ${userId}`);
      return res.status(200).json({
        user: {
          clerkId: updatedUser.clerk_id,
          username: updatedUser.clerk_username,
          email: updatedUser.email,
          role: updatedUser.role,
          organizationId: updatedUser.organization_id,
          createdAt: updatedUser.created_at,
          updatedAt: updatedUser.updated_at,
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error(`[API /api/users/${targetUserId}] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
