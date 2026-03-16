/**
 * API Route: /api/health
 *
 * Diagnostic endpoint to check environment config and database connectivity.
 * Returns non-sensitive configuration status for debugging deployment issues.
 */

export const config = {
  runtime: 'nodejs',
};

export default async function healthHandler(req, res) {
  // Allow CORS for quick browser testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const checks = {
    timestamp: new Date().toISOString(),
    environment: {
      VERCEL_ENV: process.env.VERCEL_ENV || '(not set)',
      NODE_ENV: process.env.NODE_ENV || '(not set)',
      POSTGRES_URL: process.env.POSTGRES_URL ? 'SET (' + process.env.POSTGRES_URL.substring(0, 20) + '...)' : 'MISSING',
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'MISSING',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ? 'SET' : 'MISSING',
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || '(not set)',
      VERCEL_URL: process.env.VERCEL_URL || '(not set)',
    },
    authModule: { status: 'unknown' },
    database: { status: 'unknown' },
    rateLimitTable: { status: 'unknown' },
  };

  // Check auth module import
  try {
    const { auth } = await import('../lib/auth.js');
    checks.authModule = {
      status: 'OK',
      trustedOrigins: auth.options?.trustedOrigins
        ? (Array.isArray(auth.options.trustedOrigins)
          ? auth.options.trustedOrigins.map(o => typeof o === 'function' ? '(function)' : o)
          : '(dynamic)')
        : '(none)',
    };
  } catch (err) {
    checks.authModule = {
      status: 'ERROR',
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 3).join('\n'),
    };
  }

  // Check database connectivity
  try {
    const { sql } = await import('@vercel/postgres');
    const result = await sql`SELECT 1 as ok`;
    checks.database = { status: 'OK', result: result.rows[0] };
  } catch (err) {
    checks.database = {
      status: 'ERROR',
      error: err.message,
    };
  }

  // Check rate_limit_log table
  try {
    const { sql } = await import('@vercel/postgres');
    const result = await sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rate_limit_log') as exists`;
    checks.rateLimitTable = { status: 'OK', exists: result.rows[0].exists };
  } catch (err) {
    checks.rateLimitTable = {
      status: 'ERROR',
      error: err.message,
    };
  }

  const allOk = checks.authModule.status === 'OK' && checks.database.status === 'OK';
  return res.status(allOk ? 200 : 500).json(checks);
}
