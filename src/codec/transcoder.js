import { JpegDecoder } from './decoder.js';
import { JpegEncoder } from './encoder.js';

/**
 * JpegTranscoder
 * 
 * Updates steganography data in JPEG files WITHOUT generation loss.
 * 
 * Implementation: Uses direct DCT coefficient manipulation (lossless).
 * This prevents quality degradation when updating the password vault repeatedly.
 */
export class JpegTranscoder {
    /**
     * Updates steganography data in a JPEG (lossless).
     * 
     * @param {Uint8Array} jpegBytes - Input JPEG file
     * @param {Uint8Array} newSecretData - New secret data to embed
     * @param {Object} options - Options
     * @param {Object} [options.metadata] - Metadata for the container format
     * @param {string} [options.password] - Password for encryption
     * @returns {Promise<Uint8Array>} Updated JPEG with new secret data
     */
    async updateSecret(jpegBytes, newSecretData, options = {}) {

        const decoder = new JpegDecoder();
        const [decoded, decodeErr] = await decoder.decode(jpegBytes, { skipExtraction: true, coefficientsOnly: true });
        if (decodeErr) return [null, decodeErr];

        if (!decoded.coefficients) {
            return [null, new Error('Decoder did not return coefficients. Lossless transcoding requires coefficient access.')];
        }

        if (!decoded.quantizationTables) {
            return [null, new Error('Decoder did not return quantization tables. Lossless transcoding requires table preservation.')];
        }

        const encoder = new JpegEncoder(90, {
            secretData: newSecretData,
            metadata: options.metadata,
            password: options.password,
            progressive: decoded.metadata?.progressive || false
        });

        try {
            const outputBytes = await encoder.encodeCoefficients(
                decoded.coefficients,
                decoded.quantizationTables,
                {
                    width: decoded.width,
                    height: decoded.height
                }
            );
            return [outputBytes, null];
        } catch (e) {
            return [null, e instanceof Error ? e : new Error(String(e))];
        }
    }
}
