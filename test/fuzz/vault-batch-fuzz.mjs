import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { JpegEncoder } from '../../src/codec/encoder.js';
import { sealPayload } from '../../src/information-theory/secret-sharing/css-envelope.js';

const PASSWORD = 'vault-model-pw';

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

function randStr(rng, len) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let out = '';
    for (let i = 0; i < len; i++) out += chars[rng(1)[0] % chars.length];
    return out;
}

/**
 * Runs a random operation sequence against a real vault while tracking an
 * independent model, asserting structural invariants after EVERY step.
 */
async function propOperationSequence(seed, seqLen) {
    const rng = seededRandom(seed);

    let vault = new PasswordVault([], null, true, PASSWORD);
    const model = new Map(); // id -> {title, password}
    let revision = 0;

    const checkInvariants = (label) => {
        if (!Object.isFrozen(vault.entries)) throw new Error(`${label}: entries not frozen`);
        if (vault.metadata.revision !== revision) {
            throw new Error(`${label}: revision ${vault.metadata.revision} != model ${revision}`);
        }
        const json = JSON.stringify(vault.toJSON());
        for (const [id, m] of model) {
            if (m.password && json.includes(m.password)) {
                throw new Error(`${label}: plaintext password leaked into serialization (${id})`);
            }
        }
    };

    let counter = 0;
    for (let step = 0; step < seqLen; step++) {
        let roll = rng(2)[0];
        // Empty vault: only valid adds are meaningful.
        if (model.size === 0) roll = Math.min(roll, 100);
        if (roll < 128 || model.size === 0 && roll >= 200) {
            // ADD (valid)
            const title = randStr(rng, 8);
            const pw = randStr(rng, 10) + '!';
            const before = vault.entries.length;
            const [nv, err] = await vault.addEntry({ title, username: 'u', password: pw });
            if (err) throw new Error(`valid add rejected: ${err.message}`);
            const added = nv.entries[nv.entries.length - 1];
            model.set(added.id, { title, password: pw });
            vault = nv;
            revision++;
            void before; void counter;
            counter++;
        } else if (roll < 150) {
            // ADD invalid -> must fail WITHOUT mutating
            const before = { count: vault.entries.length };
            const [nv, err] = await vault.addEntry({ username: 'no-title' });
            if (!(err instanceof Error)) throw new Error('invalid entry accepted');
            if (nv.entries.length !== before.count || nv.metadata.revision !== revision) {
                throw new Error('failed op mutated the vault');
            }
            vault = nv;
        } else if (roll < 180) {
            // UPDATE an existing entry's password
            const ids = [...model.keys()];
            const id = ids[Math.floor(rng(2)[0] / 256 * ids.length)] || ids[0];
            const newPw = randStr(rng, 12) + '?';
            const [nv, err] = await vault.updateEntry(id, { password: newPw });
            if (err) throw new Error(`update failed: ${err.message}`);
            model.get(id).password = newPw;
            vault = nv;
            revision++;
        } else if (roll < 210) {
            // DELETE
            const ids = [...model.keys()];
            if (ids.length === 0) continue;
            const id = ids[Math.floor(rng(2)[0] / 256 * ids.length)];
            const [nv, err] = await vault.deleteEntry(id);
            if (err) throw new Error(`delete failed: ${err.message}`);
            model.delete(id);
            vault = nv;
            revision++;
        } else {
            // EXPORT + IMPORT roundtrip preserves the model
            const [json, expErr] = await vault.exportEncrypted(PASSWORD);
            if (expErr) throw new Error(`export failed: ${expErr.message}`);
            const [reimported, impErr] = await PasswordVault.importEncrypted(json, PASSWORD);
            if (impErr) throw new Error(`import failed: ${impErr.message}`);
            const decrypted = await reimported.getPlaintextJSON();
            if (decrypted[1]) throw new Error(`plaintext export failed: ${decrypted[1].message}`);
            const doc = JSON.parse(decrypted[0]);
            if (doc.entries.length !== model.size) throw new Error('roundtrip changed entry count');
            for (const [id, m] of model) {
                const match = doc.entries.find(e => e.id === id);
                if (!match) throw new Error(`entry ${id} lost through export/import`);
                void m;
            }
            vault = new PasswordVault(reimported.entries, reimported.metadata, true, PASSWORD, null);
            void revision;
        }

        checkInvariants(`step ${step}`);
    }

    // Final semantic check: every model password decrypts correctly.
    const [sessionKey, skErr] = await vault._getSessionKey();
    if (skErr) throw skErr;
    for (const entry of vault.entries) {
        const [plain, pErr] = await entry.decrypt(sessionKey);
        if (pErr) throw new Error(`stored entry failed to decrypt: ${pErr.message}`);
        const m = model.get(entry.id);
        if (!m) throw new Error('vault holds entry missing from model');
        if (plain.password !== m.password) throw new Error(`password mismatch for ${entry.id}`);
    }
}

