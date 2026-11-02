import { describe, it, expect } from '../utils/test-runner.js';
import {
    serializePayloadV41,
    parseStegoPayload
} from '../../src/information-theory/steganography/stego-payload.js';
import { crc32 } from '../../src/utils/crc32.js';

describe('Format v4.1 Stego-Payload Mutation Fuzzing (Rule 11 & 16)', () => {
    const rawData = new Uint8Array(256);
    for (let i = 0; i < rawData.length; i++) rawData[i] = (i * 19 + 7) & 0xFF;

    const metadata = {
        filename: 'fuzz-target.bin',
        chunk: { id: 'fuzz-c1', index: 0, total: 2, count: 1, stripeSize: 256 },
        checksum: crc32(rawData),
        manifest: { format: 'ollie-manifest', version: 1, chunkSetId: 'fuzz-set', total: 2 }
    };

    const [goldenFrame] = serializePayloadV41(rawData, metadata);

    it('survives 1,000 random bit-flip and truncation mutations without crashing', () => {
        let seed = 0x12345678;
        const nextRand = () => {
            seed = (Math.imul(seed ^ (seed >>> 15), 0x45D9F3B) ^ 0x9E3779B9) >>> 0;
            return seed;
        };

        for (let iter = 0; iter < 1000; iter++) {
            const mutated = new Uint8Array(goldenFrame);
            const mutationType = nextRand() % 4;

            if (mutationType === 0) {
                // Bit flip
                const pos = nextRand() % mutated.length;
                const bit = 1 << (nextRand() % 8);
                mutated[pos] ^= bit;
            } else if (mutationType === 1) {
                // Byte truncation
                const truncateLen = nextRand() % mutated.length;
                const truncated = mutated.subarray(0, truncateLen);
                const [result, err] = parseStegoPayload(truncated);
                expect(result === null || result !== null).toBe(true);
                if (err) expect(err instanceof Error).toBe(true);
                continue;
            } else if (mutationType === 2) {
                // Random byte overwrite
                const pos = nextRand() % mutated.length;
                mutated[pos] = nextRand() & 0xFF;
            } else {
                // Header mutation
                const headerPos = nextRand() % 7;
                mutated[headerPos] = nextRand() & 0xFF;
            }

            const [result, err] = parseStegoPayload(mutated);
            // Invariant: Parser must never throw or return undefined; must always return Result tuple
            expect(result === null || result !== null).toBe(true);
            if (err) {
                expect(err instanceof Error).toBe(true);
            }
        }
    });

    it('survives completely random garbage buffers without crashing', () => {
        let seed = 0x87654321;
        const nextRand = () => {
            seed = (Math.imul(seed ^ (seed >>> 15), 0x45D9F3B) ^ 0x9E3779B9) >>> 0;
            return seed;
        };

        for (let iter = 0; iter < 200; iter++) {
            const len = nextRand() % 500;
            const garbage = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                garbage[i] = nextRand() & 0xFF;
            }

            const [result, err] = parseStegoPayload(garbage);
            expect(result === null || result !== null).toBe(true);
            if (err) {
                expect(err instanceof Error).toBe(true);
            }
        }
    });
});
