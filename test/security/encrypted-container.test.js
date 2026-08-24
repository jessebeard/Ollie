import { describe, it, expect } from '../utils/test-runner.js';
import { sealContainer, unsealContainer } from '../../src/information-theory/steganography/encrypted-container.js';

const PASSWORD = 'opaque-container-test-pw';

function bytes(str) { return new TextEncoder().encode(str); }

function makeFields(overrides = {}) {
    return {
        magic: 'F5SG',
        version: 4,
        flags: 0,
        k: 2,
        eccProfile: 'Extreme',
        threshold: 2,
        totalCarriers: 3,
        metaLen: 0,
        payloadLen: 5,
        bodyCRC32: 12345,
        originalLength: 100,
        blockCount: 4,
        metadataJSON: '{"filename":"vault.json"}',
        payload: new Uint8Array([1, 2, 3, 4, 5]),
        ...overrides
    };
}

describe('opaque encrypted container (Wave P)', () => {

    it('seal then unseal recovers fields and payload byte-exact', async () => {
        const fields = makeFields();
        const [wire, sealErr] = await sealContainer(PASSWORD, fields);
        expect(sealErr).toBe(null);

        if (!(wire instanceof Uint8Array) || wire.length < 28 + 16) {
            throw new Error(`wire too short: ${wire ? wire.length : 'null'}`);
        }
        void wire;

        const [unsealed, unsealErr] = await unsealContainer(PASSWORD, wire);
        if (unsealErr) throw new Error(`unseal failed: ${unsealErr.message}`);
        if (JSON.stringify(unsealed.fields) !== JSON.stringify(fields)) {
            throw new Error('fields mismatch after roundtrip');
        }
    });

    it('wrong password returns null (GCM auth failure), never partial output', async () => {
        const [wire] = await sealContainer(PASSWORD, makeFields());
        const [result] = await unsealContainer('wrong-password', wire);
        if (result !== null) throw new Error('wrong password yielded data');
    });

    it('tampered ciphertext returns null', async () => {
        const [wire] = await sealContainer(PASSWORD, makeFields());
        const corrupted = Uint8Array.from(wire);
        corrupted[Math.floor(corrupted.length / 2)] ^= 0xFF;
        const [result] = await unsealContainer(PASSWORD, corrupted);
        if (result !== null) throw new Error('tampered container yielded data');
    });

    it('salt is unique per seal operation', async () => {
        const salts = new Set();
        for (let i = 0; i < 50; i++) {
            const [wire] = await sealContainer(PASSWORD, makeFields());
            salts.add(Array.from(wire.slice(0, 16)).join(','));
        }
        if (salts.size !== 50) throw new Error(`only ${salts.size} unique salts out of 50`);
    });

    it('nonce is unique across seals with identical inputs', async () => {
        const nonces = new Set();
        for (let i = 0; i < 50; i++) {
            const [wire] = await sealContainer(PASSWORD, makeFields());
            nonces.add(Array.from(wire.slice(16, 28)).join(','));
        }
        if (nonces.size !== 50) throw new Error(`only ${nonces.size} unique nonces out of 50`);
    });
});

describe('opaque container randomness quality', () => {

    it('salt and nonce bytes pass chi-square uniformity', async () => {
        const allBytes = [];
        for (let i = 0; i < 200; i++) {
            const [wire] = await sealContainer(PASSWORD, makeFields());
            for (let j = 0; j < 28; j++) allBytes.push(wire[j]);
        }
        // Chi-square: each of 256 values should appear ~allBytes.length/256 times
        const expected = allBytes.length / 256;
        const freq = new Array(256).fill(0);
        for (const b of allBytes) freq[b]++;
        let chiSq = 0;
        for (const f of freq) chiSq += Math.pow(f - expected, 2) / expected;
        // df=255, critical value at p<0.001 is ~339
        if (chiSq > 400) throw new Error(`byte distribution not uniform (chi-square=${chiSq.toFixed(0)})`);
    });

    it('no leading zero or structural patterns in salt+nonce', async () => {
        for (let i = 0; i < 100; i++) {
            const [wire] = await sealContainer(PASSWORD, makeFields());
            // Salt must not be all zeros
            if (wire.slice(0, 16).every(b => b === 0)) throw new Error('all-zero salt detected');
            // Nonce must not be all zeros
            if (wire.slice(16, 28).every(b => b === 0)) throw new Error('all-zero nonce detected');
            // Salt must not start with the magic string
            if (wire[0] === 0x46 && wire[1] === 0x35 && wire[2] === 0x53 && wire[3] === 0x47) {
                throw new Error('salt starts with F5SG magic');
            }
        }
    });
});
