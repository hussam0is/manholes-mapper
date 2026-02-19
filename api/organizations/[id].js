/**
 * API Route: /api/organizations/:id
 * 
 * GET    - Get a specific organization
 * PUT    - Update organization (super admin only)
 * DELETE - Delete organization (super admin only)
 * 
 * Requires admin role.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { 
  ensureDb, 
  getUserById,
  getOrganizationById,
  updateOrganization,
  deleteOrganization
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { validateUUID } from '../_lib/validators.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  const { id: orgId } = req.query;
  console.debug(`[API /api/organizations/${orgId}] ${req.method} request started`);

  // Apply rate limiting
  if (applyRateLimit(req, res)) {
    return; // Rate limited, response already sent
  }

  // Validate UUID format
  if (!validateUUID(orgId)) {
    return res.status(400).json({ error: 'Invalid organization ID format' });
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
    const currentUser = await getUserById(userId);
    if (!currentUser) {
      return res.status(403).json({ error: 'User not found' });
    }

    const isSuperAdmin = currentUser.role === 'super_admin';
    const isAdmin = currentUser.role === 'admin' || isSuperAdmin;

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get organization
    const org = await getOrganizationById(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        organization: {
          id: org.id,
          name: org.name,
          createdAt: org.created_at,
        }
      });
    }

    if (req.method === 'PUT') {
      // Only super admin can update organizations
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Super admin access required' });
      }

      const body = await parseBody(request);
      const { name } = body;

      if (name !== undefined && !name.trim()) {
        return res.status(400).json({ error: 'Organization name cannot be empty' });
      }

      const updates = {};
      if (name) updates.name = name.trim();

      const updatedOrg = await updateOrganization(orgId, updates);

      console.debug(`[API /api/organizations/${orgId}] Updated by ${userId}`);
      return res.status(200).json({
        organization: {
          id: updatedOrg.id,
          name: updatedOrg.name,
          createdAt: updatedOrg.created_at,
        }
      });
    }

    if (req.method === 'DELETE') {
      // Only super admin can delete organizations
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Super admin access required' });
      }

      await deleteOrganization(orgId);

      console.debug(`[API /api/organizations/${orgId}] Deleted by ${userId}`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error(`[API /api/organizations/${orgId}] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
