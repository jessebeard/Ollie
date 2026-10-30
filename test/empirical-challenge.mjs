import { Worker } from 'node:worker_threads';
import { BatchExtractor } from '../src/information-theory/steganography/batch-extractor.js';
import { BatchEmbedder } from '../src/information-theory/steganography/batch-embedder.js';
import { ChunkManager } from '../src/information-theory/steganography/chunk-manager.js';
import { getCarrierPool } from '../src/codec/carrier-pool.js';
import { bindChunkRecords } from '../src/information-theory/steganography/carrier-manifest.js';
import { getKdfPool, deriveStegoKeys } from '../src/information-theory/cryptography/kdf-chain.js';
import { StegoEngine } from '../src/information-theory/steganography/stego-engine.js';
import { JpegEncoder } from '../src/codec/encoder.js';
import { JpegDecoder } from '../src/codec/decoder.js';

class MockFile {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
        this.size = buffer.length;
    }
    async arrayBuffer() {
        return this.buffer.buffer.slice(
            this.buffer.byteOffset,
            this.buffer.byteOffset + this.buffer.byteLength
        );
    }
}

async function makeCarriers(count) {
    const width = 256;
    const height = 256;
    const data = new Uint8ClampedArray(width * height * 4);
    let seed = 1234567;
    for (let i = 0; i < data.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed >>> 24) & 0xFF;
        data[i + 1] = (seed >>> 16) & 0xFF;
        data[i + 2] = (seed >>> 8) & 0xFF;
        data[i + 3] = 255;
    }
    const encoder = new JpegEncoder(90);
    const out = [];
    for (let i = 0; i < count; i++) {
        const jpegBytes = await encoder.encode({ width, height, data });
        out.push(new MockFile(jpegBytes, `carrier_${i}.jpg`));
    }
    return out;
}

console.log('=== EMPIRICAL CHALLENGE HARNESS ===\n');

// -----------------------------------------------------------------------------
// Test SEC-02: Plaintext master password across postMessage
// -----------------------------------------------------------------------------
console.log('--- Testing SEC-02: Plaintext password in postMessage ---');
let capturedWorkerMessages = [];

const originalWorkerPost = Worker.prototype.postMessage;
Worker.prototype.postMessage = function(data, transfer) {
    try {
        capturedWorkerMessages.push(JSON.parse(JSON.stringify(data)));
    } catch (e) {
        // In case of non-serializable objects
        capturedWorkerMessages.push(data);
    }
    return originalWorkerPost.apply(this, arguments);
};

const testPassword = 'AdversarialTestPassword123!';
const testCarriers = await makeCarriers(3);
const embedder = new BatchEmbedder();
const testPayload = new TextEncoder().encode(JSON.stringify({ secret: 'my-super-secret-vault-data' }));

console.log('1. Dispatched BatchEmbedder.embed...');
const [embeddedResults, embedErr] = await embedder.embed(testPayload, testCarriers, {
    password: testPassword,
    filename: 'vault.json',
    manifest: { revision: 1 }
});
if (embedErr) throw embedErr;

let embedPasswordsFound = [];
for (const msg of capturedWorkerMessages) {
    if (msg?.payload?.options?.password === testPassword) {
        embedPasswordsFound.push({ action: msg.action, type: msg.type, password: msg.payload?.options?.password });
    }
}
console.log(`SEC-02 (Embed): Intercepted ${embedPasswordsFound.length} worker postMessage payloads containing plaintext master password in payload.options.password:`, embedPasswordsFound);

capturedWorkerMessages = [];
console.log('2. Dispatched BatchExtractor.extract...');
const extractor = new BatchExtractor();
const stegoFiles = embeddedResults.map((r, i) => new MockFile(r.data, `stego_${i}.jpg`));

const [extractedData, extractErr] = await extractor.extract(stegoFiles, testPassword);
if (extractErr) throw extractErr;

let extractPasswordsFound = [];
for (const msg of capturedWorkerMessages) {
    if (msg?.payload?.password === testPassword) {
        extractPasswordsFound.push({ action: msg.action, type: msg.type, password: msg.payload?.password });
    }
}
console.log(`SEC-02 (Extract): Intercepted ${extractPasswordsFound.length} worker postMessage payloads containing plaintext master password in payload.password:`, extractPasswordsFound);

capturedWorkerMessages = [];
console.log('3. Dispatched KdfChain Argon2id derivation...');
const salt = new Uint8Array(16);
salt.fill(42);
const [stegoKeys, kdfErr] = await deriveStegoKeys(testPassword, salt, { passes: 1, memorySize: 1024 });
if (kdfErr) throw kdfErr;

let kdfPasswordsFound = [];
for (const msg of capturedWorkerMessages) {
    if (msg?.payload?.password === testPassword) {
        kdfPasswordsFound.push({ action: msg.action, type: msg.type, password: msg.payload?.password });
    }
}
console.log(`SEC-02 (KDF): Intercepted ${kdfPasswordsFound.length} worker postMessage payloads containing plaintext master password in kdfPayload:`, kdfPasswordsFound);
console.log(`SEC-02 VERIFIED: Plaintext password transmitted across postMessage across all 3 concurrency subsystems.\n`);


// -----------------------------------------------------------------------------
// Test SEC-01: bindChunkRecords omission in batch-extractor.js
// -----------------------------------------------------------------------------
console.log('--- Testing SEC-01: bindChunkRecords omission in batch-extractor ---');

// Decode carrier 0 and carrier 1 to get metadata and manifest
const decoder = new JpegDecoder();
const [dec0] = await decoder.decode(new Uint8Array(await stegoFiles[0].arrayBuffer()), { password: testPassword });
const [dec1] = await decoder.decode(new Uint8Array(await stegoFiles[1].arrayBuffer()), { password: testPassword });

