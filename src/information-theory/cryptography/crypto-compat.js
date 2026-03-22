
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


export function generateSecureId(prefixWithTimestamp = false) {
    if (!cryptoInstance) {
        throw new Error('Web Crypto API is required for secure ID generation');
    }

    let uuid;
    if (cryptoInstance.randomUUID) {
        uuid = cryptoInstance.randomUUID();
    } else if (cryptoInstance.getRandomValues) {
        const arr = new Uint8Array(16);
        cryptoInstance.getRandomValues(arr);
        arr[6] = (arr[6] & 0x0f) | 0x40;
        arr[8] = (arr[8] & 0x3f) | 0x80;
        let hex = '';
        for (let i = 0; i < 16; i++) {
            hex += arr[i].toString(16).padStart(2, '0');
        }
        uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    } else {
        throw new Error('No cryptographically secure PRNG available');
    }

    return prefixWithTimestamp ? `${Date.now()}-${uuid}` : uuid;
}
