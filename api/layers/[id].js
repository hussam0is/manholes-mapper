/**
 * API Route: /api/layers/[id]
 * 
 * GET    - Get a single layer with full geojson
 * PUT    - Update a layer (metadata, style, visibility, or geojson)
 * DELETE - Delete a layer
 * 
 * Requires admin/super_admin for PUT and DELETE.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { 
  ensureDb, 
  getUserById,
  getProjectById,
  getProjectLayer,
  updateProjectLayer,
  deleteProjectLayer
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  const layerId = req.query.id;
  console.log(`[API /api/layers/${layerId}] ${req.method} request started`);

  if (applyRateLimit(req, res)) return;

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
    const isAdmin = currentUser.role === 'admin' || isSuperAdmin;

    // Get the layer
    const layer = await getProjectLayer(layerId);
    if (!layer) {
      return res.status(404).json({ error: 'Layer not found' });
    }

    // Verify project access
    const project = await getProjectById(layer.project_id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isSuperAdmin && project.organization_id !== currentUser.organization_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        layer: {
          id: layer.id,
          projectId: layer.project_id,
          name: layer.name,
          layerType: layer.layer_type,
          geojson: layer.geojson,
          style: layer.style || {},
          visible: layer.visible,
          displayOrder: layer.display_order,
          createdAt: layer.created_at,
          updatedAt: layer.updated_at
        }
      });
    }

    if (req.method === 'PUT') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const body = await parseBody(request);
      const { name, style, visible, displayOrder, geojson } = body;

      const updated = await updateProjectLayer(layerId, {
        name: name?.trim() || undefined,
        style,
        visible,
        displayOrder,
        geojson
      });

      if (!updated) {
        return res.status(500).json({ error: 'Failed to update layer' });
      }

      console.log(`[API /api/layers/${layerId}] Updated by ${userId}`);
      return res.status(200).json({
        layer: {
          id: updated.id,
          projectId: updated.project_id,
          name: updated.name,
          layerType: updated.layer_type,
          style: updated.style || {},
          visible: updated.visible,
          displayOrder: updated.display_order,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at
        }
      });
    }

    if (req.method === 'DELETE') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const deleted = await deleteProjectLayer(layerId);
      if (!deleted) {
        return res.status(500).json({ error: 'Failed to delete layer' });
      }

      console.log(`[API /api/layers/${layerId}] Deleted by ${userId}`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error(`[API /api/layers/${layerId}] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
