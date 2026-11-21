/**
 * RFC 4648 Base32 encoding/decoding (A-Z, 2-7, padded with '=').
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * @param {Uint8Array} data
 * @returns {string}
 */
export function encodeBase32(data) {
    let out = '';
    let bits = 0;
    let value = 0;
    for (let i = 0; i < data.length; i++) {
        value = (value << 8) | data[i];
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    while (out.length % 8 !== 0) out += '=';
    return out;
}

/**
 * @param {string} encoded
 * @returns {[Uint8Array|null, Error|null]}
 */
export function decodeBase32(encoded) {
    const clean = encoded.toUpperCase().replace(/=/g, '');
    const bytes = [];
    let bits = 0;
    let value = 0;
    for (let i = 0; i < clean.length; i++) {
        const idx = ALPHABET.indexOf(clean[i]);
        if (idx === -1) return [null, new Error(`base32: invalid character '${clean[i]}' at position ${i}`)];
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xFF);
            bits -= 8;
        }
    }
    return [new Uint8Array(bytes), null];
}
