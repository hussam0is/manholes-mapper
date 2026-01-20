/**
 * Integration tests for /api/sketches endpoint
 * 
 * Verifies that API responses match database content.
 * Requires POSTGRES_URL to be set in .env.local
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from '@vercel/postgres';
import { validSketch } from '../fixtures/sketches.js';

// Test user IDs for integration tests
const TEST_USER_ID = 'test_user_integration_' + Date.now();
const OTHER_USER_ID = 'test_user_other_' + Date.now();

// Track created test data for cleanup
let testSketchId: string | null = null;

// Mock verifyAuth
vi.mock('../../api/_lib/auth.js', async () => {
  const actual = await vi.importActual('../../api/_lib/auth.js');
  return {
    ...actual,
    verifyAuth: vi.fn(),
    parseBody: vi.fn(),
  };
});

describe('Sketches API Integration Tests', () => {
  // Skip tests if database is not configured
  beforeAll(async () => {
    if (!process.env.POSTGRES_URL) {
      console.warn('Skipping integration tests: POSTGRES_URL not set');
      return;
    }

    // Create a initial test sketch in the database for GET tests
    const result = await sql`
      INSERT INTO sketches (user_id, name, creation_date, nodes, edges, admin_config)
      VALUES (
        ${TEST_USER_ID},
        ${'Existing Sketch'},
        ${new Date().toISOString()},
        ${JSON.stringify(validSketch.nodes)}::jsonb,
        ${JSON.stringify(validSketch.edges)}::jsonb,
        ${JSON.stringify(validSketch.adminConfig)}::jsonb
      )
      RETURNING id
    `;

    testSketchId = result.rows[0]?.id;
  });

  afterAll(async () => {
    // Clean up all test data
    await sql`DELETE FROM sketches WHERE user_id LIKE 'test_user_%'`;
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
  });

  const mockRes = () => {
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    };
    return res;
  };

  describe('GET /api/sketches', () => {
    it('should return 401 if unauthorized', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: null, error: 'Unauthorized' });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'GET', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return sketches for authenticated user', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'GET', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0];
      expect(data.sketches.length).toBeGreaterThanOrEqual(1);
      expect(data.sketches.find((s: any) => s.id === testSketchId)).toBeDefined();
    });

    it('should not return sketches of other users', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: OTHER_USER_ID, error: null });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'GET', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0];
      expect(data.sketches.find((s: any) => s.id === testSketchId)).toBeUndefined();
    });
  });

  describe('POST /api/sketches', () => {
    it('should create a new sketch', async () => {
      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });
      (parseBody as any).mockResolvedValue({ ...validSketch, name: 'New Sketch' });

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'POST', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const data = res.json.mock.calls[0][0];
      expect(data.sketch.name).toBe('New Sketch');
      expect(data.sketch.id).toBeDefined();

      // Verify in DB
      const dbResult = await sql`SELECT * FROM sketches WHERE id = ${data.sketch.id}`;
      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].user_id).toBe(TEST_USER_ID);
    });

    it('should return 400 for invalid data', async () => {
      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });
      (parseBody as any).mockResolvedValue({ name: 123 }); // Invalid name type

      const { default: handler } = await import('../../api/sketches/index.js');
      const res = mockRes();
      await handler({ method: 'POST', headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('PUT /api/sketches/[id]', () => {
    it('should update an existing sketch', async () => {
      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });
      (parseBody as any).mockResolvedValue({ ...validSketch, name: 'Updated Name' });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'PUT', url: `/api/sketches/${testSketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0];
      expect(data.sketch.name).toBe('Updated Name');

      // Verify in DB
      const dbResult = await sql`SELECT name FROM sketches WHERE id = ${testSketchId}`;
      expect(dbResult.rows[0].name).toBe('Updated Name');
    });

    it('should return 404 when updating non-existent sketch', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });
      (parseBody as any).mockResolvedValue(validSketch);

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'PUT', url: `/api/sketches/${fakeId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should not allow updating other users sketch', async () => {
      const { verifyAuth, parseBody } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: OTHER_USER_ID, error: null });
      (parseBody as any).mockResolvedValue({ ...validSketch, name: 'Hacked Name' });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'PUT', url: `/api/sketches/${testSketchId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(404); // updateSketch returns null if not found for user
    });
  });

  describe('DELETE /api/sketches/[id]', () => {
    it('should delete a sketch', async () => {
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      // Create a temporary sketch to delete
      const result = await sql`
        INSERT INTO sketches (user_id, name) VALUES (${TEST_USER_ID}, 'To Delete') RETURNING id
      `;
      const idToDelete = result.rows[0].id;

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'DELETE', url: `/api/sketches/${idToDelete}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);

      // Verify in DB
      const dbResult = await sql`SELECT * FROM sketches WHERE id = ${idToDelete}`;
      expect(dbResult.rows).toHaveLength(0);
    });

    it('should return 404 when deleting non-existent sketch', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const { verifyAuth } = await import('../../api/_lib/auth.js');
      (verifyAuth as any).mockResolvedValue({ userId: TEST_USER_ID, error: null });

      const { default: handler } = await import('../../api/sketches/[id].js');
      const res = mockRes();
      await handler({ method: 'DELETE', url: `/api/sketches/${fakeId}`, headers: {} } as any, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
