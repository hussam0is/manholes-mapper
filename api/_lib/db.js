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
  // Organizations table (must be created first - referenced by projects and users)
  await sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Projects table (must be created before sketches - referenced by sketches)
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      input_flow_config JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id)
  `;

  // Sketches table (created after projects since it references projects)
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
  
  // Migration: Add project support to sketches (now safe since projects table exists)
  await sql`ALTER TABLE sketches ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE sketches ADD COLUMN IF NOT EXISTS snapshot_input_flow_config JSONB DEFAULT '{}'::jsonb`;
  
  // Migration: Add locking support to sketches
  await sql`ALTER TABLE sketches ADD COLUMN IF NOT EXISTS locked_by TEXT`;
  await sql`ALTER TABLE sketches ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`;
  await sql`ALTER TABLE sketches ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ`;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sketches_user_id ON sketches(user_id)
  `;
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_sketches_project_id ON sketches(project_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sketches_updated_at ON sketches(updated_at DESC)
  `;

  // Users table with roles
  // Uses user_id (UUID) for Better Auth compatibility
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'user',
      organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Migration: Ensure id and username columns exist
  // This handles existing installations
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT`;
  } catch (e) {
    // Column may already exist or table has new schema
  }

  await sql`
    CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)
  `;
  
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)
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

  // Trigger for projects updated_at
  await sql`
    DROP TRIGGER IF EXISTS update_projects_updated_at ON projects
  `;
  await sql`
    CREATE TRIGGER update_projects_updated_at
        BEFORE UPDATE ON projects
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
  `;

  // Project reference layers table
  await sql`
    CREATE TABLE IF NOT EXISTS project_layers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      layer_type TEXT NOT NULL,
      geojson JSONB NOT NULL,
      style JSONB DEFAULT '{}'::jsonb,
      visible BOOLEAN DEFAULT true,
      display_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_project_layers_project ON project_layers(project_id)
  `;

  // Trigger for project_layers updated_at
  await sql`
    DROP TRIGGER IF EXISTS update_project_layers_updated_at ON project_layers
  `;
  await sql`
    CREATE TRIGGER update_project_layers_updated_at
        BEFORE UPDATE ON project_layers
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
      // Verify database connection environment variable exists
      if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
        console.error('[DB] Missing POSTGRES_URL or DATABASE_URL environment variable');
        throw new Error('Database connection not configured');
      }
      
      await initializeDatabase();
      console.log('[DB] Database initialized successfully');
    } catch (err) {
      dbInitializationPromise = null;
      console.error('[DB] Database initialization failed:', err.message);
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
    SELECT id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by, 
           project_id, snapshot_input_flow_config, created_at, updated_at
    FROM sketches
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return result.rows;
}

/**
 * Get a single sketch by ID (for owner access)
 */
export async function getSketchById(sketchId, userId) {
  const result = await sql`
    SELECT id, user_id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by,
           project_id, snapshot_input_flow_config, created_at, updated_at
    FROM sketches
    WHERE id = ${sketchId} AND user_id = ${userId}
  `;
  return result.rows[0] || null;
}

/**
 * Get a single sketch by ID with owner info (for admin access)
 * Does not filter by user_id - use for admin view only
 */
export async function getSketchByIdAdmin(sketchId) {
  const result = await sql`
    SELECT s.id, s.user_id, s.name, s.creation_date, s.nodes, s.edges, s.admin_config, 
           s.created_by, s.last_edited_by, s.project_id, s.snapshot_input_flow_config, 
           s.created_at, s.updated_at,
           u.username as owner_username, u.email as owner_email, u.organization_id as owner_organization_id
    FROM sketches s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.id = ${sketchId}
  `;
  return result.rows[0] || null;
}

// ============================================
// Sketch Locking Functions
// ============================================

// Lock duration in minutes (30 minutes default)
const LOCK_DURATION_MINUTES = 30;

/**
 * Acquire a lock on a sketch
 * @param {string} sketchId - Sketch ID
 * @param {string} userId - User ID acquiring the lock
 * @param {string} username - Username for display purposes
 * @returns {object} Lock result { success, lockedBy, lockedAt, lockExpiresAt, message }
 */
export async function acquireSketchLock(sketchId, userId, username) {
  // Check if sketch exists and get current lock status
  const checkResult = await sql`
    SELECT id, user_id, locked_by, locked_at, lock_expires_at
    FROM sketches
    WHERE id = ${sketchId}
  `;
  
  if (checkResult.rows.length === 0) {
    return { success: false, message: 'Sketch not found' };
  }
  
  const sketch = checkResult.rows[0];
  const now = new Date();
  
  // Check if locked by another user and lock hasn't expired
  if (sketch.locked_by && sketch.locked_by !== userId) {
    const lockExpires = new Date(sketch.lock_expires_at);
    if (lockExpires > now) {
      return {
        success: false,
        lockedBy: sketch.locked_by,
        lockedAt: sketch.locked_at,
        lockExpiresAt: sketch.lock_expires_at,
        message: 'Sketch is locked by another user'
      };
    }
    // Lock has expired, can be taken over
  }
  
  // Calculate lock expiration
  const lockExpiresAt = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000);
  
  // Acquire lock
  const result = await sql`
    UPDATE sketches
    SET locked_by = ${userId},
        locked_at = ${now.toISOString()}::timestamptz,
        lock_expires_at = ${lockExpiresAt.toISOString()}::timestamptz
    WHERE id = ${sketchId}
    RETURNING id, locked_by, locked_at, lock_expires_at
  `;
  
  if (result.rows.length === 0) {
    return { success: false, message: 'Failed to acquire lock' };
  }
  
  return {
    success: true,
    lockedBy: result.rows[0].locked_by,
    lockedAt: result.rows[0].locked_at,
    lockExpiresAt: result.rows[0].lock_expires_at
  };
}

/**
 * Release a lock on a sketch
 * @param {string} sketchId - Sketch ID
 * @param {string} userId - User ID releasing the lock
 * @returns {object} { success, message }
 */
export async function releaseSketchLock(sketchId, userId) {
  const result = await sql`
    UPDATE sketches
    SET locked_by = NULL,
        locked_at = NULL,
        lock_expires_at = NULL
    WHERE id = ${sketchId} AND (locked_by = ${userId} OR locked_by IS NULL)
    RETURNING id
  `;
  
  return {
    success: result.rows.length > 0,
    message: result.rows.length > 0 ? 'Lock released' : 'Could not release lock'
  };
}

/**
 * Refresh a lock's expiration time
 * @param {string} sketchId - Sketch ID
 * @param {string} userId - User ID with the lock
 * @returns {object} { success, lockExpiresAt, message }
 */
export async function refreshSketchLock(sketchId, userId) {
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000);
  
  const result = await sql`
    UPDATE sketches
    SET lock_expires_at = ${lockExpiresAt.toISOString()}::timestamptz
    WHERE id = ${sketchId} AND locked_by = ${userId}
    RETURNING id, lock_expires_at
  `;
  
  if (result.rows.length === 0) {
    return { success: false, message: 'Lock not held or sketch not found' };
  }
  
  return {
    success: true,
    lockExpiresAt: result.rows[0].lock_expires_at
  };
}

/**
 * Check lock status of a sketch
 * @param {string} sketchId - Sketch ID
 * @returns {object} { isLocked, lockedBy, lockedAt, lockExpiresAt, isExpired }
 */
export async function checkSketchLock(sketchId) {
  const result = await sql`
    SELECT locked_by, locked_at, lock_expires_at
    FROM sketches
    WHERE id = ${sketchId}
  `;
  
  if (result.rows.length === 0) {
    return { isLocked: false, message: 'Sketch not found' };
  }
  
  const sketch = result.rows[0];
  const now = new Date();
  
  if (!sketch.locked_by) {
    return { isLocked: false };
  }
  
  const lockExpires = new Date(sketch.lock_expires_at);
  const isExpired = lockExpires <= now;
  
  return {
    isLocked: !isExpired,
    lockedBy: sketch.locked_by,
    lockedAt: sketch.locked_at,
    lockExpiresAt: sketch.lock_expires_at,
    isExpired
  };
}

/**
 * Force release a lock (for admin use)
 * @param {string} sketchId - Sketch ID
 * @returns {object} { success, message }
 */
export async function forceReleaseSketchLock(sketchId) {
  const result = await sql`
    UPDATE sketches
    SET locked_by = NULL,
        locked_at = NULL,
        lock_expires_at = NULL
    WHERE id = ${sketchId}
    RETURNING id
  `;
  
  return {
    success: result.rows.length > 0,
    message: result.rows.length > 0 ? 'Lock force released' : 'Sketch not found'
  };
}

/**
 * Create a new sketch
 */
export async function createSketch(userId, sketch) {
  const { name, creationDate, nodes, edges, adminConfig, createdBy, lastEditedBy, projectId, snapshotInputFlowConfig } = sketch;
  
  const result = await sql`
    INSERT INTO sketches (user_id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by, project_id, snapshot_input_flow_config)
    VALUES (
      ${userId},
      ${name || null},
      ${creationDate || null},
      ${JSON.stringify(nodes || [])}::jsonb,
      ${JSON.stringify(edges || [])}::jsonb,
      ${JSON.stringify(adminConfig || {})}::jsonb,
      ${createdBy || null},
      ${lastEditedBy || null},
      ${projectId || null},
      ${JSON.stringify(snapshotInputFlowConfig || {})}::jsonb
    )
    RETURNING id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by, 
              project_id, snapshot_input_flow_config, created_at, updated_at
  `;
  
  return result.rows[0];
}

/**
 * Update an existing sketch
 */
export async function updateSketch(sketchId, userId, updates) {
  const { name, creationDate, nodes, edges, adminConfig, lastEditedBy, projectId, snapshotInputFlowConfig } = updates;
  
  const result = await sql`
    UPDATE sketches
    SET
      name = COALESCE(${name}, name),
      creation_date = COALESCE(${creationDate}, creation_date),
      nodes = COALESCE(${nodes != null ? JSON.stringify(nodes) : null}::jsonb, nodes),
      edges = COALESCE(${edges != null ? JSON.stringify(edges) : null}::jsonb, edges),
      admin_config = COALESCE(${adminConfig != null ? JSON.stringify(adminConfig) : null}::jsonb, admin_config),
      last_edited_by = COALESCE(${lastEditedBy}, last_edited_by),
      project_id = COALESCE(${projectId}, project_id),
      snapshot_input_flow_config = COALESCE(${snapshotInputFlowConfig != null ? JSON.stringify(snapshotInputFlowConfig) : null}::jsonb, snapshot_input_flow_config),
      updated_at = NOW()
    WHERE id = ${sketchId} AND user_id = ${userId}
    RETURNING id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by,
              project_id, snapshot_input_flow_config, created_at, updated_at
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
 * @param {string} userId - User ID from Better Auth (UUID)
 * @param {Object} userData - User data from auth session (username, email)
 * @returns {Object} User record
 */
