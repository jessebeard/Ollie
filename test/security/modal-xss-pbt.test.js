import { describe, it, expect } from '../utils/test-runner.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

// Setup basic DOM for ModalManager
const originalDoc = global.document;

describe('Security: ModalManager XSS Prevention (PBT)', () => {
    it('Property: Modal HTML injection is neutralized by escaping', async () => {
        let lastInnerHTML = '';
        const mockDoc = {
            body: { appendChild: () => {} },
            createElement: (tag) => {
                const el = {
                    style: {},
                    classList: { add: () => {}, remove: () => {} },
                    appendChild: () => {},
                    querySelector: () => ({ focus: () => {}, addEventListener: () => {} })
                };
                Object.defineProperty(el, 'innerHTML', {
                    set: (val) => { lastInnerHTML = val; },
                    get: () => lastInnerHTML
                });
                return el;
            }
        };
        global.document = mockDoc;

        const manager = new ModalManager();
        manager.show = () => {};

        const payloads = [
            '<script>alert(1)</script>',
            '<img src="x" onerror="alert(1)">',
            '"><svg/onload=alert(1)>',
            'javascript:alert(1)',
            'Hello & World',
            '\' onfocus="alert(1)"',
            'x" onerror="alert(1)"'
        ];

        for (const payload of payloads) {
            manager.showAlert('Test Title', payload);

            // Should not contain raw unescaped script tag, or raw injection attempts
            expect(lastInnerHTML.includes('<script>')).toBe(false);
            expect(lastInnerHTML.includes('onerror="alert(1)"')).toBe(false);
            expect(lastInnerHTML.includes('<svg/onload')).toBe(false);
            expect(lastInnerHTML.includes('onfocus="alert(1)"')).toBe(false);
        }

        global.document = originalDoc;
    });
});
