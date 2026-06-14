import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import { ModalManager } from '../app/components/vault/components/modal-manager.js';

if (typeof document === 'undefined') {
    global.document = {
        createElement: (tag) => ({
            className: '',
            style: {},
            innerHTML: '',
            appendChild: () => {},
            querySelector: () => ({ focus: () => {}, onclick: () => {} })
        }),
        body: { appendChild: () => {} }
    };
}

describe('ModalManager XSS Prevention', () => {
    it('PBT: should escape HTML inputs correctly to prevent XSS breakout', async () => {
        const manager = new ModalManager();
        manager.show = () => {};
        manager.hide = () => {};

        const originalCreateElement = document.createElement;

        await assertProperty(
            [Arbitrary.string(1, 50)],
            async (maliciousValue) => {
                let capturedHtml = '';
                document.createElement = (tag) => {
                    const el = {
                        className: '',
                        style: {},
                        innerHTML: '',
                        appendChild: () => {},
                        querySelector: () => ({ focus: () => {}, onclick: () => {}, onkeydown: () => {} })
                    };
                    Object.defineProperty(el, 'innerHTML', {
                        set: function(val) {
                            this._innerHTML = val;
                            if (val.includes('dynamicForm')) {
                                capturedHtml = val;
                            }
                        },
                        get: function() { return this._innerHTML; }
                    });
                    return el;
                };

                const fields = [{ name: 'username', label: 'Username', type: 'text' }];
                const initialValues = { username: maliciousValue };

                manager.showForm('Edit', fields, initialValues);

                document.createElement = originalCreateElement;

                // If maliciousValue is literally "><h1>, it shouldn't appear raw in value=""
                if (maliciousValue.includes('"')) {
                    if (capturedHtml.includes(`value="${maliciousValue}"`)) {
                        return false;
                    }
                }

                if (maliciousValue.includes('<script>')) {
                    if (capturedHtml.includes(maliciousValue)) {
                        return false;
                    }
                }

                return true;
            }
        );
        document.createElement = originalCreateElement;
    });
});
