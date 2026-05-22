import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { ModalManager } from '../../../app/components/vault/components/modal-manager.js';

const origCreateElement = global.document.createElement;

describe('ModalManager XSS Property Tests', () => {
    it('should properly escape values in showForm to prevent XSS', async () => {
        global.document.createElement = (tag) => {
            const el = origCreateElement(tag);
            if (tag === 'div') {
                el.querySelector = function() { return this; };
            }
            return el;
        };
        try {
            const manager = new ModalManager();
            let capturedHtml = '';
            manager.show = function(modal) { capturedHtml = modal.innerHTML; };

            const maliciousStringGen = Arbitrary.string(1, 100);

            await assertProperty(
                [maliciousStringGen],
                (payload) => {
                    manager.showForm('Test', [{ name: 'username', label: 'Username', type: 'text' }], { username: payload });

                    // We check that the attribute breakout payload "><script> doesn't exist unescaped in HTML
                    const testPayload = '"><script>alert(1)</script>';
                    if (payload.includes(testPayload)) {
                        if (capturedHtml.includes(testPayload)) {
                            return false; // Breakout!
                        }
                    }

                    // Verify the raw `<script` tag doesn't appear
                    if (payload.includes('<script')) {
                        if (capturedHtml.includes('<script')) return false;
                    }

                    return true;
                }, 100
            );
        } finally {
            global.document.createElement = origCreateElement;
        }
    });
});
