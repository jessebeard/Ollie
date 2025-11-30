import { describe, it, expect } from '../../../test/utils/test-runner.js';
import { Jsteg } from '../../../src/core/steganography/jsteg.js';

describe('Jsteg Container Format', () => {
    function createMockBlocks(count, fillValue = 10) {
        const blocks = [];
        for (let i = 0; i < count; i++) {
            const block = new Int32Array(64).fill(fillValue);
            block[0] = 100; // DC
            // Ensure zeros are skipped (though fillValue=10 ensures no zeros)
            blocks.push(block);
        }
        return blocks;
    }

    function readRawBytes(blocks, byteCount) {
        const bytes = new Uint8Array(byteCount);
        let byteIndex = 0;
        let bitIndex = 0;
        let currentByte = 0;

        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                if (byteIndex >= byteCount) return bytes;

                const val = block[i];
                if (val === 0) continue;

                const bit = val & 1;
                currentByte = (currentByte << 1) | bit;
                bitIndex++;

                if (bitIndex === 8) {
                    bytes[byteIndex] = currentByte;
                    byteIndex++;
                    bitIndex = 0;
                    currentByte = 0;
                }
            }
        }
        return bytes;
    }

    it('should embed data with JSTG magic bytes', () => {
        const blocks = createMockBlocks(100);
        const data = new Uint8Array([1, 2, 3]);
        const metadata = { filename: 'test.txt' };

        // This should embed: [Magic:4][Version:1][Flags:1][MetaLen:2][Meta...][Len:4][Data...][CRC:4]
        // Magic = "JSTG" = 0x4A535447

        Jsteg.embedContainer(blocks, data, metadata);

        const header = readRawBytes(blocks, 4);
        const magic = new TextDecoder().decode(header);

        expect(magic).toBe('JSTG');
    });

    it('should embed version and flags', () => {
        const blocks = createMockBlocks(100);
        const data = new Uint8Array([1]);
        const metadata = {};

        Jsteg.embedContainer(blocks, data, metadata);

        // Magic(4) + Version(1) + Flags(1)
        const header = readRawBytes(blocks, 6);

        const version = header[4];
        const flags = header[5];

        expect(version).toBe(1);
        expect(flags).toBe(0);
    });

    it('should embed metadata', () => {
        const blocks = createMockBlocks(200);
        const data = new Uint8Array([1]);
        const metadata = { foo: 'bar', baz: 123 };

        Jsteg.embedContainer(blocks, data, metadata);

        // Read header to get metadata length
        // Magic(4) + Ver(1) + Flags(1) + MetaLen(2)
        const header = readRawBytes(blocks, 8);
        const metaLen = (header[6] << 8) | header[7];

        const fullBytes = readRawBytes(blocks, 8 + metaLen);
        const metaBytes = fullBytes.slice(8, 8 + metaLen);
        const metaStr = new TextDecoder().decode(metaBytes);
        const extractedMeta = JSON.parse(metaStr);

        expect(extractedMeta.foo).toBe('bar');
        expect(extractedMeta.baz).toBe(123);
    });

    it('should extract container with metadata and payload', () => {
        const blocks = createMockBlocks(200);
        const data = new Uint8Array([10, 20, 30, 40]);
        const metadata = { test: true };

        Jsteg.embedContainer(blocks, data, metadata);

        const result = Jsteg.extractContainer(blocks);

        expect(result).toBeDefined();
        expect(result.metadata.test).toBe(true);
        expect(result.data.length).toBe(4);
        expect(result.data[0]).toBe(10);
        expect(result.data[3]).toBe(40);
    });

    it('should verify CRC32 integrity', () => {
        const blocks = createMockBlocks(200);
        const data = new Uint8Array([1, 2, 3, 4]);
        const metadata = {};

        Jsteg.embedContainer(blocks, data, metadata);

        // Corrupt the payload (flip a bit in the first byte of payload)
        // Magic(4) + Ver(1) + Flags(1) + MetaLen(2) + Meta({}) + PayloadLen(4)
        // Meta({}) is "{}" -> 2 bytes.
        // Header size = 4 + 1 + 1 + 2 + 2 + 4 = 14 bytes.
        // Payload starts at byte 14.

        let byteIndex = 0;
        let bitIndex = 0;
        const targetByteIndex = 14;
        let corrupted = false;

        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                if (block[i] === 0) continue;

                if (byteIndex === targetByteIndex) {
                    // Flip LSB
                    const val = block[i];
                    if (Math.abs(val) === 1) {
                        // If val is 1/-1 (LSB 1), flip to 0 (2/-2)
                        // If val is 2/-2 (LSB 0), flip to 1 (3/-3 or just | 1)
                        // Wait, if val is 1, LSB is 1. Flip to 0 -> val becomes 2.
                        // If val is 2, LSB is 0. Flip to 1 -> val becomes 3.
                        if (Math.abs(val) === 1) {
                            block[i] = (val > 0) ? 2 : -2;
                        } else {
                            // If val is 2, make it 3.
                            block[i] = (val & ~1) | ((val & 1) ^ 1);
                        }
                    } else {
                        block[i] ^= 1;
                    }
                    corrupted = true;
                    break;
                }

                bitIndex++;
                if (bitIndex === 8) {
                    bitIndex = 0;
                    byteIndex++;
                }
            }
            if (corrupted) break;
        }

        expect(corrupted).toBe(true);

        const result = Jsteg.extractContainer(blocks);
        expect(result).toBe(null);
    });
});
