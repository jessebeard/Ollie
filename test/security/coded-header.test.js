import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import {
    CONTROL_MAGIC,
    CONTROL_VERSION,
    CONTROL_DATA_BYTES,
    CONTROL_PARITY_BYTES,
    packControlHeader,
    unpackControlHeader,
    encodeControlCodeword,
    decodeControlCodeword
} from '../../src/information-theory/steganography/coded-header.js';

function seededRandom(seed) {
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

function sampleFields() {
    return {
        k: 3,
        metaLen: 412,
        payloadLen: 65432,
        bodyCRC32: 0xDEADBEEF,
        profileName: 'Extreme',
        originalLength: 60000,
        blockCount: 257
    };
}

describe('coded control header packing', () => {

    it('declares the frozen control-plane identity', () => {
        expect(CONTROL_MAGIC).toBe('F5SG');
        expect(CONTROL_VERSION).toBe(3);
        expect(CONTROL_DATA_BYTES).toBe(191);
        expect(CONTROL_PARITY_BYTES).toBe(64);
    });

    it('packs fields at pinned canonical offsets', () => {
        const [plane, err] = packControlHeader(sampleFields());
        expect(err).toBe(null);
        if (!(plane instanceof Uint8Array) || plane.length !== CONTROL_DATA_BYTES) {
            throw new Error(`control plane must be ${CONTROL_DATA_BYTES} bytes`);
        }

        const view = new DataView(plane.buffer);
        const magic = String.fromCharCode(plane[0], plane[1], plane[2], plane[3]);
        if (magic !== 'F5SG') throw new Error('magic offset wrong');
        if (plane[4] !== 0x03) throw new Error('version offset wrong');
        if (plane[5] !== 0x00) throw new Error('flags must be zero (reserved)');
        if (plane[6] !== 3) throw new Error('k offset wrong');
        if (view.getUint16(7, false) !== 412) throw new Error('metaLen wrong');
        if (view.getUint32(9, false) !== 65432) throw new Error('payloadLen wrong');
        if (view.getUint32(13, false) !== 0xDEADBEEF) throw new Error('bodyCRC32 wrong');
        if (plane[17] !== 4) throw new Error('profile enum must map Extreme->4');
        if (view.getUint32(18, false) !== 60000) throw new Error('originalLength wrong');
        if (view.getUint16(22, false) !== 257) throw new Error('blockCount wrong');

        // Reserved tail must be zero-padded.
        for (let i = 24; i < CONTROL_DATA_BYTES; i++) {
            if (plane[i] !== 0) throw new Error(`reserved byte ${i} not zero`);
        }
    });

    it('unpack roundtrips a packed plane', () => {
        const [plane] = packControlHeader(sampleFields());
        const [fields, err] = unpackControlHeader(plane);
        expect(err).toBe(null);

        for (const key of ['k', 'metaLen', 'payloadLen', 'bodyCRC32', 'originalLength', 'blockCount']) {
            if (fields[key] !== sampleFields()[key]) {
                throw new Error(`field ${key}: ${fields[key]} != ${sampleFields()[key]}`);
            }
        }
        if (fields.profileName !== 'Extreme') throw new Error('profile lost in roundtrip');
        if (fields.magic !== 'F5SG' || fields.version !== 3) throw new Error('identity lost');
    });

    it('rejects invalid field values via tuple', () => {
        const cases = [
            [{ ...sampleFields(), k: 0 }],
            [{ ...sampleFields(), k: 9 }],
            [{ ...sampleFields(), profileName: 'Bogus' }],
            [{ ...sampleFields(), metaLen: 70000 }],
            [{ ...sampleFields(), payloadLen: -1 }],
            [{ ...sampleFields(), blockCount: 0 }]
        ];
        for (const bad of cases) {
            const [, err] = packControlHeader(bad);
            if (!(err instanceof Error)) throw new Error(`accepted ${JSON.stringify(bad)}`);
        }
    });

    it('unpack rejects wrong magic, version and unknown profiles', () => {
        const good = packControlHeader(sampleFields())[0];

        const badMagic = Uint8Array.from(good); badMagic[0] = 0x46 + 1; // 'G'
        if (unpackControlHeader(badMagic)[1] === null && unpackControlHeader(badMagic)[0]?.magic === 'F5SG') {
            throw new Error('wrong magic accepted');
        }

        const badVer = Uint8Array.from(good); badVer[4] = 2;
        if (!(unpackControlHeader(badVer)[1] instanceof Error)) throw new Error('v2 plane accepted');

        const badProfile = Uint8Array.from(good); badProfile[17] = 9;
        if (!(unpackControlHeader(badProfile)[1] instanceof Error)) throw new Error('unknown profile accepted');
    });
});

describe('coded control codeword (RS 255,191)', () => {

    it('encodes to exactly 255 symbols and decodes back byte-exact', () => {
        const plane = packControlHeader(sampleFields())[0];
        const [codeword, err] = encodeControlCodeword(plane);
        expect(err).toBe(null);
        if (codeword.length !== 255) throw new Error(`codeword length ${codeword.length}`);

        const [out, decErr] = decodeControlCodeword(codeword);
        expect(decErr).toBe(null);
        if (out.join() !== plane.join()) throw new Error('roundtrip mismatch');
    });

    it('recovers byte-exact from exactly t=32 symbol errors anywhere', () => {
        const plane = packControlHeader(sampleFields())[0];
        const codeword = encodeControlCodeword(plane)[0];

        const rng = seededRandom(777);
        const positions = new Set();
        let guard = 0;
        while (positions.size < 32 && guard < 32 * 40) {
            positions.add(rng(4).reduce((a, b) => (a * 256 + b) % 255, 0));
            guard++;
        }
        for (const pos of positions) codeword[pos] ^= 0x01 + (rng(1)[0] & 0x7F);

        const [out, err] = decodeControlCodeword(codeword);
        expect(err).toBe(null);
        if (out.join() !== plane.join()) throw new Error('at-limit recovery mismatch');
    });

    it('beyond-tolerance corruption is correct-or-error - never silent wrong plane', async () => {
        await assertProperty(
            [Arbitrary.integer(33, 255), Arbitrary.integer(1, 999999)],
            (errorCount, seed) => {
                const plane = packControlHeader(sampleFields())[0];
                const codeword = encodeControlCodeword(plane)[0];
                const rng = seededRandom(seed);

                let touched = 0;
                let guard = 0;
                while (touched < errorCount && guard < errorCount * 30) {
                    const pos = rng(4).reduce((a, b) => (a * 256 + b) % 255, 0);
                    const before = codeword[pos];
                    codeword[pos] ^= 0x01 + (rng(1)[0] & 0x7F);
                    if (codeword[pos] !== before) touched++;
                    guard++;
                }

                const [out, err] = decodeControlCodeword(codeword);
                if (err === null) {
                    if (out.join() !== plane.join()) {
                        throw new Error(`${touched} errors: silent wrong-plane success`);
                    }
                } else if (out !== null) {
                    throw new Error('error accompanied by a plane');
                }
            },
            25
        );
    });
});
