/**
 * Structure-aware JPEG mutation engine for parser fuzzing.
 *
 * Seeds: real repo fixtures PLUS a hand-synthesized minimal progressive
 * (SOF2) stream - progressive parsing is deliberately unsupported, so these
 * seeds pin the fail-closed boundary while mutations probe around it.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Hand-built minimal-but-well-formed-looking progressive stream. */
function syntheticProgressive() {
    const bytes = [];
    bytes.push(0xFF, 0xD8);                       // SOI
    // APP0 JFIF minimal
    bytes.push(0xFF, 0xE0, 0x00, 0x10,
        0x4A, 0x46, 0x49, 0x46, 0x00,             // 'JFIF\0'
        0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);
    // DQT
    bytes.push(0xFF, 0xDB, 0x00, 0x43, 0x00);
    for (let i = 0; i < 64; i++) bytes.push(i & 0xFF);
    // SOF2 (progressive), 8-bit, 3 components, 8x8
    bytes.push(0xFF, 0xC2, 0x00, 0x11,
        0x08, 0x00, 0x08, 0x00, 0x08, 0x03,
        0x01, 0x11, 0x02, 0x11, 0x03, 0x11);
    // DHT DC table stub
    bytes.push(0xFF, 0xC4, 0x00, 0x14, 0x00,
        0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    // SOS with spectral selection 0..63
    bytes.push(0xFF, 0xDA, 0x00, 0x0C, 0x03,
        0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00);
    // scan payload with stuffed pair
    bytes.push(0x12, 0x34, 0xFF, 0x00, 0x56, 0x78);
    bytes.push(0xFF, 0xD9);                       // EOI
    return new Uint8Array(bytes);
}

function loadFixture(name) {
    const p = path.join(__dirname, '..', 'fixtures', name);
    try {
        return new Uint8Array(fs.readFileSync(p));
    } catch {
        return null;
    }
}

export function loadSeedCorpus() {
    const seeds = [
        { name: 'synthetic-progressive', bytes: syntheticProgressive() }
    ];
    for (const name of ['checkerboard-8x8-q90.jpg', 'color-blocks-24x24.jpg', 'gradient-16x16.jpg', 'solid-red-8x8.jpg']) {
        const b = loadFixture(name);
        if (b) seeds.push({ name, bytes: b });
    }
    if (seeds.length < 2) throw new Error('mutation corpus could not load seeds');
    return seeds;
}

/**
 * Applies 1..maxOps random structural mutations.
 * Ops: truncate | byteFlip | markerInject | lengthLie | duplicateSegment | splice
 */
export function mutate(input, partner, rng, maxOps = 3) {
    let data = Uint8Array.from(input);
    const opCount = 1 + (rng(1)[0] % maxOps);

    for (let op = 0; op < opCount; op++) {
        const choice = rng(4)[0] % 6;
        if (choice === 0) {
            // truncate at a random offset (keep at least 2 bytes = SOI)
            const cut = 2 + (rng(4).reduce((a, b) => (a * 256 + b) % Math.max(1, data.length - 2), 0));
            data = data.slice(0, cut);
        } else if (choice === 1 && data.length > 2) {
            const pos = rng(4).reduce((a, b) => (a * 256 + b) % data.length, 0);
            data[pos] ^= 0x01 + (rng(1)[0] & 0x7F);
        } else if (choice === 2 && data.length > 4) {
            // inject an FF-marker pair at a random offset after SOI
            const pos = 2 + (rng(4).reduce((a, b) => (a * 256 + b) % (data.length - 2), 0));
            const markerByte = 0xC0 + (rng(1)[0] & 0x1F);
            const out = new Uint8Array(data.length + 2);
            out.set(data.subarray(0, pos));
            out[pos] = 0xFF;
            out[pos + 1] = markerByte;
            out.set(data.subarray(pos), pos + 2);
            data = out;
        } else if (choice === 3 && data.length > 6) {
            // find a plausible segment length field (post-marker u16) and lie
            const pos = 2 + (rng(4).reduce((a, b) => (a * 256 + b) % (data.length - 6), 0));
            const delta = 1 + (rng(2).reduce((a, b) => (a * 256 + b) % 4096, 0));
            const big = rng(1)[0] & 1;
            const cur = (data[pos] << 8) | data[pos + 1];
            const next = big ? ((cur + delta) & 0xFFFF) : Math.max(0, cur - delta);
            data[pos] = (next >> 8) & 0xFF;
            data[pos + 1] = next & 0xFF;
        } else if (choice === 4 && partner && data.length > 8) {
            // splice: keep head of input, tail of partner
            const cutA = 2 + (rng(4).reduce((a, b) => (a * 256 + b) % (data.length - 4), 0));
            const cutB = (rng(4).reduce((a, b) => (a * 256 + b) % (partner.length - 2), 0));
            const out = new Uint8Array(cutA + (partner.length - cutB));
            out.set(data.subarray(0, cutA));
            out.set(partner.subarray(cutB), cutA);
            data = out;
        }
        // choice 5: no-op round (keeps op-count variance)
        if (data.length < 4) break;
    }

    if (!partner) void partner;
    return data;
}

export function makeRng(seed) {
    let s = seed >>> 0;
    return (n) => {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            out[i] = (s >>> 24) & 0xFF;
        }
        return out;
    };
}
