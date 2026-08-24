import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { F5 } from '../src/information-theory/steganography/f5-syndrome.js';
import {
    decodeControlCodeword,
    unpackControlHeader,
    CONTROL_VERSION
} from '../src/information-theory/steganography/coded-header.js';
import { ErrorCorrection } from '../src/information-theory/error-correction/rs-interleaver.js';
import { crc32 } from '../src/utils/crc32.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'test', 'conformance', 'golden-vectors.json');

function toHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function utf8(str) {
    return new TextEncoder().encode(str);
}

function createMockBlocks(count) {
    const blocks = [];
    for (let i = 0; i < count; i++) {
        const block = new Int32Array(64);
        block[0] = 100;
        for (let c = 1; c < 64; c++) {
            block[c] = (c % 2 === 0) ? 3 : -3;
        }
        blocks.push(block);
    }
    return blocks;
}

function diffCoefficients(before, after) {
    const changes = [];
    for (let b = 0; b < before.length; b++) {
        for (let c = 1; c < 64; c++) {
            if (before[b][c] !== after[b][c]) {
                changes.push({ block: b, coeff: c, from: before[b][c], to: after[b][c] });
            }
        }
    }
    return changes;
}

const vectors = {};

vectors._meta = {
    spec: 'src/specs/container-wire-format.md',
    regeneratedBy: 'scripts/generate-golden-vectors.mjs',
    note: 'Bit-exact conformance vectors for wire format layers 0-3.'
};

vectors.crc32 = {
    empty: crc32(new Uint8Array(0)),
    ascii_a: crc32(utf8('a')),
    check_123456789: crc32(utf8('123456789')),
    magic_F5SG: crc32(utf8('F5SG'))
};

const prngDraws = [];
{
    const gen = F5.createPRNG('ollie/conformance/v2');
    for (let i = 0; i < 8; i++) prngDraws.push(gen());
}
vectors.prng = {
    seed: 'ollie/conformance/v2',
    draws_uint32: prngDraws
};

vectors.permutation = {
    seed: 'conformance-perm',
    n: 126,
    order: Array.from(F5.generatePermutation(126, 'conformance-perm'))
};

vectors.resolveSeed = {
    public_fallback: await F5.resolveSeed({}),
    password_derived: await F5.resolveSeed({ password: 'correct horse battery staple' })
};

vectors.ecc = { profiles: {}, multiblock: null };
{
    const single = new Uint8Array(32);
    for (let i = 0; i < 32; i++) single[i] = (i * 7 + 3) & 0xFF;
    vectors.ecc.single_input_hex = toHex(single);

    for (const profileName of ['Low', 'Medium', 'High', 'Ultra', 'Extreme']) {
        const [result, err] = ErrorCorrection.protect(single, profileName);
        if (err) throw err;
        vectors.ecc.profiles[profileName] = {
            blockCount: result.blockCount,
            originalLength: result.originalLength,
            encoded_hex: toHex(result.encoded)
        };
    }

    const multi = new Uint8Array(250);
    for (let i = 0; i < 250; i++) multi[i] = (i * 13 + 5) & 0xFF;
    const [multiResult, multiErr] = ErrorCorrection.protect(multi, 'Medium');
    if (multiErr) throw multiErr;
    vectors.ecc.multiblock = {
        profile: 'Medium',
        input_hex: toHex(multi),
        blockCount: multiResult.blockCount,
        originalLength: multiResult.originalLength,
        encoded_hex: toHex(multiResult.encoded)
    };
}

{
    const blocks = createMockBlocks(12);
    const before = blocks.map(b => Int32Array.from(b));
    const data = utf8('GOLDEN-F5-VECTOR');
    const result = F5.embedRaw(blocks, data, { seed: 'conformance-f5', k: 2 });
    if (!result.success) throw new Error('f5Embed vector generation failed');
    vectors.f5Embed = {
        seed: 'conformance-f5',
        k: 2,
        data_hex: toHex(data),
        changes: diffCoefficients(before, blocks)
    };
}

{
    const blocks = createMockBlocks(140);
    const payload = utf8('CONTAINER-PAYLOAD-0123456789ABCDEF');
    const metadataObj = {};

    const [ok] = await F5.embedContainer(blocks, payload, metadataObj, { seed: 'conformance-container' });
    if (!ok) throw new Error('container vector embedding failed');

    // Recover the frame by scanning k, then pin the raw bytes.
    let frame = null;
    let storedK = null;
    let control = null;
    for (let tryK = 1; tryK <= 4; tryK++) {
        const head = F5.extractRaw(blocks, 255 * 8, { seed: 'conformance-container', k: tryK });
        if (!head) continue;
        const decoded = decodeControlCodeword(head);
        if (decoded[1]) continue;
        const fields = unpackControlHeader(decoded[0])[0];
        if (!fields || fields.magic !== 'F5SG') continue;
        storedK = tryK;
        control = fields;
        frame = F5.extractRaw(blocks, (255 + fields.blockCount * 255) * 8, { seed: 'conformance-container', k: tryK });
        break;
    }
    if (!frame) throw new Error('container vector frame recovery failed');

    const extracted = await F5.extractAuto(blocks, { seed: 'conformance-container' });
    if (!extracted || !extracted.metadata) throw new Error('container vector extraction failed');

    vectors.container = {
        seed: 'conformance-container',
        carrier_blocks: 140,
        payload_hex: toHex(payload),
        stored_k: storedK,
        version: CONTROL_VERSION,
        flags: 0,
        meta_json: JSON.stringify(metadataObj),
        payload_length: payload.length,
        control_fields: control,
        container_hex: toHex(frame),
        extracts_payload_hex: toHex(extracted.data),
        extracts_metadata: extracted.metadata
    };
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(vectors, null, 2) + '\n');
console.log(`Wrote ${OUT_PATH}`);
