/**
 * Unit tests for API rate limiting module
 *
 * Tests the sliding window rate limiter, IP extraction,
 * and the applyRateLimit middleware.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkRateLimit,
  applyRateLimit,
  MAX_REQUESTS_DEFAULT,
  MAX_REQUESTS_AUTH,
} from '../../api/_lib/rate-limit.js';

// Helper to create mock request with IP
function mockReq(ip: string, extraHeaders: Record<string, string> = {}) {
  return {
    headers: {
      'x-forwarded-for': ip,
      ...extraHeaders,
    },
    connection: { remoteAddress: '127.0.0.1' },
  };
}

// Helper to create mock response
function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
}

describe('Rate Limit Constants', () => {
  it('should export default request limit', () => {
    expect(MAX_REQUESTS_DEFAULT).toBe(100);
  });

  it('should export auth request limit', () => {
    expect(MAX_REQUESTS_AUTH).toBe(20);
  });
});

describe('checkRateLimit', () => {
  it('should allow first request', () => {
    // Use a unique IP for each test to avoid cross-test contamination
    const ip = `test-first-${Date.now()}`;
    const result = checkRateLimit(mockReq(ip));

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(MAX_REQUESTS_DEFAULT - 1);
    expect(result.limit).toBe(MAX_REQUESTS_DEFAULT);
  });

  it('should track requests per IP', () => {
    const ip = `test-track-${Date.now()}`;
    const req = mockReq(ip);

    const r1 = checkRateLimit(req);
    const r2 = checkRateLimit(req);
    const r3 = checkRateLimit(req);

    expect(r1.remaining).toBeGreaterThan(r2.remaining);
    expect(r2.remaining).toBeGreaterThan(r3.remaining);
  });

  it('should block when limit exceeded', () => {
    const ip = `test-block-${Date.now()}`;
    const req = mockReq(ip);

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      checkRateLimit(req, 5);
    }

    const result = checkRateLimit(req, 5);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('should support custom max requests', () => {
    const ip = `test-custom-${Date.now()}`;
    const req = mockReq(ip);

    const result = checkRateLimit(req, 10);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
  });

  it('should extract IP from x-forwarded-for header', () => {
    const ip = `192.168.1.${Date.now() % 256}`;
    const req = mockReq(ip);

    const result = checkRateLimit(req);
    expect(result.allowed).toBe(true);
  });

  it('should handle multiple IPs in x-forwarded-for (use first)', () => {
    const req = {
      headers: {
        'x-forwarded-for': `10.0.0.${Date.now() % 256}, 192.168.0.1, 172.16.0.1`,
      },
    };

    const result = checkRateLimit(req as any);
    expect(result.allowed).toBe(true);
  });

  it('should fall back to x-real-ip header', () => {
    const req = {
      headers: {
        'x-real-ip': `fallback-${Date.now()}`,
      },
    };

    const result = checkRateLimit(req as any);
    expect(result.allowed).toBe(true);
  });

  it('should fall back to cf-connecting-ip header', () => {
    const req = {
      headers: {
        'cf-connecting-ip': `cloudflare-${Date.now()}`,
      },
    };

    const result = checkRateLimit(req as any);
    expect(result.allowed).toBe(true);
  });

  it('should use connection remoteAddress as last fallback', () => {
    const req = {
      headers: {},
      connection: { remoteAddress: `remote-${Date.now()}` },
    };

    const result = checkRateLimit(req as any);
    expect(result.allowed).toBe(true);
  });

  it('should isolate rate limits between different IPs', () => {
    const ip1 = `isolated-a-${Date.now()}`;
    const ip2 = `isolated-b-${Date.now()}`;

    // Exhaust IP1
    for (let i = 0; i < 3; i++) {
      checkRateLimit(mockReq(ip1), 3);
    }

    const resultIp1 = checkRateLimit(mockReq(ip1), 3);
    const resultIp2 = checkRateLimit(mockReq(ip2), 3);

    expect(resultIp1.allowed).toBe(false);
    expect(resultIp2.allowed).toBe(true);
  });
});

describe('applyRateLimit', () => {
  it('should return false (not rate limited) for allowed request', () => {
    const ip = `apply-allow-${Date.now()}`;
    const req = mockReq(ip);
    const res = mockRes();

    const isLimited = applyRateLimit(req as any, res as any);

    expect(isLimited).toBe(false);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', MAX_REQUESTS_DEFAULT);
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      expect.any(Number)
    );
  });

  it('should return true (rate limited) and send 429 when exceeded', () => {
    const ip = `apply-limit-${Date.now()}`;
    const req = mockReq(ip);
    const res = mockRes();

    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      applyRateLimit(req as any, mockRes() as any, 3);
    }

    const isLimited = applyRateLimit(req as any, res as any, 3);

    expect(isLimited).toBe(true);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Too many requests',
        retryAfter: expect.any(Number),
      })
    );
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });

  it('should accept custom maxRequests parameter', () => {
    const ip = `apply-custom-${Date.now()}`;
    const req = mockReq(ip);
    const res = mockRes();

    applyRateLimit(req as any, res as any, 50);

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 50);
  });
});