export async function getOrCreateUser(userId, userData = {}) {
  const { username, email } = userData;
  
  // First, try to get existing user by ID or email
  let result = await sql`
    SELECT id, username, email, role, organization_id, created_at, updated_at
    FROM users
    WHERE id = ${userId} OR email = ${email}
    LIMIT 1
  `;
  
  if (result.rows[0]) {
    // Update user info if needed
    if (result.rows[0].id !== userId) {
      // User exists by email but with different ID, update the ID
      await sql`
        UPDATE users SET id = ${userId}, updated_at = NOW()
        WHERE email = ${email}
      `;
    }
    return result.rows[0];
  }
  
  // Create new user
  // SECURITY: Use environment variable to designate initial super admin by email
  const INITIAL_SUPER_ADMIN_EMAIL = process.env.INITIAL_SUPER_ADMIN_EMAIL;
  const isSuperAdmin = INITIAL_SUPER_ADMIN_EMAIL && email === INITIAL_SUPER_ADMIN_EMAIL;
  const role = isSuperAdmin ? 'super_admin' : 'user';
  
  result = await sql`
    INSERT INTO users (id, username, email, role)
    VALUES (${userId}, ${username || null}, ${email || null}, ${role})
    ON CONFLICT (id) DO UPDATE SET
      username = COALESCE(EXCLUDED.username, users.username),
      email = COALESCE(EXCLUDED.email, users.email),
      updated_at = NOW()
    RETURNING id, username, email, role, organization_id, created_at, updated_at
  `;
  
  return result.rows[0];
}

