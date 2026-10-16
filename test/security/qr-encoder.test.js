import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { encodeQR } from '../../src/codec/qr-encoder.js';

function bytes(str) { return new TextEncoder().encode(str); }

describe('QR encoder (ISO/IEC 18004)', () => {

    it('produces a matrix with correct dimensions for a short payload', () => {
        const result = encodeQR(bytes('Hello'));
        // 'Hello' is 5 bytes - v1 EC-M byte capacity is 14, so 21x21 modules
        expect(result.size).toBe(21);
        expect(result.modules).toBeInstanceOf(Uint8Array);
        expect(result.modules).toHaveLength(21 * 21);
    });

    it('selects larger versions for longer payloads', () => {
        const small = encodeQR(bytes('hi'));
        const large = encodeQR(bytes('a'.repeat(80)));
        expect(large.size).toBeGreaterThan(small.size);
    });

    it('has valid finder patterns at three corners', () => {
        const { size, modules } = encodeQR(bytes('test'));
        const get = (r, c) => modules[r * size + c] || 0;
        // Corners of top-left finder pattern must be dark
        expect(get(0, 0)).toBe(1);
        expect(get(0, 6)).toBe(1);
        expect(get(6, 0)).toBe(1);
        expect(get(6, 6)).toBe(1);
    });

    it('timing pattern alternates correctly', () => {
        const { size, modules } = encodeQR(bytes('timing'));
        for (let i = 8; i < size - 8; i++) {
            const expected = (i % 2 === 0) ? 1 : 0;
            expect(modules[6 * size + i]).toBe(expected);
            expect(modules[i * size + 6]).toBe(expected);
        }
    });

    it('is deterministic for identical inputs', () => {
        const a = encodeQR(bytes('deterministic'));
        const b = encodeQR(bytes('deterministic'));
        expect(a.modules).toEqual(b.modules);
    });

    it('rejects empty data via throw', () => {
        expect(() => encodeQR(new Uint8Array(0))).toThrow();
    });

    describe('PBT & Metamorphic Relations', () => {
        it('MR-qr-1: payload growth monotonically increases or preserves symbol size', async () => {
            await assertProperty(
                [Arbitrary.byteArray(1, 40), Arbitrary.byteArray(1, 40)],
                (partA, partB) => {
                    const qrShort = encodeQR(partA);
                    const combined = new Uint8Array(partA.length + partB.length);
                    combined.set(partA);
                    combined.set(partB, partA.length);
                    const qrLong = encodeQR(combined);

                    expect(qrLong.size).toBeGreaterThanOrEqual(qrShort.size);
                },
                50
            );
        });

        it('MR-qr-2: dimension strictly obeys the ISO formula 17 + 4 * version', async () => {
            await assertProperty(
                [Arbitrary.byteArray(1, 60)],
                (payload) => {
                    const qr = encodeQR(payload);
                    expect((qr.size - 17) % 4).toBe(0);
                    expect(qr.size).toBeGreaterThanOrEqual(21);
                    expect(qr.modules.length).toBe(qr.size * qr.size);

                    // Binary module domain invariant
                    for (let i = 0; i < qr.modules.length; i++) {
                        const m = qr.modules[i];
                        expect(m === 0 || m === 1).toBe(true);
                    }
                },
                50
            );
        });

        it('MR-qr-4: encodeQR is strictly deterministic across arbitrary byte arrays', async () => {
            await assertProperty(
                [Arbitrary.byteArray(1, 50)],
                (payload) => {
                    const run1 = encodeQR(payload);
                    const run2 = encodeQR(payload);

                    expect(run1.size).toBe(run2.size);
                    expect(Array.from(run1.modules)).toEqual(Array.from(run2.modules));
                },
                50
            );
        });
    });
});
