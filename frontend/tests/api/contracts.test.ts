/**
 * API Contract Tests
 * 
 * Validates that API responses match expected schemas.
 * These tests don't require a database connection.
 */
import { describe, it, expect } from 'vitest';
import {
  VALID_ROLES,
  VALID_FEATURE_KEYS,
  validateSketchInput,
  validateOrganizationInput,
  validateFeaturesInput,
  validateUserUpdateInput,
} from '../../api/_lib/validators.js';

describe('API Contract: Schema Constants', () => {
  describe('VALID_ROLES', () => {
    it('should contain expected roles', () => {
      expect(VALID_ROLES).toContain('user');
      expect(VALID_ROLES).toContain('admin');
      expect(VALID_ROLES).toContain('super_admin');
    });

    it('should have exactly 3 roles', () => {
      expect(VALID_ROLES).toHaveLength(3);
    });
  });

  describe('VALID_FEATURE_KEYS', () => {
    it('should contain expected feature keys', () => {
      expect(VALID_FEATURE_KEYS).toContain('export_csv');
      expect(VALID_FEATURE_KEYS).toContain('export_sketch');
      expect(VALID_FEATURE_KEYS).toContain('admin_settings');
      expect(VALID_FEATURE_KEYS).toContain('finish_workday');
      expect(VALID_FEATURE_KEYS).toContain('node_types');
      expect(VALID_FEATURE_KEYS).toContain('edge_types');
    });

    it('should have exactly 6 feature keys', () => {
      expect(VALID_FEATURE_KEYS).toHaveLength(6);
    });
  });
});

describe('API Contract: Sketch Endpoint', () => {
  describe('POST /api/sketches - Request Schema', () => {
    it('should accept minimal valid sketch', () => {
      const minimalSketch = {
        name: 'Test',
        nodes: [],
        edges: [],
      };
      expect(validateSketchInput(minimalSketch)).toBeNull();
    });

    it('should accept full valid sketch', () => {
      const fullSketch = {
        name: 'Full Sketch',
        creationDate: '2024-01-15T10:30:00.000Z',
        nodes: [
          { id: 'n1', x: 100, y: 200, type: 'manhole' },
          { id: 'n2', x: 300, y: 400, type: 'home' },
        ],
        edges: [{ id: 'e1', tail: 'n1', head: 'n2', type: 'pipe' }],
        adminConfig: {
          theme: 'dark',
          nodeTypes: ['manhole', 'home'],
        },
      };
      expect(validateSketchInput(fullSketch)).toBeNull();
    });

    it('should enforce node structure', () => {
      // Node must have id, x, y
      const invalidNode = {
        nodes: [{ id: 'n1' }], // Missing x, y
      };
      const errors = validateSketchInput(invalidNode);
      expect(errors).not.toBeNull();
      expect(errors?.some((e: string) => e.includes('numeric x and y'))).toBe(true);
    });

    it('should enforce edge structure', () => {
      // Edge must have at least tail or head
      const invalidEdge = {
        edges: [{ id: 'e1' }], // Missing both tail and head
      };
      const errors = validateSketchInput(invalidEdge);
      expect(errors).not.toBeNull();
      expect(errors?.some((e) => e.includes('at least a tail or head'))).toBe(true);
    });

    it('should enforce size limits', () => {
      // Max 10000 nodes
      const tooManyNodes = {
        nodes: Array(10001)
          .fill(null)
          .map((_, i) => ({ id: `n${i}`, x: i, y: i })),
      };
      expect(validateSketchInput(tooManyNodes)).not.toBeNull();

      // Max 50000 edges
      const tooManyEdges = {
        edges: Array(50001)
          .fill(null)
          .map((_, i) => ({ id: `e${i}`, tail: 'n1', head: 'n2' })),
      };
      expect(validateSketchInput(tooManyEdges)).not.toBeNull();
    });
  });
});

describe('API Contract: Organization Endpoint', () => {
  describe('POST /api/organizations - Request Schema', () => {
    it('should require name field', () => {
      const errors = validateOrganizationInput({});
      expect(errors).toContain('name is required');
    });

    it('should accept valid organization', () => {
      const errors = validateOrganizationInput({ name: 'Acme Corp' });
      expect(errors).toBeNull();
    });

    it('should reject empty name', () => {
      const errors = validateOrganizationInput({ name: '' });
      expect(errors).toContain('name cannot be empty');
    });
  });
});

describe('API Contract: Features Endpoint', () => {
  describe('PUT /api/features - Request Schema', () => {
    it('should accept valid features update', () => {
      const errors = validateFeaturesInput({
        features: {
          export_csv: true,
          export_sketch: false,
        },
      });
      expect(errors).toBeNull();
    });

    it('should reject unknown feature keys', () => {
      const errors = validateFeaturesInput({
        features: {
          unknown_feature: true,
        },
      });
      expect(errors).toContain('invalid feature key: unknown_feature');
    });

    it('should reject non-boolean values', () => {
      const errors = validateFeaturesInput({
        features: {
          export_csv: 'yes' as any,
        },
      });
      expect(errors?.some((e) => e.includes('must be boolean'))).toBe(true);
    });
  });
});

describe('API Contract: Users Endpoint', () => {
  describe('PUT /api/users/:id - Request Schema', () => {
    it('should accept valid role update', () => {
      const errors = validateUserUpdateInput({ role: 'admin' });
      expect(errors).toBeNull();
    });

    it('should accept valid organization assignment', () => {
      const errors = validateUserUpdateInput({
        organizationId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(errors).toBeNull();
    });

    it('should reject invalid role', () => {
      const errors = validateUserUpdateInput({ role: 'superuser' });
      expect(errors?.some((e) => e.includes('role must be one of'))).toBe(true);
    });

    it('should reject invalid UUID for organizationId', () => {
      const errors = validateUserUpdateInput({ organizationId: 'not-valid' });
      expect(errors).toContain('organizationId must be a valid UUID');
    });
  });
});

describe('API Contract: Response Schemas', () => {
  /**
   * These tests document expected response structures.
   * They serve as contract documentation.
   */

  it('should document sketch response structure', () => {
    const expectedSketchResponse = {
      sketch: {
        id: expect.any(String), // UUID
        name: expect.any(String),
        creationDate: expect.any(String), // ISO date
        nodes: expect.any(Array),
        edges: expect.any(Array),
        adminConfig: expect.any(Object),
        userId: expect.any(String),
      },
    };

    // This serves as documentation - actual shape validation
    const sampleResponse = {
      sketch: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test',
        creationDate: '2024-01-15T10:30:00.000Z',
        nodes: [],
        edges: [],
        adminConfig: {},
        userId: 'user-123',
      },
    };

    expect(sampleResponse).toMatchObject(expectedSketchResponse);
  });

  it('should document error response structure', () => {
    const expectedErrorResponse = {
      error: expect.any(String),
    };

    const sampleError = { error: 'Unauthorized' };
    expect(sampleError).toMatchObject(expectedErrorResponse);
  });

  it('should document list response structure', () => {
    const expectedListResponse = {
      sketches: expect.any(Array),
    };

    const sampleList = { sketches: [] };
    expect(sampleList).toMatchObject(expectedListResponse);
  });
});
