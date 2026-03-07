/**
 * API Route: /api/stats
 *
 * GET /api/stats/leaderboard?projectId=UUID — Accuracy leaderboard
 *
 * Note: Uses standard Node.js (req, res) signature.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyAuth, parseBody } from '../_lib/auth.js';
import { ensureDb, sql, getOrCreateUser } from '../_lib/db.js';
import { validateUUID } from '../_lib/validators.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { handleApiError } from '../_lib/error-handler.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Polyfill for helper functions that expect Web API Request
  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  // Rate limiting — SECURITY FIX: pass both req and res
  if (applyRateLimit(req, res)) {
    return;
  }

  // Verify auth — SECURITY FIX: check error field, not truthiness
  const { userId, error: authError, user: authUser } = await verifyAuth(request);
  if (authError) {
    return res.status(401).json({ error: authError });
  }

  await ensureDb();

  // Parse path: /api/stats/leaderboard or /api/stats?type=leaderboard
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const subPath = pathParts[2] || url.searchParams.get('type') || '';

  if (subPath === 'leaderboard' && req.method === 'GET') {
    // Get user record for org-scoped access
    const userRecord = await getOrCreateUser(userId, {
      username: authUser?.name, email: authUser?.email,
    });
    return handleLeaderboard(req, res, url, userId, userRecord);
  }

  return res.status(404).json({ error: 'Not found' });
}

async function handleLeaderboard(req, res, url, userId, userRecord) {
  const projectId = url.searchParams.get('projectId');
  const userRole = userRecord?.role || 'user';
  const userOrgId = userRecord?.organization_id;

  let sketches;
  if (projectId) {
    if (!validateUUID(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }
    // SECURITY FIX: Verify user has access to this project's organization
    if (userRole !== 'super_admin') {
      const projectResult = await sql`
        SELECT organization_id FROM projects WHERE id = ${projectId}
      `;
      const project = projectResult.rows?.[0];
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      if (project.organization_id !== userOrgId) {
        return res.status(403).json({ error: 'Access denied to this project' });
      }
    }
    const result = await sql`
      SELECT nodes FROM sketches WHERE project_id = ${projectId}
    `;
    sketches = result.rows || result;
  } else {
    // SECURITY FIX: Scope to user's organization instead of all sketches
    let result;
    if (userRole === 'super_admin') {
      result = await sql`SELECT nodes FROM sketches LIMIT 100`;
    } else if (userOrgId) {
      result = await sql`
        SELECT s.nodes FROM sketches s
        JOIN users u ON s.user_id = u.id
        WHERE u.organization_id = ${userOrgId}
        LIMIT 100
      `;
    } else {
      result = await sql`
        SELECT nodes FROM sketches WHERE user_id = ${userId} LIMIT 100
      `;
    }
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
