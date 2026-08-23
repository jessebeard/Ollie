/**
 * Escapes a value for safe interpolation into HTML text content and
 * attribute values. The single canonical implementation for the app UI —
 * do not duplicate this logic in components.
 *
 * @param {*} value - Any value; null/undefined become ''
 * @returns {string} HTML-escaped string
 */
export function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
