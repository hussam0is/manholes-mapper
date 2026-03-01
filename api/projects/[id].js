/**
 * API Route: /api/projects/:id
 *
 * GET    - Get a specific project
 * PUT    - Update project (org admin/super admin only)
 * DELETE - Delete project (org admin/super admin only)
 *
 * Requires authenticated user with organization membership.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyAuth, parseBody } from '../_lib/auth.js';
import {
  ensureDb,
  getUserById,
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

  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  const { id: projectId } = req.query;
  console.debug(`[API /api/projects/${projectId}] ${req.method} request started`);

  // Apply rate limiting
  if (applyRateLimit(req, res)) {
    return; // Rate limited, response already sent
  }

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
      const { name, description, inputFlowConfig } = body;

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

      const updatedProject = await updateProject(projectId, updates);

      console.debug(`[API /api/projects/${projectId}] Updated by ${userId}`);
      return res.status(200).json({
        project: {
          id: updatedProject.id,
          organizationId: updatedProject.organization_id,
          name: updatedProject.name,
          description: updatedProject.description,
          inputFlowConfig: updatedProject.input_flow_config || {},
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
