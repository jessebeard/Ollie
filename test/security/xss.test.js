import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView Security', () => {
    it('sanitizes malicious URLs', async () => {
        const view = new VaultView(document.createElement('div'), { emit: () => {} });

        await assertProperty(
            [Arbitrary.string()],
            (randomString) => {
                const maliciousUrl = `javascript:${randomString}`;
                const sanitized = view.sanitizeUrl(maliciousUrl);
                return sanitized === 'about:blank';
            }
        );

        await assertProperty(
            [Arbitrary.string()],
            (randomString) => {
                const maliciousUrl = `data:${randomString}`;
                const sanitized = view.sanitizeUrl(maliciousUrl);
                return sanitized === 'about:blank';
            }
        );

        await assertProperty(
            [Arbitrary.string()],
            (randomString) => {
                const maliciousUrl = `vbscript:${randomString}`;
                const sanitized = view.sanitizeUrl(maliciousUrl);
                return sanitized === 'about:blank';
            }
        );

        expect(view.sanitizeUrl('  javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('JaVaScRiPt:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('http://example.com')).toBe('http://example.com');
    });
});

describe('ModalManager Security', () => {
    it('prevents XSS in prompts', async () => {
        const manager = new ModalManager();

        await assertProperty(
            [Arbitrary.string()],
            async (maliciousInput) => {
                const promise = manager.prompt(maliciousInput, maliciousInput);
                const modalHtml = manager.overlay.innerHTML;

                // simulate closing
                manager.hide();

                // Assert structural context breakout
                // We should not find <maliciousInput> structurally unescaped
                // If the input includes < or >, it shouldn't be rendered as-is
                if (maliciousInput.includes('<') || maliciousInput.includes('>')) {
                    if (modalHtml.includes(`<h3>${maliciousInput}</h3>`)) {
                        return false;
                    }
                }
                return true;
            }
        );
    });
});
