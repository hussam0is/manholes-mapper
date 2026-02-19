/**
 * API Route: /api/layers/[...path]
 * 
 * Catch-all handler for layers API (consolidated to save serverless function slots).
 * Uses vercel.json rewrite: /api/layers -> /api/layers/_  so this catch-all handles both.
 * 
 * /api/layers          GET  - List layers for a project (metadata or full with ?full=true)
 * /api/layers          POST - Create a new layer (admin/super_admin only)
 * /api/layers/[id]     GET  - Get a single layer with full geojson
 * /api/layers/[id]     PUT  - Update a layer (metadata, style, visibility, or geojson)
 * /api/layers/[id]     DELETE - Delete a layer
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { 
  ensureDb, 
  getUserById,
  getProjectById,
  getProjectLayersMeta,
  getProjectLayersFull,
  getProjectLayer,
  createProjectLayer,
  updateProjectLayer,
  deleteProjectLayer
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { validateUUID } from '../_lib/validators.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  // Parse path segments from URL if query.path is missing (common with rewrites)
  let pathSegments = req.query.path || [];
  if (typeof pathSegments === 'string') pathSegments = [pathSegments];
  
  if (pathSegments.length === 0 && req.url.includes('/api/layers/')) {
    const parts = req.url.split('?')[0].split('/');
    const layersIdx = parts.indexOf('layers');
    if (layersIdx !== -1 && layersIdx < parts.length - 1) {
      const segment = parts[layersIdx + 1];
      if (segment && segment !== '_') {
        pathSegments = [segment];
      }
    }
  }

  const firstSegment = pathSegments.length > 0 ? pathSegments[0] : '_';
  // '_' is the collection route (rewritten from /api/layers by vercel.json)
  const isCollection = firstSegment === '_';
  const layerId = isCollection ? null : firstSegment;

  console.debug(`[API /api/layers${layerId ? '/' + layerId : ''}] ${req.method} request started. Path segments:`, pathSegments);

  // CORS origin resolution
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null; // null = allow all (development mode)
  const requestOrigin = request.headers.get('origin');
  const resolvedOrigin = !allowedOrigins
    ? (requestOrigin || '*')
    : (requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', resolvedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(204).end();
  }

  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', resolvedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

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

    // ─── Routes with a layer ID: /api/layers/[id] ───
    if (layerId) {
      // Validate UUID format before passing to handler
      if (!validateUUID(layerId)) {
        return res.status(400).json({ error: 'Invalid layer ID format' });
      }
      return handleSingleLayer(req, res, request, layerId, currentUser, isSuperAdmin, isAdmin, userId);
    }

    // ─── Collection routes: /api/layers ───
    return handleCollection(req, res, request, currentUser, isSuperAdmin, isAdmin, userId);

  } catch (error) {
    console.error(`[API /api/layers] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}

// ─── /api/layers (GET list, POST create) ───
async function handleCollection(req, res, request, currentUser, isSuperAdmin, isAdmin, userId) {
  if (req.method === 'GET') {
    const projectId = req.query.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId query parameter is required' });
    }

    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isSuperAdmin && project.organization_id !== currentUser.organization_id) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const includeFull = req.query.full === 'true';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const pagination = { limit, offset };

    const layers = includeFull
      ? await getProjectLayersFull(projectId, pagination)
      : await getProjectLayersMeta(projectId, pagination);

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

    console.debug(`[API /api/layers] Returning ${transformed.length} layers for project ${projectId}`);
    return res.status(200).json({ layers: transformed, pagination: { limit, offset, count: transformed.length } });
  }

  if (req.method === 'POST') {
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required to create layers' });
    }

    const body = await parseBody(request);
    const { projectId, name, layerType, geojson, style, visible, displayOrder } = body;

    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'Layer name is required' });
    if (!layerType) return res.status(400).json({ error: 'layerType is required' });
    if (!geojson) return res.status(400).json({ error: 'geojson data is required' });

    const project = await getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

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

    console.debug(`[API /api/layers] Created layer ${layer.id} (${layerType}) for project ${projectId} by ${userId}`);
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

  console.debug(`[API /api/layers] Method ${req.method} not allowed`);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

// ─── /api/layers/[id] (GET single, PUT update, DELETE) ───
async function handleSingleLayer(req, res, request, layerId, currentUser, isSuperAdmin, isAdmin, userId) {
  const layer = await getProjectLayer(layerId);
  if (!layer) {
    return res.status(404).json({ error: 'Layer not found' });
  }

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

    console.debug(`[API /api/layers/${layerId}] Updated by ${userId}`);
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

    console.debug(`[API /api/layers/${layerId}] Deleted by ${userId}`);
    return res.status(200).json({ success: true });
  }

  console.debug(`[API /api/layers/${layerId}] Method ${req.method} not allowed for single layer`);
  return res.status(405).json({ error: `Method ${req.method} not allowed for single layer` });
}
