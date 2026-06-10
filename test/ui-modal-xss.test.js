import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import { ModalManager } from '../app/components/vault/components/modal-manager.js';

describe('ModalManager XSS Prevention', () => {
    it('should correctly escape HTML characters', async () => {
        // Mock DOM
        if (typeof globalThis.document === 'undefined') {
            globalThis.document = {
                body: { appendChild: () => {} },
                createElement: (tag) => {
                    return {
                        className: '',
                        style: {},
                        appendChild: () => {},
                        querySelector: () => ({ focus: () => {}, onkeydown: null, onclick: null })
                    };
                }
            };
        }

        const manager = new ModalManager();

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (str) => {
                const escaped = manager.escape(str);
                return !escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"') && !escaped.includes("'");
            }
        );

        expect(manager.escape(123)).toBe("123");
        expect(manager.escape(true)).toBe("true");
        expect(manager.escape(null)).toBe("");
        expect(manager.escape(undefined)).toBe("");
        expect(manager.escape(0)).toBe("0");
        expect(manager.escape(false)).toBe("false");
    });

    it('should not contain structural HTML breakout characters in rendered modals', async () => {
        if (typeof globalThis.document === 'undefined') {
            globalThis.document = {
                body: { appendChild: () => {} },
                createElement: (tag) => {
                    return {
                        className: '',
                        style: {},
                        appendChild: () => {},
                        querySelector: () => ({ focus: () => {}, onkeydown: null, onclick: null })
                    };
                }
            };
        }

        const manager = new ModalManager();
        let lastHtml = '';
        manager.show = function(modal) {
            lastHtml = modal.innerHTML;
        };

        const maliciousPayload = '"><script>alert(1)</script><div class="';

        // test prompt
        manager.prompt(maliciousPayload, maliciousPayload);
        expect(lastHtml.includes('<script>')).toBe(false);
        expect(lastHtml.includes('value="><script>')).toBe(false);

        // test confirm
        manager.confirm(maliciousPayload);
        expect(lastHtml.includes('<script>')).toBe(false);

        // test showAlert
        manager.showAlert(maliciousPayload, maliciousPayload);
        expect(lastHtml.includes('<script>')).toBe(false);

        // test showForm
        manager.showForm(maliciousPayload, [{ name: maliciousPayload, label: maliciousPayload, type: 'text' }], { [maliciousPayload]: maliciousPayload });
        expect(lastHtml.includes('<script>')).toBe(false);
    });
});
