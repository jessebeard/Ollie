import { describe, it, expect } from '../../utils/test-runner.js';
import { ContainerFormat, FLAGS } from '../../../src/information-theory/steganography/payload-container.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

describe('ContainerFormat (Property-Based Tests)', () => {

    it('Property: Encode/Decode Symmetry', async () => {
        await assertProperty(
            // Limit payload size to what typically mathematically fits into small F5 test blocks
            [Arbitrary.byteArray(0, 1000), Arbitrary.string(1, 40), Arbitrary.string(1, 40)],
            async (dataBytes, key1, val1) => {
                const metadata = { [key1]: val1 };

                const [encoded, encErr] = ContainerFormat.encode(dataBytes, metadata);
                expect(encErr).toEqual(null);

                const [decoded, decErr] = ContainerFormat.decode(encoded);
                expect(decErr).toEqual(null);

                expect(decoded.version).toBe(1);
                expect(decoded.flags).toBe(0);
                expect(decoded.data.length).toBe(dataBytes.length);

                for (let i = 0; i < dataBytes.length; i++) {
                    if (decoded.data[i] !== dataBytes[i]) return false;
                }

                expect(decoded.metadata[key1]).toBe(val1);

                return true;
            },
            50
        );
    });

    it('Property: Flag Preservation', async () => {
        await assertProperty(
            [Arbitrary.byteArray(1, 100), Arbitrary.integer(0, 255)],
            async (dataBytes, flagValue) => {
                const [encoded, encErr] = ContainerFormat.encode(dataBytes, {}, flagValue);
                expect(encErr).toEqual(null);

                const [decoded, decErr] = ContainerFormat.decode(encoded);
                expect(decErr).toEqual(null);

                expect(decoded.flags).toBe(flagValue);

                return true;
            },
            50
        );
    });

    it('Property: CRC Tamper Detection', async () => {
        await assertProperty(
            [Arbitrary.byteArray(10, 1000), Arbitrary.positiveInteger(99)],
            async (dataBytes, randomInt) => {
                const [encoded, encErr] = ContainerFormat.encode(dataBytes, { test: true });
                expect(encErr).toEqual(null);

                // Tamper with the payload area (skip the header, flip bits)
                const tampered = new Uint8Array(encoded);
                const tamperIndex = 12 + (randomInt % Math.max(1, dataBytes.length));
                if (tamperIndex < tampered.length - 4) {
                    tampered[tamperIndex] ^= 0xFF;

                    const [decoded, decErr] = ContainerFormat.decode(tampered);
                    expect(decoded).toEqual(null);
                    expect(decErr !== null).toBe(true);
                }

                return true;
            },
            50
        );
    });

    it('should reject containers that are too small', () => {
        const tooSmall = new Uint8Array(5);
        const [result, err] = ContainerFormat.decode(tooSmall);
        expect(result).toEqual(null);
        expect(err !== null).toBe(true);
        expect(err.message.includes('Container too small')).toBe(true);
    });

    it('should reject invalid magic bytes', () => {
        const invalid = new Uint8Array(20);
        invalid[0] = 0x00;
        const [result, err] = ContainerFormat.decode(invalid);
        expect(result).toEqual(null);
        expect(err !== null).toBe(true);
        expect(err.message.includes('Invalid magic bytes')).toBe(true);
    });

    it('should reject unsupported version', () => {
        const data = new Uint8Array([1, 2, 3]);
        const [encoded] = ContainerFormat.encode(data, {});
        encoded[4] = 99;
        const [result, err] = ContainerFormat.decode(encoded);
        expect(result).toEqual(null);
        expect(err !== null).toBe(true);
        expect(err.message.includes('Unsupported version')).toBe(true);
    });

    it('should reject truncated containers', () => {
        const data = new TextEncoder().encode('Full data here');
        const [encoded] = ContainerFormat.encode(data, { test: 'meta' });
        const truncated = encoded.subarray(0, encoded.length - 10);
        const [result, err] = ContainerFormat.decode(truncated);
        expect(result).toEqual(null);
        expect(err !== null).toBe(true);
    });

    it('should reject oversized metadata via tuple', () => {
        const data = new Uint8Array([1]);
        const hugeMetadata = { data: 'x'.repeat(70000) };
        const [result, err] = ContainerFormat.encode(data, hugeMetadata);
        expect(result).toEqual(null);
        expect(err !== null).toBe(true);
        expect(err.message.includes('Metadata too large')).toBe(true);
    });

    it('isContainer should detect valid containers', () => {
        const data = new Uint8Array([1, 2, 3]);
        const [encoded] = ContainerFormat.encode(data, {});
        expect(ContainerFormat.isContainer(encoded)).toBe(true);
    });

    it('isContainer should reject non-containers', () => {
        const notContainer = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
        expect(ContainerFormat.isContainer(notContainer)).toBe(false);
    });

    it('isContainer should handle data that is too small', () => {
        const tooSmall = new Uint8Array(2);
        expect(ContainerFormat.isContainer(tooSmall)).toBe(false);
    });
});
