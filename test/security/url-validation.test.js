import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Validation Security', () => {
    it('Property: validateAndFormatURL only returns safe HTTP/HTTPS URLs or null', async () => {
        // Mock element and event bus just for instantiation
        const mockEl = typeof document !== 'undefined' ? document.createElement('div') : {};
        const view = new VaultView(mockEl, {});

        await assertProperty([Arbitrary.string(1, 100)], async (inputUrl) => {
            const result = view.validateAndFormatURL(inputUrl);

            // If it returns null, that's safe
            if (result === null) return true;

            // Otherwise, it MUST parse as a URL and have an http: or https: protocol
            try {
                const parsed = new URL(result);
                return ['http:', 'https:'].includes(parsed.protocol);
            } catch (e) {
                // Should never return an unparseable URL string
                return false;
            }
        });
    });

    it('Fuzz: validateAndFormatURL rejects malicious schemes and edge cases', () => {
        const mockEl = typeof document !== 'undefined' ? document.createElement('div') : {};
        const view = new VaultView(mockEl, {});

        const maliciousPayloads = [
            "javascript:alert(1)",
            "javascript://%250Aalert(1)",
            "JaVaScRiPt:alert(1)",
            "vbscript:msgbox(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            " javascript:alert(1) ",
            "\tjavascript:alert(1)",
            "javascript\n:alert(1)",
            "http://example.com/javascript:alert(1)", // valid HTTP, safe
            "https://example.com/javascript:alert(1)" // valid HTTPS, safe
        ];

        for (const payload of maliciousPayloads) {
            const result = view.validateAndFormatURL(payload);
            if (result !== null) {
                const parsed = new URL(result);
                expect(['http:', 'https:'].includes(parsed.protocol)).toBe(true);
            }
        }
    });

    it('Normalizes URLs without schemes to HTTPS', () => {
        const mockEl = typeof document !== 'undefined' ? document.createElement('div') : {};
        const view = new VaultView(mockEl, {});

        expect(view.validateAndFormatURL('example.com')).toBe('https://example.com/');
        expect(view.validateAndFormatURL(' www.google.com ')).toBe('https://www.google.com/');
    });
});
