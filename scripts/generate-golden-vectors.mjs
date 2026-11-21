import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { crc32 } from '../src/utils/crc32.js';
import { deriveStegoKeys, hkdfExpand } from '../src/information-theory/cryptography/kdf-chain.js';
import { generateSubmatrix, stcEmbed, stcExtract } from '../src/information-theory/steganography/stc-matrix.js';
import { packFramedPayload, selectBucketSize } from '../src/information-theory/steganography/opaque-container.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'test', 'conformance', 'golden-vectors.json');

function toHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function utf8(str) {
    return new TextEncoder().encode(str);
}

async function generateVectors() {
    const vectors = {};

    vectors._meta = {
        spec: 'src/specs/container-wire-format.md',
        regeneratedBy: 'scripts/generate-golden-vectors.mjs',
        formatVersion: 4,
        note: 'Bit-exact conformance vectors for Format v4 wire layers (CRC32, Argon2id, HKDF, STC, Opaque Container).'
    };

    // Layer 0: CRC-32 IEEE Standard Check Values
    vectors.crc32 = {
        empty: crc32(new Uint8Array(0)),
        ascii_a: crc32(utf8('a')),
        check_123456789: crc32(utf8('123456789')),
        ollie_v4: crc32(utf8('ollie/v4/conformance'))
    };

    // Layer 1: Argon2id + HKDF-Expand Domain-Separated Keys
    const testPassword = 'correct horse battery staple';
    const testSalt = new Uint8Array(16);
    for (let i = 0; i < 16; i++) testSalt[i] = (i * 17 + 5) & 0xFF;

    const [keys, kdfErr] = await deriveStegoKeys(testPassword, testSalt, {
        memorySize: 64, // fast conformance parameter
        passes: 1
    });
    if (kdfErr) throw kdfErr;

    vectors.kdf_chain = {
        password: testPassword,
        salt_hex: toHex(testSalt),
        master_key_hex: toHex(keys.masterKey),
        aes_key_hex: toHex(keys.aesKey),
        aes_iv_hex: toHex(keys.aesIV),
        stc_seed_hex: toHex(keys.stcSeed),
        cost_seed_hex: toHex(keys.costSeed)
    };

    // Layer 2: HKDF-Expand Direct Verification (RFC 5869)
    const prk = new Uint8Array(32).fill(0x0B);
    const [okm, hkdfErr] = await hkdfExpand(prk, 'ollie/test/info', 42);
    if (hkdfErr) throw hkdfErr;

    vectors.hkdf_expand = {
        prk_hex: toHex(prk),
        info: 'ollie/test/info',
        length: 42,
        okm_hex: toHex(okm)
    };

    // Layer 3: STC Deterministic Submatrix
    const stcSeed = 'conformance-stc-seed-v4';
    const submatrix_h8_w4 = generateSubmatrix(8, 4, stcSeed);
    const submatrix_h8_w2 = generateSubmatrix(8, 2, stcSeed);

    vectors.stc_matrix = {
        seed: stcSeed,
        h8_w4_columns: Array.from(submatrix_h8_w4),
        h8_w2_columns: Array.from(submatrix_h8_w2)
    };

    // Layer 4: STC Viterbi Embedding & Extraction
    const N = 320;
    const M = 40;
    const cover = new Int32Array(N);
    for (let i = 0; i < N; i++) cover[i] = ((i * 13) % 15) - 7;

    const message = new Uint8Array(M);
    for (let i = 0; i < M; i++) message[i] = (i * 7 + 1) % 2;

    const rhoPlus = new Float64Array(N).fill(1.0);
    const rhoMinus = new Float64Array(N).fill(1.0);

    const [stego, stcErr] = stcEmbed(cover, message, rhoPlus, rhoMinus, { h: 8, seed: stcSeed });
    if (stcErr) throw stcErr;

    const extracted = stcExtract(stego, M, { h: 8, seed: stcSeed });

    vectors.stc_embedding = {
        cover_sample: Array.from(cover.slice(0, 32)),
        message_bits: Array.from(message),
        stego_sample: Array.from(stego.slice(0, 32)),
        extracted_bits: Array.from(extracted),
        fidelity: Array.from(message).join('') === Array.from(extracted).join('')
    };

    // Layer 5: Opaque Container Framing & Padding
    const testPayload = utf8('Format v4 Golden Vector Conformance Test Payload');
    const bucket = selectBucketSize(testPayload.length);
    const [framed, frameErr] = await packFramedPayload(testPayload, bucket);
    if (frameErr) throw frameErr;

    vectors.opaque_framing = {
        payload_utf8: 'Format v4 Golden Vector Conformance Test Payload',
        payload_length: testPayload.length,
        bucket_size: bucket,
        framed_total_bytes: framed.length,
        framed_hex_prefix: toHex(framed.slice(0, 32))
    };

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(vectors, null, 2) + '\n', 'utf8');
    console.log(`✓ Wrote Format v4 golden vectors to ${OUT_PATH}`);
}

generateVectors().catch(err => {
    console.error('Failed to generate golden vectors:', err);
    process.exit(1);
});
