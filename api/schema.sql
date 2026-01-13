-- Manholes Mapper Database Schema
-- Run this SQL in your Vercel Postgres dashboard to initialize the database

-- Sketches table
CREATE TABLE IF NOT EXISTS sketches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,           -- Clerk user ID
    name TEXT,                       -- Optional sketch name
    creation_date TIMESTAMPTZ,       -- User-specified creation date
    nodes JSONB DEFAULT '[]'::jsonb, -- Array of node objects
    edges JSONB DEFAULT '[]'::jsonb, -- Array of edge objects
    admin_config JSONB DEFAULT '{}'::jsonb, -- Admin configuration
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_sketches_user_id ON sketches(user_id);

-- Index for sorting by update time
CREATE INDEX IF NOT EXISTS idx_sketches_updated_at ON sketches(updated_at DESC);
