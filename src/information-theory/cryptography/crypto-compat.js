
export function getCrypto() {
    if (typeof crypto !== 'undefined') {
        
        return crypto;
    } else {
        
        return import('crypto').then(m => m.webcrypto);
    }
}

export let cryptoInstance = null;

if (typeof crypto !== 'undefined') {
    cryptoInstance = crypto;
} else {
    import('crypto').then(m => {
        cryptoInstance = m.webcrypto;
    });
}

/**
 * Generates a cryptographically secure random identifier.
 * Uses Web Crypto API's randomUUID if available, otherwise falls back to getRandomValues.
 *
 * @param {boolean} prefixWithTimestamp - If true, prefixes the ID with Date.now()
 * @returns {string} Secure random ID
 */
export function generateSecureId(prefixWithTimestamp = false) {
    let id = '';

    // Mitigate missing randomUUID in some environments
    if (cryptoInstance && typeof cryptoInstance.randomUUID === 'function') {
        id = cryptoInstance.randomUUID();
    } else if (cryptoInstance && typeof cryptoInstance.getRandomValues === 'function') {
        // Fallback implementation of UUID v4 using getRandomValues
        const arr = new Uint8Array(16);
        cryptoInstance.getRandomValues(arr);

        // Set UUID v4 versions and variants
        arr[6] = (arr[6] & 0x0f) | 0x40; // Version 4
        arr[8] = (arr[8] & 0x3f) | 0x80; // Variant 10

        // Convert to hex string with dashes
        const hex = [...arr].map(b => b.toString(16).padStart(2, '0'));
        id = `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
    } else {
        // Fallback if cryptoInstance is still loading or unavailable (should not happen in normal flow, but just in case)
        throw new Error('Web Crypto API is not available for secure ID generation.');
    }

    if (prefixWithTimestamp) {
        // Extract a random segment to mimic original behavior length if necessary,
        // or just append part of the UUID. The original was Date.now()-...
        // Let's use the first 8-9 chars of the UUID without dashes
        return `${Date.now()}-${id.replace(/-/g, '').substring(0, 9)}`;
    }

    return id;
}
