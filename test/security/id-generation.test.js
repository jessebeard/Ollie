import { describe, it, expect } from '../utils/test-runner.js';
import { ChunkManager } from '../../src/information-theory/steganography/chunk-manager.js';
import { PasswordVault as ImmutableVault } from '../../src/structures/vault/immutable-vault.js';

export default async function runSecurityTests() {
    describe('Security: ID Generation (Cryptographically Secure UUIDs)', () => {

        it('ChunkManager should generate valid version 4 UUIDs without Math.random patterns', () => {
            const id = ChunkManager.generateId();
            // A basic check for standard v4 UUID format
            // e.g. 123e4567-e89b-12d3-a456-426614174000
            const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidV4Regex.test(id)).toBe(true);
        });

        it('ImmutableVault should generate IDs prefixed with timestamp and ending in valid UUID format', () => {
            const id = ImmutableVault.generateId();

            // Format is {timestamp}-{uuid}
            const parts = id.split('-');
            expect(parts.length).toBe(6); // timestamp + 5 UUID segments

            const timestamp = parseInt(parts[0], 10);
            expect(timestamp > 1600000000000).toBe(true); // Should be a valid recent timestamp

            // Reconstruct the UUID part to verify format
            const uuidPart = parts.slice(1).join('-');
            const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(uuidV4Regex.test(uuidPart)).toBe(true);
        });

        it('IDs should be unique across many generations', () => {
            const ids = new Set();
            for (let i = 0; i < 1000; i++) {
                ids.add(ChunkManager.generateId());
            }
            expect(ids.size).toBe(1000);
        });
    });
}
