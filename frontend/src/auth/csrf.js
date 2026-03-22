/**
 * Client-side CSRF Protection — Double-Submit Cookie Pattern
 *
 * Wraps window.fetch() to automatically attach the `x-csrf-token` header on
 * every mutating request (POST, PUT, DELETE) to our API.  The header value is
 * read from the `csrf_token` cookie that the server sets.
 *
 * Import this module early in the app boot sequence (after capacitor-api-proxy
 * which also wraps fetch, so our wrapper sits on top of it).
 */

/**
 * Read the csrf_token cookie value.
 * @returns {string|null}
 */
function getCsrfToken() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

const _originalFetch = window.fetch.bind(window);

window.fetch = function csrfFetch(input, init) {
  const method = (init?.method || 'GET').toUpperCase();

  // Only attach CSRF header for mutating API requests
  if (MUTATING_METHODS.has(method)) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isApi = url.includes('/api/') && !url.includes('/api/auth/');

    if (isApi) {
      const token = getCsrfToken();
      if (token) {
        const headers = new Headers(init?.headers);
        if (!headers.has('x-csrf-token')) {
          headers.set('x-csrf-token', token);
        }
        init = { ...init, headers };
      }
    }
  }

  return _originalFetch(input, init);
};
