/**
 * API Route: /api/features/:targetType/:targetId
 * 
 * GET - Get feature settings for a user or organization
 * PUT - Update feature settings (requires admin)
 * 
 * targetType: 'user' or 'organization'
 * targetId: clerk_id or org_id
 */

import { verifyAuth, parseBody } from '../_lib/auth.js';
import { 
  ensureDb, 
  getUserByClerkId,
  getOrganizationById,
  getFeatures,
  setFeatures,
  DEFAULT_FEATURES
} from '../_lib/db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Polyfill for helper functions
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  // Parse slug: /api/features/user/clerk_123 => ['user', 'clerk_123']
  const { slug } = req.query;
  if (!slug || slug.length < 2) {
    return res.status(400).json({ error: 'Invalid path. Expected /api/features/:targetType/:targetId' });
  }

  const [targetType, targetId] = slug;
  console.log(`[API /api/features/${targetType}/${targetId}] ${req.method} request started`);

  if (!['user', 'organization'].includes(targetType)) {
    return res.status(400).json({ error: 'Target type must be "user" or "organization"' });
  }

  try {
    // Initialize database
    await ensureDb();

    // Verify authentication
    const { userId, error: authError } = await verifyAuth(request);
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    // Check if user is admin
    const currentUser = await getUserByClerkId(userId);
    if (!currentUser) {
      return res.status(403).json({ error: 'User not found' });
    }

    const isSuperAdmin = currentUser.role === 'super_admin';
    const isAdmin = currentUser.role === 'admin' || isSuperAdmin;

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Validate target exists
    if (targetType === 'user') {
      const targetUser = await getUserByClerkId(targetId);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      // Org admin can only manage users in their org
      if (!isSuperAdmin && targetUser.organization_id !== currentUser.organization_id) {
        return res.status(403).json({ error: 'Cannot manage users outside your organization' });
      }
    } else if (targetType === 'organization') {
      // Only super admin can manage organization features
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Super admin access required' });
      }
      const targetOrg = await getOrganizationById(targetId);
      if (!targetOrg) {
        return res.status(404).json({ error: 'Organization not found' });
      }
    }

    if (req.method === 'GET') {
      const features = await getFeatures(targetType, targetId);
      
      return res.status(200).json({
        targetType,
        targetId,
        features,
        availableFeatures: DEFAULT_FEATURES,
      });
    }

    if (req.method === 'PUT') {
      const body = await parseBody(request);
      const { features } = body;

      if (!features || typeof features !== 'object') {
        return res.status(400).json({ error: 'Features object is required' });
      }

      // Validate feature keys
      for (const key of Object.keys(features)) {
        if (!DEFAULT_FEATURES.includes(key)) {
          return res.status(400).json({ error: `Invalid feature key: ${key}` });
        }
        if (typeof features[key] !== 'boolean') {
          return res.status(400).json({ error: `Feature value must be boolean for: ${key}` });
        }
      }

      await setFeatures(targetType, targetId, features);

      // Return updated features
      const updatedFeatures = await getFeatures(targetType, targetId);

      console.log(`[API /api/features/${targetType}/${targetId}] Updated by ${userId}`);
      return res.status(200).json({
        targetType,
        targetId,
        features: updatedFeatures,
        availableFeatures: DEFAULT_FEATURES,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error(`[API /api/features/${targetType}/${targetId}] Error:`, error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
