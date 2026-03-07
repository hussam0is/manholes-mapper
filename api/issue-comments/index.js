/**
 * API Route: /api/issue-comments
 *
 * GET  ?sketchId=<id>&nodeId=<id> - Get comments for an issue node
 * POST - Add a comment (or close/reopen) to an issue node
 *
 * Note: Uses standard Node.js (req, res) signature for better compatibility with vercel dev.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyAuth, parseBody } from '../_lib/auth.js';
import {
  ensureDb,
  getIssueComments,
  addIssueComment,
  createIssueNotifications,
  createMentionNotifications,
  getOrCreateUser,
  markIssueNotificationsRead,
  getSketchById,
  getSketchByIdAdmin,
} from '../_lib/db.js';
import { validateUUID } from '../_lib/validators.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { handleApiError } from '../_lib/error-handler.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  if (applyRateLimit(req, res)) return;

  try {
    await ensureDb();

    const { userId, error, user: authUser } = await verifyAuth(request);
    if (error) {
      return res.status(401).json({ error });
    }

    // SECURITY FIX: Helper to verify user has access to a sketch
    async function verifySketchAccess(sketchId) {
      const userRecord = await getOrCreateUser(userId, {
        username: authUser?.name, email: authUser?.email,
      });
      const userRole = userRecord?.role || 'user';
      const userOrgId = userRecord?.organization_id;

      if (userRole === 'super_admin') return true;
      if (userRole === 'admin' && userOrgId) {
        const sketch = await getSketchByIdAdmin(sketchId);
        return sketch && sketch.owner_organization_id === userOrgId;
      }
      const sketch = await getSketchById(sketchId, userId);
      return !!sketch;
    }

    if (req.method === 'GET') {
      const sketchId = req.query?.sketchId || new URL(req.url, 'http://localhost').searchParams.get('sketchId');
      const nodeId = req.query?.nodeId || new URL(req.url, 'http://localhost').searchParams.get('nodeId');

      if (!sketchId || !validateUUID(sketchId)) {
        return res.status(400).json({ error: 'Valid sketchId is required' });
      }
      if (!nodeId) {
        return res.status(400).json({ error: 'nodeId is required' });
      }

      // Verify access before returning comments
      if (!await verifySketchAccess(sketchId)) {
        return res.status(404).json({ error: 'Sketch not found' });
      }

      const comments = await getIssueComments(sketchId, nodeId);

      // Mark notifications for this issue as read for the current user
      await markIssueNotificationsRead(userId, sketchId, nodeId);

      return res.status(200).json({ comments });
    }

    if (req.method === 'POST') {
      const body = await parseBody(request);
      const { sketchId, nodeId, content, isCloseAction, isReopenAction, mentionedUserIds } = body;

      if (!sketchId || !validateUUID(sketchId)) {
        return res.status(400).json({ error: 'Valid sketchId is required' });
      }
      if (!nodeId) {
        return res.status(400).json({ error: 'nodeId is required' });
      }
      if (nodeId.length > 200) {
        return res.status(400).json({ error: 'nodeId too long' });
      }
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'Comment content is required' });
      }
      if (content.length > 5000) {
        return res.status(400).json({ error: 'Comment content too long (max 5000 characters)' });
      }

      // SECURITY FIX: Verify access before allowing comment
      if (!await verifySketchAccess(sketchId)) {
        return res.status(404).json({ error: 'Sketch not found' });
      }

      // SECURITY FIX: Validate mentionedUserIds as UUIDs
      if (Array.isArray(mentionedUserIds)) {
        for (const mid of mentionedUserIds) {
          if (!validateUUID(mid)) {
            return res.status(400).json({ error: 'Invalid mentionedUserIds — each must be a valid UUID' });
          }
        }
      }

      // Get username
      const user = await getOrCreateUser(userId, {});
      const username = user?.username || user?.email || 'Unknown';

      const comment = await addIssueComment(
        sketchId,
        nodeId,
        userId,
        username,
        content.trim(),
        { isCloseAction: !!isCloseAction, isReopenAction: !!isReopenAction }
      );

      // Create notifications for all participants except the commenter
      const notificationType = isCloseAction ? 'issue_closed' : isReopenAction ? 'issue_reopened' : 'new_comment';
      await createIssueNotifications(sketchId, nodeId, comment.id, userId, notificationType);

      // Create mention notifications for explicitly @mentioned users (who aren't already participants)
      if (Array.isArray(mentionedUserIds) && mentionedUserIds.length > 0) {
        await createMentionNotifications(sketchId, nodeId, comment.id, userId, mentionedUserIds);
      }

      return res.status(201).json({ comment });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return handleApiError(err, res, '[API /api/issue-comments]');
  }
}
