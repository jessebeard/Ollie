import { describe, it, expect } from '../utils/test-runner.js';

if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
    describe('Test Roundtrip Debug', () => {
        it('Skipped in Browser', () => { expect(true).toBe(true); });
    });
} else {
    // Only import Node-specific modules here
    import('fs').then(({ readFileSync }) => {
        import('../../src/codec/encoder.js').then(({ JpegEncoder }) => {
            import('../../src/codec/decoder.js').then(({ JpegDecoder }) => {
                
                const width = 64;
                const height = 64;
                const imageData = new Uint8ClampedArray(width * height * 4);

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        imageData[idx] = x * 4;
                        imageData[idx + 1] = y * 4;
                        imageData[idx + 2] = 128;
                        imageData[idx + 3] = 255;
                    }
                }

                const secretText = "This is a secret message!";
                const secretData = new TextEncoder().encode(secretText);

                console.log('=== ENCODING ===');
                console.log('Image size:', width, 'x', height);
                console.log('Secret data length:', secretData.length, 'bytes');

                const encoder = new JpegEncoder(90, { secretData });
                
                // Encoder encode method is async
                encoder.encode({ width, height, data: imageData }).then(jpegBytes => {
                    console.log('JPEG size:', jpegBytes.length, 'bytes');

                    console.log('\n=== DECODING ===');

                    const decoder = new JpegDecoder();
                    // Decoder decode method is async
                    decoder.decode(jpegBytes).then(([result, err]) => {
                        if (err) {
                            console.error('Decoding error:', err);
                            return;
                        }

                        console.log('Decoded image size:', result.width, 'x', result.height);
                        console.log('Secret data extracted:', result.secretData ? 'YES' : 'NO');

                        if (result.secretData) {
                            const extractedText = new TextDecoder().decode(result.secretData);
                            console.log('Extracted length:', result.secretData.length, 'bytes');
                            console.log('Extracted text:', extractedText);
                            console.log('Match:', extractedText === secretText);
                        } else {
                            console.log('ERROR: No secret data extracted!');
                        }
                    });
                });
            });
        });
    });
}
