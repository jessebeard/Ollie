
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
 * Generates a cryptographically secure unique identifier.
 * @param {boolean} prefixWithTimestamp - Whether to prepend the current timestamp.
 * @returns {string} Secure ID
 */
export function generateSecureId(prefixWithTimestamp = false) {
    if (!cryptoInstance) {
        throw new Error('cryptoInstance is not initialized yet');
    }
    const uuid = cryptoInstance.randomUUID();
    return prefixWithTimestamp ? `${Date.now()}-${uuid}` : uuid;
}
