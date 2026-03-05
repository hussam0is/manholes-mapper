/**
 * Query all data from the database
 * 
 * Usage:
 *   1. Set POSTGRES_URL environment variable (or use .env.local)
 *   2. Run: node scripts/query-all-data.js
 */

import { sql } from '@vercel/postgres';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

async function queryAllData() {
  console.log('🔍 Querying database...\n');
  
  // Check if required env vars are set
  if (!process.env.POSTGRES_URL) {
    console.error('❌ Missing POSTGRES_URL environment variable');
    console.log('\nSet it via:');
    console.log('  - .env.local file');
    console.log('  - Or: $env:POSTGRES_URL="your-url" (PowerShell)');
    process.exit(1);
  }
  
  try {
    // Test connection
    const timeResult = await sql`SELECT NOW() as current_time`;
    console.log('✓ Connected to database at:', timeResult.rows[0].current_time);
    console.log('');
    
    // ========== ORGANIZATIONS ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📁 ORGANIZATIONS TABLE');
    console.log('═══════════════════════════════════════════════════════════');
    try {
      const orgsResult = await sql`SELECT * FROM organizations ORDER BY created_at DESC`;
      console.log(`Found ${orgsResult.rows.length} organizations:\n`);
      if (orgsResult.rows.length > 0) {
        orgsResult.rows.forEach((org, i) => {
          console.log(`  ${i + 1}. ${org.name}`);
          console.log(`     ID: ${org.id}`);
          console.log(`     Created: ${org.created_at}`);
          console.log('');
        });
      } else {
        console.log('  (No organizations found)\n');
      }
    } catch (e) {
      console.log('  ⚠️  Table may not exist:', e.message, '\n');
    }
    
    // ========== USERS ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('👥 USERS TABLE');
    console.log('═══════════════════════════════════════════════════════════');
    try {
      const usersResult = await sql`
        SELECT u.*, o.name as org_name 
        FROM users u 
        LEFT JOIN organizations o ON u.organization_id = o.id 
        ORDER BY u.created_at DESC
      `;
      console.log(`Found ${usersResult.rows.length} users:\n`);
      if (usersResult.rows.length > 0) {
        usersResult.rows.forEach((user, i) => {
          console.log(`  ${i + 1}. ${user.username || '(no username)'} - ${user.email || '(no email)'}`);
          console.log(`     ID: ${user.id}`);
          console.log(`     Role: ${user.role}`);
          console.log(`     Organization: ${user.org_name || '(none)'}`);
          console.log(`     Created: ${user.created_at}`);
          console.log('');
        });
      } else {
        console.log('  (No users found)\n');
      }
    } catch (e) {
      console.log('  ⚠️  Table may not exist:', e.message, '\n');
    }
    
    // ========== PROJECTS ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📂 PROJECTS TABLE');
    console.log('═══════════════════════════════════════════════════════════');
    try {
      const projectsResult = await sql`
        SELECT p.*, o.name as org_name 
        FROM projects p 
        LEFT JOIN organizations o ON p.organization_id = o.id 
        ORDER BY p.created_at DESC
      `;
      console.log(`Found ${projectsResult.rows.length} projects:\n`);
      if (projectsResult.rows.length > 0) {
        projectsResult.rows.forEach((proj, i) => {
          console.log(`  ${i + 1}. ${proj.name}`);
          console.log(`     ID: ${proj.id}`);
          console.log(`     Description: ${proj.description || '(none)'}`);
          console.log(`     Organization: ${proj.org_name || '(none)'}`);
          console.log(`     Input Flow Config: ${JSON.stringify(proj.input_flow_config || {})}`);
          console.log(`     Created: ${proj.created_at}`);
          console.log('');
        });
      } else {
        console.log('  (No projects found)\n');
      }
    } catch (e) {
      console.log('  ⚠️  Table may not exist:', e.message, '\n');
    }
    
    // ========== SKETCHES ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✏️  SKETCHES TABLE');
    console.log('═══════════════════════════════════════════════════════════');
    try {
      const sketchesResult = await sql`
        SELECT s.id, s.name, s.user_id, s.created_by, s.last_edited_by, 
               s.creation_date, s.created_at, s.updated_at, s.project_id,
               jsonb_array_length(COALESCE(s.nodes, '[]'::jsonb)) as node_count,
               jsonb_array_length(COALESCE(s.edges, '[]'::jsonb)) as edge_count,
               p.name as project_name
        FROM sketches s
        LEFT JOIN projects p ON s.project_id = p.id
        ORDER BY s.updated_at DESC
        LIMIT 20
      `;
      console.log(`Found ${sketchesResult.rows.length} sketches (showing up to 20):\n`);
      if (sketchesResult.rows.length > 0) {
        sketchesResult.rows.forEach((sketch, i) => {
          console.log(`  ${i + 1}. ${sketch.name || '(unnamed)'}`);
          console.log(`     ID: ${sketch.id}`);
          console.log(`     User ID: ${sketch.user_id}`);
          console.log(`     Created by: ${sketch.created_by || '(unknown)'}`);
          console.log(`     Last edited by: ${sketch.last_edited_by || '(unknown)'}`);
          console.log(`     Project: ${sketch.project_name || '(none)'}`);
          console.log(`     Nodes: ${sketch.node_count}, Edges: ${sketch.edge_count}`);
          console.log(`     Created: ${sketch.created_at}`);
          console.log(`     Updated: ${sketch.updated_at}`);
          console.log('');
        });
      } else {
        console.log('  (No sketches found)\n');
      }
    } catch (e) {
      console.log('  ⚠️  Table may not exist:', e.message, '\n');
    }
    
    // ========== USER FEATURES ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔑 USER_FEATURES TABLE');
    console.log('═══════════════════════════════════════════════════════════');
    try {
      const featuresResult = await sql`SELECT * FROM user_features ORDER BY created_at DESC`;
      console.log(`Found ${featuresResult.rows.length} feature permissions:\n`);
      if (featuresResult.rows.length > 0) {
        featuresResult.rows.forEach((feat, i) => {
          console.log(`  ${i + 1}. ${feat.feature_key}`);
          console.log(`     Target: ${feat.target_type} - ${feat.target_id}`);
          console.log(`     Enabled: ${feat.enabled}`);
          console.log('');
        });
      } else {
        console.log('  (No feature permissions found)\n');
      }
    } catch (e) {
      console.log('  ⚠️  Table may not exist:', e.message, '\n');
    }
    
    // ========== BETTER AUTH TABLES ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔐 BETTER AUTH TABLES (if exist)');
    console.log('═══════════════════════════════════════════════════════════');
    
    // user table (Better Auth)
    try {
      const authUserResult = await sql`SELECT id, name, email, "emailVerified", image, "createdAt", "updatedAt" FROM "user" ORDER BY "createdAt" DESC`;
      console.log(`\n📌 "user" table - ${authUserResult.rows.length} records:\n`);
      if (authUserResult.rows.length > 0) {
        authUserResult.rows.forEach((u, i) => {
          console.log(`  ${i + 1}. ${u.name || '(no name)'} - ${u.email}`);
          console.log(`     ID: ${u.id}`);
          console.log(`     Email Verified: ${u.emailVerified || 'No'}`);
          console.log(`     Created: ${u.createdAt}`);
          console.log('');
        });
      }
    } catch (e) {
      console.log('  "user" table not found or empty\n');
    }
    
    // session table (Better Auth)
    try {
      const sessionResult = await sql`SELECT id, "userId", "expiresAt", "createdAt" FROM session ORDER BY "createdAt" DESC LIMIT 10`;
      console.log(`📌 "session" table - ${sessionResult.rows.length} records (showing up to 10):\n`);
      if (sessionResult.rows.length > 0) {
        sessionResult.rows.forEach((s, i) => {
          console.log(`  ${i + 1}. User: ${s.userId}`);
          console.log(`     Expires: ${s.expiresAt}`);
          console.log(`     Created: ${s.createdAt}`);
          console.log('');
        });
      }
    } catch (e) {
      console.log('  "session" table not found or empty\n');
    }
    
    // account table (Better Auth)
    try {
      const accountResult = await sql`SELECT id, "userId", "providerId", "accountId", "createdAt" FROM account ORDER BY "createdAt" DESC`;
      console.log(`📌 "account" table - ${accountResult.rows.length} records:\n`);
      if (accountResult.rows.length > 0) {
        accountResult.rows.forEach((a, i) => {
          console.log(`  ${i + 1}. User: ${a.userId}`);
          console.log(`     Provider: ${a.providerId}`);
          console.log(`     Account ID: ${a.accountId}`);
          console.log('');
        });
      }
    } catch (e) {
      console.log('  "account" table not found or empty\n');
    }
    
    // ========== SUMMARY ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    
    try {
      const counts = await sql`
        SELECT 
          (SELECT COUNT(*) FROM organizations) as org_count,
          (SELECT COUNT(*) FROM users) as user_count,
          (SELECT COUNT(*) FROM projects) as project_count,
          (SELECT COUNT(*) FROM sketches) as sketch_count,
          (SELECT COUNT(*) FROM user_features) as feature_count
      `;
      const c = counts.rows[0];
      console.log(`  Organizations: ${c.org_count}`);
      console.log(`  Users: ${c.user_count}`);
      console.log(`  Projects: ${c.project_count}`);
      console.log(`  Sketches: ${c.sketch_count}`);
      console.log(`  Feature Permissions: ${c.feature_count}`);
    } catch (e) {
      console.log('  Could not get counts:', e.message);
    }
    
    console.log('\n✅ Query complete!');
    
  } catch (error) {
    console.error('\n❌ Database error:', error.message);
    process.exit(1);
  }
}

queryAllData();
