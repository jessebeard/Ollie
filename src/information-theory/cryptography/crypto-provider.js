/**
 * CryptoProvider - Single source of truth for Web Crypto access
 * across browser and Node.js environments.
 */

/**
 * Returns the environment's crypto primitives.
 *
 * @returns {[{subtle: SubtleCrypto, getRandomValues: Function}|null, Error|null]} Tuple of provider or error
 */
export function getCrypto() {
    if (typeof globalThis === 'undefined' || !globalThis.crypto || !globalThis.crypto.subtle) {
        return [null, new Error('Web Crypto API is not available. Please use a modern browser or Node.js 19+.')];
    }
    return [{
        subtle: globalThis.crypto.subtle,
        getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    }, null];
}

/**
 * Generates an RFC 4122 version 4 UUID using CSPRNG entropy.
 *
 * @returns {string} UUID string
 * @throws {Error} If no crypto provider is available
 */
export function randomUUID() {
    const [cryptoObj, err] = getCrypto();
    if (err) throw err;

    if (typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
