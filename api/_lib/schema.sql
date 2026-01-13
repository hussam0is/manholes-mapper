-- Manholes Mapper - Database Schema
-- Run this on your Vercel Postgres database to create the required tables

-- Sketches table: stores user sketches with nodes and edges as JSONB
CREATE TABLE IF NOT EXISTS sketches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,           -- Clerk user ID
    name TEXT,                        -- User-defined sketch name
    creation_date TIMESTAMPTZ,        -- Date shown in exports
    nodes JSONB DEFAULT '[]'::jsonb,  -- Array of node objects
    edges JSONB DEFAULT '[]'::jsonb,  -- Array of edge objects
    admin_config JSONB DEFAULT '{}'::jsonb, -- User's admin configuration
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
