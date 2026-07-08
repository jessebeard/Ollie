import { describe, it, expect, executeTests, getStats } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Validation PBT', () => {
    it('Property: URL Sanitization Rejects Malicious Protocols', async () => {
        const mockView = new VaultView(null, null);
        await assertProperty(
            [Arbitrary.string(1, 100)],
            async (url) => {
                const sanitized = mockView.sanitizeUrl(url);
                if (!sanitized) return true;
                const cleaned = sanitized.replace(/[\x00-\x20\x7F]/g, '').toLowerCase();
                expect(cleaned.startsWith('javascript:')).toBe(false);
                expect(cleaned.startsWith('data:')).toBe(false);
                expect(cleaned.startsWith('vbscript:')).toBe(false);
                return true;
            },
            500
        );
    });
});

await executeTests();
const stats = getStats();
if (stats.failed > 0) process.exit(1);
