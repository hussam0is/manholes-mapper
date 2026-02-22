/**
 * System Integration Tests — Backend Connectivity & Data Integrity
 *
 * Verifies end-to-end data flow between API handlers and the Postgres database:
 *  - Database connectivity and table structure
 *  - Sketch CRUD with full data integrity (nodes/edges round-trip)
 *  - Project–sketch association (project_id correctly set and queried)
 *  - Project sketches endpoint (GET /api/projects/:id?fullSketches=true)
 *  - Sketch listing with full=true returns JSONB data
 *  - Data isolation between users
 *
 * Requires POSTGRES_URL to be set in .env.local (real Neon Postgres).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from '@vercel/postgres';
import { validSketch, complexSketch, createMockResponse } from '../fixtures/sketches.js';

// Unique test user IDs and emails for isolation (emails must be unique across tests)
const TEST_TS = Date.now();
const TEST_USER_ID = 'test_sys_user_' + TEST_TS;
const TEST_USER_EMAIL = `systest_${TEST_TS}@test.com`;
const OTHER_USER_ID = 'test_sys_other_' + TEST_TS;
const OTHER_USER_EMAIL = `other_${TEST_TS}@test.com`;

// Track IDs created during tests for cleanup
let testSketchIds: string[] = [];
let testProjectId: string | null = null;
let testOrgId: string | null = null;

// Mock verifyAuth and parseBody so API handlers skip real session checks
vi.mock('../../api/_lib/auth.js', async () => {
  const actual = await vi.importActual('../../api/_lib/auth.js');
  return {
    ...actual,
    verifyAuth: vi.fn(),
    parseBody: vi.fn(),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockRes = () => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res;
};

/** Return the first call's argument to res.json() */
const jsonBody = (res: any) => res.json.mock.calls[0]?.[0];

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('System Integration Tests — Backend Connectivity', () => {
  // Skip if database not configured
  beforeAll(async () => {
    if (!process.env.POSTGRES_URL) {
      console.warn('Skipping system tests: POSTGRES_URL not set');
      return;
    }

    // Create a test organization for project tests
    const orgResult = await sql`
      INSERT INTO organizations (name)
      VALUES (${'Test Org System ' + Date.now()})
      RETURNING id
    `;
    testOrgId = orgResult.rows[0]?.id;

    // Create a test user record (required for project access checks)
    await sql`
      INSERT INTO users (id, username, email, role, organization_id)
      VALUES (${TEST_USER_ID}, 'systest', ${TEST_USER_EMAIL}, 'admin', ${testOrgId})
      ON CONFLICT (id) DO NOTHING
    `;

    // Create another user for isolation tests
    await sql`
      INSERT INTO users (id, username, email, role, organization_id)
      VALUES (${OTHER_USER_ID}, 'other', ${OTHER_USER_EMAIL}, 'user', ${testOrgId})
      ON CONFLICT (id) DO NOTHING
    `;

    // Create a test project
    const projResult = await sql`
      INSERT INTO projects (organization_id, name, description)
      VALUES (${testOrgId}, 'System Test Project', 'Created by system tests')
      RETURNING id
    `;
    testProjectId = projResult.rows[0]?.id;
  });

  afterAll(async () => {
    if (!process.env.POSTGRES_URL) return;

    // Clean up all test data (in correct FK order)
    await sql`DELETE FROM sketches WHERE user_id IN (${TEST_USER_ID}, ${OTHER_USER_ID})`;
    if (testProjectId) await sql`DELETE FROM projects WHERE id = ${testProjectId}`;
    if (testOrgId) await sql`DELETE FROM organizations WHERE id = ${testOrgId}`;
    await sql`DELETE FROM users WHERE id IN (${TEST_USER_ID}, ${OTHER_USER_ID})`;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // 1. Database connectivity
  // ────────────────────────────────────────────────────────────────────────

  describe('Database Connectivity', () => {
    it('should connect to Postgres and run a basic query', async () => {
      const result = await sql`SELECT 1 AS ok`;
      expect(result.rows[0].ok).toBe(1);
    });

    it('should have sketches table with required columns', async () => {
      const result = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'sketches'
        ORDER BY ordinal_position
      `;
      const columns = result.rows.map((r: any) => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('name');
      expect(columns).toContain('nodes');
      expect(columns).toContain('edges');
      expect(columns).toContain('admin_config');
      expect(columns).toContain('project_id');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    it('should have projects table with required columns', async () => {
      const result = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'projects'
        ORDER BY ordinal_position
      `;
      const columns = result.rows.map((r: any) => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('organization_id');
      expect(columns).toContain('name');
      expect(columns).toContain('input_flow_config');
    });

    it('should have users table with role and organization_id columns', async () => {
      const result = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
      `;
      const columns = result.rows.map((r: any) => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('role');
      expect(columns).toContain('organization_id');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Sketch CRUD — full data round-trip
  // ────────────────────────────────────────────────────────────────────────

  describe('Sketch CRUD via API', () => {
    it('POST /api/sketches should create a sketch with full node/edge data', async () => {
      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null, user: { name: 'systest', email: TEST_USER_EMAIL } });
      (parseBody as any).mockResolvedValue({ ...complexSketch, name: 'System CRUD Test' });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'POST', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const data = jsonBody(res);
      expect(data.sketch).toBeDefined();
      expect(data.sketch.id).toBeDefined();
      expect(data.sketch.name).toBe('System CRUD Test');

      testSketchIds.push(data.sketch.id);

      // Verify nodes persisted correctly in DB
      const dbRow = await sql`SELECT nodes, edges, admin_config FROM sketches WHERE id = ${data.sketch.id}`;
      expect(dbRow.rows).toHaveLength(1);
      expect(dbRow.rows[0].nodes).toHaveLength(complexSketch.nodes.length);
      expect(dbRow.rows[0].edges).toHaveLength(complexSketch.edges.length);
    });

    it('GET /api/sketches/:id should return full sketch data matching DB', async () => {
      const sketchId = testSketchIds[0];
      expect(sketchId).toBeDefined();

      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null, user: { name: 'systest', email: TEST_USER_EMAIL } });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'GET', url: `/api/sketches/${sketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      expect(data.sketch.id).toBe(sketchId);
      expect(data.sketch.nodes).toHaveLength(complexSketch.nodes.length);
      expect(data.sketch.edges).toHaveLength(complexSketch.edges.length);
      expect(data.sketch.name).toBe('System CRUD Test');

      // Verify node coordinates survived the round-trip
      const apiNode = data.sketch.nodes.find((n: any) => n.id === 'n1');
      expect(apiNode).toBeDefined();
      expect(apiNode.x).toBe(0);
      expect(apiNode.y).toBe(0);
      expect(apiNode.type).toBe('manhole');
    });

    it('PUT /api/sketches/:id should update nodes and edges', async () => {
      const sketchId = testSketchIds[0];
      const updatedNodes = [
        { id: 'n1', x: 50, y: 75, type: 'manhole', note: 'Updated' },
        { id: 'n2', x: 150, y: 250, type: 'home' },
      ];
      const updatedEdges = [
        { id: 'e1', tail: 'n1', head: 'n2', type: 'pipe' },
      ];

      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });
      (parseBody as any).mockResolvedValue({
        name: 'Updated System Test',
        nodes: updatedNodes,
        edges: updatedEdges,
      });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'PUT', url: `/api/sketches/${sketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      expect(data.sketch.name).toBe('Updated System Test');
      expect(data.sketch.nodes).toHaveLength(2);
      expect(data.sketch.edges).toHaveLength(1);

      // Verify in DB
      const dbRow = await sql`SELECT nodes, edges FROM sketches WHERE id = ${sketchId}`;
      expect(dbRow.rows[0].nodes).toHaveLength(2);
      expect(dbRow.rows[0].nodes[0].x).toBe(50);
      expect(dbRow.rows[0].edges).toHaveLength(1);
    });

    it('GET /api/sketches with full=true should include nodes/edges', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null, user: { name: 'systest', email: TEST_USER_EMAIL } });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'GET', headers: {}, query: { full: 'true' } } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      expect(data.sketches.length).toBeGreaterThanOrEqual(1);

      const testSketch = data.sketches.find((s: any) => s.id === testSketchIds[0]);
      expect(testSketch).toBeDefined();
      expect(testSketch.nodes).toBeDefined();
      expect(testSketch.nodes.length).toBeGreaterThan(0);
      expect(testSketch.edges).toBeDefined();
    });

    it('GET /api/sketches without full=true should omit nodes/edges', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null, user: { name: 'systest', email: TEST_USER_EMAIL } });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'GET', headers: {}, query: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      const testSketch = data.sketches.find((s: any) => s.id === testSketchIds[0]);
      expect(testSketch).toBeDefined();
      // Metadata-only response should NOT include nodes/edges
      expect(testSketch.nodes).toBeUndefined();
      expect(testSketch.edges).toBeUndefined();
    });

    it('DELETE /api/sketches/:id should remove sketch from DB', async () => {
      // Create a sketch specifically to delete
      const insertResult = await sql`
        INSERT INTO sketches (user_id, name, nodes, edges)
        VALUES (${TEST_USER_ID}, 'To Delete', '[]'::jsonb, '[]'::jsonb)
        RETURNING id
      `;
      const idToDelete = insertResult.rows[0].id;

      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'DELETE', url: `/api/sketches/${idToDelete}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);

      // Verify gone from DB
      const dbCheck = await sql`SELECT id FROM sketches WHERE id = ${idToDelete}`;
      expect(dbCheck.rows).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Project–Sketch Association
  // ────────────────────────────────────────────────────────────────────────

  describe('Project–Sketch Association', () => {
    let projectSketchId: string;

    it('should create a sketch assigned to a project', async () => {
      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null, user: { name: 'systest', email: TEST_USER_EMAIL } });
      (parseBody as any).mockResolvedValue({
        ...validSketch,
        name: 'Project Sketch',
        projectId: testProjectId,
      });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'POST', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const data = jsonBody(res);
      projectSketchId = data.sketch.id;
      testSketchIds.push(projectSketchId);

      expect(data.sketch.projectId).toBe(testProjectId);

      // Verify in DB
      const dbRow = await sql`SELECT project_id FROM sketches WHERE id = ${projectSketchId}`;
      expect(dbRow.rows[0].project_id).toBe(testProjectId);
    });

    it('GET /api/projects/:id?fullSketches=true should return project sketches with nodes/edges', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/projects/[id].js');
      const res = mockRes();
      await handler({
        method: 'GET',
        headers: {},
        query: { id: testProjectId, fullSketches: 'true' },
      } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      expect(data.sketches).toBeDefined();
      expect(data.sketches.length).toBeGreaterThanOrEqual(1);

      const projSketch = data.sketches.find((s: any) => s.id === projectSketchId);
      expect(projSketch).toBeDefined();
      expect(projSketch.nodes).toBeDefined();
      expect(projSketch.nodes.length).toBeGreaterThan(0);
      expect(projSketch.edges).toBeDefined();
      expect(projSketch.projectId).toBe(testProjectId);
    });

    it('should NOT return unassigned sketches in project endpoint', async () => {
      // Create an unassigned sketch (no project_id)
      const unassignedResult = await sql`
        INSERT INTO sketches (user_id, name, nodes, edges)
        VALUES (${TEST_USER_ID}, 'Unassigned Sketch', ${JSON.stringify(validSketch.nodes)}::jsonb, ${JSON.stringify(validSketch.edges)}::jsonb)
        RETURNING id
      `;
      const unassignedId = unassignedResult.rows[0].id;
      testSketchIds.push(unassignedId);

      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/projects/[id].js');
      const res = mockRes();
      await handler({
        method: 'GET',
        headers: {},
        query: { id: testProjectId, fullSketches: 'true' },
      } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      const found = data.sketches.find((s: any) => s.id === unassignedId);
      expect(found).toBeUndefined();
    });

    it('should update sketch project_id via PUT', async () => {
      const sketchId = testSketchIds[0]; // existing sketch without project

      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });
      (parseBody as any).mockResolvedValue({
        name: 'Updated System Test',
        nodes: [{ id: 'n1', x: 50, y: 75, type: 'manhole' }],
        edges: [],
        projectId: testProjectId,
      });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'PUT', url: `/api/sketches/${sketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      expect(data.sketch.projectId).toBe(testProjectId);

      // Verify in DB
      const dbRow = await sql`SELECT project_id FROM sketches WHERE id = ${sketchId}`;
      expect(dbRow.rows[0].project_id).toBe(testProjectId);
    });

    it('GET /api/projects/:id should return project metadata', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/projects/[id].js');
      const res = mockRes();
      await handler({
        method: 'GET',
        headers: {},
        query: { id: testProjectId },
      } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      expect(data.project).toBeDefined();
      expect(data.project.id).toBe(testProjectId);
      expect(data.project.name).toBe('System Test Project');
      expect(data.project.organizationId).toBe(testOrgId);
    });

    it('GET /api/projects/:id?includeSketches=true should return sketch metadata', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/projects/[id].js');
      const res = mockRes();
      await handler({
        method: 'GET',
        headers: {},
        query: { id: testProjectId, includeSketches: 'true' },
      } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      expect(data.project).toBeDefined();
      expect(data.sketches).toBeDefined();
      expect(data.sketches.length).toBeGreaterThanOrEqual(1);
      // Sketch metadata should have id and name but NOT nodes/edges
      const s = data.sketches[0];
      expect(s.id).toBeDefined();
      expect(s.nodes).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. User Data Isolation
  // ────────────────────────────────────────────────────────────────────────

  describe('User Data Isolation', () => {
    it('regular user should NOT see another user sketches via GET /api/sketches', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      // Authenticate as OTHER_USER (role=user, not admin)
      (verifyAuth as any).mockResolvedValue({ userId: OTHER_USER_ID, error: null, user: { name: 'other', email: OTHER_USER_EMAIL } });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'GET', headers: {}, query: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      // Other user should not see TEST_USER_ID's sketches
      const leaked = data.sketches.find((s: any) => testSketchIds.includes(s.id));
      expect(leaked).toBeUndefined();
    });

    it('regular user should get 404 when accessing another user sketch by ID', async () => {
      const sketchId = testSketchIds[0];

      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: OTHER_USER_ID, error: null, user: { name: 'other', email: OTHER_USER_EMAIL } });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'GET', url: `/api/sketches/${sketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('regular user should get 404 when trying to update another user sketch', async () => {
      const sketchId = testSketchIds[0];

      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: OTHER_USER_ID, error: null });
      (parseBody as any).mockResolvedValue({ name: 'Hacked', nodes: [], edges: [] });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'PUT', url: `/api/sketches/${sketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('regular user should get 404 when trying to delete another user sketch', async () => {
      const sketchId = testSketchIds[0];

      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: OTHER_USER_ID, error: null });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'DELETE', url: `/api/sketches/${sketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Data Integrity — JSONB round-trip
  // ────────────────────────────────────────────────────────────────────────

  describe('Data Integrity — JSONB round-trip', () => {
    it('node properties (type, note, coordinates) should survive create → read', async () => {
      const richNodes = [
        { id: 'r1', x: 123.456, y: 789.012, type: 'manhole', note: 'Deep manhole with special chars: <>&"' },
        { id: 'r2', x: -50, y: 0.001, type: 'home', note: 'Hebrew text: בדיקה' },
      ];
      const richEdges = [
        { id: 're1', tail: 'r1', head: 'r2', type: 'pipe', note: 'Edge note' },
      ];

      // Insert directly via SQL
      const result = await sql`
        INSERT INTO sketches (user_id, name, nodes, edges)
        VALUES (${TEST_USER_ID}, 'JSONB Round-Trip', ${JSON.stringify(richNodes)}::jsonb, ${JSON.stringify(richEdges)}::jsonb)
        RETURNING id
      `;
      const sketchId = result.rows[0].id;
      testSketchIds.push(sketchId);

      // Read back via API
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null, user: { name: 'systest', email: TEST_USER_EMAIL } });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'GET', url: `/api/sketches/${sketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);

      // Verify floating point precision
      const n1 = data.sketch.nodes.find((n: any) => n.id === 'r1');
      expect(n1.x).toBeCloseTo(123.456, 3);
      expect(n1.y).toBeCloseTo(789.012, 3);
      expect(n1.type).toBe('manhole');
      expect(n1.note).toContain('<>&"');

      // Verify Hebrew text survived
      const n2 = data.sketch.nodes.find((n: any) => n.id === 'r2');
      expect(n2.note).toContain('בדיקה');

      // Verify edge data
      expect(data.sketch.edges).toHaveLength(1);
      expect(data.sketch.edges[0].tail).toBe('r1');
      expect(data.sketch.edges[0].head).toBe('r2');
    });

    it('adminConfig object should survive round-trip', async () => {
      const adminConfig = {
        theme: 'dark',
        nodeTypes: ['manhole', 'home', 'drainage'],
        edgeTypes: ['pipe', 'cable'],
        customField: { nested: true, count: 42 },
      };

      const result = await sql`
        INSERT INTO sketches (user_id, name, nodes, edges, admin_config)
        VALUES (${TEST_USER_ID}, 'AdminConfig Test', '[]'::jsonb, '[]'::jsonb, ${JSON.stringify(adminConfig)}::jsonb)
        RETURNING id
      `;
      const sketchId = result.rows[0].id;
      testSketchIds.push(sketchId);

      // Read back via direct SQL
      const dbRow = await sql`SELECT admin_config FROM sketches WHERE id = ${sketchId}`;
      expect(dbRow.rows[0].admin_config.theme).toBe('dark');
      expect(dbRow.rows[0].admin_config.nodeTypes).toEqual(['manhole', 'home', 'drainage']);
      expect(dbRow.rows[0].admin_config.customField.nested).toBe(true);
      expect(dbRow.rows[0].admin_config.customField.count).toBe(42);
    });

    it('empty nodes/edges arrays should be preserved (not null)', async () => {
      const result = await sql`
        INSERT INTO sketches (user_id, name, nodes, edges)
        VALUES (${TEST_USER_ID}, 'Empty Arrays Test', '[]'::jsonb, '[]'::jsonb)
        RETURNING id
      `;
      const sketchId = result.rows[0].id;
      testSketchIds.push(sketchId);

      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null, user: { name: 'systest', email: TEST_USER_EMAIL } });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'GET', url: `/api/sketches/${sketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = jsonBody(res);
      expect(Array.isArray(data.sketch.nodes)).toBe(true);
      expect(data.sketch.nodes).toHaveLength(0);
      expect(Array.isArray(data.sketch.edges)).toBe(true);
      expect(data.sketch.edges).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. Error handling
  // ────────────────────────────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: null, error: 'Unauthorized' });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'GET', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 for invalid UUID sketch ID', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'GET', url: '/api/sketches/not-a-uuid', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 for non-existent sketch', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null, user: { name: 'systest', email: TEST_USER_EMAIL } });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'GET', url: `/api/sketches/${fakeId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 for invalid project UUID', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/projects/[id].js');
      const res = mockRes();
      await handler({
        method: 'GET',
        headers: {},
        query: { id: 'invalid-uuid' },
      } as any, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 for non-existent project', async () => {
      const fakeProjectId = '00000000-0000-0000-0000-000000000000';
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/projects/[id].js');
      const res = mockRes();
      await handler({
        method: 'GET',
        headers: {},
        query: { id: fakeProjectId },
      } as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 for invalid sketch data (non-numeric coords)', async () => {
      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });
      (parseBody as any).mockResolvedValue({
        name: 'Bad Sketch',
        nodes: [{ id: 'n1', x: 'not-a-number', y: 100 }],
        edges: [],
      });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'POST', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
