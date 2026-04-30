import { describe, it, expect } from '../utils/test-runner.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';
import { assertProperty } from '../utils/pbt.js';

describe('Security: URL Validation in VaultView', () => {
    it('should only open safe URLs and block javascript/data URIs', () => {
        const mockEventBus = { emit: () => {} };
        const mockElement = { innerHTML: '', appendChild: () => {} };
        const view = new VaultView(mockElement, mockEventBus);

        let openedUrl = null;
        let windowFeatures = null;
        global.window = {
            open: (url, target, features) => {
                openedUrl = url;
                windowFeatures = features;
            }
        };

        let launchHandler = null;

        const origCreateElement = global.document.createElement;
        global.document.createElement = (tag) => {
            const el = {
                tagName: tag.toUpperCase(),
                setAttribute: () => {},
                appendChild: () => {},
                className: '',
                innerHTML: '',
            };

            el.querySelector = (sel) => {
                return {
                    addEventListener: (evt, handler) => {
                        if (sel === '.btn-launch' && evt === 'click') {
                            launchHandler = handler;
                        }
                    }
                };
            };
            return el;
        };

        // Suppress console warnings during tests
        const origWarn = console.warn;
        console.warn = () => {};

        // Property-based test for safe URLs
        const safeUrlArbitrary = {
            generate: () => {
                const protos = ['http://', 'https://'];
                const domains = ['example.com', 'google.com', 'localhost'];
                const proto = protos[Math.floor(Math.random() * protos.length)];
                const domain = domains[Math.floor(Math.random() * domains.length)];
                return proto + domain + '/' + Math.random().toString(36).substring(7);
            },
            shrink: (val) => [val]
        };

        // Custom manual PBT loop instead of using assertProperty which seems to have issues with our mock environment
        for (let i = 0; i < 50; i++) {
            const url = safeUrlArbitrary.generate();
            openedUrl = null;
            windowFeatures = null;
            launchHandler = null;

            const entry = { id: '1', title: 'Test', url: url };
            view.createCard(entry);

            if (launchHandler) launchHandler({ stopPropagation: () => {} });

            if (openedUrl !== url || windowFeatures !== 'noopener,noreferrer') {
                console.warn = origWarn;
                global.document.createElement = origCreateElement;
                throw new Error(`PBT Failed: Safe URL ${url} was not opened correctly`);
            }
        }

        // Adversarial test for unsafe URLs
        const unsafeUrls = [
            'javascript:alert(1)',
            'javascript://%250Aalert(1)',
            'data:text/html,<script>alert(1)</script>',
            'vbscript:msgbox("hello")',
            'file:///etc/passwd'
        ];

        for (const url of unsafeUrls) {
            openedUrl = null;
            launchHandler = null;

            const entry = { id: '1', title: 'Test', url: url };
            view.createCard(entry);

            if (launchHandler) launchHandler({ stopPropagation: () => {} });

            if (openedUrl !== null) {
                console.warn = origWarn;
                global.document.createElement = origCreateElement;
                throw new Error(`Unsafe URL was opened: ${url}`);
            }
        }

        console.warn = origWarn;
        global.document.createElement = origCreateElement;
    });
});
