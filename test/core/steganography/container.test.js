import { describe, it, expect } from '../../../test/utils/test-runner.js';
import { Jsteg } from '../../../src/core/steganography/jsteg.js';

describe('Jsteg Container Format', () => {
    function createMockBlocks(count, fillValue = 10) {
        const blocks = [];
        for (let i = 0; i < count; i++) {
            const block = new Int32Array(64).fill(fillValue);
            block[0] = 100;

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

    it('should embed data with JSTG magic bytes', async () => {
        const blocks = createMockBlocks(100);
        const data = new Uint8Array([1, 2, 3]);
        const metadata = { filename: 'test.txt' };

        await Jsteg.embedContainer(blocks, data, metadata);

        const header = readRawBytes(blocks, 4);
        const magic = new TextDecoder().decode(header);

        expect(magic).toBe('JSTG');
    });

    it('should embed version and flags', async () => {
        const blocks = createMockBlocks(100);
        const data = new Uint8Array([1]);
        const metadata = {};

        await Jsteg.embedContainer(blocks, data, metadata);

        const header = readRawBytes(blocks, 6);

        const version = header[4];
        const flags = header[5];

        expect(version).toBe(1);
        expect(flags).toBe(0);
    });

    it('should embed metadata', async () => {
        const blocks = createMockBlocks(200);
        const data = new Uint8Array([1]);
        const metadata = { foo: 'bar', baz: 123 };

        await Jsteg.embedContainer(blocks, data, metadata);

        const header = readRawBytes(blocks, 8);
        const metaLen = (header[6] << 8) | header[7];

        const fullBytes = readRawBytes(blocks, 8 + metaLen);
        const metaBytes = fullBytes.slice(8, 8 + metaLen);
        const metaStr = new TextDecoder().decode(metaBytes);
        const extractedMeta = JSON.parse(metaStr);

        expect(extractedMeta.foo).toBe('bar');
        expect(extractedMeta.baz).toBe(123);
    });

    it('should extract container with metadata and payload', async () => {
        const blocks = createMockBlocks(200);
        const data = new Uint8Array([10, 20, 30, 40]);
        const metadata = { test: true };

        await Jsteg.embedContainer(blocks, data, metadata);

        const result = await Jsteg.extractContainer(blocks);

        expect(result).toBeDefined();
        expect(result.metadata.test).toBe(true);
        expect(result.data.length).toBe(4);
        expect(result.data[0]).toBe(10);
        expect(result.data[3]).toBe(40);
    });

    it('should verify CRC32 integrity', async () => {
        const blocks = createMockBlocks(200);
        const data = new Uint8Array([1, 2, 3, 4]);
        const metadata = {};

        await Jsteg.embedContainer(blocks, data, metadata);

        let byteIndex = 0;
        let bitIndex = 0;
        const targetByteIndex = 14;
        let corrupted = false;

        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                if (block[i] === 0) continue;

                if (byteIndex === targetByteIndex) {

                    const val = block[i];
                    if (Math.abs(val) === 1) {

                        if (Math.abs(val) === 1) {
                            block[i] = (val > 0) ? 2 : -2;
                        } else {

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

        const result = await Jsteg.extractContainer(blocks);
        expect(result).toBe(null);
    });

    it('should embed with ECC when flag is set', async () => {
        const blocks = createMockBlocks(300);
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        const metadata = { ecc: true };

        await Jsteg.embedContainer(blocks, data, metadata);

        const result = await Jsteg.extractContainer(blocks);
        expect(result).toBeDefined();
        expect(result.data.length).toBe(5);
        expect(result.metadata.ecc).toBe(true);
        expect(result.data[0]).toBe(1);
    });

    it('should recover from corruption when ECC is enabled', async () => {

        const blocks = createMockBlocks(500);
        const data = new Uint8Array([10, 20, 30, 40, 50]);
        const metadata = { ecc: true, eccProfile: 'Medium' };

        await Jsteg.embedContainer(blocks, data, metadata);

        let byteIndex = 0;
        let bitIndex = 0;
        const targetBytes = [100, 150, 200, 250, 300];
        let corruptedCount = 0;

        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                if (block[i] === 0) continue;

                if (targetBytes.includes(byteIndex) && bitIndex === 0) {

                    const val = block[i];
                    if (Math.abs(val) === 1) {
                        block[i] = (val > 0) ? 2 : -2;
                    } else {
                        block[i] ^= 1;
                    }
                    corruptedCount++;
                }

                bitIndex++;
                if (bitIndex === 8) {
                    bitIndex = 0;
                    byteIndex++;
                }
            }
        }

        expect(corruptedCount).toBeGreaterThan(0);

        const result = await Jsteg.extractContainer(blocks);
        expect(result).toBeDefined();
        expect(result.data.length).toBe(5);
        expect(result.data[0]).toBe(10);
        expect(result.data[4]).toBe(50);
    });

    it('should encrypt and decrypt data with password', async () => {
        const blocks = createMockBlocks(400);
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        const metadata = { encrypted: true };
        const password = 'secret-password';

        await Jsteg.embedContainer(blocks, data, metadata, { password });

        const result = await Jsteg.extractContainer(blocks, { password });

        expect(result).toBeDefined();
        expect(result.metadata.encrypted).toBe(true);
        expect(result.data.length).toBe(5);
        expect(result.data[0]).toBe(1);
        expect(result.data[4]).toBe(5);
    });

    it('should fail to decrypt with wrong password', async () => {
        const blocks = createMockBlocks(400);
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        const metadata = { encrypted: true };
        const password = 'secret-password';

        await Jsteg.embedContainer(blocks, data, metadata, { password });

        const result = await Jsteg.extractContainer(blocks, { password: 'wrong-password' });

        expect(result).toBe(null);
    });

    it('should combine encryption and ECC', async () => {
        const blocks = createMockBlocks(500);
        const data = new Uint8Array([10, 20, 30]);
        const metadata = { encrypted: true, ecc: true };
        const password = 'secure-ecc';

        await Jsteg.embedContainer(blocks, data, metadata, { password });

        let byteIndex = 0;
        let bitIndex = 0;
        const targetByteIndex = 150;
        let corrupted = false;

        for (const block of blocks) {
            for (let i = 1; i < 64; i++) {
                if (block[i] === 0) continue;
                if (byteIndex === targetByteIndex) {
                    const val = block[i];
                    if (Math.abs(val) === 1) block[i] = (val > 0) ? 2 : -2;
                    else block[i] ^= 1;
                    corrupted = true;
                    break;
                }
                bitIndex++;
                if (bitIndex === 8) { bitIndex = 0; byteIndex++; }
            }
            if (corrupted) break;
        }
        expect(corrupted).toBe(true);

        const result = await Jsteg.extractContainer(blocks, { password });

        expect(result).toBeDefined();
        expect(result.data[0]).toBe(10);
        expect(result.data[2]).toBe(30);
    });
});

