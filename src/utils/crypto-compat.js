// Crypto compatibility shim for both Browser and Node.js
export function getCrypto() {
    if (typeof crypto !== 'undefined') {
        // Browser
        return crypto;
    } else {
        // Node.js - dynamic import
        return import('crypto').then(m => m.webcrypto);
    }
}

// For synchronous usage (after initialization)
export let cryptoInstance = null;

// Initialize
if (typeof crypto !== 'undefined') {
    cryptoInstance = crypto;
} else {
    import('crypto').then(m => {
        cryptoInstance = m.webcrypto;
    });
}
