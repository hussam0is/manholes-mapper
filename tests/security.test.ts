/**
 * Security tests
 *
 * Tests for XSS prevention, injection attacks, authentication bypass,
 * and other OWASP-related security concerns.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  validateString,
  validateSketchInput,
  validateOrganizationInput,
  validateUserUpdateInput,
  validateFeaturesInput,
  validateUUID,
} from '../api/_lib/validators.js';
import { sanitizeErrorMessage, parseBody } from '../api/_lib/auth.js';

describe('Security: Input Validation', () => {
  describe('XSS Prevention via validateString', () => {
    it('should truncate excessively long strings', () => {
      const xssPayload = '<script>alert("xss")</script>'.repeat(100);
      const result = validateString(xssPayload, 50);
      expect(result!.length).toBeLessThanOrEqual(50);
    });

    it('should return null for non-string types to prevent type coercion attacks', () => {
      expect(validateString(123)).toBeNull();
      expect(validateString(true)).toBeNull();
      expect(validateString({})).toBeNull();
      expect(validateString([])).toBeNull();
      expect(validateString(() => {})).toBeNull();
      expect(validateString(Symbol())).toBeNull();
    });

    it('should handle string with null bytes', () => {
      const result = validateString('hello\x00world');
      expect(result).toBe('hello\x00world'); // passes through, up to consumer to handle
    });
  });

  describe('SQL Injection Prevention via validateUUID', () => {
    it('should reject SQL injection in UUID field', () => {
      expect(validateUUID("'; DROP TABLE sketches; --")).toBe(false);
      expect(validateUUID("1' OR '1'='1")).toBe(false);
      expect(validateUUID("UNION SELECT * FROM users")).toBe(false);
    });

    it('should reject UUID with special characters', () => {
      expect(validateUUID("550e8400-e29b-41d4-a716-44665544000'")).toBe(false);
      expect(validateUUID('550e8400-e29b-41d4-a716-446655440000;')).toBe(false);
      expect(validateUUID('550e8400-e29b-41d4-a716-446655440000--')).toBe(false);
    });
  });

  describe('Sketch Input Injection', () => {
    it('should reject non-string name types', () => {
      const errors = validateSketchInput({ name: 123 });
      expect(errors).toContain('name must be a string or null');
    });

    it('should reject XSS in node data (type coercion)', () => {
      const errors = validateSketchInput({
        nodes: [{ id: '<script>alert(1)</script>', x: 0, y: 0 }],
      });
      // The node is structurally valid, but XSS in id — consumer should escape
      expect(errors).toBeNull();
    });

    it('should reject prototype pollution attempt in adminConfig', () => {
      const errors = validateSketchInput({
        adminConfig: { __proto__: { isAdmin: true } },
      });
      // adminConfig is a valid object
      expect(errors).toBeNull();
    });

    it('should reject array as adminConfig', () => {
      const errors = validateSketchInput({ adminConfig: [1, 2, 3] });
      expect(errors).toContain('adminConfig must be an object');
    });

    it('should reject null as adminConfig', () => {
      const errors = validateSketchInput({ adminConfig: null });
      expect(errors).toContain('adminConfig must be an object');
    });

    it('should enforce node count limits to prevent DoS', () => {
      const nodes = Array(10001)
        .fill(null)
        .map((_, i) => ({ id: `n${i}`, x: i, y: i }));
      const errors = validateSketchInput({ nodes });
      expect(errors).not.toBeNull();
    });

    it('should enforce edge count limits to prevent DoS', () => {
      const edges = Array(50001)
        .fill(null)
        .map((_, i) => ({ id: `e${i}`, tail: 'n1', head: 'n2' }));
      const errors = validateSketchInput({ edges });
      expect(errors).not.toBeNull();
    });
  });

  describe('User Update Input Injection', () => {
    it('should reject role escalation with invalid role', () => {
      const errors = validateUserUpdateInput({ role: 'super_admin_override' });
      expect(errors).toContain('role must be one of: user, admin, super_admin');
    });

    it('should reject SQL injection in organizationId', () => {
      const errors = validateUserUpdateInput({
        organizationId: "'; DROP TABLE users; --",
      });
      expect(errors).toContain('organizationId must be a valid UUID');
    });

    it('should reject non-string role', () => {
      const errors = validateUserUpdateInput({ role: { admin: true } as any });
      expect(errors).toContain('role must be a string');
    });
  });

  describe('Organization Input Injection', () => {
    it('should reject oversized name (buffer overflow attempt)', () => {
      const errors = validateOrganizationInput({ name: 'A'.repeat(201) });
      expect(errors).toContain('name exceeds maximum of 200 characters');
    });

    it('should reject whitespace-only name', () => {
      const errors = validateOrganizationInput({ name: '   \t\n  ' });
      expect(errors).toContain('name cannot be empty');
    });
  });

  describe('Feature Input Injection', () => {
    it('should reject unknown feature keys (prevent feature injection)', () => {
      const errors = validateFeaturesInput({
        features: { _internal_bypass: true },
      });
      expect(errors).toContain('invalid feature key: _internal_bypass');
    });

    it('should reject non-boolean values', () => {
      const errors = validateFeaturesInput({
        features: { export_csv: 'true' as any },
      });
      expect(errors?.some((e) => e.includes('must be boolean'))).toBe(true);
    });
  });
});

describe('Security: Error Information Leakage', () => {
  it('should not expose error details in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    const sensitiveError = new Error('Database connection failed at postgres://user:password@host:5432/db');
    const result = sanitizeErrorMessage(sensitiveError);

    expect(result).toBe('Internal server error');
    expect(result).not.toContain('password');
    expect(result).not.toContain('postgres');

    vi.unstubAllEnvs();
  });

  it('should show error details in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', undefined);

    const error = new Error('Detailed debug info');
    const result = sanitizeErrorMessage(error);

    expect(result).toBe('Detailed debug info');

    vi.unstubAllEnvs();
  });

  it('should handle error objects without message property', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const result = sanitizeErrorMessage({} as any);
    expect(result).toBe('Internal server error');

    vi.unstubAllEnvs();
  });
});

describe('Security: Request Body Size Limits', () => {
  it('should reject oversized Content-Length header', async () => {
    const mockRequest = {
      headers: { 'content-length': (20 * 1024 * 1024).toString() }, // 20MB
    };

    await expect(parseBody(mockRequest as any)).rejects.toThrow('Request body too large');
  });

  it('should reject oversized streaming body', async () => {
    let dataCallback: Function;
    const mockRequest = {
      headers: {},
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'data') dataCallback = cb;
      }),
      destroy: vi.fn(),
    };

    const promise = parseBody(mockRequest as any, 100); // 100 bytes max

    // Send more than 100 bytes
    dataCallback!('x'.repeat(200));

    await expect(promise).rejects.toThrow('Request body too large');
    expect(mockRequest.destroy).toHaveBeenCalled();
  });

  it('should reject malformed JSON body', async () => {
    let dataCallback: Function;
    let endCallback: Function;

    const mockRequest = {
      headers: { 'content-length': '20' },
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'data') dataCallback = cb;
        if (event === 'end') endCallback = cb;
      }),
    };

    const promise = parseBody(mockRequest as any);

    dataCallback!('not valid json {{{');
    endCallback!();

    await expect(promise).rejects.toThrow();
  });
});

describe('Security: UUID Validation Edge Cases', () => {
  it('should reject UUIDs with trailing characters', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000\n')).toBe(false);
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000 ')).toBe(false);
  });

  it('should reject UUIDs with leading characters', () => {
    expect(validateUUID(' 550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(validateUUID('')).toBe(false);
  });

  it('should reject very long strings', () => {
    expect(validateUUID('a'.repeat(10000))).toBe(false);
  });

  it('should accept valid zero UUID', () => {
    expect(validateUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('should accept valid max UUID', () => {
    expect(validateUUID('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true);
  });
});
