export function sanitizeUrl(url) {
    if (!url) return '';
    const cleanUrl = String(url).replace(/[\x00-\x1F\x7F]/g, '');
    const validationUrl = String(url).replace(/[\x00-\x20\x7F]/g, '');

    try {
        const parsed = new URL(validationUrl, 'http://dummy.base');
        const protocol = parsed.protocol.toLowerCase();
        if (['javascript:', 'vbscript:', 'data:'].includes(protocol)) {
            return 'about:blank';
        }
    } catch (e) {
        return 'about:blank';
    }

    return cleanUrl;
}
