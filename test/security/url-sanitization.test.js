import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('URL Sanitization Security', () => {
    it('prevents XSS via malicious URL schemes', async () => {
        const view = new VaultView(document.createElement('div'), { emit: () => {} });

        // Define a custom arbitrary for malicious URLs
        const maliciousUrlArbitrary = {
            generate: () => {
                const schemes = ['javascript:', 'data:', 'vbscript:'];
                const scheme = schemes[Math.floor(Math.random() * schemes.length)];
                const payloads = ['alert(1)', 'console.log("xss")'];
                const payload = payloads[Math.floor(Math.random() * payloads.length)];

                // Randomly inject whitespace/control chars
                const chars = scheme.split('');
                const injected = chars.map(c => Math.random() > 0.5 ? c + ' \x00\t\n\r ' : c).join('');

                return injected + payload;
            },
            shrink: (val) => [val.replace(/[\x00-\x20]/g, '')]
        };

        await assertProperty(
            [maliciousUrlArbitrary],
            async (maliciousUrl) => {
                const sanitized = view.sanitizeUrl(maliciousUrl);
                return sanitized === 'about:blank';
            }
        );
    });
});
