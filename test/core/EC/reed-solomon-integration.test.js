import { describe, it, expect } from '../../../test/utils/test-runner.js';
import { ErrorCorrection } from '../../../src/core/steganography/error-correction.js';

describe('ErrorCorrection (Reed-Solomon)', () => {
    it('should protect data by adding parity bytes', () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        // We'll use a standard configuration, e.g., 4 bytes of data + 4 bytes of parity?
        // Or maybe let the class decide.
        // Let's assume protect() takes data and optional parity count.

        const protectedData = ErrorCorrection.protect(data);

        // Should be larger than original
        expect(protectedData.length).toBeGreaterThan(data.length);

        // First part should match original data (systematic code)
        for (let i = 0; i < data.length; i++) {
            expect(protectedData[i]).toBe(data[i]);
        }
    });

    it('should recover data from corruption', () => {
        const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
        const protectedData = ErrorCorrection.protect(data);

        // Corrupt some bytes
        // RS capability depends on parity count. 
        // If we add N parity bytes, we can correct N/2 errors.
        // Let's assume default adds enough for at least 2 errors.

        const corrupted = new Uint8Array(protectedData);
        corrupted[0] = 0xFF; // Error 1
        corrupted[3] = 0xFF; // Error 2

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

        // Corrupt everything
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
