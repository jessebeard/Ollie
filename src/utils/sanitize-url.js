export function sanitizeUrl(url) {
    if (!url) return '';

    // Strip non-printable characters that might bypass standard sanitizers
    const cleanUrl = String(url).replace(/[\x00-\x1F\x7F]/g, '');

    try {
        const urlObj = new URL(cleanUrl, 'http://dummy.base');
        const protocol = urlObj.protocol.toLowerCase();

        // Reject dangerous protocols
        if (['javascript:', 'data:', 'vbscript:'].includes(protocol)) {
            return '';
        }

        return cleanUrl;
    } catch (e) {
        // If it can't be parsed, it's safer to reject it or return it as-is?
        // We'll return empty string if invalid
        return '';
    }
}
