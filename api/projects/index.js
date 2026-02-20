/**
 * API Route: /api/projects
 * 
 * GET  - List all projects for user's organization
 * POST - Create a new project (org admin/super admin only)
 * 
 * Requires authenticated user with organization membership.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import {
  ensureDb,
  sql,
  getUserById,
  getProjectsByOrganization,
  createProject,
  getProjectById
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.debug(`[API /api/projects] ${req.method} request started`);

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
    const currentUser = await getUserById(userId);
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
      
      let projects;
      
      // Super admin with no org filter - return all projects
      if (isSuperAdmin && !orgId) {
        const { getAllProjects } = await import('../_lib/db.js');
        projects = await getAllProjects();
        console.debug(`[API /api/projects] Super admin: returning all ${projects.length} projects`);
      } else if (!orgId) {
        // Non-super admin without org - return empty
        return res.status(200).json({ projects: [] });
      } else {
        // Non-super admins can only see their own organization's projects
        if (!isSuperAdmin && orgId !== currentUser.organization_id) {
          return res.status(403).json({ error: 'Access denied to this organization' });
        }
        projects = await getProjectsByOrganization(orgId);
        console.debug(`[API /api/projects] Returning ${projects.length} projects for org ${orgId}`);
      }
      
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

      // Count orphaned sketches (no project_id assigned) scoped to the user's organization
      let orphanCount = 0;
      if (isAdmin && currentUser.organization_id) {
        const userOrgId = currentUser.organization_id;
        const orphanResult = await sql`
          SELECT COUNT(*) as count FROM sketches s
          JOIN users u ON s.user_id = u.id
          WHERE s.project_id IS NULL AND u.organization_id = ${userOrgId}
        `;
        orphanCount = parseInt(orphanResult.rows[0]?.count) || 0;
      }

      return res.status(200).json({ projects: transformed, orphanCount });
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

      console.debug(`[API /api/projects] Created project ${project.id} in org ${targetOrgId} by ${userId}`);
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
