/**
 * API Route: /api/org-members
 *
 * GET - List members of the current user's organization (id, username, email)
 *       Available to any authenticated user for @mention functionality.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyAuth } from '../_lib/auth.js';
import {
  ensureDb,
  getUserById,
  getUsersByOrganization,
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { handleApiError } from '../_lib/error-handler.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  if (applyRateLimit(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureDb();

    const { userId, error } = await verifyAuth(request);
    if (error) {
      return res.status(401).json({ error });
    }

    const currentUser = await getUserById(userId);
    if (!currentUser || !currentUser.organization_id) {
      return res.status(200).json({ members: [] });
    }

    const users = await getUsersByOrganization(currentUser.organization_id, { limit: 200 });

    // Return minimal info needed for mentions (exclude current user)
    const members = users
      .filter(u => u.id !== userId)
      .map(u => ({
        id: u.id,
        username: u.username || u.email?.split('@')[0] || 'Unknown',
        email: u.email,
      }));

    return res.status(200).json({ members });
  } catch (err) {
    return handleApiError(err, res, '[API /api/org-members]');
  }
}
