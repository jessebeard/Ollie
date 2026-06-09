import { it, describe, expect } from '../../utils/test-runner.js';
import { ModalManager } from '../../../app/components/vault/components/modal-manager.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

// Minimal DOM mock for Node environment
if (typeof document === 'undefined') {
    globalThis.document = {
        createElement: () => ({
            className: '',
            style: {},
            appendChild: () => {},
            querySelector: () => ({ focus: () => {}, onclick: () => {}, onkeydown: () => {} })
        }),
        body: { appendChild: () => {} }
    };
}

describe('ModalManager XSS Property Tests', () => {
    it('should never contain raw unescaped input in rendered modal HTML', async () => {
        const manager = new ModalManager();

        // Override show to intercept the modal HTML instead of rendering to DOM
        let capturedHtml = '';
        manager.show = (modal) => {
            capturedHtml = modal.innerHTML || '';
        };

        await assertProperty([Arbitrary.string(1, 50)], async (payload) => {
            // Render a prompt modal
            manager.prompt('Title', payload, 'text');

            // Check if structural payload contexts are escaped
            if (payload.includes('"')) {
                // Ensure it's not breaking out of double-quote contexts like `value=""` or `class=""`
                if (capturedHtml.includes(payload)) {
                    // This might be safe if payload only contains alphanumeric,
                    // but if it contains structural chars, it should be escaped.
                    if (/[&<>"']/.test(payload)) {
                        return false; // Structural chars must be escaped!
                    }
                }
            }

            // The label injection: <label>${label}</label>
            // If payload has '<script>', it should become '&lt;script&gt;'
            if (payload.includes('<') && capturedHtml.includes('<' + payload.split('<')[1])) {
                 if (capturedHtml.includes(payload)) return false;
            }

            return true;
        });
    });

    it('should escape showForm initial values to prevent attribute injection', async () => {
        const manager = new ModalManager();
        let capturedHtml = '';
        manager.show = (modal) => {
            capturedHtml = modal.innerHTML || '';
        };

        await assertProperty([Arbitrary.string(1, 50)], async (payload) => {
            manager.showForm('Title', [{name: 'field1'}], {field1: payload});

            // Specifically looking for attribute breakout
            // The HTML is `value="${val}"`
            // If the payload contains `"` and wasn't escaped, we'd see `value="...payload..."` where payload contains raw `"` breaking the HTML
            if (payload.includes('"')) {
                // If the payload contains quote, and it was injected unescaped, it would break the value attribute
                if (capturedHtml.includes(`value="${payload}"`)) return false;
            }
            return true;
        });
    });
});
