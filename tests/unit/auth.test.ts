/**
 * Unit tests for authentication helper functions
 * 
 * Tests sanitization and utility functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeErrorMessage, parseBody } from '../../api/_lib/auth.js';

describe('sanitizeErrorMessage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should return default message for null/undefined error in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    
    // Re-import to get fresh module with new env
    expect(sanitizeErrorMessage(null as any)).toBe('Internal server error');
    expect(sanitizeErrorMessage(undefined as any)).toBe('Internal server error');
  });

  it('should return custom default message when provided', () => {
    vi.stubEnv('NODE_ENV', 'production');
    
    expect(sanitizeErrorMessage(null as any, 'Custom error')).toBe('Custom error');
  });

  it('should return error message in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', undefined);
    
    const error = new Error('Detailed error message');
    expect(sanitizeErrorMessage(error)).toBe('Detailed error message');
  });

  it('should handle string errors in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', undefined);
    
    expect(sanitizeErrorMessage('String error')).toBe('String error');
  });
});

describe('parseBody', () => {
  it('should reject body exceeding max size based on Content-Length', async () => {
    const mockRequest = {
      headers: {
        'content-length': (10 * 1024 * 1024).toString(), // 10MB
      },
    };

    await expect(parseBody(mockRequest as any)).rejects.toThrow('Request body too large');
  });

  it('should handle request with json() method', async () => {
    const mockData = { test: 'data' };
    const mockRequest = {
      headers: { 'content-length': '100' },
      json: vi.fn().mockResolvedValue(mockData),
    };

    const result = await parseBody(mockRequest as any);
    expect(result).toEqual(mockData);
    expect(mockRequest.json).toHaveBeenCalled();
  });

  it('should handle request with body property', async () => {
    const mockBody = { existing: 'body' };
    const mockRequest = {
      headers: { 'content-length': '100' },
      body: mockBody,
    };

    const result = await parseBody(mockRequest as any);
    expect(result).toEqual(mockBody);
  });

  it('should handle streaming request body', async () => {
    const chunks = ['{"test":', '"data"}'];
    let dataCallback: Function;
    let endCallback: Function;

    const mockRequest = {
      headers: { 'content-length': '15' },
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'data') dataCallback = cb;
        if (event === 'end') endCallback = cb;
      }),
    };

    const promise = parseBody(mockRequest as any);

    // Simulate streaming data
    chunks.forEach((chunk) => dataCallback(chunk));
    endCallback();

    const result = await promise;
    expect(result).toEqual({ test: 'data' });
  });

  it('should handle empty streaming body', async () => {
    let endCallback: Function;

    const mockRequest = {
      headers: { 'content-length': '0' },
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'end') endCallback = cb;
      }),
    };

    const promise = parseBody(mockRequest as any);
    endCallback();

    const result = await promise;
    expect(result).toEqual({});
  });

  it('should reject streaming body exceeding max size', async () => {
    let dataCallback: Function;

    const mockRequest = {
      headers: {},
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'data') dataCallback = cb;
      }),
      destroy: vi.fn(),
    };

    const promise = parseBody(mockRequest as any, 10); // 10 bytes max

    // Send more than 10 bytes
    dataCallback('a'.repeat(20));

    await expect(promise).rejects.toThrow('Request body too large');
    expect(mockRequest.destroy).toHaveBeenCalled();
  });
});
