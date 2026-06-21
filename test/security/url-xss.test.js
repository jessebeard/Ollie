import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL XSS Prevention', () => {
    it('prevents javascript: and other malicious protocols using PBT', async () => {
        const view = new VaultView(document.createElement('div'), { emit: () => {} });

        // Generate potentially malicious URLs with varying case and whitespace
        const maliciousProtocolsArb = {
            generate: () => {
                const protocols = ['javascript:', 'data:', 'vbscript:'];
                const protocol = protocols[Math.floor(Math.random() * protocols.length)];

                // Randomize case
                const casedProtocol = protocol.split('').map(c =>
                    Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()
                ).join('');

                // Add random whitespace
                const whitespace = [' ', '\t', '\n', '\r'];
                const prefixWs = Array(Math.floor(Math.random() * 5)).fill(0).map(() =>
                    whitespace[Math.floor(Math.random() * whitespace.length)]
                ).join('');

                // Add random payload
                const payloadLength = Math.floor(Math.random() * 20);
                const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()\'";<>{}!@#$%^&*_=+-`~[]\\|/';
                const payload = Array(payloadLength).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');

                return prefixWs + casedProtocol + payload;
            },
            shrink: (value) => [] // Simplified shrink
        };

        await assertProperty(
            [maliciousProtocolsArb],
            (url) => {
                const safeUrl = view.sanitizeUrl(url);
                return safeUrl === 'about:blank';
            }
        );

        // Also test valid URLs using a generic string arbitrary
        await assertProperty(
            [Arbitrary.string(1, 50)],
            (str) => {
                let validUrl = 'https://example.com/';
                try {
                    // Filter out lone surrogates which cause URI malformed in encodeURIComponent
                    const safeStr = str.replace(/[\uD800-\uDFFF]/g, '');
                    validUrl += encodeURIComponent(safeStr);
                } catch (e) {
                    // Fallback
                }
                const safeUrl = view.sanitizeUrl(validUrl);
                return safeUrl === validUrl;
            }
        );
    });
});
