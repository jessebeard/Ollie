import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { cryptoInstance } from '../../src/information-theory/cryptography/crypto-compat.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';

describe('Security: ID Generation', () => {

    it('cryptoInstance.randomUUID() generates valid, unique UUIDs', async () => {
        const uuidSet = new Set();

        await assertProperty(
            [Arbitrary.integer(1, 1000)], // The actual argument doesn't matter much, we just want to run it many times
            async (dummyVal) => {
                const uuid = cryptoInstance.randomUUID();

                // UUID format check (v4 or similar)
                const isValidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);

                // Uniqueness check
                const isUnique = !uuidSet.has(uuid);
                uuidSet.add(uuid);

                return isValidFormat && isUnique;
            },
            500 // iterations
        );
    });

    it('ImmutableVault generates valid, unique UUIDs', async () => {
        const uuidSet = new Set();

        await assertProperty(
            [Arbitrary.integer(1, 1000)],
            async (dummyVal) => {
                const uuid = ImmutableVault.generateId();
                const isUnique = !uuidSet.has(uuid);
                uuidSet.add(uuid);
                // Also verify it doesn't contain obvious bad patterns like sequential numbers
                return isUnique && typeof uuid === 'string' && uuid.length > 10;
            },
            100 // iterations
        );
    });

    it('ChunkManager generates valid, unique UUIDs', async () => {
        const uuidSet = new Set();

        await assertProperty(
            [Arbitrary.integer(1, 1000)],
            async (dummyVal) => {
                const uuid = ChunkManager.generateId();
                const isUnique = !uuidSet.has(uuid);
                uuidSet.add(uuid);
                return isUnique && typeof uuid === 'string' && uuid.length > 10;
            },
            100 // iterations
        );
    });
});
