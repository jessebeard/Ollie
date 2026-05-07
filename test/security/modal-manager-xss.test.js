import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

function escape(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

describe('ModalManager Security - XSS Prevention', () => {
    it('should escape malicious input in modal components', async () => {
        // Setup mock environment
        const originalDocument = global.document;
        let createdModals = [];
        global.document = {
            body: { appendChild: () => {} },
            createElement: (tag) => {
                const el = {
                    className: '',
                    style: {},
                    children: [],
                    appendChild: (child) => el.children.push(child),
                    querySelector: () => ({ focus: () => {}, onclick: () => {}, onsubmit: () => {}, onkeydown: () => {} })
                };
                Object.defineProperty(el, 'innerHTML', {
                    set: (val) => { el._innerHTML = val; },
                    get: () => el._innerHTML || ''
                });
                createdModals.push(el);
                return el;
            }
        };

        const modalManager = new ModalManager();

        await assertProperty(
            [Arbitrary.string(1, 100)],
            async (maliciousInput) => {
                createdModals = [];
                const testPayload = `<script>alert('${maliciousInput}')</script>`;

                // Test showForm
                modalManager.showForm(testPayload, [{ name: 'test', label: testPayload }]);
                if (createdModals.some(m => m.innerHTML.includes(testPayload))) {
                    throw new Error('XSS payload found in showForm');
                }

                // Test confirm
                createdModals = [];
                modalManager.confirm(testPayload);
                if (createdModals.some(m => m.innerHTML.includes(testPayload))) {
                    throw new Error('XSS payload found in confirm');
                }

                // Test prompt
                createdModals = [];
                modalManager.prompt(testPayload, testPayload);
                if (createdModals.some(m => m.innerHTML.includes(testPayload))) {
                    throw new Error('XSS payload found in prompt');
                }

                // Test showAlert
                createdModals = [];
                modalManager.showAlert(testPayload, testPayload);
                if (createdModals.some(m => m.innerHTML.includes(testPayload))) {
                    throw new Error('XSS payload found in showAlert');
                }

                return true;
            }
        );

        global.document = originalDocument;
    });
});
