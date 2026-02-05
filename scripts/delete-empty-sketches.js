/**
 * Delete empty sketches from the database
 */

import { sql } from '@vercel/postgres';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function deleteEmptySketches() {
  console.log('🔍 Finding empty sketches...\n');
  
  try {
    // First, count empty sketches
    const countResult = await sql`
      SELECT COUNT(*) as count FROM sketches 
      WHERE (nodes IS NULL OR nodes = '[]'::jsonb) 
      AND (edges IS NULL OR edges = '[]'::jsonb)
    `;
    console.log('Empty sketches found:', countResult.rows[0].count);
    
    if (countResult.rows[0].count === '0') {
      console.log('No empty sketches to delete.');
      return;
    }
    
    // Delete them
    const deleteResult = await sql`
      DELETE FROM sketches 
      WHERE (nodes IS NULL OR nodes = '[]'::jsonb) 
      AND (edges IS NULL OR edges = '[]'::jsonb)
      RETURNING id, name, created_at
    `;
    
    console.log('\n✅ Deleted', deleteResult.rows.length, 'empty sketches:');
    deleteResult.rows.forEach(r => {
      console.log(`  - ${r.id} (${r.name || 'unnamed'}, created: ${r.created_at})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deleteEmptySketches();
