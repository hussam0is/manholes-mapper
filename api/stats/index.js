/**
 * API Route: /api/stats
 *
 * GET /api/stats/leaderboard?projectId=UUID — Accuracy leaderboard
 *
 * Note: Uses standard Node.js (req, res) signature.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyAuth } from '../_lib/auth.js';
import { ensureDb, sql } from '../_lib/db.js';
import { validateUUID } from '../_lib/validators.js';
import { applyRateLimit } from '../_lib/rate-limit.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Rate limiting
  const rlResult = applyRateLimit(req);
  if (!rlResult.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Verify auth
  const session = await verifyAuth(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await ensureDb();

  // Parse path: /api/stats/leaderboard or /api/stats?type=leaderboard
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const subPath = pathParts[2] || url.searchParams.get('type') || '';

  if (subPath === 'leaderboard' && req.method === 'GET') {
    return handleLeaderboard(req, res, url);
  }

  return res.status(404).json({ error: 'Not found' });
}

async function handleLeaderboard(req, res, url) {
  const projectId = url.searchParams.get('projectId');

  let sketches;
  if (projectId) {
    if (!validateUUID(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }
    const result = await sql`
      SELECT nodes FROM sketches WHERE project_id = ${projectId}
    `;
    sketches = result.rows || result;
  } else {
    // All sketches (limited for performance)
    const result = await sql`
      SELECT nodes FROM sketches LIMIT 100
    `;
    sketches = result.rows || result;
  }

  // Aggregate per user
  const userStats = new Map();

  for (const sketch of sketches) {
    const nodes = sketch.nodes || [];
    for (const node of nodes) {
      if (!node.createdBy) continue;
      const hasSurvey = node.surveyX != null && node.surveyY != null;
      if (!hasSurvey) continue;

      if (!userStats.has(node.createdBy)) {
        userStats.set(node.createdBy, {
          user: node.createdBy,
          nodeCount: 0,
          totalPrecision: 0,
          precisionCount: 0,
        });
      }

      const stats = userStats.get(node.createdBy);
      stats.nodeCount++;

      if (node.measure_precision != null && node.measure_precision > 0) {
        stats.totalPrecision += node.measure_precision;
        stats.precisionCount++;
      }
    }
  }

  // Compute averages and stars
  const leaderboard = Array.from(userStats.values()).map(s => {
    const avgAccuracy = s.precisionCount > 0
      ? s.totalPrecision / s.precisionCount
      : null;

    // Star ratings based on average precision
    let stars = 0;
    if (avgAccuracy != null) {
      if (avgAccuracy < 0.035) stars = 3;
      else if (avgAccuracy < 0.05) stars = 2;
      else if (avgAccuracy < 0.1) stars = 1;
    }

    return {
      user: s.user,
      nodeCount: s.nodeCount,
      avgAccuracy,
      stars,
    };
  });

  // Sort by node count descending
  leaderboard.sort((a, b) => b.nodeCount - a.nodeCount);

  return res.status(200).json({ leaderboard });
}
