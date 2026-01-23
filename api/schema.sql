-- Manholes Mapper - Database Schema
-- Run this on your Vercel Postgres database to create the required tables

-- Sketches table: stores user sketches with nodes and edges as JSONB
CREATE TABLE IF NOT EXISTS sketches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,           -- Clerk user ID
    name TEXT,                        -- User-defined sketch name
    creation_date TIMESTAMPTZ,        -- Date shown in exports
    nodes JSONB DEFAULT '[]'::jsonb,  -- Array of node objects (includes createdAt, createdBy per node)
    edges JSONB DEFAULT '[]'::jsonb,  -- Array of edge objects (includes createdAt, createdBy per edge)
    admin_config JSONB DEFAULT '{}'::jsonb, -- User's admin configuration
    created_by TEXT,                  -- Username who created the sketch
    last_edited_by TEXT,              -- Username who last edited the sketch
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: Add new columns if they don't exist
ALTER TABLE sketches ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE sketches ADD COLUMN IF NOT EXISTS last_edited_by TEXT;

-- Migration: Add project support to sketches
ALTER TABLE sketches ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE sketches ADD COLUMN IF NOT EXISTS snapshot_input_flow_config JSONB DEFAULT '{}'::jsonb;

-- Index for project queries on sketches
CREATE INDEX IF NOT EXISTS idx_sketches_project_id ON sketches(project_id);

-- Index for fast user queries
CREATE INDEX IF NOT EXISTS idx_sketches_user_id ON sketches(user_id);

-- Optional: Index for sorting by update time
CREATE INDEX IF NOT EXISTS idx_sketches_updated_at ON sketches(updated_at DESC);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_sketches_updated_at ON sketches;
CREATE TRIGGER update_sketches_updated_at
    BEFORE UPDATE ON sketches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- User Management Tables
-- ============================================

-- Organizations table: groups of users
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Projects Table (per organization)
-- ============================================

-- Projects table: templates with input flow configuration
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    input_flow_config JSONB DEFAULT '{}'::jsonb,  -- Business input flow rules
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for organization project queries
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);

-- Trigger for projects updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Users table: stores user roles and organization membership
CREATE TABLE IF NOT EXISTS users (
    clerk_id TEXT PRIMARY KEY,
    clerk_username TEXT,
    email TEXT,
    role TEXT DEFAULT 'user',  -- 'super_admin', 'admin', 'user'
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for organization queries
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- Index for role queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Trigger for users updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Feature permissions table: controls feature access per user or organization
CREATE TABLE IF NOT EXISTS user_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL,  -- 'user', 'organization'
    target_id TEXT NOT NULL,     -- clerk_id or org_id
    feature_key TEXT NOT NULL,   -- 'export_csv', 'export_sketch', 'admin_settings', etc.
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(target_type, target_id, feature_key)
);

-- Index for feature lookups
CREATE INDEX IF NOT EXISTS idx_user_features_target ON user_features(target_type, target_id);