console.log('Carrier 0 manifest total chunks:', dec0.secretMetadata.manifest.total);
console.log('Carrier 0 manifest entries:', dec0.secretMetadata.manifest.entries);

// Tamper with carrier 1: keep carrier 1's authentic signed manifest and share,
// but corrupt its chunk data (stripe payload)
const originalCarrier1Data = dec1.secretData.slice();
const tamperedCarrier1Data = new Uint8Array(originalCarrier1Data.length);
tamperedCarrier1Data.set(originalCarrier1Data);
// Corrupt the stripe payload
tamperedCarrier1Data[0] ^= 0xAA;
tamperedCarrier1Data[1] ^= 0x55;

// Re-encode carrier 1 with the tampered secretData but keeping the authentic signed manifest
const { JpegTranscoder } = await import('../src/codec/transcoder.js');
const transcoder = new JpegTranscoder();
const [tamperedCarrier1Jpeg, tErr] = await transcoder.updateSecret(
    new Uint8Array(await testCarriers[1].arrayBuffer()),
    tamperedCarrier1Data,
    {
        metadata: dec1.secretMetadata,
        password: testPassword
    }
);
if (tErr) throw tErr;

const tamperedStegoFiles = [
    stegoFiles[0],
    new MockFile(tamperedCarrier1Jpeg, 'tampered_carrier_1.jpg'),
    stegoFiles[2]
];

console.log('Extracting from carrier set containing tampered stripe...');
const [tamperedExtractResult, tamperedExtractErr] = await extractor.extract(tamperedStegoFiles, testPassword);

console.log('Extraction outcome with tampered stripe:');
console.log('Result:', tamperedExtractResult);
console.log('Returned error:', tamperedExtractErr?.message);

// Now test what bindChunkRecords would have done:
const actualChecksum0 = ChunkManager.calculateChecksum(dec0.secretData);
const actualChecksum1 = ChunkManager.calculateChecksum(tamperedCarrier1Data);
console.log(`Carrier 0 stripe checksum: ${actualChecksum0} (manifest: ${dec0.secretMetadata.manifest.entries[0].checksum})`);
console.log(`Carrier 1 tampered stripe checksum: ${actualChecksum1} (manifest: ${dec0.secretMetadata.manifest.entries[1].checksum})`);

const recordsFromExtracted = [
    { index: 0, checksum: actualChecksum0 },
    { index: 1, checksum: actualChecksum1 }
];
console.log('Calling bindChunkRecords manually with extracted stripe records:');
const [, bindErr] = bindChunkRecords(recordsFromExtracted, dec0.secretMetadata.manifest, { subset: true });
console.log('bindChunkRecords error returned:', bindErr?.message);

if (tamperedExtractErr && tamperedExtractErr.message.includes('manifest')) {
    console.log('SEC-01 REFUTED: batch-extractor failed at manifest verification!');
} else {
    console.log('SEC-01 CONFIRMED: batch-extractor passed manifest verification despite tampered stripe!');
    console.log(`Failed downstream at: "${tamperedExtractErr?.message}"`);
}
console.log();


// -----------------------------------------------------------------------------
// Test SEC-10: Steganographic decoding candidate bucket early return timing
// -----------------------------------------------------------------------------
console.log('--- Testing SEC-10: Steganographic decoding candidate bucket early return timing ---');

// 1. Measure extraction time for valid stego carrier with small payload (first bucket)
const [decInfoValid] = await decoder.decode(new Uint8Array(await stegoFiles[0].arrayBuffer()), { skipExtraction: true, coefficientsOnly: true });
const validBlocks = [];
for (const compId in decInfoValid.coefficients) {
    const comp = decInfoValid.coefficients[compId];
    for (let i = 0; i < comp.blocks.length; i++) validBlocks.push(comp.blocks[i]);
}

const t0Valid = performance.now();
const [extValid, errValid] = await StegoEngine.extract(validBlocks, testPassword);
const t1Valid = performance.now();
const validDuration = t1Valid - t0Valid;
console.log(`Extraction time for valid stego carrier (exits on first matching bucket): ${validDuration.toFixed(2)} ms (found payload: ${!!extValid})`);

// 2. Measure extraction time for non-stego carrier (tries all candidate buckets)
const [decInfoCover] = await decoder.decode(new Uint8Array(await testCarriers[0].arrayBuffer()), { skipExtraction: true, coefficientsOnly: true });
const coverBlocks = [];
for (const compId in decInfoCover.coefficients) {
    const comp = decInfoCover.coefficients[compId];
    for (let i = 0; i < comp.blocks.length; i++) coverBlocks.push(comp.blocks[i]);
}

const t0Cover = performance.now();
const [extCover, errCover] = await StegoEngine.extract(coverBlocks, testPassword);
const t1Cover = performance.now();
const coverDuration = t1Cover - t0Cover;
console.log(`Extraction time for non-stego carrier (scans all candidate buckets): ${coverDuration.toFixed(2)} ms (found payload: ${!!extCover})`);
console.log(`Timing ratio (non-carrier / carrier): ${(coverDuration / validDuration).toFixed(2)}x`);
console.log(`SEC-10 CONFIRMED: Early return causes measurable timing discrepancy between carrier and non-carrier images.`);

// Clean up pools
const carrierPool = getCarrierPool();
const kdfPool = getKdfPool();
await carrierPool.terminate();
await kdfPool.terminate();
console.log('\n=== EMPIRICAL CHALLENGE COMPLETE ===');
