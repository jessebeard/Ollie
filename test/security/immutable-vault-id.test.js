import { describe, it, expect } from '../utils/test-runner.js';
import { PasswordVault } from '../../src/structures/vault/immutable-vault.js';
import { cryptoInstance } from '../../src/information-theory/cryptography/crypto-compat.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';

describe('Sentinel: PasswordVault Security - ID Generation', () => {
    it('generates IDs that conform to UUID format', () => {
        const id = PasswordVault.generateId();

        // UUID format regex (v4 or general format)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        expect(uuidRegex.test(id)).toBe(true);
    });

    it('generates unique IDs without collisions', () => {
        const numIds = 1000;
        const generatedIds = new Set();

        for (let i = 0; i < numIds; i++) {
            const id = PasswordVault.generateId();
            expect(generatedIds.has(id)).toBe(false);
            generatedIds.add(id);
        }

        expect(generatedIds.size).toBe(numIds);
    });

    it('uses Web Crypto API for secure ID generation (mocks)', () => {
        // We mock randomUUID temporarily to ensure it's being called
        const originalRandomUUID = cryptoInstance.randomUUID;
        let wasCalled = false;

        cryptoInstance.randomUUID = () => {
            wasCalled = true;
            return 'mocked-uuid-1234';
        };

        try {
            const id = PasswordVault.generateId();
            expect(wasCalled).toBe(true);
            expect(id).toBe('mocked-uuid-1234');
        } finally {
            // Restore
            cryptoInstance.randomUUID = originalRandomUUID;
        }
    });

    it('PBT: ID generation is consistent across multiple calls', () => {
        // While UUIDs are random, we can assert properties about their structure
        assertProperty(
            Arbitrary.integer(1, 100),
            (count) => {
                for (let i = 0; i < count; i++) {
                    const id = PasswordVault.generateId();
                    if (typeof id !== 'string' || id.length !== 36) {
                        return false;
                    }
                }
                return true;
            }
        );
    });
});
