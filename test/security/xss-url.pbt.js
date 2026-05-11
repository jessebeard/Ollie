import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { describe, it, expect } from '../utils/test-runner.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL XSS Prevention', () => {
    it('should only open valid http/https URLs with noopener,noreferrer', async () => {
        let openedUrl = null;
        let openedFeatures = null;
        global.window = {
            open: (url, target, features) => {
                openedUrl = url;
                openedFeatures = features;
            }
        };
        global.document = {
            createElement: (tag) => {
                return {
                    className: '',
                    setAttribute: () => {},
                    innerHTML: '',
                    listeners: {},
                    querySelector: function(sel) {
                        return {
                            addEventListener: (event, cb) => {
                                this.listeners[sel] = this.listeners[sel] || {};
                                this.listeners[sel][event] = cb;
                            }
                        };
                    }
                }
            }
        };

        const view = new VaultView({
            innerHTML: '',
            appendChild: () => {}
        }, { emit: () => {} });

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (urlInput) => {
                openedUrl = null;
                openedFeatures = null;

                const entry = {
                    title: 'test',
                    username: 'user',
                    url: urlInput,
                    id: '1'
                };

                const card = view.createCard(entry);
                if (card.listeners['.btn-launch'] && card.listeners['.btn-launch']['click']) {
                    card.listeners['.btn-launch']['click']({ stopPropagation: () => {} });
                }

                if (openedUrl) {
                    try {
                        const parsed = new URL(openedUrl);
                        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                            return false;
                        }
                    } catch (e) {
                        return false;
                    }
                    if (!openedFeatures || !openedFeatures.includes('noopener') || !openedFeatures.includes('noreferrer')) {
                        return false;
                    }
                }
                return true;
            }
        );
    });
});
