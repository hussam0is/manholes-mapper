/**
 * API Route: /api/projects/:id/sketches
 *
 * GET - Get all sketches for a project (with full data: nodes, edges)
 *
 * Requires authenticated user with organization membership.
 */

import { verifyAuth, sanitizeErrorMessage } from '../../_lib/auth.js';
import {
  ensureDb,
  getUserById,
  getProjectById,
  getSketchesByProject
} from '../../_lib/db.js';
import { applyRateLimit } from '../../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  const { id: projectId } = req.query;
  console.debug(`[API /api/projects/${projectId}/sketches] ${req.method} request started`);

  if (applyRateLimit(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureDb();

    const { userId, error: authError } = await verifyAuth(request);
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    const currentUser = await getUserById(userId);
    if (!currentUser) {
      return res.status(403).json({ error: 'User not found' });
    }

    const isSuperAdmin = currentUser.role === 'super_admin';

    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isSuperAdmin && project.organization_id !== currentUser.organization_id) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

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

  } catch (error) {
    console.error(`[API /api/projects/${projectId}/sketches] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
