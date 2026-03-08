/**
 * API Route: /api/stats
 *
 * GET /api/stats/leaderboard?projectId=UUID — Accuracy leaderboard
 * GET /api/stats/workload?projectId=UUID    — Workload statistics (admin/super_admin)
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

  // Get user record for org-scoped access
  const userRecord = await getOrCreateUser(userId, {
    username: authUser?.name, email: authUser?.email,
  });

  if (subPath === 'leaderboard' && req.method === 'GET') {
    return handleLeaderboard(req, res, url, userId, userRecord);
  }

  if (subPath === 'workload' && req.method === 'GET') {
    return handleWorkload(req, res, url, userId, userRecord);
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

/**
 * GET /api/stats/workload — Workload statistics for admins
 *
 * Returns:
 * - summary: total sketches, nodes, edges, km
 * - perUser: per-user workload (sketches, nodes measured, last active)
 * - daily: daily activity (nodes created per day, last 30 days)
 * - perProject: per-project breakdown
 */
async function handleWorkload(req, res, url, userId, userRecord) {
  const userRole = userRecord?.role || 'user';
  const userOrgId = userRecord?.organization_id;

  // Only admin and super_admin can access workload stats
  if (userRole !== 'admin' && userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const projectId = url.searchParams.get('projectId');

  // Build WHERE clause based on role and optional project filter
  let sketchResult;
  if (projectId) {
    if (!validateUUID(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }
    // Verify access
    if (userRole !== 'super_admin') {
      const projResult = await sql`SELECT organization_id FROM projects WHERE id = ${projectId}`;
      const proj = projResult.rows?.[0];
      if (!proj || proj.organization_id !== userOrgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    sketchResult = await sql`
      SELECT s.id, s.name, s.nodes, s.edges, s.created_by, s.last_edited_by,
             s.creation_date, s.created_at, s.updated_at, s.project_id,
             p.name as project_name
      FROM sketches s
      LEFT JOIN projects p ON s.project_id = p.id
      WHERE s.project_id = ${projectId}
      ORDER BY s.updated_at DESC
      LIMIT 500
    `;
  } else if (userRole === 'super_admin') {
    sketchResult = await sql`
      SELECT s.id, s.name, s.nodes, s.edges, s.created_by, s.last_edited_by,
             s.creation_date, s.created_at, s.updated_at, s.project_id,
             p.name as project_name
      FROM sketches s
      LEFT JOIN projects p ON s.project_id = p.id
      ORDER BY s.updated_at DESC
      LIMIT 500
    `;
  } else {
    // Admin: scoped to own organization
    sketchResult = await sql`
      SELECT s.id, s.name, s.nodes, s.edges, s.created_by, s.last_edited_by,
             s.creation_date, s.created_at, s.updated_at, s.project_id,
             p.name as project_name
      FROM sketches s
      LEFT JOIN projects p ON s.project_id = p.id
      JOIN users u ON s.user_id = u.id
      WHERE u.organization_id = ${userOrgId}
      ORDER BY s.updated_at DESC
      LIMIT 500
    `;
  }

  const sketches = sketchResult.rows || sketchResult;

  // Aggregation
  let totalNodes = 0;
  let totalEdges = 0;
  let totalKm = 0;
  let nodesWithCoords = 0;
  const perUserMap = new Map();
  const dailyMap = new Map();
  const perProjectMap = new Map();

  for (const sketch of sketches) {
    const nodes = sketch.nodes || [];
    const edges = sketch.edges || [];
    const nodeCount = nodes.length;
    const edgeCount = edges.length;

    totalNodes += nodeCount;
    totalEdges += edgeCount;

    // Project aggregation
    const projKey = sketch.project_id || '__unassigned__';
    const projName = sketch.project_name || null;
    if (!perProjectMap.has(projKey)) {
      perProjectMap.set(projKey, {
        id: sketch.project_id,
        name: projName,
        sketches: 0,
        nodes: 0,
        edges: 0,
        km: 0,
        nodesWithCoords: 0,
      });
    }
    const projStats = perProjectMap.get(projKey);
    projStats.sketches++;
    projStats.nodes += nodeCount;
    projStats.edges += edgeCount;

    // Per-user: track sketch creation
    const creator = sketch.created_by || 'unknown';
    if (!perUserMap.has(creator)) {
      perUserMap.set(creator, {
        user: creator,
        sketchesCreated: 0,
        nodesMeasured: 0,
        nodesCreated: 0,
        lastActive: null,
      });
    }
    const userStats = perUserMap.get(creator);
    userStats.sketchesCreated++;
    const sketchDate = sketch.updated_at || sketch.created_at;
    if (sketchDate && (!userStats.lastActive || new Date(sketchDate) > new Date(userStats.lastActive))) {
      userStats.lastActive = sketchDate;
    }

    // Process nodes
    for (const node of nodes) {
      const hasSurvey = node.surveyX != null && node.surveyY != null;
      if (hasSurvey) {
        nodesWithCoords++;
        projStats.nodesWithCoords++;
      }

      // Per-node creator tracking
      const nodeCreator = node.createdBy || creator;
      if (!perUserMap.has(nodeCreator)) {
        perUserMap.set(nodeCreator, {
          user: nodeCreator,
          sketchesCreated: 0,
          nodesMeasured: 0,
          nodesCreated: 0,
          lastActive: null,
        });
      }
      const nodeUserStats = perUserMap.get(nodeCreator);
      nodeUserStats.nodesCreated++;
      if (hasSurvey) nodeUserStats.nodesMeasured++;

      // Daily activity from node measureDate or createdAt
      const nodeDate = node.measureDate || node.createdAt;
      if (nodeDate) {
        const day = String(nodeDate).slice(0, 10); // YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
        }
      }
    }

    // Compute km from survey coordinates
    let km = 0;
    for (const edge of edges) {
      const tailNode = nodes.find(n => String(n.id) === String(edge.tail));
      const headNode = nodes.find(n => String(n.id) === String(edge.head));
      if (tailNode?.surveyX != null && tailNode?.surveyY != null &&
          headNode?.surveyX != null && headNode?.surveyY != null) {
        const dx = tailNode.surveyX - headNode.surveyX;
        const dy = tailNode.surveyY - headNode.surveyY;
        km += Math.sqrt(dx * dx + dy * dy) / 1000;
      }
    }
    totalKm += km;
    projStats.km += km;
  }

  // Build sorted arrays
  const perUser = Array.from(perUserMap.values())
    .sort((a, b) => b.nodesMeasured - a.nodesMeasured);

  // Daily activity: last 30 days
  const daily = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const perProject = Array.from(perProjectMap.values())
    .filter(p => p.id) // exclude unassigned
    .sort((a, b) => b.nodes - a.nodes);

  return res.status(200).json({
    summary: {
      totalSketches: sketches.length,
      totalNodes,
      totalEdges,
      totalKm: Math.round(totalKm * 100) / 100,
      nodesWithCoords,
      completionPct: totalNodes > 0 ? Math.round((nodesWithCoords / totalNodes) * 100) : 0,
    },
    perUser,
    daily,
    perProject,
  });
}
