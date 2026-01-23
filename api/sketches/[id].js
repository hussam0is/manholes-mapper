/**
 * API Route: /api/sketches/[id]
 * 
 * GET    - Get a single sketch by ID
 * PUT    - Update a sketch
 * DELETE - Delete a sketch
 * 
 * Note: Uses standard Node.js (req, res) signature for better compatibility with vercel dev.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { getSketchById, updateSketch, deleteSketch, ensureDb, getProjectById } from '../_lib/db.js';
import { validateSketchInput, validateUUID } from '../_lib/validators.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Polyfill for helper functions that expect Web API Request
  const request = req; 
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  // Extract sketch ID from URL
  const urlPath = req.url;
  const pathParts = (urlPath || '').split('/');
  const sketchId = pathParts[pathParts.length - 1].split('?')[0];

  console.log(`[API /api/sketches/${sketchId}] ${req.method} request started`);

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
    const { userId, error: authError } = await verifyAuth(request);
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    if (req.method === 'GET') {
      const sketch = await getSketchById(sketchId, userId);
      
      if (!sketch) {
        return res.status(404).json({ error: 'Sketch not found' });
      }
      
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
      
      return res.status(200).json({ sketch: transformed });
    }

    if (req.method === 'PUT') {
      const body = await parseBody(request);
      
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
      });
      
      if (!updated) {
        return res.status(404).json({ error: 'Sketch not found' });
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
      
      console.log(`[API /api/sketches/${sketchId}] Updated sketch`);
      return res.status(200).json({ sketch: transformed });
    }

    if (req.method === 'DELETE') {
      const deleted = await deleteSketch(sketchId, userId);
      
      if (!deleted) {
        return res.status(404).json({ error: 'Sketch not found' });
      }
      
      console.log(`[API /api/sketches/${sketchId}] Deleted sketch`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(`[API /api/sketches/${sketchId}] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
