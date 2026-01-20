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
  // Sketches table
  await sql`
    CREATE TABLE IF NOT EXISTS sketches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      name TEXT,
      creation_date TIMESTAMPTZ,
      nodes JSONB DEFAULT '[]'::jsonb,
      edges JSONB DEFAULT '[]'::jsonb,
      admin_config JSONB DEFAULT '{}'::jsonb,
      created_by TEXT,
      last_edited_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Migration: Add new columns if they don't exist
  await sql`ALTER TABLE sketches ADD COLUMN IF NOT EXISTS created_by TEXT`;
  await sql`ALTER TABLE sketches ADD COLUMN IF NOT EXISTS last_edited_by TEXT`;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sketches_user_id ON sketches(user_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sketches_updated_at ON sketches(updated_at DESC)
  `;

  // Organizations table
  await sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Users table with roles
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      clerk_id TEXT PRIMARY KEY,
      clerk_username TEXT,
      email TEXT,
      role TEXT DEFAULT 'user',
      organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)
  `;

  // User features table
  await sql`
    CREATE TABLE IF NOT EXISTS user_features (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      feature_key TEXT NOT NULL,
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(target_type, target_id, feature_key)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_user_features_target ON user_features(target_type, target_id)
  `;

  // Trigger to auto-update updated_at timestamp
  await sql`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql'
  `;

  await sql`
    DROP TRIGGER IF EXISTS update_sketches_updated_at ON sketches
  `;
  await sql`
    CREATE TRIGGER update_sketches_updated_at
        BEFORE UPDATE ON sketches
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
  `;

  await sql`
    DROP TRIGGER IF EXISTS update_users_updated_at ON users
  `;
  await sql`
    CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
  `;
}

/**
 * Ensure database is initialized.
 */
export async function ensureDb() {
  if (dbInitializationPromise) return dbInitializationPromise;

  dbInitializationPromise = (async () => {
    try {
      await initializeDatabase();
    } catch (err) {
      dbInitializationPromise = null;
      throw err;
    }
  })();

  return dbInitializationPromise;
}

/**
 * Get all sketches for a user
 */
export async function getSketchesByUser(userId) {
  const result = await sql`
    SELECT id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by, created_at, updated_at
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
    SELECT id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by, created_at, updated_at
    FROM sketches
    WHERE id = ${sketchId} AND user_id = ${userId}
  `;
  return result.rows[0] || null;
}

/**
 * Create a new sketch
 */
export async function createSketch(userId, sketch) {
  const { name, creationDate, nodes, edges, adminConfig, createdBy, lastEditedBy } = sketch;
  
  const result = await sql`
    INSERT INTO sketches (user_id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by)
    VALUES (
      ${userId},
      ${name || null},
      ${creationDate || null},
      ${JSON.stringify(nodes || [])}::jsonb,
      ${JSON.stringify(edges || [])}::jsonb,
      ${JSON.stringify(adminConfig || {})}::jsonb,
      ${createdBy || null},
      ${lastEditedBy || null}
    )
    RETURNING id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by, created_at, updated_at
  `;
  
  return result.rows[0];
}

/**
 * Update an existing sketch
 */
export async function updateSketch(sketchId, userId, updates) {
  const { name, creationDate, nodes, edges, adminConfig, lastEditedBy } = updates;
  
  const result = await sql`
    UPDATE sketches
    SET
      name = COALESCE(${name}, name),
      creation_date = COALESCE(${creationDate}, creation_date),
      nodes = COALESCE(${nodes != null ? JSON.stringify(nodes) : null}::jsonb, nodes),
      edges = COALESCE(${edges != null ? JSON.stringify(edges) : null}::jsonb, edges),
      admin_config = COALESCE(${adminConfig != null ? JSON.stringify(adminConfig) : null}::jsonb, admin_config),
      last_edited_by = COALESCE(${lastEditedBy}, last_edited_by),
      updated_at = NOW()
    WHERE id = ${sketchId} AND user_id = ${userId}
    RETURNING id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by, created_at, updated_at
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

// ============================================
// User Management Functions
// ============================================

/**
 * Get or create a user record
 * @param {string} clerkId - Clerk user ID
 * @param {Object} userData - User data from Clerk (username, email)
 * @returns {Object} User record
 */
export async function getOrCreateUser(clerkId, userData = {}) {
  // First, try to get existing user
  let result = await sql`
    SELECT clerk_id, clerk_username, email, role, organization_id, created_at, updated_at
    FROM users
    WHERE clerk_id = ${clerkId}
  `;
  
  if (result.rows[0]) {
    return result.rows[0];
  }
  
  // Create new user
  const { username, email } = userData;
  
  // SECURITY: Use environment variable to designate initial super admin by Clerk ID
  // This is more secure than checking username which could be spoofed
  const INITIAL_SUPER_ADMIN_CLERK_ID = process.env.INITIAL_SUPER_ADMIN_CLERK_ID;
  const isSuperAdmin = INITIAL_SUPER_ADMIN_CLERK_ID && clerkId === INITIAL_SUPER_ADMIN_CLERK_ID;
  const role = isSuperAdmin ? 'super_admin' : 'user';
  
  result = await sql`
    INSERT INTO users (clerk_id, clerk_username, email, role)
    VALUES (${clerkId}, ${username || null}, ${email || null}, ${role})
    ON CONFLICT (clerk_id) DO UPDATE SET
      clerk_username = COALESCE(EXCLUDED.clerk_username, users.clerk_username),
      email = COALESCE(EXCLUDED.email, users.email),
      updated_at = NOW()
    RETURNING clerk_id, clerk_username, email, role, organization_id, created_at, updated_at
  `;
  
  return result.rows[0];
}

/**
 * Get a user by Clerk ID
 */
export async function getUserByClerkId(clerkId) {
  const result = await sql`
    SELECT clerk_id, clerk_username, email, role, organization_id, created_at, updated_at
    FROM users
    WHERE clerk_id = ${clerkId}
  `;
  return result.rows[0] || null;
}

/**
 * Get all users (for super admin)
 */
export async function getAllUsers() {
  const result = await sql`
    SELECT u.clerk_id, u.clerk_username, u.email, u.role, u.organization_id, 
           u.created_at, u.updated_at, o.name as organization_name
    FROM users u
    LEFT JOIN organizations o ON u.organization_id = o.id
    ORDER BY u.created_at DESC
  `;
  return result.rows;
}

/**
 * Get users by organization (for org admin)
 */
export async function getUsersByOrganization(organizationId) {
  const result = await sql`
    SELECT u.clerk_id, u.clerk_username, u.email, u.role, u.organization_id,
           u.created_at, u.updated_at, o.name as organization_name
    FROM users u
    LEFT JOIN organizations o ON u.organization_id = o.id
    WHERE u.organization_id = ${organizationId}
    ORDER BY u.created_at DESC
  `;
  return result.rows;
}

/**
 * Update a user's role and/or organization
 */
export async function updateUser(clerkId, updates) {
  const { role, organizationId } = updates;
  
  const result = await sql`
    UPDATE users
    SET
      role = COALESCE(${role}, role),
      organization_id = ${organizationId === undefined ? null : organizationId},
      updated_at = NOW()
    WHERE clerk_id = ${clerkId}
    RETURNING clerk_id, clerk_username, email, role, organization_id, created_at, updated_at
  `;
  
  return result.rows[0] || null;
}

// ============================================
// Organization Functions
// ============================================

/**
 * Get all organizations
 */
export async function getAllOrganizations() {
  const result = await sql`
    SELECT o.id, o.name, o.created_at,
           COUNT(u.clerk_id) as user_count
    FROM organizations o
    LEFT JOIN users u ON o.id = u.organization_id
    GROUP BY o.id, o.name, o.created_at
    ORDER BY o.name
  `;
  return result.rows;
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(orgId) {
  const result = await sql`
    SELECT id, name, created_at
    FROM organizations
    WHERE id = ${orgId}
  `;
  return result.rows[0] || null;
}

/**
 * Create a new organization
 */
export async function createOrganization(name) {
  const result = await sql`
    INSERT INTO organizations (name)
    VALUES (${name})
    RETURNING id, name, created_at
  `;
  return result.rows[0];
}

/**
 * Update an organization
 */
export async function updateOrganization(orgId, updates) {
  const { name } = updates;
  
  const result = await sql`
    UPDATE organizations
    SET name = COALESCE(${name}, name)
    WHERE id = ${orgId}
    RETURNING id, name, created_at
  `;
  
  return result.rows[0] || null;
}

/**
 * Delete an organization
 */
export async function deleteOrganization(orgId) {
  // First, remove organization from all users
  await sql`
    UPDATE users SET organization_id = NULL WHERE organization_id = ${orgId}
  `;
  
  // Delete the organization
  const result = await sql`
    DELETE FROM organizations
    WHERE id = ${orgId}
    RETURNING id
  `;
  
  return result.rows.length > 0;
}

// ============================================
// Feature Permission Functions
// ============================================

/**
 * Default features that are enabled for all users
 */
export const DEFAULT_FEATURES = [
  'export_csv',
  'export_sketch',
  'admin_settings',
  'finish_workday',
  'node_types',
  'edge_types'
];

/**
 * Get feature settings for a target (user or organization)
 */
export async function getFeatures(targetType, targetId) {
  const result = await sql`
    SELECT feature_key, enabled
    FROM user_features
    WHERE target_type = ${targetType} AND target_id = ${targetId}
  `;
  
  // Build features object with defaults
  const features = {};
  DEFAULT_FEATURES.forEach(key => {
    features[key] = true; // Default enabled
  });
  
  // Override with stored settings
  result.rows.forEach(row => {
    features[row.feature_key] = row.enabled;
  });
  
  return features;
}

/**
 * Get effective features for a user (considers both user and org settings)
 * Org settings are applied first, then user-specific overrides
 */
export async function getEffectiveFeatures(clerkId, organizationId) {
  const features = {};
  DEFAULT_FEATURES.forEach(key => {
    features[key] = true;
  });
  
  // Apply organization settings first
  if (organizationId) {
    const orgResult = await sql`
      SELECT feature_key, enabled
      FROM user_features
      WHERE target_type = 'organization' AND target_id = ${organizationId}
    `;
    orgResult.rows.forEach(row => {
      features[row.feature_key] = row.enabled;
    });
  }
  
  // Apply user-specific settings (override org)
  const userResult = await sql`
    SELECT feature_key, enabled
    FROM user_features
    WHERE target_type = 'user' AND target_id = ${clerkId}
  `;
  userResult.rows.forEach(row => {
    features[row.feature_key] = row.enabled;
  });
  
  return features;
}

/**
 * Set a feature for a target
 */
export async function setFeature(targetType, targetId, featureKey, enabled) {
  const result = await sql`
    INSERT INTO user_features (target_type, target_id, feature_key, enabled)
    VALUES (${targetType}, ${targetId}, ${featureKey}, ${enabled})
    ON CONFLICT (target_type, target_id, feature_key) DO UPDATE SET
      enabled = ${enabled}
    RETURNING id, target_type, target_id, feature_key, enabled
  `;
  return result.rows[0];
}

/**
 * Set multiple features at once
 */
export async function setFeatures(targetType, targetId, featureSettings) {
  const results = [];
  for (const [key, enabled] of Object.entries(featureSettings)) {
    const result = await setFeature(targetType, targetId, key, enabled);
    results.push(result);
  }
  return results;
}

/**
 * Delete a feature setting (revert to default)
 */
export async function deleteFeature(targetType, targetId, featureKey) {
  const result = await sql`
    DELETE FROM user_features
    WHERE target_type = ${targetType} AND target_id = ${targetId} AND feature_key = ${featureKey}
    RETURNING id
  `;
  return result.rows.length > 0;
}
