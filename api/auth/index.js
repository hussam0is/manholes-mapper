import { auth } from "../../lib/auth.js";
import { toNodeHandler } from "better-auth/node";
import { handleCors } from "../_lib/cors.js";
import { applyRateLimit, MAX_REQUESTS_AUTH } from "../_lib/rate-limit.js";

export const config = { runtime: 'nodejs' };

const betterAuthHandler = toNodeHandler(auth);

export default async function handler(req, res) {
  // CORS — use the shared allowlist-based helper (handles OPTIONS preflight too).
  if (handleCors(req, res)) return;

  // Rate limit /api/auth/* more strictly than the default API surface.
  // This is the first line of defense against credential stuffing / signup abuse.
  if (applyRateLimit(req, res, MAX_REQUESTS_AUTH)) return;

  try {
    return await betterAuthHandler(req, res);
  } catch (error) {
    console.error('[Auth API] Error:', error?.message || error);
    if (!res.headersSent) {
      const isDev = process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
      return res.status(500).json({
        error: isDev ? (error?.message || 'Internal server error') : 'Internal server error',
      });
    }
  }
}
