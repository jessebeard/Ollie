import { describe, it, expect } from '../../../test/utils/test-runner.js';
import { assertProperty, Arbitrary } from '../../../test/utils/pbt.js';
import { ErrorCorrection } from '../../../src/core/steganography/error-correction.js';

describe('ErrorCorrection (Reed-Solomon Integration)', () => {

    describe('Profile-based protect/recover', () => {
        it('should protect data and add parity bytes', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const [result, err] = ErrorCorrection.protect(data, 'Medium');

            expect(err).toBe(null);
            expect(result).toBeDefined();
            expect(result.encoded.length).toBeGreaterThan(data.length);
            expect(result.originalLength).toBe(data.length);
            expect(result.profile).toBe('Medium');
            expect(result.blockCount).toBeGreaterThanOrEqual(1);
        });

        it('should recover data from clean (uncorrupted) encoded payload', () => {
            const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
            const [protectedResult, protErr] = ErrorCorrection.protect(data, 'Medium');
            expect(protErr).toBe(null);

            const [recovered, recErr] = ErrorCorrection.recover(
                protectedResult.encoded,
                'Medium',
                protectedResult.originalLength,
                protectedResult.blockCount
            );

            expect(recErr).toBe(null);
            expect(recovered).toBeDefined();
            expect(recovered.length).toBe(data.length);
            for (let i = 0; i < data.length; i++) {
                expect(recovered[i]).toBe(data[i]);
            }
        });

        it('should recover data from corruption within RS limits', () => {
            const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
            const [protectedResult, protErr] = ErrorCorrection.protect(data, 'Medium');
            expect(protErr).toBe(null);

            // Corrupt a few bytes in the encoded payload
            const corrupted = new Uint8Array(protectedResult.encoded);
            corrupted[0] = 0xFF;
            corrupted[3] = 0xFF;

            const [recovered, recErr] = ErrorCorrection.recover(
                corrupted,
                'Medium',
                protectedResult.originalLength,
                protectedResult.blockCount
            );

            expect(recErr).toBe(null);
            expect(recovered).toBeDefined();
            expect(recovered.length).toBe(data.length);
            for (let i = 0; i < data.length; i++) {
                expect(recovered[i]).toBe(data[i]);
            }
        });

        it('should return error for unknown profile', () => {
            const data = new Uint8Array([1, 2, 3]);
            const [result, err] = ErrorCorrection.protect(data, 'NonexistentProfile');
            expect(result).toBe(null);
            expect(err).toBeDefined();
            expect(err.message.includes('Unknown')).toBe(true);
        });

        it('should return error on recover with unknown profile', () => {
            const [result, err] = ErrorCorrection.recover(
                new Uint8Array(255),
                'NonexistentProfile',
                10,
                1
            );
            expect(result).toBe(null);
            expect(err).toBeDefined();
        });
    });

    describe('PBT: protect/recover roundtrip', () => {
        it('Property: roundtrip preserves data for random payloads', () => {
            assertProperty(
                [Arbitrary.byteArray(1, 100)],
                (data) => {
                    const [protectedResult, protErr] = ErrorCorrection.protect(data, 'Low');
                    expect(protErr).toBe(null);

                    const [recovered, recErr] = ErrorCorrection.recover(
                        protectedResult.encoded,
                        'Low',
                        protectedResult.originalLength,
                        protectedResult.blockCount
                    );
                    expect(recErr).toBe(null);
                    expect(recovered.length).toBe(data.length);
                    for (let i = 0; i < data.length; i++) {
                        expect(recovered[i]).toBe(data[i]);
                    }
                },
                30
            );
        });
    });

    describe('ECC Profiles', () => {
        it('all profiles protect and recover correctly', () => {
            const profiles = ['Low', 'Medium', 'High', 'Ultra', 'Extreme'];
            const data = new Uint8Array([42, 84, 126, 168, 210]);

            for (const profile of profiles) {
                const [protResult, protErr] = ErrorCorrection.protect(data, profile);
                expect(protErr).toBe(null);

                const [recovered, recErr] = ErrorCorrection.recover(
                    protResult.encoded,
                    profile,
                    protResult.originalLength,
                    protResult.blockCount
                );
                expect(recErr).toBe(null);
                for (let i = 0; i < data.length; i++) {
                    expect(recovered[i]).toBe(data[i]);
                }
            }
        });

        it('higher profiles have larger encoded sizes', () => {
            const len = 50;
            const lowSize = ErrorCorrection.calculateEncodedSize(len, 'Low');
            const medSize = ErrorCorrection.calculateEncodedSize(len, 'Medium');
            const highSize = ErrorCorrection.calculateEncodedSize(len, 'High');
            expect(medSize).toBeGreaterThanOrEqual(lowSize);
            expect(highSize).toBeGreaterThanOrEqual(medSize);
        });
    });

    describe('Overhead Multiplier', () => {
        it('Low profile has lowest overhead', () => {
            const low = ErrorCorrection.getOverheadMultiplier('Low');
            const high = ErrorCorrection.getOverheadMultiplier('High');
            expect(low).toBeLessThan(high);
        });

        it('overhead multiplier is always > 1', () => {
            const profiles = ['Low', 'Medium', 'High', 'Ultra', 'Extreme'];
            for (const p of profiles) {
                expect(ErrorCorrection.getOverheadMultiplier(p)).toBeGreaterThan(1);
            }
        });
    });

    describe('Legacy path', () => {
        it('protect with no profile returns Uint8Array directly', () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const result = ErrorCorrection.protect(data);
            // Legacy returns Uint8Array, not tuple
            expect(result instanceof Uint8Array).toBe(true);
            expect(result.length).toBeGreaterThan(data.length);
        });

        it('legacy protect systemtatic: data bytes preserved at start', () => {
            const data = new Uint8Array([10, 20, 30, 40, 50]);
            const result = ErrorCorrection.protect(data);
            for (let i = 0; i < data.length; i++) {
                expect(result[i]).toBe(data[i]);
            }
        });
    });
});
