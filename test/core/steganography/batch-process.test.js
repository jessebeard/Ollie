import { BatchEmbedder } from '../../../src/information-theory/steganography/batch-embedder.js';
import { BatchExtractor } from '../../../src/information-theory/steganography/batch-extractor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class MockFile {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
    }
    async arrayBuffer() {

        return this.buffer.buffer.slice(this.buffer.byteOffset, this.buffer.byteOffset + this.buffer.byteLength);
    }
}

async function runTest() {
    console.log('Starting Batch Processing Test...');

    const imagePath = path.join(__dirname, '../../fixtures/tetst racer.jpg');

    if (!fs.existsSync(imagePath)) {
        console.error(`Test image not found at ${imagePath}`);
        process.exit(1);
    }

    const imageBuffer = fs.readFileSync(imagePath);

    const files = [
        new MockFile(imageBuffer, 'image1.jpg'),
        new MockFile(imageBuffer, 'image2.jpg')
    ];

    const secretData = new Uint8Array(2000);
    for (let i = 0; i < secretData.length; i++) secretData[i] = i % 255;

    const embedder = new BatchEmbedder();
    const options = {
        chunkSize: 1000,
        filename: 'secret.bin'
    };

    console.log('Embedding...');
    const [embeddedFiles, embedErr] = await embedder.embed(secretData, files, options, (c, t, s) => console.log(s));
    if (embedErr) throw embedErr;

    console.log(`Embedded into ${embeddedFiles.length} files.`);

    const extractFiles = embeddedFiles.map(f => new MockFile(f.data, f.name));

    const extractor = new BatchExtractor();
    console.log('Extracting...');
    const [result, extractErr] = await extractor.extract(extractFiles, null, (c, t, s) => console.log(s));
    if (extractErr) throw extractErr;

    console.log('Extraction complete.');
    console.log('Filename:', result.filename);
    console.log('Data length:', result.data.length);

    if (result.data.length !== secretData.length) {
        throw new Error(`Length mismatch: expected ${secretData.length}, got ${result.data.length}`);
    }

    for (let i = 0; i < secretData.length; i++) {
        if (result.data[i] !== secretData[i]) {
            throw new Error(`Data mismatch at index ${i}`);
        }
    }

    console.log('Test Passed!');
}

runTest().catch(e => {
    console.error('Test Failed:', e);
    process.exit(1);
});
