/**
 * Escape a string for safe insertion into HTML.
 * Prevents XSS by replacing &, <, >, ", and ' with their HTML entities.
 *
 * @param {any} str - Value to escape (converted to string)
 * @returns {string} Escaped HTML string
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
