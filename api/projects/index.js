/**
 * API Route: /api/projects
 * 
 * GET  - List all projects for user's organization
 * POST - Create a new project (org admin/super admin only)
 * 
 * Requires authenticated user with organization membership.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { 
  ensureDb, 
  getUserByClerkId,
  getProjectsByOrganization,
  createProject,
  getProjectById
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.log(`[API /api/projects] ${req.method} request started`);

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

    // Get current user
    const currentUser = await getUserByClerkId(userId);
    if (!currentUser) {
      return res.status(403).json({ error: 'User not found' });
    }

    const isSuperAdmin = currentUser.role === 'super_admin';
    const isAdmin = currentUser.role === 'admin' || isSuperAdmin;

    // User must belong to an organization to see projects
    if (!currentUser.organization_id && !isSuperAdmin) {
      return res.status(403).json({ error: 'User must belong to an organization' });
    }

    if (req.method === 'GET') {
      // Get organization ID from query param (for super admin) or from user
      const orgId = req.query.organizationId || currentUser.organization_id;
      
      if (!orgId) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      // Non-super admins can only see their own organization's projects
      if (!isSuperAdmin && orgId !== currentUser.organization_id) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      const projects = await getProjectsByOrganization(orgId);
      
      const transformed = projects.map(p => ({
        id: p.id,
        organizationId: p.organization_id,
        name: p.name,
        description: p.description,
        inputFlowConfig: p.input_flow_config || {},
        sketchCount: parseInt(p.sketch_count) || 0,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));

      console.log(`[API /api/projects] Returning ${transformed.length} projects for org ${orgId}`);
      return res.status(200).json({ projects: transformed });
    }

    if (req.method === 'POST') {
      // Only org admin or super admin can create projects
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required to create projects' });
      }

      const body = await parseBody(request);
      const { name, description, inputFlowConfig, organizationId } = body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Project name is required' });
      }

      // Determine which organization to create the project in
      let targetOrgId = organizationId || currentUser.organization_id;
      
      // Only super admin can create projects in other organizations
      if (organizationId && organizationId !== currentUser.organization_id && !isSuperAdmin) {
        return res.status(403).json({ error: 'Cannot create project in another organization' });
      }

      if (!targetOrgId) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      const project = await createProject(targetOrgId, {
        name: name.trim(),
        description: description?.trim() || null,
        inputFlowConfig: inputFlowConfig || {},
      });

      console.log(`[API /api/projects] Created project ${project.id} in org ${targetOrgId} by ${userId}`);
      return res.status(201).json({
        project: {
          id: project.id,
          organizationId: project.organization_id,
          name: project.name,
          description: project.description,
          inputFlowConfig: project.input_flow_config || {},
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error(`[API /api/projects] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
