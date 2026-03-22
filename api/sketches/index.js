/**
 * API Route: /api/sketches
 *
 * GET  - List all sketches for authenticated user
 * POST - Create a new sketch
 *
 * When called with ?id=<sketchId> (via rewrite from /api/sketches/:id):
 * GET    - Get a single sketch by ID (includes lock status)
 * PUT    - Update a sketch
 * DELETE - Delete a sketch
 * POST   - Lock operations (action=lock, action=unlock, action=refresh)
 *
 * Note: Uses standard Node.js (req, res) signature for better compatibility with vercel dev.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyCsrf } from '../_lib/csrf.js';
import { verifyAuth, parseBody } from '../_lib/auth.js';
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
  getOrCreateUser,
  getSketchById,
  getSketchByIdAdmin,
  updateSketch,
  deleteSketch,
  acquireSketchLock,
  releaseSketchLock,
  refreshSketchLock,
  checkSketchLock,
  forceReleaseSketchLock
} from '../_lib/db.js';
import { validateSketchInput, validateUUID } from '../_lib/validators.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { handleApiError } from '../_lib/error-handler.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (verifyCsrf(req, res)) return;

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

  // Route to single-resource handler if ID is provided (via rewrite from /api/sketches/:id)
  const resourceId = req.query?.id;
  if (resourceId) {
    return handleSingleSketch(req, res, request, resourceId);
  }

  try {
    // Verify authentication first (before DB init to return 401 instead of 500)
    const { userId, error: authError, user: authUser } = await verifyAuth(request);

    if (authError) {
      console.warn(`[API /api/sketches] Auth failed: ${authError}`);
      return res.status(401).json({ error: authError });
    }

    // Initialize database
    await ensureDb();

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
        version: row.version ?? 0,
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
        version: sketch.version ?? 0,
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
    return handleApiError(error, res, '[API /api/sketches]');
  }
}

/**
 * Handle single sketch operations: GET/PUT/DELETE/POST /api/sketches/:id
 * (Merged from api/sketches/[id].js)
 */
