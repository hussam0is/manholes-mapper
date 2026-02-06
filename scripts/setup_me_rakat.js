/**
 * One-time Setup Script: Me Rakat Project
 * ========================================
 * 
 * Creates the geopoint_org organization, me_rakat project, and imports
 * GIS reference layers from the geojson_output directory.
 * 
 * Prerequisites:
 *   1. Run import_gis_layers.py first to generate GeoJSON files
 *   2. Set POSTGRES_URL or DATABASE_URL environment variable
 *   3. Have an authenticated admin/super_admin user
 * 
 * Usage:
 *   node scripts/setup_me_rakat.js
 * 
 * Or with env file:
 *   node -e "require('dotenv').config({path:'.env.local'})" scripts/setup_me_rakat.js
 */

import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEOJSON_DIR = path.join(__dirname, 'geojson_output');

// Default styles per layer type
const DEFAULT_STYLES = {
  sections: {
    strokeColor: 'rgba(0, 100, 200, 0.6)',
    fillColor: 'rgba(0, 100, 200, 0.08)',
    lineWidth: 2,
    lineDash: [8, 4],
    labelField: 'name',
    labelColor: '#0064c8',
    labelFontSize: 11
  },
  survey_manholes: {
    strokeColor: 'rgba(180, 60, 20, 0.7)',
    fillColor: 'rgba(180, 60, 20, 0.5)',
    pointRadius: 4,
    pointShape: 'square',
    labelField: 'OBJECTID',
    labelColor: '#b43c14',
    labelFontSize: 9
  },
  survey_pipes: {
    strokeColor: 'rgba(60, 140, 60, 0.7)',
    fillColor: 'rgba(60, 140, 60, 0.2)',
    lineWidth: 2.5,
    lineDash: [],
    labelColor: '#3c8c3c',
    labelFontSize: 9
  },
  streets: {
    strokeColor: 'rgba(100, 100, 100, 0.5)',
    fillColor: 'rgba(100, 100, 100, 0.05)',
    lineWidth: 1.5,
    lineDash: [4, 2],
    labelField: 'ST_NAME',
    labelColor: '#555',
    labelFontSize: 10
  },
  addresses: {
    strokeColor: 'rgba(150, 80, 150, 0.6)',
    fillColor: 'rgba(150, 80, 150, 0.4)',
    pointRadius: 3,
    pointShape: 'circle',
    labelField: 'HOUSE_NUM',
    labelColor: '#965096',
    labelFontSize: 8
  }
};

async function main() {
  console.log('=== Me Rakat Project Setup ===\n');

  // 1. Create project_layers table if not exists
  console.log('1. Ensuring project_layers table exists...');
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
  await sql`CREATE INDEX IF NOT EXISTS idx_project_layers_project ON project_layers(project_id)`;
  console.log('   Table ready.\n');

  // 2. Create or find geopoint_org organization
  console.log('2. Creating geopoint_org organization...');
  let orgResult = await sql`
    SELECT id, name FROM organizations WHERE name = 'geopoint_org'
  `;
  
  let orgId;
  if (orgResult.rows.length > 0) {
    orgId = orgResult.rows[0].id;
    console.log(`   Organization already exists: ${orgId}\n`);
  } else {
    orgResult = await sql`
      INSERT INTO organizations (name) VALUES ('geopoint_org')
      RETURNING id, name
    `;
    orgId = orgResult.rows[0].id;
    console.log(`   Created organization: ${orgId}\n`);
  }

  // 3. Create or find me_rakat project
  console.log('3. Creating me_rakat project...');
  let projResult = await sql`
    SELECT id, name FROM projects WHERE name = 'me_rakat' AND organization_id = ${orgId}
  `;
  
  let projectId;
  if (projResult.rows.length > 0) {
    projectId = projResult.rows[0].id;
    console.log(`   Project already exists: ${projectId}\n`);
  } else {
    projResult = await sql`
      INSERT INTO projects (organization_id, name, description)
      VALUES (${orgId}, 'me_rakat', 'מי רקת - סקר מים וביוב')
      RETURNING id, name
    `;
    projectId = projResult.rows[0].id;
    console.log(`   Created project: ${projectId}\n`);
  }

  // 4. Check for manifest.json
  const manifestPath = path.join(GEOJSON_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.log(`\n   No manifest.json found at ${manifestPath}`);
    console.log('   Run import_gis_layers.py first to generate GeoJSON files.');
    console.log(`\n   Organization ID: ${orgId}`);
    console.log(`   Project ID: ${projectId}`);
    console.log('\n   You can manually upload layers via the admin UI.');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`4. Importing ${manifest.layers.length} layers from ${GEOJSON_DIR}...\n`);

  // 5. Import each layer
  for (let i = 0; i < manifest.layers.length; i++) {
    const layerInfo = manifest.layers[i];
    const filePath = layerInfo.file;
    
    console.log(`   [${i + 1}/${manifest.layers.length}] ${layerInfo.name} (${layerInfo.layer_type})...`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`      File not found: ${filePath}, skipping.`);
      continue;
    }
    
    // Check if layer already exists
    const existingLayer = await sql`
      SELECT id FROM project_layers 
      WHERE project_id = ${projectId} AND layer_type = ${layerInfo.layer_type}
    `;
    
    if (existingLayer.rows.length > 0) {
      console.log(`      Layer already exists (${existingLayer.rows[0].id}), updating...`);
      const geojson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const style = layerInfo.style || DEFAULT_STYLES[layerInfo.layer_type] || {};
      
      await sql`
        UPDATE project_layers 
        SET geojson = ${JSON.stringify(geojson)}::jsonb,
            style = ${JSON.stringify(style)}::jsonb,
            name = ${layerInfo.name},
            updated_at = NOW()
        WHERE id = ${existingLayer.rows[0].id}
      `;
      console.log(`      Updated with ${geojson.features?.length || 0} features.`);
      continue;
    }
    
    // Read GeoJSON file
    const geojsonData = fs.readFileSync(filePath, 'utf-8');
    const geojson = JSON.parse(geojsonData);
    const style = layerInfo.style || DEFAULT_STYLES[layerInfo.layer_type] || {};
    
    await sql`
      INSERT INTO project_layers (project_id, name, layer_type, geojson, style, visible, display_order)
      VALUES (
        ${projectId},
        ${layerInfo.name},
        ${layerInfo.layer_type},
        ${JSON.stringify(geojson)}::jsonb,
        ${JSON.stringify(style)}::jsonb,
        true,
        ${i}
      )
    `;
    
    console.log(`      Imported ${geojson.features?.length || 0} features.`);
  }

  console.log('\n=== Setup Complete ===');
  console.log(`Organization: geopoint_org (${orgId})`);
  console.log(`Project: me_rakat (${projectId})`);
  console.log(`Layers imported: ${manifest.layers.length}`);
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
