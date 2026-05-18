import { describe, it, expect } from '../utils/test-runner.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

// Quick mock for document if needed by ModalManager initialization
if (typeof document === 'undefined') {
    globalThis.document = {
        createElement: (tag) => {
            let _innerHTML = '';
            return {
                tagName: tag.toUpperCase(),
                className: '',
                style: { display: 'none' },
                appendChild: () => {},
                querySelector: () => ({ focus: () => {}, value: '' }),
                get innerHTML() { return _innerHTML; },
                set innerHTML(val) { _innerHTML = val; }
            };
        },
        body: { appendChild: () => {} }
    };
}

describe('ModalManager XSS Prevention', () => {
    it('escapes XSS payloads in showAlert', () => {
        const manager = new ModalManager();
        const payload = '"><img src=x onerror=alert(1)>';

        // Override show to prevent DOM attachment errors during test
        manager.show = (modal) => { manager._lastModal = modal; };

        manager.showAlert(payload, payload);

        expect(manager._lastModal.innerHTML.includes(payload)).toBe(false);
        expect(manager._lastModal.innerHTML.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;')).toBe(true);
    });

    it('escapes XSS payloads in prompt', () => {
        const manager = new ModalManager();
        const payload = '"><script>alert(1)</script>';

        manager.show = (modal) => { manager._lastModal = modal; };

        manager.prompt(payload, payload);

        expect(manager._lastModal.innerHTML.includes('<script>')).toBe(false);
        expect(manager._lastModal.innerHTML.includes('&lt;script&gt;')).toBe(true);
    });

    it('escapes XSS payloads in confirm', () => {
        const manager = new ModalManager();
        const payload = '<svg/onload=alert(1)>';

        manager.show = (modal) => { manager._lastModal = modal; };

        manager.confirm(payload);

        expect(manager._lastModal.innerHTML.includes(payload)).toBe(false);
        expect(manager._lastModal.innerHTML.includes('&lt;svg/onload=alert(1)&gt;')).toBe(true);
    });

    it('escapes XSS payloads in showForm', () => {
        const manager = new ModalManager();
        const payload = '"><img src=x onerror=alert(1)>';

        manager.show = (modal) => { manager._lastModal = modal; };

        manager.showForm(payload, [{name: payload, label: payload}], {[payload]: payload});

        expect(manager._lastModal.innerHTML.includes(payload)).toBe(false);
        expect(manager._lastModal.innerHTML.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;')).toBe(true);
    });
});