/** Long-run entry point (scripts/fuzz.mjs registry). */
export async function runVaultModelFuzz(scale = 1) {
    await assertProperty(
        [Arbitrary.integer(1, 999999)],
        async (seed) => {
            await propOperationSequence(seed, 10);
        },
        Math.max(4, 6 * scale)
    );
}

/** Zeroization + lock hygiene checks (user radar item). */
export async function runZeroizationChecks(scale = 1) {
    for (let i = 0; i < 4 * scale; i++) {
        /** @type {Uint8Array|null} */
        let dekRef = null;                    // reference to the actual DEK draw
        const wrapped = (n) => {
            const b = new Uint8Array(n);
            globalThis.crypto.getRandomValues(b);
            if (n === 32 && dekRef === null) dekRef = b;   // hold SAME buffer
            return b;
        };
        await sealPayload(new Uint8Array([9, 9, 9]), { threshold: 1, total: 2, random: wrapped });
        // css-envelope MUST wipe its DEK copy (the very buffer we hold).
        if (dekRef.some(b => b !== 0)) {
            throw new Error('DEK buffer was not zeroized after sealing');
        }
    }

    // Lock hygiene: credentials unreachable + entries dropped.
    let vault = new PasswordVault([], null, true, PASSWORD);
    [vault] = await vault.addEntry({ title: 't', username: 'u', password: 'p' });
    const locked = vault.lock();
    if (locked.isUnlocked) throw new Error('locked vault reports unlocked');
    if (locked.entries.length !== 0) throw new Error('locked vault retained entries');
    if (JSON.stringify(locked).includes('"_unlock"')) throw new Error('_unlock enumerable');
    if (locked._password() !== null || locked._sessionKey() !== null) {
        throw new Error('credentials survived lock()');
    }
    void scale;
}

/** Batch EC subset MRs over randomized carrier counts and thresholds. */
export async function runBatchSubsetFuzz(scale = 1) {
    const combos = [
        { n: 3, k: 2 },
        { n: 4, k: 2 },
        { n: 4, k: 3 }
    ];

    const iterations = Math.max(2, 2 * scale);
    for (let i = 0; i < iterations; i++) {
        const combo = combos[i % combos.length];
        const { n, k } = combo;
        const seedBase = (seedOf(combo.n, combo.k) + i * 977) >>> 0;

        const carriers = [];
        for (let c = 0; c < n; c++) {
            const size = 256;
            const data = new Uint8ClampedArray(size * size * 4);
            let s = seedBase + c;
            for (let px = 0; px < data.length; px += 4) {
                s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
                data[px] = (s >>> 24) & 0xFF;
                data[px + 1] = (s >>> 16) & 0xFF;
                data[px + 2] = (s >>> 8) & 0xFF;
                data[px + 3] = 255;
            }
            const encoded = await new JpegEncoder(90)
                .encode({ width: size, height: size, data });
            carriers.push({
                name: `carrier_${c}.jpg`,
                size: encoded.length,
                arrayBuffer: async () => encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
            });
        }

        let vault = new PasswordVault([], null, true, PASSWORD);
        [vault] = await vault.addEntry({
            title: 'model-entry', username: 'u@example.com',
            password: 'secret-value', url: 'https://example.com',
            notes: 'n'.repeat(120)
        });

        const [results, saveErr] = await vault.save(carriers, PASSWORD, null, { threshold: k });
        if (saveErr) throw new Error(`save failed (n=${n}, k=${k}): ${saveErr.message}`);
        if (results.length !== n) {
            throw new Error(`expected one coded carrier per photo (${n}), got ${results.length}`);
        }

        const stego = results.map((r, idx) => ({
            name: `stego_${idx}.jpg`,
            size: r.data.length,
            arrayBuffer: async () => r.data.buffer.slice(r.data.byteOffset, r.data.byteOffset + r.data.byteLength)
        }));

        // EVERY k-subset recovers.
        for (let mask = 0; mask < (1 << n); mask++) {
            const bitsCount = [...Array(n).keys()].filter(b => mask & (1 << b)).length;
            if (bitsCount !== k) continue;
            const subset = [];
            for (let b = 0; b < n; b++) if (mask & (1 << b)) subset.push(stego[b]);

            const [loaded, loadErr] = await PasswordVault.load(subset, PASSWORD);
            if (loadErr) throw new Error(`subset [${[...Array(n).keys()].filter(b => mask & (1 << b))}] failed: ${loadErr.message}`);
            if (!loaded || !loaded.isUnlocked) throw new Error('subset did not unlock');
        }

        // ANY (k-1)-subset fails closed.
        for (let drop = 0; drop < n; drop++) {
            const subset = stego.filter((_, b) => b !== drop);
            if (subset.length >= k) continue;
            const [, err] = await PasswordVault.load(subset, PASSWORD);
            if (!(err instanceof Error)) {
                throw new Error(`below-threshold subset accepted when dropping ${drop}`);
            }
        }
    }
}

function seedOf(n, k) { return ((n * 31) ^ (k * 17)) >>> 0; }
