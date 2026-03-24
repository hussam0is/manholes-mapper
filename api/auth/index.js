import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";

export const config = { runtime: 'nodejs' };

const betterAuthHandler = toNodeHandler(auth);

export default async function handler(req, res) {
  // DB test
  if (req.headers['x-db-test'] === '1') {
    try {
      const { Pool } = await import('@neondatabase/serverless');
      const pool = new Pool({ connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL });
      const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
      await pool.end();
      return res.status(200).json({ tables: r.rows.map(x => x.table_name) });
    } catch (e) {
      return res.status(500).json({ dbError: e.message });
    }
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.status(204).end();
  }

  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  try {
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
}
