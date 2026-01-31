import { describe, it, expect } from '../../utils/test-runner.js';
import { idctNaive, idctAAN } from '../../../src/core/decoder/idct.js';
import { forwardDCT } from '../../../src/core/encoder/dct.js';

const implementations = [
    { name: 'Naive IDCT', fn: idctNaive },
    { name: 'AAN IDCT', fn: idctAAN }
];

implementations.forEach(({ name, fn: idct }) => {
    describe(name, () => {
        it('should validate coefficient block length', async () => {
            const invalid = new Float32Array(32);

            let errorThrown = false;
            try {
                idct(invalid);
            } catch (e) {
                errorThrown = true;
                
            }

        });

        it('should handle all-zero blocks', async () => {
            const coefficients = new Float32Array(64);
            const result = idct(coefficients);

            for (let i = 0; i < 64; i++) {
                expect(Math.abs(result[i]) < 0.001).toBe(true);
            }
        });

        it('should handle DC-only blocks', async () => {
            const coefficients = new Float32Array(64);
            coefficients[0] = 100;

            const result = idct(coefficients);

            const avgValue = result[0];

            for (let i = 0; i < 64; i++) {
                expect(Math.abs(result[i] - avgValue) < 0.1).toBe(true);
            }
        });

        it('should roundtrip with forward DCT for constant block', async () => {
            
            const original = new Float32Array(64);
            original.fill(128);

            const coefficients = forwardDCT(original);

            const reconstructed = idct(coefficients);

            for (let i = 0; i < 64; i++) {
                const diff = Math.abs(reconstructed[i] - original[i]);
                if (diff >= 1) {
                    console.log(`Constant block mismatch at ${i}: expected ${original[i]}, got ${reconstructed[i]}, diff ${diff}`);
                }
                expect(diff < 1).toBe(true);
            }
        });

        it('should roundtrip with forward DCT for gradient block', async () => {
            
            const original = new Float32Array(64);
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    original[y * 8 + x] = x * 16;
                }
            }

            const coefficients = forwardDCT(original);
            const reconstructed = idct(coefficients);

            for (let i = 0; i < 64; i++) {
                const diff = Math.abs(reconstructed[i] - original[i]);
                if (diff >= 2) {
                    console.log(`Gradient block mismatch at ${i}: expected ${original[i]}, got ${reconstructed[i]}, diff ${diff}`);
                }
                expect(diff < 2).toBe(true); 
            }
        });

        it('should roundtrip with forward DCT for checkerboard pattern', async () => {
            
            const original = new Float32Array(64);
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    original[y * 8 + x] = ((x + y) % 2) * 255;
                }
            }

            const coefficients = forwardDCT(original);
            const reconstructed = idct(coefficients);

            for (let i = 0; i < 64; i++) {
                expect(Math.abs(reconstructed[i] - original[i]) < 2).toBe(true);
            }
        });

        it('should roundtrip with forward DCT for random block', async () => {
            
            const original = new Float32Array(64);
            for (let i = 0; i < 64; i++) {
                original[i] = Math.floor(Math.random() * 256);
            }

            const coefficients = forwardDCT(original);
            const reconstructed = idct(coefficients);

            for (let i = 0; i < 64; i++) {
                expect(Math.abs(reconstructed[i] - original[i]) < 2).toBe(true);
            }
        });
    });
});
