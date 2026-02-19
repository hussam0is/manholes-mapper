/**
 * API Route: /api/sketches/assign-project
 *
 * POST - Bulk-assign orphaned sketches (project_id IS NULL) to a project
 *
 * Requires admin or super_admin role.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { ensureDb, sql, getUserById, getProjectById } from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  if (applyRateLimit(req, res)) return;

  if (req.method !== 'POST') {
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

    const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const body = await parseBody(request);
    const { projectId } = body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // Verify project exists
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Bulk-assign all orphaned sketches to the target project
    const result = await sql`
      UPDATE sketches
      SET project_id = ${projectId}, updated_at = NOW()
      WHERE project_id IS NULL
      RETURNING id
    `;

    const assignedCount = result.rows.length;
    console.debug(`[API /api/sketches/assign-project] Assigned ${assignedCount} orphaned sketches to project ${projectId}`);

    return res.status(200).json({ assignedCount });

  } catch (error) {
    console.error(`[API /api/sketches/assign-project] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
