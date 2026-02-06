/**
 * API Route: /api/layers
 * 
 * GET  - List layers for a project (metadata only, or full with ?full=true)
 * POST - Create a new layer (admin/super_admin only)
 * 
 * Query params:
 *   projectId (required) - Project UUID
 *   full      (optional) - If "true", includes geojson data
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { 
  ensureDb, 
  getUserById,
  getProjectById,
  getProjectLayersMeta,
  getProjectLayersFull,
  createProjectLayer
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.log(`[API /api/layers] ${req.method} request started`);

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

    if (req.method === 'GET') {
      const projectId = req.query.projectId;
      if (!projectId) {
        return res.status(400).json({ error: 'projectId query parameter is required' });
      }

      // Verify project exists and user has access
      const project = await getProjectById(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Check access: user must be in same org or super admin
      if (!isSuperAdmin && project.organization_id !== currentUser.organization_id) {
        return res.status(403).json({ error: 'Access denied to this project' });
      }

      const includeFull = req.query.full === 'true';
      let layers;

      if (includeFull) {
        layers = await getProjectLayersFull(projectId);
      } else {
        layers = await getProjectLayersMeta(projectId);
      }

      const transformed = layers.map(l => ({
        id: l.id,
        projectId: l.project_id,
        name: l.name,
        layerType: l.layer_type,
        style: l.style || {},
        visible: l.visible,
        displayOrder: l.display_order,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
        ...(l.geojson ? { geojson: l.geojson } : {})
      }));

      console.log(`[API /api/layers] Returning ${transformed.length} layers for project ${projectId}`);
      return res.status(200).json({ layers: transformed });
    }

    if (req.method === 'POST') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required to create layers' });
      }

      const body = await parseBody(request);
      const { projectId, name, layerType, geojson, style, visible, displayOrder } = body;

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Layer name is required' });
      }
      if (!layerType) {
        return res.status(400).json({ error: 'layerType is required' });
      }
      if (!geojson) {
        return res.status(400).json({ error: 'geojson data is required' });
      }

      // Verify project exists and user has access
      const project = await getProjectById(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!isSuperAdmin && project.organization_id !== currentUser.organization_id) {
        return res.status(403).json({ error: 'Cannot add layers to another organization\'s project' });
      }

      const layer = await createProjectLayer(projectId, {
        name: name.trim(),
        layerType,
        geojson,
        style: style || {},
        visible: visible !== false,
        displayOrder: displayOrder || 0
      });

      console.log(`[API /api/layers] Created layer ${layer.id} (${layerType}) for project ${projectId} by ${userId}`);
      return res.status(201).json({
        layer: {
          id: layer.id,
          projectId: layer.project_id,
          name: layer.name,
          layerType: layer.layer_type,
          style: layer.style || {},
          visible: layer.visible,
          displayOrder: layer.display_order,
          createdAt: layer.created_at,
          updatedAt: layer.updated_at
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error(`[API /api/layers] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
