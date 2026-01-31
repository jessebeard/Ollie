import { describe, it, expect } from '../../../test/utils/test-runner.js';
import { ErrorCorrection } from '../../../src/core/steganography/error-correction.js';

describe('ErrorCorrection (Reed-Solomon)', () => {
    it('should protect data by adding parity bytes', () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);

        const protectedData = ErrorCorrection.protect(data);

        expect(protectedData.length).toBeGreaterThan(data.length);

        for (let i = 0; i < data.length; i++) {
            expect(protectedData[i]).toBe(data[i]);
        }
    });

    it('should recover data from corruption', () => {
        const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
        const protectedData = ErrorCorrection.protect(data);

        const corrupted = new Uint8Array(protectedData);
        corrupted[0] = 0xFF; 
        corrupted[3] = 0xFF; 

        const recovered = ErrorCorrection.recover(corrupted);

        expect(recovered).toBeDefined();
        expect(recovered.length).toBe(data.length);

        for (let i = 0; i < data.length; i++) {
            expect(recovered[i]).toBe(data[i]);
        }
    });

    it('should fail if too many errors', () => {
        const data = new Uint8Array([1, 2, 3, 4]);
        const protectedData = ErrorCorrection.protect(data);

        const corrupted = new Uint8Array(protectedData);
        corrupted.fill(0xFF);

        let errorThrown = false;
        try {
            ErrorCorrection.recover(corrupted);
        } catch (e) {
            errorThrown = true;
        }

        expect(errorThrown).toBe(true);
    });
});
