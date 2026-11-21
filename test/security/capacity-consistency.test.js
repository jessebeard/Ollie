import { describe, it, expect } from '../utils/test-runner.js';
import { CapacityScanner } from '../../src/codec/capacity-scanner.js';
import { BatchEmbedder } from '../../src/information-theory/steganography/batch-embedder.js';
import { JpegEncoder } from '../../src/codec/encoder.js';
import { JpegDecoder } from '../../src/codec/decoder.js';
import { StegoEngine } from '../../src/information-theory/steganography/stego-engine.js';

function makeMockFile(bytes, name) {
    return {
        name,
        size: bytes.length,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    };
}

async function buildSyntheticCarrier() {
    const width = 256;
    const height = 256;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = (i * 3) & 0xFF;
        data[i + 1] = (i * 7) & 0xFF;
        data[i + 2] = (i * 11) & 0xFF;
        data[i + 3] = 255;
    }
    const jpegBytes = await new JpegEncoder(90, { subsampling: '4:4:4' }).encode({ width, height, data });

    const decoder = new JpegDecoder();
    const [decoded] = await decoder.decode(jpegBytes, { skipExtraction: true, coefficientsOnly: true });
    const allBlocks = [];
    for (const compId in decoded.coefficients) {
        const compData = decoded.coefficients[compId];
        for (let i = 0; i < compData.blocks.length; i++) {
            allBlocks.push(compData.blocks[i]);
        }
    }
    return { mockFile: makeMockFile(jpegBytes, 'carrier.jpg'), allBlocks };
}

describe('Format v4 Capacity Model Consistency', () => {

    it('scanner reports exactly what the embedder pipeline will accept', async () => {
        const { mockFile, allBlocks } = await buildSyntheticCarrier();

        const [scanResult, scanErr] = await CapacityScanner.scan([mockFile]);
        expect(scanErr).toEqual(null);

        const expected = StegoEngine.calculateCapacity(allBlocks);
        expect(scanResult.totalCapacity).toBe(expected);
        expect(scanResult.totalCapacity).toBeGreaterThan(0);
    });

    it('embedder capacity template is well-formed', () => {
        const template = BatchEmbedder.CAPACITY_METADATA_TEMPLATE();
        const realShape = {
            filename: 'vault.json',
            chunk: { id: 'x'.repeat(36), index: 11, total: 374 },
            checksum: 1234567890,
            originalLength: 29310,
            blockCount: 345
        };

        expect(JSON.stringify(template).length).toBeGreaterThanOrEqual(JSON.stringify(realShape).length);
    });

    it('calculateCarrierCapacity matches StegoEngine capacity math', async () => {
        const { allBlocks } = await buildSyntheticCarrier();

        const viaHelper = BatchEmbedder.calculateCarrierCapacity(allBlocks);
        const direct = StegoEngine.calculateCapacity(allBlocks);

        expect(viaHelper).toBe(direct);
    });
});
