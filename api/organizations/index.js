/**
 * API Route: /api/organizations
 *
 * GET  - List all organizations
 * POST - Create a new organization (super admin only)
 *
 * When called with ?id=<orgId> (via rewrite from /api/organizations/:id):
 * GET    - Get a specific organization
 * PUT    - Update organization (super admin only)
 * DELETE - Delete organization (super admin only)
 *
 * Requires admin role.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyCsrf } from '../_lib/csrf.js';
import { verifyAuth, parseBody } from '../_lib/auth.js';
import {
  ensureDb,
  getUserById,
  getAllOrganizations,
  createOrganization,
  getOrganizationById,
  updateOrganization,
  deleteOrganization
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { validateUUID, validateOrganizationInput } from '../_lib/validators.js';
import { handleApiError } from '../_lib/error-handler.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (verifyCsrf(req, res)) return;

  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.debug(`[API /api/organizations] ${req.method} request started`);

  // Apply rate limiting
  if (applyRateLimit(req, res)) {
    return; // Rate limited, response already sent
  }

  // Route to single-resource handler if ID is provided (via rewrite from /api/organizations/:id)
  const resourceId = req.query?.id;
  if (resourceId) {
    return handleSingleOrganization(req, res, request, resourceId);
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

    if (req.method === 'GET') {
      const organizations = await getAllOrganizations();

      const transformed = organizations.map(o => ({
        id: o.id,
        name: o.name,
        userCount: parseInt(o.user_count) || 0,
        createdAt: o.created_at,
      }));

      console.debug(`[API /api/organizations] Returning ${transformed.length} organizations`);
      return res.status(200).json({ organizations: transformed });
    }

    if (req.method === 'POST') {
      // Only super admin can create organizations
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Super admin access required' });
      }

      const body = await parseBody(request);

      // Validate organization input (name required, length check)
      const validationErrors = validateOrganizationInput(body);
      if (validationErrors) {
        return res.status(400).json({ error: 'Validation failed', details: validationErrors });
      }

      const org = await createOrganization(body.name.trim());

      console.debug(`[API /api/organizations] Created org ${org.id} by ${userId}`);
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
    return handleApiError(error, res, '[API /api/organizations]');
  }
}

/**
 * Handle single organization operations: GET/PUT/DELETE /api/organizations/:id
 * (Merged from api/organizations/[id].js)
 */
async function handleSingleOrganization(req, res, request, orgId) {
  console.debug(`[API /api/organizations/${orgId}] ${req.method} request started`);

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

      // If name is provided, validate it (length, not empty)
      if (body.name !== undefined) {
        const validationErrors = validateOrganizationInput(body);
        if (validationErrors) {
          return res.status(400).json({ error: 'Validation failed', details: validationErrors });
        }
      }

      const updates = {};
      if (body.name) updates.name = body.name.trim();

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
    return handleApiError(error, res, `[API /api/organizations/${orgId}]`);
  }
}
