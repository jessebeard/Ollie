/**
 * Encoding - Shared byte/string codecs used across storage layers.
 */

/**
 * Encodes a Uint8Array or byte array to a base64 string.
 *
 * @param {Uint8Array|Array<number>} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Decodes a base64 string into a Uint8Array byte array.
 *
 * @param {string} b64
 * @returns {[Uint8Array, null] | [null, Error]}
 */
export function base64ToBytes(b64) {
    if (typeof b64 !== 'string') {
        return [null, new Error('base64ToBytes: input must be a string')];
    }
    try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return [bytes, null];
    } catch (err) {
        return [null, err instanceof Error ? err : new Error(String(err))];
    }
}

export function utf8ToBytes(text) {
    return new TextEncoder().encode(text);
}
