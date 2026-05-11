import { describe, it, expect } from '../utils/test-runner.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';

describe('VaultView URL Security', () => {
    it('Property: VaultView Launch Button avoids executing unsafe protocols', async () => {
        let openedUrl = null;
        let windowFeatures = null;

        const env = typeof global !== 'undefined' ? global : window;
        const originalWindowOpen = env.window ? env.window.open : undefined;

        env.window = {
            open: (url, target, features) => {
                openedUrl = url;
                windowFeatures = features;
            }
        };

        const originalDocumentCreateElement = env.document ? env.document.createElement : undefined;

        env.document = {
            createElement: (tag) => {
                const el = {
                    tagName: tag.toUpperCase(),
                    className: '',
                    innerHTML: '',
                    attributes: {},
                    listeners: {},
                    setAttribute: (k, v) => el.attributes[k] = v,
                    querySelector: (selector) => {
                        if (selector === '.more-btn' || selector === '.btn-copy' || selector === '.btn-launch') {
                            return {
                                addEventListener: (evt, cb) => {
                                    if (!el.listeners[selector]) el.listeners[selector] = {};
                                    el.listeners[selector][evt] = cb;
                                }
                            };
                        }
                        return null;
                    }
                };
                return el;
            }
        };

        const mockElement = {
            innerHTML: '',
            appendChild: () => {}
        };
        const mockEvents = { emit: () => {} };

        const view = new VaultView(mockElement, mockEvents);

        await assertProperty(
            [
                Arbitrary.string()
            ],
            async (urlStr) => {
                openedUrl = null;
                const entry = {
                    id: '1',
                    title: 'Test',
                    username: 'test',
                    url: urlStr,
                    tags: []
                };

                const card = view.createCard(entry);

                // Simulate click
                if (card.listeners && card.listeners['.btn-launch'] && card.listeners['.btn-launch']['click']) {
                    card.listeners['.btn-launch']['click']({});
                }

                if (openedUrl) {
                    try {
                        let parsedUrl = openedUrl.trim();
                        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(parsedUrl)) {
                            parsedUrl = 'https://' + parsedUrl;
                        }
                        const urlObj = new URL(parsedUrl);
                        return ['http:', 'https:'].includes(urlObj.protocol);
                    } catch (e) {
                        return false;
                    }
                }

                return true;
            }
        );

        env.window.open = originalWindowOpen;
        if (originalDocumentCreateElement) {
            env.document.createElement = originalDocumentCreateElement;
        }
    });
});
