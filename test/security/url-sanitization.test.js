import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Security', () => {
    it('prevents malicious URLs from being executed via window.open', async () => {
        let openedUrl = null;
        global.window.open = (url, target) => { openedUrl = url; };

        const element = {
            innerHTML: '',
            appendChild: (child) => { element.child = child; }
        };
        const eventBus = { emit: () => {} };
        const view = new VaultView(element, eventBus);

        // Override document.createElement specifically for this test to capture the event listener
        const originalCreateElement = global.document.createElement;

        let capturedLaunchHandler = null;

        global.document.createElement = (tag) => {
             const el = originalCreateElement(tag);
             if (tag === 'div') {
                  const originalQuerySelector = el.querySelector.bind(el);
                  el.querySelector = (sel) => {
                       if (sel === '.btn-launch') {
                            return {
                                 addEventListener: (event, handler) => {
                                      if (event === 'click') capturedLaunchHandler = handler;
                                 }
                            };
                       }
                       if (sel === '.more-btn' || sel === '.btn-copy') {
                            return { addEventListener: () => {} };
                       }
                       return originalQuerySelector(sel);
                  };
             }
             return el;
        };

        const maliciousArb = {
            generate: () => {
                const protocols = ['javascript:', 'data:', 'vbscript:', ' JaVaScRiPt: '];
                const protocol = protocols[Math.floor(Math.random() * protocols.length)];
                return `${protocol}alert(1)`;
            },
            shrink: (val) => []
        };

        try {
            await assertProperty(
                [maliciousArb],
                async (maliciousUrl) => {
                    openedUrl = null;
                    capturedLaunchHandler = null;
                    view.render([{ id: '1', title: 'Test', url: maliciousUrl }]);

                    if (capturedLaunchHandler) {
                        capturedLaunchHandler(new Event('click'));
                    }
                    return openedUrl === 'about:blank' || openedUrl === null;
                }
            );
        } finally {
             global.document.createElement = originalCreateElement;
        }
    });

    it('allows safe URLs to be opened', async () => {
        let openedUrl = null;
        global.window.open = (url, target) => { openedUrl = url; };

        const element = {
            innerHTML: '',
            appendChild: (child) => { element.child = child; }
        };
        const eventBus = { emit: () => {} };
        const view = new VaultView(element, eventBus);

        const originalCreateElement = global.document.createElement;
        let capturedLaunchHandler = null;

        global.document.createElement = (tag) => {
             const el = originalCreateElement(tag);
             if (tag === 'div') {
                  const originalQuerySelector = el.querySelector.bind(el);
                  el.querySelector = (sel) => {
                       if (sel === '.btn-launch') {
                            return {
                                 addEventListener: (event, handler) => {
                                      if (event === 'click') capturedLaunchHandler = handler;
                                 }
                            };
                       }
                       if (sel === '.more-btn' || sel === '.btn-copy') {
                            return { addEventListener: () => {} };
                       }
                       return originalQuerySelector(sel);
                  };
             }
             return el;
        };

        try {
            view.render([{ id: '1', title: 'Test', url: 'https://google.com' }]);
            if (capturedLaunchHandler) {
                 capturedLaunchHandler(new Event('click'));
            }
            expect(openedUrl).toBe('https://google.com');
        } finally {
             global.document.createElement = originalCreateElement;
        }
    });
});
