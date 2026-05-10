import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('ModalManager Security', () => {

    function captureInnerHTML(action) {
        let capturedHTML = null;

        const originalDocument = global.document;
        global.document = {
            body: {
                appendChild: () => {}
            },
            createElement: (tag) => {
                const el = {
                    tagName: tag.toUpperCase(),
                    style: {},
                    classList: {
                        add: () => {}, remove: () => {}, contains: () => false, toggle: () => {}
                    },
                    addEventListener: () => {},
                    appendChild: () => {},
                    getAttribute: () => null,
                    setAttribute: () => {},
                    removeAttribute: () => {},
                    textContent: '',
                    querySelector: function() { return { focus: () => {}, onclick: () => {}, onkeydown: () => {} }; },
                    querySelectorAll: () => []
                };

                // Intercept innerHTML assignment to capture the generated template
                Object.defineProperty(el, 'innerHTML', {
                    get: () => capturedHTML,
                    set: (val) => { capturedHTML = val; }
                });

                return el;
            }
        };

        try {
            const manager = new ModalManager();
            action(manager);
            return capturedHTML;
        } finally {
            global.document = originalDocument;
        }
    }

    it('should never render unescaped user strings in prompt()', async () => {
        await assertProperty(
            [Arbitrary.string(1, 50), Arbitrary.string(1, 50), Arbitrary.string(1, 20)],
            (title, label, type) => {
                const html = captureInnerHTML((m) => m.prompt(title, label, type));

                // If the input contains a <, it should be escaped to &lt; in the HTML
                if (title.includes('<') && html.includes(title)) return false;
                if (label.includes('<') && html.includes(label)) return false;
                if (type.includes('<') && html.includes(type)) return false;

                // If it contains &, it should be escaped to &amp;, unless the input itself contains &amp;
                if (title.includes('&') && title !== '&amp;' && html.includes(title) && !html.includes('&amp;')) return false;

                return true;
            }
        );
    });

    it('should never render unescaped user strings in confirm()', async () => {
        await assertProperty(
            [Arbitrary.string(1, 100)],
            (message) => {
                const html = captureInnerHTML((m) => m.confirm(message));
                if (message.includes('<') && html.includes(message)) return false;
                if (message.includes('>') && html.includes(message)) return false;
                return true;
            }
        );
    });

    it('should never render unescaped user strings in showAlert()', async () => {
        await assertProperty(
            [Arbitrary.string(1, 50), Arbitrary.string(1, 100), Arbitrary.string(1, 20)],
            (title, message, type) => {
                const html = captureInnerHTML((m) => m.showAlert(title, message, type));
                if (title.includes('<') && html.includes(title)) return false;
                if (message.includes('<') && html.includes(message)) return false;
                if (type.includes('<') && html.includes(type)) return false;
                return true;
            }
        );
    });

    it('should never render unescaped user strings in showForm()', async () => {
        await assertProperty(
            [Arbitrary.string(1, 50), Arbitrary.string(1, 20), Arbitrary.string(1, 20), Arbitrary.string(1, 20)],
            (title, fieldName, fieldLabel, initialValue) => {
                const fields = [{ name: fieldName, label: fieldLabel, type: 'text' }];
                const initialValues = { [fieldName]: initialValue };

                const html = captureInnerHTML((m) => m.showForm(title, fields, initialValues));

                if (title.includes('<') && html.includes(title)) return false;
                if (fieldName.includes('<') && html.includes(fieldName)) return false;
                if (fieldLabel.includes('<') && html.includes(fieldLabel)) return false;
                if (initialValue.includes('<') && html.includes(initialValue)) return false;

                return true;
            }
        );
    });
});
