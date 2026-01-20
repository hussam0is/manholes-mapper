/**
 * API Route: /api/organizations
 * 
 * GET  - List all organizations
 * POST - Create a new organization (super admin only)
 * 
 * Requires admin role.
 */

import { verifyAuth, parseBody } from '../_lib/auth.js';
import { 
  ensureDb, 
  getUserByClerkId,
  getAllOrganizations,
  createOrganization
} from '../_lib/db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.log(`[API /api/organizations] ${req.method} request started`);

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

    if (req.method === 'GET') {
      const organizations = await getAllOrganizations();
      
      const transformed = organizations.map(o => ({
        id: o.id,
        name: o.name,
        userCount: parseInt(o.user_count) || 0,
        createdAt: o.created_at,
      }));

      console.log(`[API /api/organizations] Returning ${transformed.length} organizations`);
      return res.status(200).json({ organizations: transformed });
    }

    if (req.method === 'POST') {
      // Only super admin can create organizations
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Super admin access required' });
      }

      const body = await parseBody(request);
      const { name } = body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Organization name is required' });
      }

      const org = await createOrganization(name.trim());

      console.log(`[API /api/organizations] Created org ${org.id} by ${userId}`);
      return res.status(201).json({
        organization: {
          id: org.id,
          name: org.name,
          userCount: 0,
          createdAt: org.created_at,
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error(`[API /api/organizations] Error:`, error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
