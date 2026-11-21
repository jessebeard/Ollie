import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { ErrorCorrection, ECC_PROFILES } from '../../src/information-theory/error-correction/rs-interleaver.js';

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

function sameBytes(a, b) {
    return a.length === b.length && a.join() === b.join();
}

function injectErrors(encoded, count, rng) {
    const corrupted = Uint8Array.from(encoded);
    const positions = new Set();
    let guard = 0;
    while (positions.size < Math.min(count, encoded.length) && guard < count * 50) {
        const pos = rng(4).reduce((acc, b) => (acc * 256 + b) % encoded.length, 0);
        if (!positions.has(pos)) {
            positions.add(pos);
            corrupted[pos] ^= 0x01 + (rng(1)[0] & 0x7F); // guaranteed value change
        }
        guard++;
    }
    return corrupted;
}

async function propAtLimit(data, seed) {
    const profileName = 'High'; // parity 64 -> t=32 per block
    const [result, err] = ErrorCorrection.protect(data, profileName);
    if (err) throw err;

    const rng = seededRandom(seed);
    const blockCount = result.blockCount;
    const tLimit = Math.floor(ECC_PROFILES.High.parityBytes / 2);

    // Hit EVERY block with exactly tLimit errors.
    const corrupted = Uint8Array.from(result.encoded);
    const perBlock = new Map();
    for (let pos = 0; pos < corrupted.length; pos++) {
        const blockIdx = pos % blockCount;
        const used = perBlock.get(blockIdx) || 0;
        if (used < tLimit) {
            corrupted[pos] ^= 0x80;
            perBlock.set(blockIdx, used + 1);
        }
    }
    for (let b = 0; b < blockCount; b++) {
        if ((perBlock.get(b) || 0) !== tLimit) {
            throw new Error(`block ${b} got ${(perBlock.get(b) || 0)} errors, expected ${tLimit}`);
        }
    }

    const [recovered, recErr] = ErrorCorrection.recover(
        corrupted, profileName, result.originalLength, result.blockCount
    );
    if (recErr) throw new Error(`at-limit recovery failed: ${recErr.message}`);
    if (!sameBytes(recovered, data)) throw new Error('at-limit recovery produced wrong bytes');
}

async function propBeyondTolerance(data, seed, errorCount) {
    const profileName = 'Medium'; // parity 32 -> t=16
    if (errorCount <= 16) return;

    const [result, err] = ErrorCorrection.protect(data, profileName);
    if (err) throw err;

    const rng = seededRandom(seed);
    const corrupted = injectErrors(result.encoded, errorCount, rng);

    const [recovered, recErr] = ErrorCorrection.recover(
        corrupted, profileName, result.originalLength, result.blockCount
    );

    // The ONLY acceptable outcomes: exact recovery, or an explicit error
    // tuple. Wrong-data-success is the forbidden state.
    if (recErr === null) {
        if (!sameBytes(recovered, data)) {
            throw new Error(`${errorCount} errors: silent wrong-data success`);
        }
    } else if (recovered !== null) {
        throw new Error('error tuple accompanied by a buffer');
    }
}

async function propSubTolerance(data, seed, flipsPerBlock) {
    for (const profileName of ['Low', 'Medium']) {
        const parity = ECC_PROFILES[profileName].parityBytes;
        if (flipsPerBlock > Math.floor(parity / 2)) continue;

        const [result, err] = ErrorCorrection.protect(data, profileName);
        if (err) throw err;

        const rng = seededRandom((seed ^ flipsPerBlock * 7919) >>> 0);
        const blockCount = result.blockCount;
        const corrupted = Uint8Array.from(result.encoded);

        // Interleave layout: encoded[bytePos * blockCount + blockIdx].
        for (let b = 0; b < blockCount; b++) {
            const positions = new Set();
            let guard = 0;
            while (positions.size < flipsPerBlock && guard < flipsPerBlock * 60) {
                const bytePos = rng(4).reduce((acc, x) => (acc * 256 + x) % 255, 0);
                positions.add(bytePos);
                guard++;
            }
            for (const bytePos of positions) {
                corrupted[bytePos * blockCount + b] ^= 0x55;
            }
        }

        const [recovered, recErr] = ErrorCorrection.recover(
            corrupted, profileName, result.originalLength, result.blockCount
        );
        if (recErr) throw new Error(`${profileName} failed under ${flipsPerBlock}/block: ${recErr.message}`);
        if (!sameBytes(recovered, data)) {
            throw new Error(`${profileName} wrong output under ${flipsPerBlock}/block`);
        }
    }
}

/** Long-run entry point (scripts/fuzz.mjs registry). */
export async function runEccEdgeFuzz(scale = 1) {
    await assertProperty(
        [Arbitrary.byteArray(300, 600), Arbitrary.integer(100000, 900000)],
        (data, seed) => propAtLimit(data, seed),
        12 * scale
    );
    await assertProperty(
        [Arbitrary.byteArray(200, 400), Arbitrary.integer(1, 999999), Arbitrary.integer(40, 90)],
        (data, seed, count) => propBeyondTolerance(data, seed, count),
        30 * scale
    );
    await assertProperty(
        [Arbitrary.byteArray(150, 450), Arbitrary.integer(2, 500000), Arbitrary.integer(1, 14)],
        (data, seed, flips) => propSubTolerance(data, seed, flips),
        15 * scale
    );
}
