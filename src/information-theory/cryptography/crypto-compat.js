
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
    if (cryptoInstance && typeof cryptoInstance.randomUUID === 'function') {
        const uuid = cryptoInstance.randomUUID();
        return prefixWithTimestamp ? `${Date.now()}-${uuid}` : uuid;
    } else if (cryptoInstance && typeof cryptoInstance.getRandomValues === 'function') {
        const buffer = new Uint8Array(16);
        cryptoInstance.getRandomValues(buffer);
        const hex = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
        return prefixWithTimestamp ? `${Date.now()}-${hex}` : hex;
    } else {
        const rand = () => Math.random().toString(36).substring(2, 11);
        return prefixWithTimestamp ? `${Date.now()}-${rand()}` : `${rand()}-${rand()}`;
    }
}
