/**
 * Integration tests for /api/sketches endpoint
 * 
 * Verifies that API responses match database content.
 * Requires POSTGRES_URL to be set in .env.local
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { sql } from '@vercel/postgres';

// Test user ID for integration tests
const TEST_USER_ID = 'test_user_integration_' + Date.now();

// Track created test data for cleanup
let testSketchId: string | null = null;

/**
 * Helper to transform database row to API format (snake_case to camelCase)
 */
function transformDbRowToApiFormat(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    creationDate: row.creation_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nodes: row.nodes || [],
    edges: row.edges || [],
    adminConfig: row.admin_config || {},
  };
}

describe('Sketches API Integration Tests', () => {
  // Skip tests if database is not configured
  beforeAll(async () => {
    if (!process.env.POSTGRES_URL) {
      console.warn('Skipping integration tests: POSTGRES_URL not set');
      return;
    }

    // Create a test sketch in the database
    const testNodes = [{ id: 'n1', x: 100, y: 200, type: 'manhole' }];
    const testEdges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const testAdminConfig = { theme: 'dark' };

    const result = await sql`
      INSERT INTO sketches (user_id, name, creation_date, nodes, edges, admin_config)
      VALUES (
        ${TEST_USER_ID},
        ${'Test Sketch'},
        ${new Date().toISOString()},
        ${JSON.stringify(testNodes)}::jsonb,
        ${JSON.stringify(testEdges)}::jsonb,
        ${JSON.stringify(testAdminConfig)}::jsonb
      )
      RETURNING id
    `;

    testSketchId = result.rows[0]?.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testSketchId) {
      await sql`DELETE FROM sketches WHERE id = ${testSketchId}`;
    }
    // Also clean up any orphaned test data
    await sql`DELETE FROM sketches WHERE user_id LIKE 'test_user_integration_%'`;
  });

  it('should have database connection', async () => {
    if (!process.env.POSTGRES_URL) {
      expect.assertions(0);
      return;
    }

    const result = await sql`SELECT NOW() as current_time`;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].current_time).toBeDefined();
  });

  it('API transformation should match expected camelCase format', async () => {
    if (!process.env.POSTGRES_URL || !testSketchId) {
      expect.assertions(0);
      return;
    }

    // Query database directly
    const dbResult = await sql`
      SELECT id, name, creation_date, nodes, edges, admin_config, created_at, updated_at
      FROM sketches
      WHERE id = ${testSketchId}
    `;

    expect(dbResult.rows).toHaveLength(1);
    const dbRow = dbResult.rows[0];

    // Transform using the same logic as the API
    const transformed = transformDbRowToApiFormat(dbRow);

    // Verify transformation
    expect(transformed).toHaveProperty('id', dbRow.id);
    expect(transformed).toHaveProperty('name', dbRow.name);
    expect(transformed).toHaveProperty('creationDate', dbRow.creation_date);
    expect(transformed).toHaveProperty('createdAt', dbRow.created_at);
    expect(transformed).toHaveProperty('updatedAt', dbRow.updated_at);
    expect(transformed).toHaveProperty('nodes');
    expect(transformed).toHaveProperty('edges');
    expect(transformed).toHaveProperty('adminConfig');

    // Verify snake_case fields are NOT in transformed output
    expect(transformed).not.toHaveProperty('creation_date');
    expect(transformed).not.toHaveProperty('created_at');
    expect(transformed).not.toHaveProperty('updated_at');
    expect(transformed).not.toHaveProperty('admin_config');
  });

  it('getSketchesByUser should return sketches matching database', async () => {
    if (!process.env.POSTGRES_URL || !testSketchId) {
      expect.assertions(0);
      return;
    }

    // Import the database function
    const { getSketchesByUser } = await import('../../api/_lib/db.js');

    // Get sketches via db function
    const sketches = await getSketchesByUser(TEST_USER_ID);

    // Verify we got the test sketch
    expect(sketches.length).toBeGreaterThanOrEqual(1);
    const testSketch = sketches.find((s: { id: string }) => s.id === testSketchId);
    expect(testSketch).toBeDefined();

    // Query database directly for comparison
    const dbResult = await sql`
      SELECT id, name, creation_date, nodes, edges, admin_config, created_at, updated_at
      FROM sketches
      WHERE id = ${testSketchId} AND user_id = ${TEST_USER_ID}
    `;

    expect(dbResult.rows).toHaveLength(1);
    const dbRow = dbResult.rows[0];

    // Verify db function returns same data as direct query
    expect(testSketch.id).toBe(dbRow.id);
    expect(testSketch.name).toBe(dbRow.name);
    expect(JSON.stringify(testSketch.nodes)).toBe(JSON.stringify(dbRow.nodes));
    expect(JSON.stringify(testSketch.edges)).toBe(JSON.stringify(dbRow.edges));
  });

  it('getSketchById should return sketch matching database', async () => {
    if (!process.env.POSTGRES_URL || !testSketchId) {
      expect.assertions(0);
      return;
    }

    // Import the database function
    const { getSketchById } = await import('../../api/_lib/db.js');

    // Get sketch via db function
    const sketch = await getSketchById(testSketchId, TEST_USER_ID);
    expect(sketch).toBeDefined();

    // Query database directly for comparison
    const dbResult = await sql`
      SELECT id, name, creation_date, nodes, edges, admin_config, created_at, updated_at
      FROM sketches
      WHERE id = ${testSketchId} AND user_id = ${TEST_USER_ID}
    `;

    expect(dbResult.rows).toHaveLength(1);
    const dbRow = dbResult.rows[0];

    // Verify exact match
    expect(sketch.id).toBe(dbRow.id);
    expect(sketch.name).toBe(dbRow.name);
    expect(sketch.creation_date).toEqual(dbRow.creation_date);
    expect(JSON.stringify(sketch.nodes)).toBe(JSON.stringify(dbRow.nodes));
    expect(JSON.stringify(sketch.edges)).toBe(JSON.stringify(dbRow.edges));
    expect(JSON.stringify(sketch.admin_config)).toBe(JSON.stringify(dbRow.admin_config));
  });

  it('API handler should return transformed data matching database', async () => {
    if (!process.env.POSTGRES_URL || !testSketchId) {
      expect.assertions(0);
      return;
    }

    // Mock verifyAuth to return our test user
    vi.mock('../../api/_lib/auth.js', async () => {
      const actual = await vi.importActual('../../api/_lib/auth.js');
      return {
        ...actual,
        verifyAuth: vi.fn().mockResolvedValue({ userId: TEST_USER_ID, error: null }),
      };
    });

    // Import the handler
    const { default: handler } = await import('../../api/sketches/index.js');

    // Create a mock request
    const mockRequest = {
      method: 'GET',
      headers: new Headers({
        'authorization': 'Bearer mock-token',
        'content-type': 'application/json',
      }),
    };

    // Call the handler with mock res object
    const mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    };
    
    await handler(mockRequest as any, mockResponse as any);
    
    // Extract data from the mock
    const data = mockResponse.json.mock.calls[0][0];

    expect(data).toHaveProperty('sketches');
    expect(Array.isArray(data.sketches)).toBe(true);

    // Find our test sketch in the response
    const apiSketch = data.sketches.find((s: { id: string }) => s.id === testSketchId);
    expect(apiSketch).toBeDefined();

    // Query database directly
    const dbResult = await sql`
      SELECT id, name, creation_date, nodes, edges, admin_config, created_at, updated_at
      FROM sketches
      WHERE id = ${testSketchId}
    `;
    const dbRow = dbResult.rows[0];

    // Verify API response matches database (with transformation)
    // Note: API returns dates as ISO strings, database returns Date objects
    expect(apiSketch.id).toBe(dbRow.id);
    expect(apiSketch.name).toBe(dbRow.name);
    // Compare dates as ISO strings
    const toIso = (d: any) => d instanceof Date ? d.toISOString() : d;
    
    expect(toIso(apiSketch.creationDate)).toBe(toIso(dbRow.creation_date));
    expect(toIso(apiSketch.createdAt)).toBe(toIso(dbRow.created_at));
    expect(toIso(apiSketch.updatedAt)).toBe(toIso(dbRow.updated_at));
    expect(JSON.stringify(apiSketch.nodes)).toBe(JSON.stringify(dbRow.nodes));
    expect(JSON.stringify(apiSketch.edges)).toBe(JSON.stringify(dbRow.edges));
    expect(JSON.stringify(apiSketch.adminConfig)).toBe(JSON.stringify(dbRow.admin_config));

    // Clean up mock
    vi.restoreAllMocks();
  });
});
