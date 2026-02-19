/**
 * API Route: /api/user-role
 * 
 * GET - Get current user's role, permissions, and features
 *       Auto-creates user record on first access
 * 
 * Returns user info with effective features based on user and org settings.
 */

import { verifyAuth, sanitizeErrorMessage } from '../_lib/auth.js';
import {
  ensureDb,
  sql,
  getOrCreateUser,
  getUserById,
  getEffectiveFeatures,
  DEFAULT_FEATURES,
  createOrganization,
  getAllOrganizations,
  updateUser
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.debug(`[API /api/user-role] ${req.method} request started`);

  // Apply rate limiting
  if (applyRateLimit(req, res)) {
    return; // Rate limited, response already sent
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize database
    await ensureDb();

    // Verify authentication using Better Auth
    const { userId, error: authError, user: authUser } = await verifyAuth(request);
    
    if (authError || !userId) {
      return res.status(401).json({ error: authError || 'Not authenticated' });
    }

    // Extract user info from auth session
    const username = authUser?.name || null;
    const email = authUser?.email || null;

    // Get or create user record in our app database
    let user = await getOrCreateUser(userId, { username, email });

    // Auto-bootstrap: if super_admin has no organization, create or assign one
    if (user.role === 'super_admin' && !user.organization_id) {
      const orgs = await getAllOrganizations();
      let orgId;
      if (orgs.length === 0) {
        // Derive org name from email domain (e.g. admin@geopoint.me → "Geopoint")
        const domain = (email || '').split('@')[1] || 'Default';
        const orgName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
        const newOrg = await createOrganization(orgName);
        orgId = newOrg.id;
        console.debug(`[API /api/user-role] Auto-created organization "${orgName}" (${orgId}) for super_admin`);
      } else {
        orgId = orgs[0].id;
        console.debug(`[API /api/user-role] Auto-assigned super_admin to existing org ${orgId}`);
      }
      await updateUser(userId, { organizationId: orgId });
      user = await getUserById(userId);
    }

    // Get effective features (combining org and user settings)
    const features = await getEffectiveFeatures(userId, user.organization_id);

    // Build response
    const response = {
      userId: user.id || userId,
      username: user.username || username,
      email: user.email || email,
      role: user.role,
      organizationId: user.organization_id,
      isSuperAdmin: user.role === 'super_admin',
      isAdmin: user.role === 'admin' || user.role === 'super_admin',
      features,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };

    console.debug(`[API /api/user-role] User ${userId} role: ${user.role}`);
    return res.status(200).json(response);

  } catch (error) {
    console.error(`[API /api/user-role] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
