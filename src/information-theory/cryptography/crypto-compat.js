
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
 * Securely generate a unique identifier.
 * Uses CSPRNG instead of Math.random()
 *
 * @param {boolean} prefixWithTimestamp - Whether to prefix the ID with a timestamp for chronological sorting
 * @returns {string} The securely generated identifier
 */
export function generateSecureId(prefixWithTimestamp = false) {
    if (!cryptoInstance) {
        throw new Error('Crypto module not yet initialized');
    }

    // Some older environments might have crypto but not randomUUID
    if (typeof cryptoInstance.randomUUID === 'function') {
        const uuid = cryptoInstance.randomUUID();
        return prefixWithTimestamp ? `${Date.now()}-${uuid}` : uuid;
    }

    // Fallback if randomUUID is not available but getRandomValues is
    const arr = new Uint8Array(16);
    cryptoInstance.getRandomValues(arr);

    // Manually format as UUID v4
    // Set version to 4 (0100)
    arr[6] = (arr[6] & 0x0f) | 0x40;
    // Set variant to 10xx
    arr[8] = (arr[8] & 0x3f) | 0x80;

    const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    const uuid = `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;

    return prefixWithTimestamp ? `${Date.now()}-${uuid}` : uuid;
}
