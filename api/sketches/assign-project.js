/**
 * API Route: /api/sketches/assign-project
 *
 * POST - Assign all orphaned sketches (no project_id) in the user's organization to a project
 *
 * Body: { projectId: string (UUID) }
 * Returns: { assignedCount: number }
 *
 * Requires: authenticated admin user with organization membership.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { ensureDb, sql, getOrCreateUser, getProjectById } from '../_lib/db.js';
import { validateUUID } from '../_lib/validators.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.debug(`[API /api/sketches/assign-project] ${req.method} request started`);

  if (applyRateLimit(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureDb();

    const { userId, error: authError, user: authUser } = await verifyAuth(request);
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    // Get user record to check role and organization
    const currentUser = await getOrCreateUser(userId, {
      username: authUser?.name,
      email: authUser?.email,
    });
    const userRole = currentUser?.role || 'user';
    const userOrgId = currentUser?.organization_id;

    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!userOrgId) {
      return res.status(400).json({ error: 'User has no organization' });
    }

    const body = await parseBody(request);
    const { projectId } = body;

    if (!projectId || !validateUUID(projectId)) {
      return res.status(400).json({ error: 'Valid projectId is required' });
    }

    // Verify the project exists and belongs to the user's organization
    const project = await getProjectById(projectId);
    if (!project || project.organization_id !== userOrgId) {
      return res.status(404).json({ error: 'Project not found in your organization' });
    }

    // Assign all orphaned sketches in the organization to the project
    const result = await sql`
      UPDATE sketches s
      SET project_id = ${projectId}
      FROM users u
      WHERE s.user_id = u.id
        AND s.project_id IS NULL
        AND u.organization_id = ${userOrgId}
      RETURNING s.id
    `;

    const assignedCount = result.rows?.length || 0;
    console.debug(`[API /api/sketches/assign-project] Assigned ${assignedCount} orphaned sketches to project ${projectId}`);

    return res.status(200).json({ assignedCount });
  } catch (error) {
    console.error('[API /api/sketches/assign-project] Error:', error.message);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
