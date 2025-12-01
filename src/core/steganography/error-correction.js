import {
    ReedSolomonEncoder,
    ReedSolomonDecoder,
    GenericGF_QR_CODE_FIELD_256
} from '../EC/reedsolomon.js';

/**
 * ErrorCorrection - Wrapper around Reed-Solomon implementation
 */
export class ErrorCorrection {
    // Standard field for byte-oriented data (GF(2^8))
    static FIELD = GenericGF_QR_CODE_FIELD_256;

    // Default parity bytes count
    // 4 parity bytes allow correcting up to 2 byte errors
    static DEFAULT_PARITY_BYTES = 4;

    /**
     * Protects data by appending Reed-Solomon parity bytes.
     * 
     * @param {Uint8Array} data - Original data
     * @param {number} parityBytes - Number of parity bytes to add (default: 4)
     * @returns {Uint8Array} Data with appended parity bytes
     */
    static protect(data, parityBytes = this.DEFAULT_PARITY_BYTES) {
        const encoder = new ReedSolomonEncoder(this.FIELD);

        // Create a buffer large enough for data + parity
        // Note: RS implementation works on Int32Array usually, but we need Uint8Array output.
        // The library modifies the input array in place if it's large enough, 
        // or we pass a larger array with data at the beginning.

        const totalLength = data.length + parityBytes;
        const toEncode = new Int32Array(totalLength);

        // Copy data to the beginning
        for (let i = 0; i < data.length; i++) {
            toEncode[i] = data[i];
        }

        // Encode (modifies toEncode in place to add parity at the end)
        encoder.encode(toEncode, parityBytes);

        // Convert back to Uint8Array
        // We can just copy since values are bytes
        const result = new Uint8Array(totalLength);
        for (let i = 0; i < totalLength; i++) {
            result[i] = toEncode[i];
        }

        return result;
    }

    /**
     * Recovers original data from potentially corrupted data (which includes parity).
     * 
     * @param {Uint8Array} receivedData - Data + Parity bytes
     * @param {number} parityBytes - Number of parity bytes included (default: 4)
     * @returns {Uint8Array} Original data (corrected)
     * @throws {Error} If too many errors to correct
     */
    static recover(receivedData, parityBytes = this.DEFAULT_PARITY_BYTES) {
        const decoder = new ReedSolomonDecoder(this.FIELD);

        // Convert to Int32Array for the library
        const toDecode = new Int32Array(receivedData.length);
        for (let i = 0; i < receivedData.length; i++) {
            toDecode[i] = receivedData[i];
        }

        // Decode (modifies toDecode in place to fix errors)
        // Note: decode() throws if uncorrectable
        try {
            decoder.decode(toDecode, parityBytes);
            // console.log('RS Decode successful');
        } catch (e) {
            // console.error('RS Decode failed:', e);
            throw e;
        }

        // Extract original data (remove parity)
        const dataLength = receivedData.length - parityBytes;
        const result = new Uint8Array(dataLength);
        for (let i = 0; i < dataLength; i++) {
            result[i] = toDecode[i];
        }

        return result;
    }
}