/**
 * Get a user by ID (Better Auth UUID)
 */
export async function getUserById(userId) {
  const result = await sql`
    SELECT id, username, email, role, organization_id, created_at, updated_at
    FROM users
    WHERE id = ${userId}  `;
  return result.rows[0] || null;
}


/**
 * Get all users (for super admin)
 */
export async function getAllUsers() {
  const result = await sql`
    SELECT u.id, u.username, u.email, u.role, u.organization_id, 
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
    SELECT u.id, u.username, u.email, u.role, u.organization_id,
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
export async function updateUser(userId, updates) {
  const { role, organizationId } = updates;
  
  const result = await sql`
    UPDATE users
    SET
      role = COALESCE(${role}, role),
      organization_id = ${organizationId === undefined ? null : organizationId},
      updated_at = NOW()
    WHERE id = ${userId}    RETURNING id, username, email, role, organization_id, created_at, updated_at
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
           COUNT(u.id) as user_count
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
// Project Functions
// ============================================

/**
 * Get all projects for an organization
 */
export async function getProjectsByOrganization(organizationId) {
  const result = await sql`
    SELECT p.id, p.organization_id, p.name, p.description, p.input_flow_config,
           p.created_at, p.updated_at,
           COUNT(s.id) as sketch_count
    FROM projects p
    LEFT JOIN sketches s ON p.id = s.project_id
    WHERE p.organization_id = ${organizationId}
    GROUP BY p.id, p.organization_id, p.name, p.description, p.input_flow_config, p.created_at, p.updated_at
    ORDER BY p.name
  `;
  return result.rows;
}

/**
 * Get all projects (for super admin)
 */
export async function getAllProjects() {
  const result = await sql`
    SELECT p.id, p.organization_id, p.name, p.description, p.input_flow_config,
           p.created_at, p.updated_at,
           COUNT(s.id) as sketch_count
    FROM projects p
    LEFT JOIN sketches s ON p.id = s.project_id
    GROUP BY p.id, p.organization_id, p.name, p.description, p.input_flow_config, p.created_at, p.updated_at
    ORDER BY p.name
  `;
  return result.rows;
}

/**
 * Get a single project by ID
 */
export async function getProjectById(projectId) {
  const result = await sql`
    SELECT id, organization_id, name, description, input_flow_config, created_at, updated_at
    FROM projects
    WHERE id = ${projectId}
  `;
  return result.rows[0] || null;
}

/**
 * Create a new project
 */
export async function createProject(organizationId, project) {
  const { name, description, inputFlowConfig } = project;
  
  const result = await sql`
    INSERT INTO projects (organization_id, name, description, input_flow_config)
    VALUES (
      ${organizationId},
      ${name},
      ${description || null},
      ${JSON.stringify(inputFlowConfig || {})}::jsonb
    )
    RETURNING id, organization_id, name, description, input_flow_config, created_at, updated_at
  `;
  
  return result.rows[0];
}

/**
 * Update a project
 */
export async function updateProject(projectId, updates) {
  const { name, description, inputFlowConfig } = updates;
  
  const result = await sql`
    UPDATE projects
    SET
      name = COALESCE(${name}, name),
      description = COALESCE(${description}, description),
      input_flow_config = COALESCE(${inputFlowConfig != null ? JSON.stringify(inputFlowConfig) : null}::jsonb, input_flow_config),
      updated_at = NOW()
    WHERE id = ${projectId}
    RETURNING id, organization_id, name, description, input_flow_config, created_at, updated_at
  `;
  
  return result.rows[0] || null;
}

/**
 * Delete a project
 */
export async function deleteProject(projectId) {
  // First, remove project reference from all sketches
  await sql`
    UPDATE sketches SET project_id = NULL WHERE project_id = ${projectId}
  `;
  
  // Delete the project
  const result = await sql`
    DELETE FROM projects
    WHERE id = ${projectId}
    RETURNING id
  `;
  
  return result.rows.length > 0;
}

/**
 * Duplicate a project with all its configuration
 */
export async function duplicateProject(projectId, newName) {
  const original = await getProjectById(projectId);
  if (!original) return null;
  
  const result = await sql`
    INSERT INTO projects (organization_id, name, description, input_flow_config)
    VALUES (
      ${original.organization_id},
      ${newName},
      ${original.description},
      ${JSON.stringify(original.input_flow_config || {})}::jsonb
    )
    RETURNING id, organization_id, name, description, input_flow_config, created_at, updated_at
  `;
  
  return result.rows[0];
}

/**
 * Get sketches by project ID
 */
export async function getSketchesByProject(projectId) {
  const result = await sql`
    SELECT id, user_id, name, creation_date, nodes, edges, admin_config, created_by, last_edited_by,
           project_id, snapshot_input_flow_config, created_at, updated_at
    FROM sketches
    WHERE project_id = ${projectId}
    ORDER BY updated_at DESC
  `;
  return result.rows;
}

/**
 * Get all sketches (for super admin)
 * Returns all sketches from all users
 */
export async function getAllSketches() {
  const result = await sql`
    SELECT s.id, s.user_id, s.name, s.creation_date, s.nodes, s.edges, s.admin_config, 
           s.created_by, s.last_edited_by, s.project_id, s.snapshot_input_flow_config, 
           s.created_at, s.updated_at,
           u.username as owner_username, u.email as owner_email
    FROM sketches s
    LEFT JOIN users u ON s.user_id = u.id
    ORDER BY s.updated_at DESC
  `;
  return result.rows;
}

/**
 * Get all sketches for an organization (for admin)
 * Returns all sketches from users in the organization
 */
export async function getSketchesByOrganization(organizationId) {
  const result = await sql`
    SELECT s.id, s.user_id, s.name, s.creation_date, s.nodes, s.edges, s.admin_config, 
           s.created_by, s.last_edited_by, s.project_id, s.snapshot_input_flow_config, 
           s.created_at, s.updated_at,
           u.username as owner_username, u.email as owner_email
    FROM sketches s
    INNER JOIN users u ON s.user_id = u.id
    WHERE u.organization_id = ${organizationId}
    ORDER BY s.updated_at DESC
  `;
  return result.rows;
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
export async function getEffectiveFeatures(userId, organizationId) {
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
    WHERE target_type = 'user' AND target_id = ${userId}
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

// ============================================
// Project Reference Layer Functions
// ============================================

/**
 * Get all layers for a project (metadata only, without geojson)
 */
export async function getProjectLayersMeta(projectId) {
  const result = await sql`
    SELECT id, project_id, name, layer_type, style, visible, display_order, created_at, updated_at
    FROM project_layers
    WHERE project_id = ${projectId}
    ORDER BY display_order, name
  `;
  return result.rows;
}

/**
 * Get a single layer with full geojson
 */
export async function getProjectLayer(layerId) {
  const result = await sql`
    SELECT id, project_id, name, layer_type, geojson, style, visible, display_order, created_at, updated_at
    FROM project_layers
    WHERE id = ${layerId}
  `;
  return result.rows[0] || null;
}

/**
 * Get full layer data (with geojson) for all visible layers of a project
 */
export async function getProjectLayersFull(projectId) {
  const result = await sql`
    SELECT id, project_id, name, layer_type, geojson, style, visible, display_order, created_at, updated_at
    FROM project_layers
    WHERE project_id = ${projectId}
    ORDER BY display_order, name
  `;
  return result.rows;
}

/**
 * Create a new project layer
 */
export async function createProjectLayer(projectId, layer) {
  const { name, layerType, geojson, style, visible, displayOrder } = layer;
  
  const result = await sql`
    INSERT INTO project_layers (project_id, name, layer_type, geojson, style, visible, display_order)
    VALUES (
      ${projectId},
      ${name},
      ${layerType},
      ${JSON.stringify(geojson)}::jsonb,
      ${JSON.stringify(style || {})}::jsonb,
      ${visible !== false},
      ${displayOrder || 0}
    )
    RETURNING id, project_id, name, layer_type, style, visible, display_order, created_at, updated_at
  `;
  
  return result.rows[0];
}

/**
 * Update a project layer (metadata or geojson)
 */
export async function updateProjectLayer(layerId, updates) {
  const { name, style, visible, displayOrder, geojson } = updates;
  
  const result = await sql`
    UPDATE project_layers
    SET
      name = COALESCE(${name}, name),
      style = COALESCE(${style != null ? JSON.stringify(style) : null}::jsonb, style),
      visible = COALESCE(${visible}, visible),
      display_order = COALESCE(${displayOrder}, display_order),
      geojson = COALESCE(${geojson != null ? JSON.stringify(geojson) : null}::jsonb, geojson),
      updated_at = NOW()
    WHERE id = ${layerId}
    RETURNING id, project_id, name, layer_type, style, visible, display_order, created_at, updated_at
  `;
  
  return result.rows[0] || null;
}

/**
 * Delete a project layer
 */
export async function deleteProjectLayer(layerId) {
  const result = await sql`
    DELETE FROM project_layers
    WHERE id = ${layerId}
    RETURNING id
  `;
  return result.rows.length > 0;
}
