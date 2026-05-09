import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('ModalManager Security', () => {
    const setupDOM = () => {
        const env = typeof global !== 'undefined' ? global : window;
        const originalDoc = env.document;

        env.document = {
            body: { appendChild: () => {} },
            createElement: (tag) => {
                const el = {
                    className: '',
                    style: { display: 'none' },
                    children: [],
                    appendChild: (child) => { el.children.push(child); },
                    querySelector: () => ({ focus: () => {}, value: 'mock', onkeydown: null, onclick: null }),
                    _innerHTML: ''
                };
                Object.defineProperty(el, 'innerHTML', {
                    get: () => el._innerHTML,
                    set: (val) => { el._innerHTML = val; }
                });
                return el;
            }
        };

        return () => { env.document = originalDoc; };
    };

    it('should escape HTML in prompt dialogs to prevent XSS', async () => {
        const restoreDOM = setupDOM();

        await assertProperty(
            [Arbitrary.string(1, 50), Arbitrary.string(1, 50)],
            (title, label) => {
                const manager = new ModalManager();
                let renderedHTML = '';
                manager.show = (modal) => {
                    renderedHTML = modal.innerHTML;
                };

                manager.prompt(title, label);

                // Assert that raw input with < or > doesn't appear exactly as typed unless escaped
                if (title.includes('<') || title.includes('>')) {
                    expect(renderedHTML.includes(title)).toBe(false);
                }
            }
        );

        restoreDOM();
    });
});
