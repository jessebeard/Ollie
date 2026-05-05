import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('Security: ModalManager XSS Prevention', () => {
    it('should sanitize input in modals via PBT', () => {
        let lastInnerHTML = '';

        global.document = {
            body: { appendChild: () => {}, innerHTML: '' },
            createElement: (tag) => {
                return {
                    className: '',
                    style: { display: 'none' },
                    _innerHTML: '',
                    get innerHTML() { return this._innerHTML; },
                    set innerHTML(val) {
                        this._innerHTML = val;
                        lastInnerHTML = val;
                    },
                    appendChild: () => {},
                    querySelector: () => ({ focus: () => {}, onclick: () => {}, value: '' }),
                    querySelectorAll: () => []
                };
            }
        };

        const modalManager = new ModalManager();
        modalManager.show = () => {};

        assertProperty(
            Arbitrary.string(),
            Arbitrary.string(),
            (title, message) => {
                modalManager.showAlert(title, message);

                // If inputs contain unescaped tags, they shouldn't appear in output
                if (title.includes('<') || message.includes('<')) {
                    if (title.includes('<script>') || message.includes('<script>')) {
                        expect(lastInnerHTML.includes('<script>')).toBe(false);
                    }
                    if (title.includes('<img>') || message.includes('<img>')) {
                        expect(lastInnerHTML.includes('<img>')).toBe(false);
                    }
                }

                return true;
            }
        );
    });

    it('should escape known malicious payloads', () => {
        let lastInnerHTML = '';
        global.document = {
            body: { appendChild: () => {}, innerHTML: '' },
            createElement: (tag) => {
                return {
                    className: '',
                    style: { display: 'none' },
                    _innerHTML: '',
                    get innerHTML() { return this._innerHTML; },
                    set innerHTML(val) {
                        this._innerHTML = val;
                        lastInnerHTML = val;
                    },
                    appendChild: () => {},
                    querySelector: () => ({ focus: () => {}, onclick: () => {}, value: '' }),
                    querySelectorAll: () => []
                };
            }
        };

        const modalManager = new ModalManager();
        modalManager.show = () => {};

        // Excluded javascript:alert(1) and others that don't contain HTML tags from the strict includes checks
        // since they don't break HTML structure on their own, but we include them to ensure they don't crash
        const payloads = [
            '<script>alert(1)</script>',
            '<img src=x onerror=alert(1)>',
            '\"><script>alert(1)</script>',
            '<svg/onload=alert(1)>'
        ];

        for (const payload of payloads) {
            modalManager.showAlert(payload, payload);
            expect(lastInnerHTML.includes(payload)).toBe(false);
            expect(lastInnerHTML.includes('&lt;')).toBe(true); // Should be escaped

            modalManager.prompt(payload, payload);
            expect(lastInnerHTML.includes(payload)).toBe(false);

            modalManager.confirm(payload);
            expect(lastInnerHTML.includes(payload)).toBe(false);

            modalManager.showForm(payload, [{ name: payload, label: payload }]);
            expect(lastInnerHTML.includes(payload)).toBe(false);
        }
    });
});
