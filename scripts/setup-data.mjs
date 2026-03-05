/**
 * One-time script to create the geopoint_plus org and me_rakat project.
 * Run: node scripts/setup-data.mjs
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.POSTGRES_URL);

const ADMIN_USER_ID = '6414c7d8-81ff-4367-b090-fe9d10527e5a';

async function main() {
  // 1. Create organization
  const [org] = await sql`
    INSERT INTO organizations (name)
    VALUES (${'geopoint_plus'})
    RETURNING id, name, created_at
  `;
  console.log('Created organization:', org.id, org.name);

  // 2. Create project under the organization
  const [project] = await sql`
    INSERT INTO projects (organization_id, name, description)
    VALUES (${org.id}, ${'me_rakat'}, ${'מי רקת'})
    RETURNING id, name
  `;
  console.log('Created project:', project.id, project.name);

  // 3. Assign admin user to the organization
  await sql`
    UPDATE users SET organization_id = ${org.id}
    WHERE id = ${ADMIN_USER_ID}
  `;
  console.log('Assigned admin user to org:', org.id);

  // 4. Assign existing unassigned sketches to the project
  const updated = await sql`
    UPDATE sketches SET project_id = ${project.id}
    WHERE user_id = ${ADMIN_USER_ID} AND project_id IS NULL
    RETURNING id
  `;
  console.log('Assigned', updated.length, 'sketches to project');

  console.log('\nDone! Org ID:', org.id, 'Project ID:', project.id);
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
