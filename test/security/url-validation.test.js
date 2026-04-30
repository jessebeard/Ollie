import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
// We will test a standalone validator since testing VaultView UI directly in node is tricky
export function validateUrl(urlStr) {
    try {
        const parsed = new URL(urlStr);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
        return null; // Reject unsafe
    } catch (e) {
        // If it doesn't parse, check if it already has a known scheme that just failed to parse.
        // We only want to prepend https:// if it looks like a bare domain (e.g., example.com)
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlStr)) {
            return null; // Already has a scheme, don't prepend https://
        }

        try {
            const prefixed = new URL('https://' + urlStr);
            if (prefixed.protocol === 'https:') {
                return prefixed.toString();
            }
        } catch (e2) {
            return null;
        }
    }
    return null;
}

describe('Security: URL Validation for window.open', () => {
    it('Property: Rejects dangerous protocols', async () => {
        await assertProperty(
            [
                { generate: () => Arbitrary.string(1, 20).generate() }
            ],
            async (randomStr) => {
                const dangerousUrls = [
                    `javascript:${randomStr}`,
                    `data:${randomStr}`,
                    `vbscript:${randomStr}`,
                    `file://${randomStr}`
                ];

                for (const url of dangerousUrls) {
                    const validated = validateUrl(url);
                    expect(validated).toBe(null);
                }
                return true;
            },
            10
        );
    });

    it('Property: Accepts safe protocols', async () => {
        await assertProperty(
            [
                { generate: () => Arbitrary.string(1, 20).generate() } // path/domain part
            ],
            async (randomStr) => {
                const domain = randomStr.replace(/[^a-zA-Z0-9-]/g, '') + '.com';
                if (domain === '.com') return true; // skip empty

                const safeUrls = [
                    `https://${domain}`,
                    `http://${domain}`,
                    `${domain}` // Should prepend https://
                ];

                for (const url of safeUrls) {
                    const validated = validateUrl(url);
                    expect(validated !== null).toBe(true);
                    expect(validated.startsWith('http')).toBe(true);
                }
                return true;
            },
            20
        );
    });
});
