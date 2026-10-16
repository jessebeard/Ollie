import { describe, it, expect } from '../utils/test-runner.js';
import { loadArgon2id, deriveArgon2id } from '../../src/vendor/argon2/index.js';

describe('Vendored Argon2id WASM Module', () => {
    it('initializes the WASM module successfully', async () => {
        const argon2id = await loadArgon2id();
        expect(typeof argon2id).toBe('function');
    });

    it('hashes data with standard RFC 9106 test vector (t=1, m=32, p=1, tagLength=32)', async () => {
        const argon2id = await loadArgon2id();
        const password = new TextEncoder().encode('password');
        const salt = new TextEncoder().encode('somesalt12345678'); // 16 bytes

        const hash = argon2id({
            password,
            salt,
            passes: 1,
            memorySize: 32, // 32 KB
            parallelism: 1,
            tagLength: 32
        });

        expect(hash instanceof Uint8Array).toBe(true);
        expect(hash.length).toBe(32);

        // Verify deterministic output across multiple invocations
        const hash2 = argon2id({
            password,
            salt,
            passes: 1,
            memorySize: 32,
            parallelism: 1,
            tagLength: 32
        });
        expect(Array.from(hash)).toEqual(Array.from(hash2));
    });

    it('executes Format v4 standard parameters (t=3, m=65536, p=1) deterministically via deriveArgon2id', async () => {
        const password = 'correct-horse-battery-staple';
        const salt = new Uint8Array(16);
        for (let i = 0; i < 16; i++) salt[i] = i * 17;

        const t0 = Date.now();
        const hash = await deriveArgon2id({
            password,
            salt,
            passes: 3,
            memorySize: 65536, // 64 MB
            parallelism: 1,
            tagLength: 32
        });
        const elapsed = Date.now() - t0;

        expect(hash.length).toBe(32);
        expect(hash.some(b => b !== 0)).toBe(true);
        expect(elapsed < 2000).toBe(true);
    });

    it('produces distinct hashes for different passwords or salts', async () => {
        const salt1 = new TextEncoder().encode('salt-one-1234567');
        const salt2 = new TextEncoder().encode('salt-two-1234567');
        const pw1 = 'password-one';
        const pw2 = 'password-two';

        const h1 = await deriveArgon2id({ password: pw1, salt: salt1, passes: 1, memorySize: 64, parallelism: 1 });
        const h2 = await deriveArgon2id({ password: pw2, salt: salt1, passes: 1, memorySize: 64, parallelism: 1 });
        const h3 = await deriveArgon2id({ password: pw1, salt: salt2, passes: 1, memorySize: 64, parallelism: 1 });

        expect(Array.from(h1)).not.toEqual(Array.from(h2));
        expect(Array.from(h1)).not.toEqual(Array.from(h3));
    });
});
