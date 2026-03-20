/**
 * API Route: /api/health
 *
 * Anonymous:  returns { status: "ok"|"error", timestamp }
 * Admin/Super-admin: returns full diagnostic details
 */

import { verifyAuth } from './_lib/auth.js';
import { getUserById } from './_lib/db.js';

export const config = {
  runtime: 'nodejs',
};

export default async function healthHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Quick DB connectivity check (used for both anon and admin)
  let dbOk = false;
  try {
    const { sql } = await import('@vercel/postgres');
    const result = await sql`SELECT 1 as ok`;
    dbOk = result.rows[0]?.ok === 1;
  } catch {
    dbOk = false;
  }

  // --- Anonymous response: minimal status only ---
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  let isAdmin = false;
  try {
    const { userId, error: authError } = await verifyAuth(request);
    if (!authError && userId) {
      const user = await getUserById(userId);
      isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    }
  } catch {
    // Not authenticated — that's fine for the basic check
  }

  if (!isAdmin) {
    return res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    });
  }

  // --- Admin response: full diagnostics (no secrets) ---
  const checks = {
    timestamp: new Date().toISOString(),
    environment: {
      VERCEL_ENV: process.env.VERCEL_ENV || '(not set)',
      NODE_ENV: process.env.NODE_ENV || '(not set)',
      POSTGRES_URL: process.env.POSTGRES_URL ? 'SET' : 'MISSING',
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'MISSING',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? 'SET' : 'MISSING',
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ? 'SET' : 'MISSING',
    },
    authModule: { status: 'unknown' },
    database: { status: dbOk ? 'OK' : 'ERROR' },
    rateLimitTable: { status: 'unknown' },
  };

  // Check auth module import
  try {
    await import('../lib/auth.js');
    checks.authModule = { status: 'OK' };
  } catch (err) {
    checks.authModule = { status: 'ERROR', error: err.message };
  }

  // Check rate_limit_log table
  try {
    const { sql } = await import('@vercel/postgres');
    const result = await sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rate_limit_log') as exists`;
    checks.rateLimitTable = { status: 'OK', exists: result.rows[0].exists };
  } catch (err) {
    checks.rateLimitTable = { status: 'ERROR', error: err.message };
  }

  const allOk = checks.authModule.status === 'OK' && checks.database.status === 'OK';
  return res.status(allOk ? 200 : 500).json(checks);
}
