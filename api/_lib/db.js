/**
 * Database connection helper for Vercel Postgres
 * 
 * Uses @vercel/postgres for serverless-friendly connection pooling.
 */

import { sql } from '@vercel/postgres';

export { sql };

/**
 * Initialize database tables if they don't exist.
 * Call this once during deployment or first request.
 */
export async function initializeDatabase() {
  try {
    // Create sketches table
    await sql`
      CREATE TABLE IF NOT EXISTS sketches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        name TEXT,
        creation_date TIMESTAMPTZ,
        nodes JSONB DEFAULT '[]'::jsonb,
        edges JSONB DEFAULT '[]'::jsonb,
        admin_config JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Create index on user_id for faster queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_sketches_user_id ON sketches(user_id)
    `;

    return { success: true };
  } catch (error) {
    console.error('Failed to initialize database:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all sketches for a user
 * @param {string} userId - Clerk user ID
 * @returns {Promise<Array>} Array of sketches
 */
export async function getSketchesByUser(userId) {
  const result = await sql`
    SELECT id, name, creation_date, nodes, edges, admin_config, created_at, updated_at
    FROM sketches
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return result.rows;
}

/**
 * Get a single sketch by ID
 * @param {string} sketchId - Sketch UUID
 * @param {string} userId - Clerk user ID (for authorization)
 * @returns {Promise<Object|null>} Sketch or null if not found
 */
export async function getSketchById(sketchId, userId) {
  const result = await sql`
    SELECT id, name, creation_date, nodes, edges, admin_config, created_at, updated_at
    FROM sketches
    WHERE id = ${sketchId} AND user_id = ${userId}
  `;
  return result.rows[0] || null;
}

/**
 * Create a new sketch
 * @param {string} userId - Clerk user ID
 * @param {Object} sketch - Sketch data
 * @returns {Promise<Object>} Created sketch
 */
export async function createSketch(userId, sketch) {
  const { name, creationDate, nodes, edges, adminConfig } = sketch;
  
  const result = await sql`
    INSERT INTO sketches (user_id, name, creation_date, nodes, edges, admin_config)
    VALUES (
      ${userId},
      ${name || null},
      ${creationDate || null},
      ${JSON.stringify(nodes || [])}::jsonb,
      ${JSON.stringify(edges || [])}::jsonb,
      ${JSON.stringify(adminConfig || {})}::jsonb
    )
    RETURNING id, name, creation_date, nodes, edges, admin_config, created_at, updated_at
  `;
  
  return result.rows[0];
}

/**
 * Update an existing sketch
 * @param {string} sketchId - Sketch UUID
 * @param {string} userId - Clerk user ID (for authorization)
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated sketch or null if not found
 */
export async function updateSketch(sketchId, userId, updates) {
  const { name, creationDate, nodes, edges, adminConfig } = updates;
  
  const result = await sql`
    UPDATE sketches
    SET
      name = COALESCE(${name}, name),
      creation_date = COALESCE(${creationDate}, creation_date),
      nodes = COALESCE(${nodes ? JSON.stringify(nodes) : null}::jsonb, nodes),
      edges = COALESCE(${edges ? JSON.stringify(edges) : null}::jsonb, edges),
      admin_config = COALESCE(${adminConfig ? JSON.stringify(adminConfig) : null}::jsonb, admin_config),
      updated_at = NOW()
    WHERE id = ${sketchId} AND user_id = ${userId}
    RETURNING id, name, creation_date, nodes, edges, admin_config, created_at, updated_at
  `;
  
  return result.rows[0] || null;
}

/**
 * Delete a sketch
 * @param {string} sketchId - Sketch UUID
 * @param {string} userId - Clerk user ID (for authorization)
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteSketch(sketchId, userId) {
  const result = await sql`
    DELETE FROM sketches
    WHERE id = ${sketchId} AND user_id = ${userId}
    RETURNING id
  `;
  
  return result.rows.length > 0;
}
