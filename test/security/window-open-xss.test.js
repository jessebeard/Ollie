import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';
import { sanitizeUrl } from '../../app/utils/security.js';

describe('VaultView window.open XSS', () => {
    it('prevents javascript: URIs in window.open via property-based testing', async () => {
        let windowOpenCalled = false;
        let windowOpenUrl = null;

        const originalWindow = global.window;
        const originalDocument = global.document;

        global.window = {
            open: (url, target) => {
                windowOpenCalled = true;
                windowOpenUrl = url;
            }
        };

        const createElement = (tag) => {
            return {
                className: '',
                setAttribute: () => {},
                innerHTML: '',
                appendChild: () => {},
                querySelector: (sel) => {
                    if (sel === '.more-btn') return { addEventListener: () => {} };
                    if (sel === '.btn-copy') return { addEventListener: () => {} };
                    if (sel === '.btn-launch') return {
                        addEventListener: (event, cb) => {
                            if (event === 'click') {
                                // Since dynamic import is async, we can't just await cb.
                                // We'll trigger it and sleep a bit for the import to resolve.
                                cb({ stopPropagation: () => {} });
                            }
                        }
                    };
                    return { addEventListener: () => {} };
                }
            };
        };

        global.document = { createElement };

        try {
            await assertProperty(
                [Arbitrary.string(1, 50)],
                async (maliciousUrl) => {
                    windowOpenCalled = false;
                    windowOpenUrl = null;

                    const view = new VaultView(document.createElement('div'), { emit: () => {} });

                    const card = view.createCard({
                        id: 1,
                        title: "Test",
                        username: "user",
                        url: maliciousUrl
                    });

                    // We need to wait for dynamic import to resolve
                    await new Promise(resolve => setTimeout(resolve, 5));

                    if (windowOpenCalled && windowOpenUrl && windowOpenUrl.toLowerCase().trim().startsWith('javascript:')) {
                        return false;
                    }
                    if (windowOpenCalled && windowOpenUrl && windowOpenUrl.toLowerCase().trim().startsWith('vbscript:')) {
                        return false;
                    }
                    if (windowOpenCalled && windowOpenUrl && windowOpenUrl.toLowerCase().trim().startsWith('data:')) {
                        return false;
                    }

                    return true;
                }
            );
        } finally {
            global.window = originalWindow;
            global.document = originalDocument;
        }
    });

    it('sanitizes specific payloads', async () => {
        const payloads = [
            'javascript:alert(1)',
            '  javascript:alert(1)',
            'java\x00script:alert(1)',
            'JaVaScRiPt:alert(1)',
            'data:text/html,<script>alert(1)</script>'
        ];

        for (const payload of payloads) {
            const sanitized = sanitizeUrl(payload);
            expect(sanitized).toBe('about:blank');
        }
    });
});
