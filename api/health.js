/**
 * API Route: /api/health
 *
 * Lightweight health-check endpoint.
 * Uses Edge Runtime so it does NOT count toward the Vercel Hobby
 * 12-serverless-function limit.
 *
 * GET /api/health → 200 { status: "ok", timestamp, region }
 */

export const config = { runtime: 'edge' };

export default function handler(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const body = JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    region: process.env.VERCEL_REGION || 'unknown',
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
