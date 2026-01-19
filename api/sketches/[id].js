/**
 * API Route: /api/sketches/[id]
 * 
 * GET    - Get a single sketch by ID
 * PUT    - Update a sketch
 * DELETE - Delete a sketch
 */

import { verifyAuth, parseBody, unauthorizedResponse, jsonResponse, errorResponse } from '../_lib/auth.js';
import { getSketchById, updateSketch, deleteSketch, initializeDatabase } from '../_lib/db.js';

// Use Edge Runtime for Web API Request/Response support
export const config = { runtime: 'edge' };

// Ensure database is initialized (runs once per cold start)
let dbInitializationPromise = null;

async function ensureDb() {
  if (!dbInitializationPromise) {
    dbInitializationPromise = initializeDatabase().catch(err => {
      dbInitializationPromise = null; // Reset promise so next request can retry
      throw err;
    });
  }
  return dbInitializationPromise;
}

export default async function handler(request) {
  try {
    // Initialize database on first request
    await ensureDb();

    // Verify authentication
    const { userId, error: authError } = await verifyAuth(request);
    if (authError) {
      return unauthorizedResponse(authError);
    }

    // Extract sketch ID from URL - handle both Web API and Node.js formats
    // Node.js: request.url is just the path like "/api/sketches/123"
    // Web API: request.url is a full URL
    const urlPath = request.url?.startsWith('http') 
      ? new URL(request.url).pathname 
      : request.url;
    const pathParts = (urlPath || '').split('/');
    const sketchId = pathParts[pathParts.length - 1];

    if (!sketchId || sketchId === 'sketches') {
      return errorResponse('Sketch ID is required', 400);
    }

    const method = request.method;

    if (method === 'GET') {
      // Get single sketch
      const sketch = await getSketchById(sketchId, userId);
      
      if (!sketch) {
        return errorResponse('Sketch not found', 404);
      }
      
      // Transform to frontend format
      const transformed = {
        id: sketch.id,
        name: sketch.name,
        creationDate: sketch.creation_date,
        createdAt: sketch.created_at,
        updatedAt: sketch.updated_at,
        nodes: sketch.nodes || [],
        edges: sketch.edges || [],
        adminConfig: sketch.admin_config || {},
      };
      
      return jsonResponse({ sketch: transformed });
    }

    if (method === 'PUT') {
      // Update sketch
      const body = await parseBody(request);
      
      const updated = await updateSketch(sketchId, userId, {
        name: body.name,
        creationDate: body.creationDate,
        nodes: body.nodes,
        edges: body.edges,
        adminConfig: body.adminConfig,
      });
      
      if (!updated) {
        return errorResponse('Sketch not found', 404);
      }
      
      // Transform to frontend format
      const transformed = {
        id: updated.id,
        name: updated.name,
        creationDate: updated.creation_date,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        nodes: updated.nodes || [],
        edges: updated.edges || [],
        adminConfig: updated.admin_config || {},
      };
      
      return jsonResponse({ sketch: transformed });
    }

    if (method === 'DELETE') {
      // Delete sketch
      const deleted = await deleteSketch(sketchId, userId);
      
      if (!deleted) {
        return errorResponse('Sketch not found', 404);
      }
      
      return jsonResponse({ success: true });
    }

    // Method not allowed
    return errorResponse('Method not allowed', 405);
  } catch (error) {
    console.error('API error:', error);
    return errorResponse('Internal server error', 500);
  }
}
