/**
 * API Route: /api/sketches/[id]
 * 
 * GET    - Get a single sketch by ID (includes lock status)
 * PUT    - Update a sketch
 * DELETE - Delete a sketch
 * POST   - Lock operations (action=lock, action=unlock, action=refresh)
 * 
 * Note: Uses standard Node.js (req, res) signature for better compatibility with vercel dev.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { 
  getSketchById, 
  getSketchByIdAdmin, 
  updateSketch, 
  deleteSketch, 
  ensureDb, 
  getProjectById, 
  getOrCreateUser,
  acquireSketchLock,
  releaseSketchLock,
  refreshSketchLock,
  checkSketchLock,
  forceReleaseSketchLock
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

  // Extract sketch ID from URL
  const urlPath = req.url;
  const pathParts = (urlPath || '').split('/');
  const sketchId = pathParts[pathParts.length - 1].split('?')[0];

  console.debug(`[API /api/sketches/${sketchId}] ${req.method} request started`);

  // Apply rate limiting
  if (applyRateLimit(req, res)) {
    return; // Rate limited, response already sent
  }

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
      
      // Get user info
      const username = authUser?.name || authUser?.email || userId;
      
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
          // Only allow admins to force unlock
          const userRecord = await getOrCreateUser(userId, { username: authUser?.name, email: authUser?.email });
          const userRole = userRecord?.role || 'user';
          
          if (userRole !== 'admin' && userRole !== 'super_admin') {
            return res.status(403).json({ error: 'Only admins can force unlock sketches' });
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
      });

      if (!updated) {
        return res.status(404).json({ error: 'Sketch not found' });
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
          nodes: current.nodes || [],
          edges: current.edges || [],
          adminConfig: current.admin_config || {},
          projectId: current.project_id,
          snapshotInputFlowConfig: current.snapshot_input_flow_config || {},
        };
        console.warn(`[API /api/sketches/${sketchId}] Version conflict: client had ${body.clientUpdatedAt}, DB has ${current.updated_at}`);
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
        nodes: updated.nodes || [],
        edges: updated.edges || [],
        adminConfig: updated.admin_config || {},
        projectId: updated.project_id,
        snapshotInputFlowConfig: updated.snapshot_input_flow_config || {},
      };
      
      console.debug(`[API /api/sketches/${sketchId}] Updated sketch`);
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
    console.error(`[API /api/sketches/${sketchId}] Error:`, error.message);
    
    // Check for specific error types
    if (error.message?.includes('Database connection not configured')) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
