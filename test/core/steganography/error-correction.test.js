import { describe, it, expect } from '../../utils/test-runner.js';
import { ErrorCorrection, ECC_PROFILES } from '../../../src/core/steganography/error-correction.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

describe('ErrorCorrection (Property-Based Tests)', () => {

    it('Property: Protect/Recover Symmetry across all profiles', async () => {
        const profileNames = Object.keys(ECC_PROFILES);

        await assertProperty(
            [Arbitrary.byteArray(10, 500), Arbitrary.integer(0, profileNames.length - 1)],
            async (dataBytes, profileIndex) => {
                const profileName = profileNames[profileIndex];

                const [result, protectErr] = ErrorCorrection.protect(dataBytes, profileName);
                expect(protectErr).toEqual(null);

                expect(result.originalLength).toBe(dataBytes.length);
                expect(result.profile).toBe(profileName);
                expect(result.blockCount).toBeGreaterThan(0);

                const [recovered, recoverErr] = ErrorCorrection.recover(
                    result.encoded, profileName, result.originalLength, result.blockCount
                );
                expect(recoverErr).toEqual(null);
                expect(recovered.length).toBe(dataBytes.length);

                for (let i = 0; i < dataBytes.length; i++) {
                    if (recovered[i] !== dataBytes[i]) return false;
                }

                return true;
            },
            25
        );
    });

    it('Property: Error Correction Recovery (Medium profile)', async () => {
        await assertProperty(
            [Arbitrary.byteArray(50, 200), Arbitrary.positiveInteger(15)],
            async (dataBytes, maxErrors) => {
                const [result, protectErr] = ErrorCorrection.protect(dataBytes, 'Medium');
                expect(protectErr).toEqual(null);

                // Medium profile: 32 parity bytes per block, can correct up to 16 symbol errors
                const errorsToIntroduce = Math.min(maxErrors, 14);
                const corruptedData = new Uint8Array(result.encoded);
                for (let i = 0; i < errorsToIntroduce; i++) {
                    corruptedData[i * 10 % corruptedData.length] ^= 0xAA;
                }

                const [recovered, recoverErr] = ErrorCorrection.recover(
                    corruptedData, 'Medium', result.originalLength, result.blockCount
                );
                expect(recoverErr).toEqual(null);
                expect(recovered.length).toBe(dataBytes.length);

                for (let i = 0; i < dataBytes.length; i++) {
                    if (recovered[i] !== dataBytes[i]) return false;
                }

                return true;
            },
            25
        );
    });

    it('should reject unknown ECC profile for protect via tuple', () => {
        const data = new Uint8Array(10);
        const [result, err] = ErrorCorrection.protect(data, 'Nonexistent');
        expect(result).toEqual(null);
        expect(err !== null).toBe(true);
        expect(err.message.includes('Unknown ECC profile')).toBe(true);
    });

    it('should reject unknown ECC profile for recover via tuple', () => {
        const data = new Uint8Array(10);
        const [result, err] = ErrorCorrection.recover(data, 'Nonexistent');
        expect(result).toEqual(null);
        expect(err !== null).toBe(true);
        expect(err.message.includes('Unknown ECC profile')).toBe(true);
    });

    it('should calculate overhead multiplier correctly', () => {
        const lowOverhead = ErrorCorrection.getOverheadMultiplier('Low');
        const extremeOverhead = ErrorCorrection.getOverheadMultiplier('Extreme');

        expect(lowOverhead).toBeGreaterThan(1.0);
        expect(lowOverhead).toBeLessThan(1.1);
        expect(extremeOverhead).toBe(3);
    });

    it('should calculate encoded size correctly', () => {
        expect(ErrorCorrection.calculateEncodedSize(223, 'Medium')).toBe(255);
        expect(ErrorCorrection.calculateEncodedSize(224, 'Medium')).toBe(510);
    });

    it('should handle legacy protect/recover (no profile)', () => {
        const data = new Uint8Array([10, 20, 30, 40, 50]);
        const encoded = ErrorCorrection.protect(data);

        // Legacy returns Uint8Array directly (not a tuple)
        expect(encoded.length).toBe(data.length + 4);

        const recovered = ErrorCorrection.recover(encoded);
        expect(recovered.length).toBe(data.length);
        for (let i = 0; i < data.length; i++) {
            expect(recovered[i]).toBe(data[i]);
        }
    });
});
