/**
 * Extended unit tests for validators
 * 
 * Comprehensive coverage for all validation functions.
 */
import { describe, it, expect } from 'vitest';
import {
  validateString,
  validateRole,
  validateFeatureKey,
  validateUUID,
  validateSketchInput,
  validateUserUpdateInput,
  validateOrganizationInput,
  validateFeaturesInput,
  VALID_ROLES,
  VALID_FEATURE_KEYS,
} from '../../api/_lib/validators.js';

describe('validateString', () => {
  it('should return null for null input', () => {
    expect(validateString(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(validateString(undefined)).toBeNull();
  });

  it('should return null for non-string input', () => {
    expect(validateString(123)).toBeNull();
    expect(validateString({})).toBeNull();
    expect(validateString([])).toBeNull();
  });

  it('should return the string for valid input', () => {
    expect(validateString('hello')).toBe('hello');
  });

  it('should truncate strings exceeding max length', () => {
    const longString = 'a'.repeat(2000);
    expect(validateString(longString, 100)).toBe('a'.repeat(100));
  });

  it('should use default max length of 1000', () => {
    const longString = 'a'.repeat(1500);
    expect(validateString(longString)).toBe('a'.repeat(1000));
  });
});

describe('validateRole', () => {
  it('should accept all valid roles', () => {
    VALID_ROLES.forEach((role) => {
      expect(validateRole(role)).toBe(true);
    });
  });

  it('should reject invalid roles', () => {
    expect(validateRole('superuser')).toBe(false);
    expect(validateRole('guest')).toBe(false);
    expect(validateRole('')).toBe(false);
    expect(validateRole('ADMIN')).toBe(false); // Case sensitive
  });
});

describe('validateFeatureKey', () => {
  it('should accept all valid feature keys', () => {
    VALID_FEATURE_KEYS.forEach((key) => {
      expect(validateFeatureKey(key)).toBe(true);
    });
  });

  it('should reject invalid feature keys', () => {
    expect(validateFeatureKey('invalid_feature')).toBe(false);
    expect(validateFeatureKey('EXPORT_CSV')).toBe(false); // Case sensitive
    expect(validateFeatureKey('')).toBe(false);
  });
});

describe('validateUUID', () => {
  it('should accept valid v4 UUIDs', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(validateUUID('7f33d02b-871c-4394-884b-017e88c79219')).toBe(true);
    expect(validateUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(validateUUID('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true);
  });

  it('should accept UUIDs in uppercase', () => {
    expect(validateUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('should reject invalid formats', () => {
    expect(validateUUID('not-a-uuid')).toBe(false);
    expect(validateUUID('550e8400-e29b-41d4-a716')).toBe(false); // Too short
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false); // Too long
    expect(validateUUID('550e8400e29b41d4a716446655440000')).toBe(false); // No dashes
    expect(validateUUID('')).toBe(false);
    expect(validateUUID(null as any)).toBe(false);
    expect(validateUUID(undefined as any)).toBe(false);
    expect(validateUUID(123 as any)).toBe(false);
  });
});

describe('validateSketchInput - edge cases', () => {
  it('should accept empty name string', () => {
    const errors = validateSketchInput({ name: '' });
    expect(errors).toBeNull();
  });

  it('should accept null name', () => {
    const errors = validateSketchInput({ name: null });
    expect(errors).toBeNull();
  });

  it('should reject name exceeding 200 characters', () => {
    const errors = validateSketchInput({ name: 'a'.repeat(201) });
    expect(errors).toContain('name exceeds maximum of 200 characters');
  });

  it('should accept edges array', () => {
    const errors = validateSketchInput({ edges: [] });
    expect(errors).toBeNull();
  });

  it('should reject edges exceeding maximum', () => {
    const edges = Array(50001)
      .fill(null)
      .map((_, i) => ({ id: `e${i}`, tail: 'n1', head: 'n2' }));
    const errors = validateSketchInput({ edges });
    expect(errors).toContain('edges exceeds maximum of 50000');
  });

  it('should validate adminConfig is an object', () => {
    expect(validateSketchInput({ adminConfig: [] })).toContain('adminConfig must be an object');
    expect(validateSketchInput({ adminConfig: null })).toContain('adminConfig must be an object');
  });

  it('should accept valid creationDate string', () => {
    const errors = validateSketchInput({ creationDate: '2024-01-01T00:00:00.000Z' });
    expect(errors).toBeNull();
  });

  it('should reject non-string creationDate', () => {
    const errors = validateSketchInput({ creationDate: 12345 as any });
    expect(errors).toContain('creationDate must be a string');
  });
});

describe('validateUserUpdateInput', () => {
  it('should accept valid role update', () => {
    const errors = validateUserUpdateInput({ role: 'admin' });
    expect(errors).toBeNull();
  });

  it('should reject invalid role', () => {
    const errors = validateUserUpdateInput({ role: 'superuser' });
    expect(errors).toContain('role must be one of: user, admin, super_admin');
  });

  it('should reject non-string role', () => {
    const errors = validateUserUpdateInput({ role: 123 as any });
    expect(errors).toContain('role must be a string');
  });

  it('should accept valid organizationId', () => {
    const errors = validateUserUpdateInput({
      organizationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(errors).toBeNull();
  });

  it('should accept null organizationId', () => {
    const errors = validateUserUpdateInput({ organizationId: null });
    expect(errors).toBeNull();
  });

  it('should reject invalid organizationId format', () => {
    const errors = validateUserUpdateInput({ organizationId: 'not-a-uuid' });
    expect(errors).toContain('organizationId must be a valid UUID');
  });

  it('should reject non-string organizationId', () => {
    const errors = validateUserUpdateInput({ organizationId: 123 as any });
    expect(errors).toContain('organizationId must be a string');
  });
});

describe('validateOrganizationInput', () => {
  it('should accept valid organization name', () => {
    const errors = validateOrganizationInput({ name: 'Test Org' });
    expect(errors).toBeNull();
  });

  it('should require name', () => {
    const errors = validateOrganizationInput({});
    expect(errors).toContain('name is required');
  });

  it('should reject null name', () => {
    const errors = validateOrganizationInput({ name: null });
    expect(errors).toContain('name is required');
  });

  it('should reject non-string name', () => {
    const errors = validateOrganizationInput({ name: 123 });
    expect(errors).toContain('name must be a string');
  });

  it('should reject empty name', () => {
    const errors = validateOrganizationInput({ name: '   ' });
    expect(errors).toContain('name cannot be empty');
  });

  it('should reject name exceeding 200 characters', () => {
    const errors = validateOrganizationInput({ name: 'a'.repeat(201) });
    expect(errors).toContain('name exceeds maximum of 200 characters');
  });
});

describe('validateFeaturesInput', () => {
  it('should accept valid features object', () => {
    const errors = validateFeaturesInput({
      features: { export_csv: true, admin_settings: false },
    });
    expect(errors).toBeNull();
  });

  it('should require features object', () => {
    const errors = validateFeaturesInput({});
    expect(errors).toContain('features must be an object');
  });

  it('should reject array as features', () => {
    const errors = validateFeaturesInput({ features: [] });
    expect(errors).toContain('features must be an object');
  });

  it('should reject invalid feature key', () => {
    const errors = validateFeaturesInput({
      features: { invalid_key: true },
    });
    expect(errors).toContain('invalid feature key: invalid_key');
  });

  it('should reject non-boolean feature value', () => {
    const errors = validateFeaturesInput({
      features: { export_csv: 'yes' as any },
    });
    expect(errors).toContain('feature value for export_csv must be boolean');
  });

  it('should collect multiple errors', () => {
    const errors = validateFeaturesInput({
      features: { invalid_key: 'not-boolean' as any },
    });
    expect(errors).toContain('invalid feature key: invalid_key');
    expect(errors).toContain('feature value for invalid_key must be boolean');
  });
});
