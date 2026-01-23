/**
 * Test script to verify Vercel Postgres connection
 * 
 * Usage:
 *   1. Create .env.local with your database credentials
 *   2. Run: node scripts/test-db-connection.js
 */

import { sql } from '@vercel/postgres';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

async function testConnection() {
  console.log('Testing database connection...\n');
  
  // Check if required env vars are set
  const requiredVars = ['POSTGRES_URL'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    console.log('\nMake sure you have a .env.local file with:');
    console.log('  POSTGRES_URL=postgresql://...');
    process.exit(1);
  }
  
  console.log('✓ Environment variables loaded');
  console.log('  POSTGRES_HOST:', process.env.POSTGRES_HOST || '(from URL)');
  console.log('  POSTGRES_DATABASE:', process.env.POSTGRES_DATABASE || '(from URL)');
  console.log('');
  
  try {
    // Test basic connection
    console.log('Testing connection...');
    const result = await sql`SELECT NOW() as current_time`;
    console.log('✓ Connection successful!');
    console.log('  Server time:', result.rows[0].current_time);
    console.log('');
    
    // Initialize schema
    console.log('Initializing database schema...');
    
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
    console.log('✓ Sketches table created/verified');
    
    // Create indexes
    await sql`
      CREATE INDEX IF NOT EXISTS idx_sketches_user_id ON sketches(user_id)
    `;
    console.log('✓ User ID index created/verified');
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_sketches_updated_at ON sketches(updated_at DESC)
    `;
    console.log('✓ Updated at index created/verified');
    
    // Verify table structure
    const tableInfo = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sketches'
      ORDER BY ordinal_position
    `;
    
    console.log('\n✓ Table structure:');
    tableInfo.rows.forEach(row => {
      console.log(`    ${row.column_name}: ${row.data_type}`);
    });
    
    // Count existing records
    const countResult = await sql`SELECT COUNT(*) as count FROM sketches`;
    console.log(`\n✓ Current record count: ${countResult.rows[0].count}`);
    
    console.log('\n🎉 Database setup complete!');
    console.log('\nNext steps:');
    console.log('  1. Generate a secret: openssl rand -base64 32');
    console.log('  2. Add BETTER_AUTH_SECRET to .env.local and Vercel environment variables');
    console.log('  3. Add BETTER_AUTH_URL to .env.local (your app URL)');
    console.log('  4. Deploy to Vercel or run locally with: npm run dev');
    
  } catch (error) {
    console.error('\n❌ Database error:', error.message);
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.log('\nTroubleshooting:');
      console.log('  - Check your internet connection');
      console.log('  - Verify the POSTGRES_URL is correct');
      console.log('  - Make sure the database exists in Vercel dashboard');
    }
    
    process.exit(1);
  }
}

testConnection();
