/**
 * API Route: /api/notifications
 *
 * GET              - Get unread notifications for the authenticated user
 * GET ?count=true  - Get count of unread notifications
 * POST             - Mark notifications as read (body: { ids: [...] } or { all: true })
 *
 * Note: Uses standard Node.js (req, res) signature for better compatibility with vercel dev.
 */

import { handleCors } from '../_lib/cors.js';
import { verifyCsrf } from '../_lib/csrf.js';
import { verifyAuth, parseBody } from '../_lib/auth.js';
import {
  ensureDb,
  getUnreadNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
  markAllNotificationsRead,
} from '../_lib/db.js';
import { applyRateLimit } from '../_lib/rate-limit.js';
import { handleApiError } from '../_lib/error-handler.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (verifyCsrf(req, res)) return;

  const request = req;
  if (!request.headers.get) {
    request.headers.get = (name) => req.headers[name.toLowerCase()];
  }

  if (applyRateLimit(req, res)) return;

  try {
    await ensureDb();

    const { userId, error } = await verifyAuth(request);
    if (error) {
      return res.status(401).json({ error });
    }

    if (req.method === 'GET') {
      const countOnly = req.query?.count || new URL(req.url, 'http://localhost').searchParams.get('count');

      if (countOnly === 'true') {
        const count = await getUnreadNotificationCount(userId);
        return res.status(200).json({ count });
      }

      const notifications = await getUnreadNotifications(userId);
      return res.status(200).json({ notifications });
    }

    if (req.method === 'POST') {
      const body = await parseBody(request);

      if (body.all) {
        const count = await markAllNotificationsRead(userId);
        return res.status(200).json({ marked: count });
      }

      if (Array.isArray(body.ids) && body.ids.length > 0) {
        const count = await markNotificationsRead(userId, body.ids);
        return res.status(200).json({ marked: count });
      }

      return res.status(400).json({ error: 'Provide ids array or all:true' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return handleApiError(err, res, '[API /api/notifications]');
  }
}
