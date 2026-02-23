/**
 * API Route: /api/sketches
 * 
 * GET  - List all sketches for authenticated user
 * POST - Create a new sketch
 * 
 * Note: Uses standard Node.js (req, res) signature for better compatibility with vercel dev.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import {
  getSketchesByUser,
  getSketchesMetaByUser,
  getAllSketches,
  getAllSketchesMeta,
  getSketchesByOrganization,
  getSketchesMetaByOrganization,
  createSketch,
  ensureDb,
  sql,
  getProjectById,
  getOrCreateUser
} from '../_lib/db.js';
import { validateSketchInput, validateUUID } from '../_lib/validators.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Polyfill for helper functions that expect Web API Request
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.debug(`[API /api/sketches] ${req.method} request started`);

  // Apply rate limiting
  if (applyRateLimit(req, res)) {
    return; // Rate limited, response already sent
  }
  
  try {
    // Initialize database
    await ensureDb();

    // Verify authentication
    const { userId, error: authError, user: authUser } = await verifyAuth(request);

    if (authError) {
      console.warn(`[API /api/sketches] Auth failed: ${authError}`);
      return res.status(401).json({ error: authError });
    }

    if (req.method === 'GET') {
      const username = authUser?.name || null;
      const email = authUser?.email || null;

      // Get or create user record to access role and organization
      const userRecord = await getOrCreateUser(userId, { username, email });
      const userRole = userRecord?.role || 'user';
      const organizationId = userRecord?.organization_id;

      // Parse pagination and data params
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const includeFull = req.query.full === 'true';
      const pagination = { limit, offset };

      let sketches;

      // Role-based sketch access:
      // - super_admin: sees all sketches
      // - admin: sees all sketches in their organization
      // - user: sees only their own sketches
      // Use metadata-only queries by default; ?full=true for complete data
      if (userRole === 'super_admin') {
        sketches = includeFull ? await getAllSketches(pagination) : await getAllSketchesMeta(pagination);
        console.debug(`[API /api/sketches] Super admin ${userId} fetched ${sketches?.length} total sketches (full=${includeFull})`);
      } else if (userRole === 'admin' && organizationId) {
        sketches = includeFull
          ? await getSketchesByOrganization(organizationId, pagination)
          : await getSketchesMetaByOrganization(organizationId, pagination);
        console.debug(`[API /api/sketches] Admin ${userId} fetched ${sketches?.length} sketches for org ${organizationId} (full=${includeFull})`);
      } else {
        sketches = includeFull
          ? await getSketchesByUser(userId, pagination)
          : await getSketchesMetaByUser(userId, pagination);
        console.debug(`[API /api/sketches] User ${userId} fetched ${sketches?.length} own sketches (full=${includeFull})`);
      }

      const transformed = (sketches || []).map(row => ({
        id: row.id,
        name: row.name,
        creationDate: row.creation_date,
        createdBy: row.created_by,
        lastEditedBy: row.last_edited_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        projectId: row.project_id,
        // Include owner info for admin views
        ownerId: row.user_id,
        ownerUsername: row.owner_username || null,
        ownerEmail: row.owner_email || null,
        // Flag to indicate if this sketch belongs to the current user
        isOwner: row.user_id === userId,
        // Include node/edge counts from metadata queries (always available)
        nodeCount: row.node_count != null ? Number(row.node_count) : (row.nodes ? row.nodes.length : 0),
        edgeCount: row.edge_count != null ? Number(row.edge_count) : (row.edges ? row.edges.length : 0),
        // Only include large JSONB fields when full=true
        ...(includeFull ? {
          nodes: row.nodes || [],
          edges: row.edges || [],
          adminConfig: row.admin_config || {},
          snapshotInputFlowConfig: row.snapshot_input_flow_config || {},
        } : {}),
      }));

      return res.status(200).json({
        sketches: transformed,
        pagination: { limit, offset, count: transformed.length },
      });
    }

    if (req.method === 'POST') {
      const body = await parseBody(request);

      // Handle assign-orphans action
      if (body.action === 'assign-orphans') {
        const { projectId } = body;
        if (!projectId || !validateUUID(projectId)) {
          return res.status(400).json({ error: 'Valid projectId is required' });
        }
        const currentUser = await getOrCreateUser(userId, {
          username: authUser?.name, email: authUser?.email,
        });
        const userRole = currentUser?.role || 'user';
        const userOrgId = currentUser?.organization_id;
        if (userRole !== 'admin' && userRole !== 'super_admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }
        if (!userOrgId) {
          return res.status(400).json({ error: 'User has no organization' });
        }
        const project = await getProjectById(projectId);
        if (!project || project.organization_id !== userOrgId) {
          return res.status(404).json({ error: 'Project not found in your organization' });
        }
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
        console.debug(`[API /api/sketches] Assigned ${assignedCount} orphaned sketches to project ${projectId}`);
        return res.status(200).json({ assignedCount });
      }

      // Validate input
      const validationErrors = validateSketchInput(body);
      if (validationErrors) {
        console.warn(`[API /api/sketches] Validation failed:`, validationErrors);
        console.warn(`[API /api/sketches] Request body summary:`, {
          name: body.name,
          nameType: typeof body.name,
          nodesCount: Array.isArray(body.nodes) ? body.nodes.length : 'not array',
          edgesCount: Array.isArray(body.edges) ? body.edges.length : 'not array',
          adminConfigType: typeof body.adminConfig,
          creationDateType: typeof body.creationDate,
          projectId: body.projectId,
        });
        return res.status(400).json({ error: 'Validation failed', details: validationErrors });
      }
      
      // Get project's input flow config if projectId is provided
      let snapshotInputFlowConfig = body.snapshotInputFlowConfig || {};
      if (body.projectId) {
        const project = await getProjectById(body.projectId);
        if (project) {
          // Copy the project's input flow config as a snapshot
          snapshotInputFlowConfig = project.input_flow_config || {};
        }
      }
      
      const sketch = await createSketch(userId, {
        name: body.name,
        creationDate: body.creationDate,
        nodes: body.nodes || [],
        edges: body.edges || [],
        adminConfig: body.adminConfig || {},
        createdBy: body.createdBy,
        lastEditedBy: body.lastEditedBy,
        projectId: body.projectId || null,
        snapshotInputFlowConfig: snapshotInputFlowConfig,
      });
      
      const transformed = {
        id: sketch.id,
        name: sketch.name,
        creationDate: sketch.creation_date,
        createdBy: sketch.created_by,
        lastEditedBy: sketch.last_edited_by,
        createdAt: sketch.created_at,
        updatedAt: sketch.updated_at,
        nodes: sketch.nodes || [],
        edges: sketch.edges || [],
        adminConfig: sketch.admin_config || {},
        projectId: sketch.project_id,
        snapshotInputFlowConfig: sketch.snapshot_input_flow_config || {},
      };
      
      console.debug(`[API /api/sketches] Created sketch ${transformed.id} for ${userId} in project ${body.projectId || 'none'}`);
      return res.status(201).json({ sketch: transformed });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(`[API /api/sketches] Error:`, error.message);
    
    // Check for specific error types
    if (error.message?.includes('Database connection not configured')) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
