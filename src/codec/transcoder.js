import { inverseZigZag } from '../algebraic/mappings/inverse-zigzag.js';
import { JpegEncoder } from './encoder.js';
import { JpegDecoder } from './decoder.js';
import { F5 } from '../information-theory/steganography/f5-syndrome.js';

export class JpegTranscoder {
    constructor() {}

    /**
     * Updates secret data in a JPEG without full re-encoding.
     * Works by decoding to DCT coefficients, replacing them using F5, and re-packing into a new JPEG.
     * 
     * @param {Uint8Array} jpegBytes 
     * @param {Uint8Array} newSecretData 
     * @param {Object} options 
     */
    async updateSecret(jpegBytes, newSecretData, options = {}) {
        const decoder = new JpegDecoder();
        // Step 1: Recover DCT coefficients
        const [decoded, decodeErr] = await decoder.decode(jpegBytes, { 
            coefficientsOnly: true,
            skipExtraction: true 
        });
        
        if (decodeErr) return [null, decodeErr];

        // Step 2: Prepare Encoder with existing coefficients and new secret
        const encoder = new JpegEncoder(90, {
            secretData: newSecretData,
            metadata: options.metadata,
            password: options.password,
            seed: options.seed,
            progressive: decoded.metadata?.progressive || false
        });

        // Step 3: Embed & re-encode
        const [encodedBytes, encodeErr] = await encoder.encodeCoefficients(decoded.coefficients, decoded.quantizationTables);
        if (encodeErr) return [null, encodeErr];

        return [encodedBytes, null];
    }
}
