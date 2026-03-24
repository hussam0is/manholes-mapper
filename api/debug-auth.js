/**
 * Temporary debug endpoint to surface auth initialization errors.
 * DELETE THIS after debugging is complete.
 */
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const diagnostics = {
    env: {
      hasBetterAuthSecret: !!process.env.BETTER_AUTH_SECRET,
      hasPostgresUrl: !!process.env.POSTGRES_URL,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasVercelUrl: !!process.env.VERCEL_URL,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    },
    authImport: null,
    dbTest: null,
  };

  // Test 1: Can we import auth?
  try {
    const { auth } = await import('../lib/auth.js');
    diagnostics.authImport = { ok: true, type: typeof auth };
  } catch (err) {
    diagnostics.authImport = { ok: false, error: err.message, stack: err.stack?.split('\n').slice(0, 5) };
  }

  // Test 2: Can we connect to DB?
  try {
    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL });
    const result = await pool.query('SELECT 1 as test');
    diagnostics.dbTest = { ok: true, result: result.rows[0] };
    await pool.end();
  } catch (err) {
    diagnostics.dbTest = { ok: false, error: err.message };
  }

  res.status(200).json(diagnostics);
}
