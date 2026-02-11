/**
 * API Route: /api/sketches
 * 
 * GET  - List all sketches for authenticated user
 * POST - Create a new sketch
 * 
 * Note: Uses standard Node.js (req, res) signature for better compatibility with vercel dev.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { 
  getSketchesByUser, 
  getAllSketches, 
  getSketchesByOrganization, 
  createSketch, 
  ensureDb, 
  getProjectById,
  getOrCreateUser
} from '../_lib/db.js';
import { validateSketchInput } from '../_lib/validators.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
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
      
      let sketches;
      
      // Role-based sketch access:
      // - super_admin: sees all sketches
      // - admin: sees all sketches in their organization
      // - user: sees only their own sketches
      if (userRole === 'super_admin') {
        sketches = await getAllSketches();
        console.debug(`[API /api/sketches] Super admin ${userId} fetched ${sketches?.length} total sketches`);
      } else if (userRole === 'admin' && organizationId) {
        sketches = await getSketchesByOrganization(organizationId);
        console.debug(`[API /api/sketches] Admin ${userId} fetched ${sketches?.length} sketches for org ${organizationId}`);
      } else {
        sketches = await getSketchesByUser(userId);
        console.debug(`[API /api/sketches] User ${userId} fetched ${sketches?.length} own sketches`);
      }
      
      const transformed = (sketches || []).map(row => ({
        id: row.id,
        name: row.name,
        creationDate: row.creation_date,
        createdBy: row.created_by,
        lastEditedBy: row.last_edited_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        nodes: row.nodes || [],
        edges: row.edges || [],
        adminConfig: row.admin_config || {},
        projectId: row.project_id,
        snapshotInputFlowConfig: row.snapshot_input_flow_config || {},
        // Include owner info for admin views
        ownerId: row.user_id,
        ownerUsername: row.owner_username || null,
        ownerEmail: row.owner_email || null,
        // Flag to indicate if this sketch belongs to the current user
        isOwner: row.user_id === userId,
      }));
      
      return res.status(200).json({ sketches: transformed });
    }

    if (req.method === 'POST') {
      const body = await parseBody(request);
      
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
