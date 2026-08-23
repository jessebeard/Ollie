/**
 * URL Safety - Single whitelist for any user- or carrier-supplied URL that
 * will be opened or rendered as a link. Scheme confusion (control chars,
 * HTML entities, protocol-relative forms) resolves to rejection.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Decides whether a URL is safe to open in a browser context.
 *
 * @param {string} candidate - Untrusted URL string
 * @returns {boolean} True only for absolute http(s) URLs with a hostname
 */
export function isSafeHttpUrl(candidate) {
    if (typeof candidate !== 'string') return false;

    const trimmed = candidate.trim();
    if (trimmed === '' || /[\s\u0000-\u001F]/.test(trimmed)) return false;
    if (/&colon;/i.test(trimmed)) return false;
    if (trimmed.startsWith('//')) return false;

    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch (e) {
        return false;
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
    if (!parsed.hostname) return false;

    return true;
}
