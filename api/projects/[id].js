/**
 * API Route: /api/projects/:id
 * 
 * GET    - Get a specific project
 * PUT    - Update project (org admin/super admin only)
 * DELETE - Delete project (org admin/super admin only)
 * 
 * Requires authenticated user with organization membership.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import {
  ensureDb,
  getUserById,
  getProjectById,
  updateProject,
  deleteProject,
  duplicateProject,
  getSketchesMetaByProject
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
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
      // Check if sketches are requested
      const includeSketches = req.query.includeSketches === 'true';
      
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
    console.error(`[API /api/projects/${projectId}] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
