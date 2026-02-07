/**
 * Update ClickUp tasks with latest status and descriptions.
 * Uses ClickUp Personal API Token.
 * 
 * Usage: CLICKUP_TOKEN=pk_xxx node scripts/update_clickup.mjs
 */

const TOKEN = process.env.CLICKUP_TOKEN;
if (!TOKEN) {
  console.error('Error: Set CLICKUP_TOKEN environment variable');
  console.error('Get your token from: https://app.clickup.com/settings/apps');
  process.exit(1);
}

const BASE = 'https://api.clickup.com/api/v2';

async function updateTask(taskId, updates) {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    method: 'PUT',
    headers: {
      'Authorization': TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to update ${taskId}: ${res.status} ${err}`);
  }
  return res.json();
}

async function main() {
  console.log('Updating ClickUp tasks...\n');

  const updates = [
    {
      id: '86ewdpb0u',
      name: 'FEATURE: add manholes base map (GIS reference layers)',
      status: 'success in dev',
      description: `GIS reference layers system implemented and deployed to dev branch.

Full-stack implementation:
- project_layers DB table with JSONB geojson storage
- REST API /api/layers endpoints (GET, POST, PUT, DELETE) with role-based access
- Canvas rendering engine (reference-layers.js) with ITM-to-canvas coordinate conversion
- Viewport culling for performance with large datasets
- Support for Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon
- Layer toggle controls in desktop and mobile menus
- Admin project settings: "Manage Layers" modal with GeoJSON upload/delete
- ArcPy import script for GDB/SHP extraction
- Setup script for one-time org/project/layer import

Layers imported for me_rakat project:
- Sections (מנות): 15 polygon features
- Survey Manholes (שוחות סקר): 13,898 point features
- Survey Pipes (קווי סקר): 20,698 line features
- Streets (רחובות): 2,047 line features
- Addresses (כתובות): 3,391 point features

Commit: 28a285d on dev branch`
    },
    {
      id: '86ewgcyb4',
      name: 'FEATURE: add Me Rakat data filling business logic',
      status: 'success in dev',
      description: `Me Rakat project infrastructure implemented:
- Created geopoint_org organization in database
- Created me_rakat project with 5 GIS reference layers
- Input flow configuration system ready for business logic rules
- Layers render as background overlays on canvas for surveyor reference

Organization ID: 64ff799a-adb4-41d1-bd21-f9662db639ff
Project ID: c2fe9214-01a4-4893-98a6-85c390140280`
    },
    {
      id: '86ewgd1jr',
      name: 'Feature: Admin Page',
      status: 'success in dev',
      description: `Admin panel fully implemented with:
- Users management tab (view, edit roles, assign organizations)
- Organizations management tab (CRUD)
- Feature permissions tab (per-user and per-org feature toggles)
- Projects management with input flow configuration
- Layer management modal (upload GeoJSON, toggle visibility, delete)
- Role-based access: super_admin sees all, admin sees own org`
    },
    {
      id: '86ewgd1jb',
      name: 'Feature: Role based sketches Access',
      status: 'success in dev',
      description: `Role-based access control implemented:
- super_admin: full access to all sketches, users, organizations
- admin: access to own organization's sketches and users
- user: access to own sketches only
- API enforces role checks on all endpoints
- Frontend respects roles for UI visibility`
    },
    {
      id: '86ewgd13y',
      name: 'FEATURE: Permissions and Roles (Admin, Organization, User)',
      status: 'success in dev',
      description: `Full permissions system implemented:
- Three roles: super_admin, admin, user
- user_features table for granular feature permissions
- Per-user and per-organization feature toggles
- Default features: export_csv, export_sketch, admin_settings, etc.
- Effective permissions cascade: defaults -> org overrides -> user overrides`
    },
    {
      id: '86ewgd2h2',
      name: 'Feature: Organization Sketches View',
      status: 'success in dev',
      description: `Organization sketches view implemented:
- My Sketches has two tabs: Personal and Organization
- Organization tab shows all sketches from users in same organization
- Admin can view all organization sketches with owner info
- API endpoints support organization-scoped sketch queries`
    }
  ];

  for (const update of updates) {
    try {
      console.log(`  Updating: ${update.name}`);
      await updateTask(update.id, {
        status: update.status,
        description: update.description
      });
      console.log(`    -> Status: ${update.status} ✓\n`);
    } catch (err) {
      console.log(`    -> ERROR: ${err.message}\n`);
    }
  }

  console.log('Done!');
}

main();
