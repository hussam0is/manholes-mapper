/**
 * API Route: /api/sketches
 * 
 * GET  - List all sketches for authenticated user
 * POST - Create a new sketch
 */

import { verifyAuth, parseBody, unauthorizedResponse, jsonResponse, errorResponse } from '../_lib/auth.js';
import { getSketchesByUser, createSketch, initializeDatabase } from '../_lib/db.js';

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

    const method = request.method;
    if (method === 'GET') {
      // List all sketches for the user
      const sketches = await getSketchesByUser(userId);
      
      // Transform database rows to match frontend format
      const transformed = (sketches || []).map(row => ({
        id: row.id,
        name: row.name,
        creationDate: row.creation_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        nodes: row.nodes || [],
        edges: row.edges || [],
        adminConfig: row.admin_config || {},
      }));
      
      return jsonResponse({ sketches: transformed });
    }

    if (method === 'POST') {
      // Create a new sketch
      const body = await parseBody(request);
      
      const sketch = await createSketch(userId, {
        name: body.name,
        creationDate: body.creationDate,
        nodes: body.nodes || [],
        edges: body.edges || [],
        adminConfig: body.adminConfig || {},
      });
      
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
      
      return jsonResponse({ sketch: transformed }, 201);
    }

    // Method not allowed
    return errorResponse('Method not allowed', 405);
  } catch (error) {
    console.error('API error:', error);
    return errorResponse(error.message || 'Internal server error', 500);
  }
}
