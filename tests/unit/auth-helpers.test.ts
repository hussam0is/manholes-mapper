/**
 * Extended tests for auth helper functions
 *
 * Tests edge cases for verifyAuth header conversion, cookie parsing,
 * and error handling beyond the existing auth.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { sanitizeErrorMessage, parseBody } from '../../api/_lib/auth.js';

describe('sanitizeErrorMessage - extended', () => {
  it('should handle Error object with custom message in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');

    const error = new Error('Something went wrong');
    expect(sanitizeErrorMessage(error)).toBe('Internal server error');

    vi.unstubAllEnvs();
  });

  it('should handle errors in VERCEL_ENV production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'production');

    const error = new Error('Should be hidden');
    expect(sanitizeErrorMessage(error)).toBe('Internal server error');

    vi.unstubAllEnvs();
  });

  it('should handle non-Error objects in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', undefined);

    expect(sanitizeErrorMessage(42 as any)).toBe('42');
    expect(sanitizeErrorMessage(false as any)).toBe('false');

    vi.unstubAllEnvs();
  });

  it('should handle empty string error', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', undefined);

    // Empty string is falsy, so goes to default
    expect(sanitizeErrorMessage('' as any)).toBe('Internal server error');

    vi.unstubAllEnvs();
  });
});

describe('parseBody - extended edge cases', () => {
  it('should handle request with no Content-Length header', async () => {
    let endCallback: Function;

    const mockRequest = {
      headers: {},
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'end') endCallback = cb;
      }),
    };

    const promise = parseBody(mockRequest as any);
    endCallback!();

    const result = await promise;
    expect(result).toEqual({});
  });

  it('should handle request with json() that returns nested data', async () => {
    const nestedData = {
      sketch: {
        name: 'Test',
        nodes: [{ id: 1, x: 100, y: 200 }],
        edges: [],
      },
    };

    const mockRequest = {
      headers: { 'content-length': '200' },
      json: vi.fn().mockResolvedValue(nestedData),
    };

    const result = await parseBody(mockRequest as any);
    expect(result).toEqual(nestedData);
  });

  it('should handle request with json() that throws', async () => {
    const mockRequest = {
      headers: { 'content-length': '100' },
      json: vi.fn().mockRejectedValue(new Error('JSON parse error')),
    };

    await expect(parseBody(mockRequest as any)).rejects.toThrow('JSON parse error');
  });

  it('should handle request with body as empty object', async () => {
    const mockRequest = {
      headers: { 'content-length': '2' },
      body: {},
    };

    const result = await parseBody(mockRequest as any);
    expect(result).toEqual({});
  });

  it('should handle streaming error event', async () => {
    let errorCallback: Function;

    const mockRequest = {
      headers: {},
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'error') errorCallback = cb;
      }),
    };

    const promise = parseBody(mockRequest as any);
    errorCallback!(new Error('Stream error'));

    await expect(promise).rejects.toThrow('Stream error');
  });

  it('should accept exact max size via Content-Length', async () => {
    const maxSize = 1000;
    const mockRequest = {
      headers: { 'content-length': maxSize.toString() },
      body: { test: true },
    };

    // Should NOT throw because it's at the limit, not over
    const result = await parseBody(mockRequest as any, maxSize);
    expect(result).toEqual({ test: true });
  });

  it('should reject Content-Length just over max', async () => {
    const maxSize = 1000;
    const mockRequest = {
      headers: { 'content-length': (maxSize + 1).toString() },
    };

    await expect(parseBody(mockRequest as any, maxSize)).rejects.toThrow('Request body too large');
  });
});
