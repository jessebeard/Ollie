import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { ModalManager } from '../../../app/components/vault/components/modal-manager.js';

describe('ModalManager XSS tests', () => {
    it('prevents XSS in prompts', async () => {
        let capturedHtml = '';

        // We rely on test/runner.js global.document mock,
        // but we intercept appendChild on manager.overlay.
        const manager = new ModalManager();
        if (manager.overlay) {
            manager.overlay.appendChild = (el) => {
                 capturedHtml = el.innerHTML || el._innerHTML || '';
            };
        }

        await assertProperty(
            [Arbitrary.string()],
            async (payload) => {
                capturedHtml = '';

                // Override ModalManager prompt setup if it accesses native DOM stuff that might fail
                // In our case test/runner.js provides a robust enough mock to pass without crashing,
                // but we explicitly only care about HTML creation.
                // Re-mocking querySelector for the local modal element since test/runner.js createElement
                // might not return a functional querySelector result for nested elements.
                const originalCreateElement = document.createElement;
                document.createElement = (tag) => {
                    const element = originalCreateElement(tag);
                    element.querySelector = function() {
                        return {
                            addEventListener: () => {},
                            focus: () => {},
                            onclick: () => {},
                            onkeydown: () => {},
                            value: ''
                        };
                    };
                    Object.defineProperty(element, 'innerHTML', {
                        get: function() { return this._innerHTML || ''; },
                        set: function(val) { this._innerHTML = val; }
                    });
                    return element;
                };

                manager.prompt(payload, payload);

                document.createElement = originalCreateElement;

                // Assert that the payload does not break out of HTML structure
                if (payload.includes('<') && capturedHtml.includes(payload)) {
                    return false;
                }

                manager.hide();
                return true;
            }
        );
    });
});
