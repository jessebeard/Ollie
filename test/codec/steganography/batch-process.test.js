import { describe, it, expect } from '../../utils/test-runner.js';
import { BatchEmbedder } from '../../../src/information-theory/steganography/batch-embedder.js';
import { BatchExtractor } from '../../../src/information-theory/steganography/batch-extractor.js';
import { JpegEncoder } from '../../../src/codec/encoder.js';

class MockFile {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
    }
    async arrayBuffer() {
        return this.buffer.buffer.slice(this.buffer.byteOffset, this.buffer.byteOffset + this.buffer.byteLength);
    }
}

describe('Batch Processing', () => {
    it('embeds and extracts across multiple carrier files', async () => {
        // Generate synthetic carrier images with high-frequency noise for F5 capacity
        const width = 256;
        const height = 256;
        const data = new Uint8ClampedArray(width * height * 4);
        let s = 123456789;
        for (let i = 0; i < data.length; i += 4) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            data[i] = s & 0xFF;
            data[i + 1] = (s >> 8) & 0xFF;
            data[i + 2] = (s >> 16) & 0xFF;
            data[i + 3] = 255;
        }
        const imageBuffer = await new JpegEncoder(90, { subsampling: '4:4:4' }).encode({ width, height, data });

        const files = [
            new MockFile(imageBuffer, 'image1.jpg'),
            new MockFile(imageBuffer, 'image2.jpg')
        ];

        const secretData = new Uint8Array(200);
        for (let i = 0; i < secretData.length; i++) secretData[i] = i % 255;

        const embedder = new BatchEmbedder();
        const options = {
            chunkSize: 1000,
            filename: 'secret.bin',
            password: 'batch-test-password',
            manifest: { revision: 0 }
        };

        const [embeddedFiles, embedErr] = await embedder.embed(secretData, files, options, () => {});
        expect(embedErr).toEqual(null);
        expect(embeddedFiles.length).toBeGreaterThan(0);

        const extractFiles = embeddedFiles.map(f => new MockFile(f.data, f.name));

        const extractor = new BatchExtractor();
        const [result, extractErr] = await extractor.extract(extractFiles, 'batch-test-password', () => {});
        expect(extractErr).toEqual(null);
        expect(result.filename).toBe('secret.bin');
        expect(result.data.length).toBe(secretData.length);

        for (let i = 0; i < secretData.length; i++) {
            expect(result.data[i]).toBe(secretData[i]);
        }
    });
});

