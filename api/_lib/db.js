/**
 * Database connection helper for Vercel Postgres
 * 
 * Uses @vercel/postgres for serverless-friendly connection pooling.
 */

import { sql } from '@vercel/postgres';

export { sql };

// Centralized database initialization promise - shared across all API routes
let dbInitializationPromise = null;

/**
 * Initialize database tables if they don't exist.
 */
async function initializeDatabase() {
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

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sketches_user_id ON sketches(user_id)
  `;
}

/**
 * Ensure database is initialized.
 */
export async function ensureDb() {
  if (!dbInitializationPromise) {
    dbInitializationPromise = initializeDatabase().catch(err => {
      dbInitializationPromise = null; 
      throw err;
    });
  }
  return dbInitializationPromise;
}

/**
 * Get all sketches for a user
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
 */
export async function updateSketch(sketchId, userId, updates) {
  const { name, creationDate, nodes, edges, adminConfig } = updates;
  
  const result = await sql`
    UPDATE sketches
    SET
      name = COALESCE(${name}, name),
      creation_date = COALESCE(${creationDate}, creation_date),
      nodes = COALESCE(${nodes != null ? JSON.stringify(nodes) : null}::jsonb, nodes),
      edges = COALESCE(${edges != null ? JSON.stringify(edges) : null}::jsonb, edges),
      admin_config = COALESCE(${adminConfig != null ? JSON.stringify(adminConfig) : null}::jsonb, admin_config),
      updated_at = NOW()
    WHERE id = ${sketchId} AND user_id = ${userId}
    RETURNING id, name, creation_date, nodes, edges, admin_config, created_at, updated_at
  `;
  
  return result.rows[0] || null;
}

/**
 * Delete a sketch
 */
export async function deleteSketch(sketchId, userId) {
  const result = await sql`
    DELETE FROM sketches
    WHERE id = ${sketchId} AND user_id = ${userId}
    RETURNING id
  `;
  
  return result.rows.length > 0;
}
