/**
 * Shared API error handler
 *
 * Provides a single function that every route's catch block should call.
 * It reads the `status` property set by parseBody() (413, 415) and
 * other known error markers to return the correct HTTP status code
 * instead of always falling back to 500.
 */

import { sanitizeErrorMessage } from './auth.js';

/**
 * Handle an error caught in an API route's top-level try/catch.
 *
 * @param {Error} error - The caught error
 * @param {import('http').ServerResponse} res - The response object
 * @param {string} routeLabel - Label for logging, e.g. '[API /api/sketches]'
 */
export function handleApiError(error, res, routeLabel) {
  console.error(`${routeLabel} Error:`, error.message || error);

  // Database not configured
  if (error.message?.includes('Database connection not configured')) {
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  // Errors with an explicit HTTP status (set by parseBody: 400, 413, 415)
  const status = error.status;
  if (status && status >= 400 && status < 600) {
    // For client errors (4xx), the message is safe to expose (we authored it)
    if (status < 500) {
      return res.status(status).json({ error: error.message });
    }
    return res.status(status).json({ error: sanitizeErrorMessage(error) });
  }

  // Default: 500 Internal Server Error
  return res.status(500).json({ error: sanitizeErrorMessage(error) });
}
