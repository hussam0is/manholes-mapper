/**
 * API Route: /api/projects
 *
 * GET  - List all projects for user's organization
 * POST - Create a new project (org admin/super admin only)
 *
 * When called with ?id=<projectId> (via rewrite from /api/projects/:id):
 * GET    - Get a specific project
 * PUT    - Update project (org admin/super admin only)
 * DELETE - Delete project (org admin/super admin only)
 * POST   - Duplicate project (action=duplicate)
 *
 * Requires authenticated user with organization membership.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyCsrf } from '../_lib/csrf.js';
import { verifyAuth, parseBody } from '../_lib/auth.js';
import {
  ensureDb,
  sql,
  getUserById,
  getProjectsByOrganization,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  duplicateProject,
  getSketchesMetaByProject,
  getSketchesByProject
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { validateUUID } from '../_lib/validators.js';
import { handleApiError } from '../_lib/error-handler.js';

const MAX_NAME_LENGTH = 200;

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (verifyCsrf(req, res)) return;

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

  // Route to single-resource handler if ID is provided (via rewrite from /api/projects/:id)
  const resourceId = req.query?.id;
  if (resourceId) {
    return handleSingleProject(req, res, request, resourceId);
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
        targetKm: p.target_km != null ? parseFloat(p.target_km) : null,
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
      const { name, description, inputFlowConfig, organizationId, targetKm } = body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Project name is required' });
      }
      if (name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ error: `Project name exceeds maximum of ${MAX_NAME_LENGTH} characters` });
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
        targetKm: targetKm != null ? parseFloat(targetKm) : null,
      });

      console.debug(`[API /api/projects] Created project ${project.id} in org ${targetOrgId} by ${userId}`);
      return res.status(201).json({
        project: {
          id: project.id,
          organizationId: project.organization_id,
          name: project.name,
          description: project.description,
          inputFlowConfig: project.input_flow_config || {},
          targetKm: project.target_km != null ? parseFloat(project.target_km) : null,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    return handleApiError(error, res, '[API /api/projects]');
  }
}

/**
 * Handle single project operations: GET/PUT/DELETE/POST /api/projects/:id
 * (Merged from api/projects/[id].js)
 */
async function handleSingleProject(req, res, request, projectId) {
  console.debug(`[API /api/projects/${projectId}] ${req.method} request started`);

  // Validate UUID format
  if (!validateUUID(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
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

    // Get project
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if user has access to this project's organization
    if (!isSuperAdmin && project.organization_id !== currentUser.organization_id) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    if (req.method === 'GET') {
      // Check if full sketches (with nodes/edges) are requested
      const fullSketches = req.query.fullSketches === 'true';
      // Check if sketch metadata is requested
      const includeSketches = req.query.includeSketches === 'true';

      // Shortcut: fullSketches returns just the sketches array (for project-canvas mode)
      if (fullSketches) {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const rows = await getSketchesByProject(projectId, { limit, offset });
        const sketches = rows.map(s => ({
          id: s.id,
          name: s.name,
          creationDate: s.creation_date,
          nodes: s.nodes || [],
          edges: s.edges || [],
          adminConfig: s.admin_config || {},
          projectId: s.project_id,
          snapshotInputFlowConfig: s.snapshot_input_flow_config || {},
          createdBy: s.created_by,
          lastEditedBy: s.last_edited_by,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          version: s.version ?? 0,
        }));
        return res.status(200).json({ sketches, pagination: { limit, offset, count: sketches.length } });
      }

      const response = {
        project: {
          id: project.id,
          organizationId: project.organization_id,
          name: project.name,
          description: project.description,
          inputFlowConfig: project.input_flow_config || {},
          targetKm: project.target_km != null ? parseFloat(project.target_km) : null,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        }
      };

      if (includeSketches) {
        const sketchLimit = Math.min(Math.max(parseInt(req.query.sketchLimit) || 50, 1), 200);
        const sketchOffset = Math.max(parseInt(req.query.sketchOffset) || 0, 0);
        const sketches = await getSketchesMetaByProject(projectId, { limit: sketchLimit, offset: sketchOffset });
        response.sketches = sketches.map(s => ({
          id: s.id,
          name: s.name,
          createdBy: s.created_by,
          lastEditedBy: s.last_edited_by,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          version: s.version ?? 0,
        }));
        response.sketchPagination = { limit: sketchLimit, offset: sketchOffset, count: sketches.length };
      }

      return res.status(200).json(response);
    }

    if (req.method === 'PUT') {
      // Only org admin or super admin can update projects
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required to update projects' });
      }

      const body = await parseBody(request);
      const { name, description, inputFlowConfig, targetKm } = body;

      if (name !== undefined && !name.trim()) {
        return res.status(400).json({ error: 'Project name cannot be empty' });
      }
      if (name && name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ error: `Project name exceeds maximum of ${MAX_NAME_LENGTH} characters` });
      }

      const updates = {};
      if (name) updates.name = name.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (inputFlowConfig !== undefined) updates.inputFlowConfig = inputFlowConfig;
      if (targetKm !== undefined) updates.targetKm = targetKm != null ? parseFloat(targetKm) : null;

      const updatedProject = await updateProject(projectId, updates);

      console.debug(`[API /api/projects/${projectId}] Updated by ${userId}`);
      return res.status(200).json({
        project: {
          id: updatedProject.id,
          organizationId: updatedProject.organization_id,
          name: updatedProject.name,
          description: updatedProject.description,
          inputFlowConfig: updatedProject.input_flow_config || {},
          targetKm: updatedProject.target_km != null ? parseFloat(updatedProject.target_km) : null,
          createdAt: updatedProject.created_at,
          updatedAt: updatedProject.updated_at,
        }
      });
    }

    if (req.method === 'DELETE') {
      // Only org admin or super admin can delete projects
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required to delete projects' });
      }

      await deleteProject(projectId);

      console.debug(`[API /api/projects/${projectId}] Deleted by ${userId}`);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST') {
      // POST to /api/projects/:id is used for duplicating
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required to duplicate projects' });
      }

      const body = await parseBody(request);
      const action = body.action;

      if (action === 'duplicate') {
        const newName = body.name || `${project.name} (Copy)`;
        if (newName.length > MAX_NAME_LENGTH) {
          return res.status(400).json({ error: `Project name exceeds maximum of ${MAX_NAME_LENGTH} characters` });
        }
        const duplicated = await duplicateProject(projectId, newName);

        console.debug(`[API /api/projects/${projectId}] Duplicated to ${duplicated.id} by ${userId}`);
        return res.status(201).json({
          project: {
            id: duplicated.id,
            organizationId: duplicated.organization_id,
            name: duplicated.name,
            description: duplicated.description,
            inputFlowConfig: duplicated.input_flow_config || {},
            targetKm: duplicated.target_km != null ? parseFloat(duplicated.target_km) : null,
            createdAt: duplicated.created_at,
            updatedAt: duplicated.updated_at,
          }
        });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    return handleApiError(error, res, `[API /api/projects/${projectId}]`);
  }
}
