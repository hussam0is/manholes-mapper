/**
 * API Route: /api/sketches/[id]
 * 
 * GET    - Get a single sketch by ID
 * PUT    - Update a sketch
 * DELETE - Delete a sketch
 */

import { verifyAuth, unauthorizedResponse, jsonResponse, errorResponse } from '../_lib/auth.js';
import { getSketchById, updateSketch, deleteSketch } from '../_lib/db.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Verify authentication
  const { userId, error: authError } = await verifyAuth(request);
  if (authError) {
    return unauthorizedResponse(authError);
  }

  // Extract sketch ID from URL
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const sketchId = pathParts[pathParts.length - 1];

  if (!sketchId || sketchId === 'sketches') {
    return errorResponse('Sketch ID is required', 400);
  }

  const method = request.method;

  try {
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
      const body = await request.json();
      
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
