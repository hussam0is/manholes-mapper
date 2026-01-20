/**
 * API Route: /api/sketches
 * 
 * GET  - List all sketches for authenticated user
 * POST - Create a new sketch
 * 
 * Note: Uses standard Node.js (req, res) signature for better compatibility with vercel dev.
 */

import { verifyAuth, parseBody, sanitizeErrorMessage } from '../_lib/auth.js';
import { getSketchesByUser, createSketch, ensureDb } from '../_lib/db.js';
import { validateSketchInput } from '../_lib/validators.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Polyfill for helper functions that expect Web API Request
  const request = req; 
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  console.log(`[API /api/sketches] ${req.method} request started`);
  
  // Apply rate limiting
  if (applyRateLimit(req, res)) {
    return; // Rate limited, response already sent
  }
  
  try {
    // Initialize database
    await ensureDb();

    // Verify authentication
    const { userId, error: authError } = await verifyAuth(request);
    
    if (authError) {
      console.warn(`[API /api/sketches] Auth failed: ${authError}`);
      return res.status(401).json({ error: authError });
    }

    if (req.method === 'GET') {
      const sketches = await getSketchesByUser(userId);
      console.log(`[API /api/sketches] Fetched ${sketches?.length} sketches for ${userId}`);
      
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
        });
        return res.status(400).json({ error: 'Validation failed', details: validationErrors });
      }
      
      const sketch = await createSketch(userId, {
        name: body.name,
        creationDate: body.creationDate,
        nodes: body.nodes || [],
        edges: body.edges || [],
        adminConfig: body.adminConfig || {},
        createdBy: body.createdBy,
        lastEditedBy: body.lastEditedBy,
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
      };
      
      console.log(`[API /api/sketches] Created sketch ${transformed.id} for ${userId}`);
      return res.status(201).json({ sketch: transformed });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(`[API /api/sketches] Error:`, error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
}
