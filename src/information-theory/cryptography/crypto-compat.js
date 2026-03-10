
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
