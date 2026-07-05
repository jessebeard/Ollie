export function sanitizeUrl(url) {
    if (!url) return '';
    try {
        const cleanUrl = String(url).replace(/[\x00-\x1F\x7F]/g, '');
        // We use a dummy base URL so schemeless urls (e.g. 'example.com') don't throw error
        // But wait, URL requires a base if it's relative. Let's provide a dummy one
        const parsed = new URL(cleanUrl.replace(/[\x00-\x20\x7F]/g, ''), 'http://dummy.base');
        if (['javascript:', 'data:', 'vbscript:'].includes(parsed.protocol)) {
            return 'about:blank';
        }
        return cleanUrl;
    } catch (e) {
        return 'about:blank';
    }
}