async function handleSingleSketch(req, res, request, sketchId) {
  console.debug(`[API /api/sketches/${sketchId}] ${req.method} request started`);

  try {
    if (!sketchId || sketchId === 'sketches') {
      return res.status(400).json({ error: 'Sketch ID is required' });
    }

    // Validate UUID format
    if (!validateUUID(sketchId)) {
      return res.status(400).json({ error: 'Invalid sketch ID format' });
    }

    // Initialize database
    await ensureDb();

    // Verify authentication
    const { userId, error: authError, user: authUser } = await verifyAuth(request);
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    if (req.method === 'GET') {
      // Get user info to check role and organization
      const username = authUser?.name || null;
      const email = authUser?.email || null;
      const userRecord = await getOrCreateUser(userId, { username, email });
      const userRole = userRecord?.role || 'user';
      const userOrgId = userRecord?.organization_id;

      let sketch;
      let isOwner = false;

      // Role-based access:
      // - super_admin: can view any sketch
      // - admin: can view sketches from their organization
      // - user: can only view their own sketches
      if (userRole === 'super_admin') {
        sketch = await getSketchByIdAdmin(sketchId);
        isOwner = sketch?.user_id === userId;
      } else if (userRole === 'admin' && userOrgId) {
        sketch = await getSketchByIdAdmin(sketchId);
        // Admins can only access sketches from users in their organization
        if (sketch && sketch.owner_organization_id !== userOrgId) {
          sketch = null; // Not authorized
        }
        isOwner = sketch?.user_id === userId;
      } else {
        // Regular users can only see their own sketches
        sketch = await getSketchById(sketchId, userId);
        isOwner = true;
      }

      if (!sketch) {
        return res.status(404).json({ error: 'Sketch not found' });
      }

      // Check lock status
      const lockStatus = await checkSketchLock(sketchId);

      const transformed = {
        id: sketch.id,
        name: sketch.name,
        creationDate: sketch.creation_date,
        createdBy: sketch.created_by,
        lastEditedBy: sketch.last_edited_by,
        createdAt: sketch.created_at,
        updatedAt: sketch.updated_at,
        version: sketch.version ?? 0,
        nodes: sketch.nodes || [],
        edges: sketch.edges || [],
        adminConfig: sketch.admin_config || {},
        projectId: sketch.project_id,
        snapshotInputFlowConfig: sketch.snapshot_input_flow_config || {},
        // Include owner info and access level
        ownerId: sketch.user_id,
        ownerUsername: sketch.owner_username || null,
        ownerEmail: sketch.owner_email || null,
        isOwner: isOwner,
        // Include lock status
        lock: {
          isLocked: lockStatus.isLocked || false,
          lockedBy: lockStatus.lockedBy || null,
          lockedAt: lockStatus.lockedAt || null,
          lockExpiresAt: lockStatus.lockExpiresAt || null,
          canEdit: !lockStatus.isLocked || lockStatus.lockedBy === userId,
        },
      };

      return res.status(200).json({ sketch: transformed });
    }

    if (req.method === 'POST') {
      // Handle lock operations
      const body = await parseBody(request);
      const action = body.action;

      if (!action) {
        return res.status(400).json({ error: 'Action is required (lock, unlock, refresh, forceUnlock)' });
      }

      // Get user info and verify access to sketch
      const username = authUser?.name || authUser?.email || userId;
      const userRecord = await getOrCreateUser(userId, { username: authUser?.name, email: authUser?.email });
      const userRole = userRecord?.role || 'user';
      const userOrgId = userRecord?.organization_id;

      // SECURITY FIX: Verify user has access to this sketch before lock operations
      if (action !== 'forceUnlock') {
        let hasAccess = false;
        if (userRole === 'super_admin') {
          hasAccess = true;
        } else if (userRole === 'admin' && userOrgId) {
          const sketch = await getSketchByIdAdmin(sketchId);
          hasAccess = sketch && sketch.owner_organization_id === userOrgId;
        } else {
          const sketch = await getSketchById(sketchId, userId);
          hasAccess = !!sketch;
        }
        if (!hasAccess) {
          return res.status(404).json({ error: 'Sketch not found' });
        }
      }

      switch (action) {
        case 'lock': {
          const result = await acquireSketchLock(sketchId, userId, username);
          if (result.success) {
            console.debug(`[API /api/sketches/${sketchId}] Lock acquired by ${userId}`);
            return res.status(200).json({ success: true, lock: result });
          } else {
            console.warn(`[API /api/sketches/${sketchId}] Lock failed: ${result.message}`);
            return res.status(409).json({
              error: result.message,
              lock: {
                lockedBy: result.lockedBy,
                lockedAt: result.lockedAt,
                lockExpiresAt: result.lockExpiresAt
              }
            });
          }
        }

        case 'unlock': {
          const result = await releaseSketchLock(sketchId, userId);
          console.debug(`[API /api/sketches/${sketchId}] Lock released by ${userId}`);
          return res.status(200).json({ success: result.success, message: result.message });
        }

        case 'refresh': {
          const result = await refreshSketchLock(sketchId, userId);
          if (result.success) {
            return res.status(200).json({ success: true, lockExpiresAt: result.lockExpiresAt });
          } else {
            return res.status(400).json({ success: false, message: result.message });
          }
        }

        case 'forceUnlock': {
          if (userRole !== 'admin' && userRole !== 'super_admin') {
            return res.status(403).json({ error: 'Only admins can force unlock sketches' });
          }
          // SECURITY FIX: Verify admin has access to this sketch's organization
          if (userRole === 'admin' && userOrgId) {
            const sketch = await getSketchByIdAdmin(sketchId);
            if (!sketch || sketch.owner_organization_id !== userOrgId) {
              return res.status(404).json({ error: 'Sketch not found' });
            }
          }

          const result = await forceReleaseSketchLock(sketchId);
          console.debug(`[API /api/sketches/${sketchId}] Lock force released by admin ${userId}`);
          return res.status(200).json({ success: result.success, message: result.message });
        }

        default:
          return res.status(400).json({ error: 'Unknown action. Use: lock, unlock, refresh, forceUnlock' });
      }
    }

    if (req.method === 'PUT') {
      const body = await parseBody(request);

      // Check lock status before allowing update
      const lockStatus = await checkSketchLock(sketchId);
      if (lockStatus.isLocked && lockStatus.lockedBy !== userId) {
        console.warn(`[API /api/sketches/${sketchId}] Update blocked - locked by ${lockStatus.lockedBy}`);
        return res.status(409).json({
          error: 'Sketch is locked by another user',
          lock: {
            lockedBy: lockStatus.lockedBy,
            lockedAt: lockStatus.lockedAt,
            lockExpiresAt: lockStatus.lockExpiresAt
          }
        });
      }

      // Validate input
      const validationErrors = validateSketchInput(body);
      if (validationErrors) {
        console.warn(`[API /api/sketches/${sketchId}] Validation failed:`, validationErrors);
        console.warn(`[API /api/sketches/${sketchId}] Request body summary:`, {
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

      // If projectId is being changed, get the new project's input flow config
      let snapshotInputFlowConfig = body.snapshotInputFlowConfig;
      if (body.projectId !== undefined && body.updateInputFlowSnapshot) {
        if (body.projectId) {
          const project = await getProjectById(body.projectId);
          if (project) {
            snapshotInputFlowConfig = project.input_flow_config || {};
          }
        } else {
          // If project is being removed, keep the existing snapshot or clear it
          snapshotInputFlowConfig = snapshotInputFlowConfig || {};
        }
      }

      const updated = await updateSketch(sketchId, userId, {
        name: body.name,
        creationDate: body.creationDate,
        nodes: body.nodes,
        edges: body.edges,
        adminConfig: body.adminConfig,
        lastEditedBy: body.lastEditedBy,
        projectId: body.projectId,
        snapshotInputFlowConfig: snapshotInputFlowConfig,
        clientUpdatedAt: body.clientUpdatedAt || null,
        clientVersion: body.clientVersion != null ? body.clientVersion : null,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Sketch not found' });
      }

      // Atomic lock conflict: another user acquired the lock between our check and update
      if (updated.lockConflict) {
        console.warn(`[API /api/sketches/${sketchId}] Update blocked atomically - locked by ${updated.lockedBy}`);
        return res.status(409).json({
          error: 'Sketch is locked by another user',
          lock: {
            lockedBy: updated.lockedBy,
            lockExpiresAt: updated.lockExpiresAt,
          }
        });
      }

      // Optimistic-lock conflict: another process updated the sketch since the client
      // last fetched it (e.g. a direct DB coordinate fix). Return 409 with current data
      // so the client can refresh its local updatedAt and retry.
      if (updated.conflict) {
        const current = updated.current;
        const currentTransformed = {
          id: current.id,
          name: current.name,
          creationDate: current.creation_date,
          createdBy: current.created_by,
          lastEditedBy: current.last_edited_by,
          createdAt: current.created_at,
          updatedAt: current.updated_at,
          version: current.version ?? 0,
          nodes: current.nodes || [],
          edges: current.edges || [],
          adminConfig: current.admin_config || {},
          projectId: current.project_id,
          snapshotInputFlowConfig: current.snapshot_input_flow_config || {},
        };
        console.warn(`[API /api/sketches/${sketchId}] Version conflict: client had v${body.clientVersion ?? 'none'} (updatedAt=${body.clientUpdatedAt}), DB has v${current.version ?? 0} (updatedAt=${current.updated_at})`);
        return res.status(409).json({
          error: 'Sketch was updated by another process. Retry with the current version.',
          currentSketch: currentTransformed,
        });
      }

      const transformed = {
        id: updated.id,
        name: updated.name,
        creationDate: updated.creation_date,
        createdBy: updated.created_by,
        lastEditedBy: updated.last_edited_by,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        version: updated.version ?? 0,
        nodes: updated.nodes || [],
        edges: updated.edges || [],
        adminConfig: updated.admin_config || {},
        projectId: updated.project_id,
        snapshotInputFlowConfig: updated.snapshot_input_flow_config || {},
      };

      console.debug(`[API /api/sketches/${sketchId}] Updated sketch (v${transformed.version})`);
      return res.status(200).json({ sketch: transformed });
    }

    if (req.method === 'DELETE') {
      const deleted = await deleteSketch(sketchId, userId);

      if (!deleted) {
        return res.status(404).json({ error: 'Sketch not found' });
      }

      console.debug(`[API /api/sketches/${sketchId}] Deleted sketch`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return handleApiError(error, res, `[API /api/sketches/${sketchId}]`);
  }
}
