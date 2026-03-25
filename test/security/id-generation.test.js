import { describe, it, expect } from '../utils/test-runner.js';
import { generateSecureId } from '../../src/information-theory/cryptography/crypto-compat.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';

describe('Security: ID Generation', () => {
    it('should generate unique IDs', () => {
        const ids = new Set();
        const iterations = 10000;

        for (let i = 0; i < iterations; i++) {
            ids.add(generateSecureId());
        }

        // Assert that all generated IDs are unique
        expect(ids.size).toEqual(iterations);
    });

    it('should prefix with timestamp when requested', () => {
        const id1 = generateSecureId(true);
        const parts = id1.split('-');

        // Parts should be at least [timestamp, uuid_part1, ...]
        expect(parts.length).toBeGreaterThan(1);

        const timestamp = parseInt(parts[0], 10);
        // The timestamp should be a valid recent timestamp
        expect(timestamp).toBeGreaterThan(1700000000000);
        expect(timestamp).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('should not contain predictable patterns (PBT)', async () => {
        const ids = Array.from({ length: 100 }, () => generateSecureId());

        assertProperty(
            [Arbitrary.integer(0, ids.length - 2)],
            (index) => {
                const id1 = ids[index];
                const id2 = ids[index + 1];
                // IDs should be completely different strings, not sequential
                expect(id1).not.toEqual(id2);
            }
        );
    });
});
