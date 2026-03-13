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

  // --- KPI tracking ---
  const now = new Date();
  const weekAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgoMs = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgoMs = now.getTime() - 90 * 24 * 60 * 60 * 1000;

  // Summary accuracy
  let totalPrecisionSum = 0;
  let totalPrecisionCount = 0;
  let weekVelocity = 0;
  let prevWeekVelocity = 0;

  // Weekly velocity (last 12 weeks, keyed by Monday date string)
  const weeklyMap = new Map();

  // Accuracy distribution
  const accuracyDistribution = { rtk: 0, float: 0, dgps: 0, gps: 0, unknown: 0 };

  // Issue breakdown
  const issueBreakdown = { missingCoords: 0, missingMeasurements: 0, longEdges: 0, negativeGradients: 0 };

  // Activity heatmap (last 90 days): key = "date|user"
  const heatmapMap = new Map();

  // Per-user accuracy + active days tracking
  // Stored separately, merged into perUserMap after the loop
  const perUserAccMap = new Map(); // user -> { totalPrec, precCount, activeDaysSet }

  /**
   * Get the Monday (start of ISO week) for a given date string.
   * Returns 'YYYY-MM-DD' of that Monday, or null if invalid.
   */
  function getWeekMonday(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
    const diff = day === 0 ? -6 : 1 - day; // shift to Monday
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  for (const sketch of sketches) {
    const nodes = sketch.nodes || [];
    const edges = sketch.edges || [];
    const nodeCount = nodes.length;
    const edgeCount = edges.length;

    totalNodes += nodeCount;
    totalEdges += edgeCount;

    // Build node lookup map for edge processing (avoids repeated .find())
    const nodeById = new Map();
    for (const node of nodes) {
      nodeById.set(String(node.id), node);
    }

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

      // --- KPI: accuracy tracking ---
      if (hasSurvey && node.measure_precision != null && node.measure_precision > 0) {
        totalPrecisionSum += node.measure_precision;
        totalPrecisionCount++;
      }

      // --- KPI: accuracy distribution (only nodes with survey coords) ---
      if (hasSurvey) {
        const prec = node.measure_precision;
        if (prec != null && prec > 0) {
          if (prec < 0.05) accuracyDistribution.rtk++;
          else if (prec < 0.5) accuracyDistribution.float++;
          else if (prec < 5) accuracyDistribution.dgps++;
          else accuracyDistribution.gps++;
        } else {
          accuracyDistribution.unknown++;
        }
      }

      // --- KPI: velocity (this week / prev week) ---
      const measDate = node.measureDate || node.createdAt;
      if (measDate && hasSurvey) {
        const measMs = new Date(measDate).getTime();
        if (!isNaN(measMs)) {
          if (measMs >= weekAgoMs) {
            weekVelocity++;
          } else if (measMs >= twoWeeksAgoMs) {
            prevWeekVelocity++;
          }
        }
      }

      // --- KPI: weekly array (last 12 weeks) ---
      if (measDate && hasSurvey) {
        const monday = getWeekMonday(measDate);
        if (monday) {
          const mondayMs = new Date(monday).getTime();
          const twelveWeeksAgoMs = now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000;
          if (mondayMs >= twelveWeeksAgoMs) {
            weeklyMap.set(monday, (weeklyMap.get(monday) || 0) + 1);
          }
        }
      }

      // --- KPI: per-user accuracy + active days ---
      if (hasSurvey) {
        if (!perUserAccMap.has(nodeCreator)) {
          perUserAccMap.set(nodeCreator, { totalPrec: 0, precCount: 0, activeDaysSet: new Set() });
        }
        const uAcc = perUserAccMap.get(nodeCreator);
        if (node.measure_precision != null && node.measure_precision > 0) {
          uAcc.totalPrec += node.measure_precision;
          uAcc.precCount++;
        }
        const mDay = measDate ? String(measDate).slice(0, 10) : null;
        if (mDay && /^\d{4}-\d{2}-\d{2}$/.test(mDay)) {
          uAcc.activeDaysSet.add(mDay);
        }
      }

      // --- KPI: activity heatmap (last 90 days) ---
      if (measDate && nodeCreator) {
        const hDay = String(measDate).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(hDay)) {
          const hMs = new Date(hDay).getTime();
          if (!isNaN(hMs) && hMs >= ninetyDaysAgoMs) {
            const hKey = `${hDay}|${nodeCreator}`;
            heatmapMap.set(hKey, (heatmapMap.get(hKey) || 0) + 1);
          }
        }
      }

      // --- KPI: issue — missingCoords ---
      if (!hasSurvey &&
          node.type !== 'schematic' &&
          node.nodeType !== 'Home' &&
          node.isForLater !== true) {
        issueBreakdown.missingCoords++;
      }
    }

    // Compute km from survey coordinates + edge-level issue tracking
    let km = 0;
    for (const edge of edges) {
      const tailNode = nodeById.get(String(edge.tail));
      const headNode = nodeById.get(String(edge.head));
      const tailHasSurvey = tailNode?.surveyX != null && tailNode?.surveyY != null;
      const headHasSurvey = headNode?.surveyX != null && headNode?.surveyY != null;

      if (tailHasSurvey && headHasSurvey) {
        const dx = tailNode.surveyX - headNode.surveyX;
        const dy = tailNode.surveyY - headNode.surveyY;
        const distM = Math.sqrt(dx * dx + dy * dy);
        km += distM / 1000;

        // --- KPI: longEdges (>70m ITM) ---
        if (distM > 70) {
          issueBreakdown.longEdges++;
        }
      }

      // --- KPI: missingMeasurements ---
      // Edges connected to functional manholes (maintenanceStatus === 1)
      // where tail_measurement or head_measurement is missing
      const tailMeas = edge.tail_measurement;
      const headMeas = edge.head_measurement;
      const tailMissing = tailMeas == null || tailMeas === '' || tailMeas === undefined;
      const headMissing = headMeas == null || headMeas === '' || headMeas === undefined;
      if (tailMissing || headMissing) {
        const tailFunctional = tailNode?.maintenanceStatus === 1;
        const headFunctional = headNode?.maintenanceStatus === 1;
        if (tailFunctional || headFunctional) {
          issueBreakdown.missingMeasurements++;
        }
      }

      // --- KPI: negativeGradients ---
      // head_measurement > tail_measurement (both defined numbers > 0)
      const tailMeasNum = parseFloat(tailMeas);
      const headMeasNum = parseFloat(headMeas);
      if (!isNaN(tailMeasNum) && tailMeasNum > 0 &&
          !isNaN(headMeasNum) && headMeasNum > 0 &&
          headMeasNum > tailMeasNum) {
        issueBreakdown.negativeGradients++;
      }
    }
    totalKm += km;
    projStats.km += km;
  }

  // Build sorted arrays — merge per-user accuracy data
  const perUser = Array.from(perUserMap.values())
    .map(u => {
      const acc = perUserAccMap.get(u.user);
      const activeDays = acc ? acc.activeDaysSet.size : 0;
      return {
        ...u,
        avgAccuracy: acc && acc.precCount > 0
          ? Math.round((acc.totalPrec / acc.precCount) * 100) / 100
          : null,
        activeDays,
        nodesPerDay: activeDays > 0
          ? Math.round((u.nodesMeasured / activeDays) * 100) / 100
          : 0,
      };
    })
    .sort((a, b) => b.nodesMeasured - a.nodesMeasured);

  // Daily activity: last 30 days
  const daily = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const perProject = Array.from(perProjectMap.values())
    .filter(p => p.id) // exclude unassigned
    .sort((a, b) => b.nodes - a.nodes);

  // --- Build weekly velocity array (last 12 weeks, sorted chronologically) ---
  const weekly = Array.from(weeklyMap.entries())
    .map(([weekStart, count]) => ({ weekStart, count }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // --- Build activity heatmap array (last 90 days, only count > 0) ---
  const activityHeatmap = Array.from(heatmapMap.entries())
    .map(([key, count]) => {
      const [date, user] = key.split('|');
      return { date, user, count };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.user.localeCompare(b.user));

  // --- Compute summary KPIs ---
  const avgAccuracy = totalPrecisionCount > 0
    ? Math.round((totalPrecisionSum / totalPrecisionCount) * 100) / 100
    : null;

  const velocityChangePct = prevWeekVelocity > 0
    ? Math.round(((weekVelocity - prevWeekVelocity) / prevWeekVelocity) * 100)
    : null;

  const unmeasuredNodes = totalNodes - nodesWithCoords;
  const forecastDays = weekVelocity > 0
    ? Math.ceil(unmeasuredNodes / weekVelocity * 7)
    : null;

  return res.status(200).json({
    summary: {
      totalSketches: sketches.length,
      totalNodes,
      totalEdges,
      totalKm: Math.round(totalKm * 100) / 100,
      nodesWithCoords,
      completionPct: totalNodes > 0 ? Math.round((nodesWithCoords / totalNodes) * 100) : 0,
      avgAccuracy,
      weekVelocity,
      prevWeekVelocity,
      velocityChangePct,
      forecastDays,
    },
    perUser,
    daily,
    perProject,
    weekly,
    accuracyDistribution,
    issueBreakdown,
    activityHeatmap,
  });
}
