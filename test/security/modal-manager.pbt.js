import { describe, it } from '../../test/utils/test-runner.js';
import { assertProperty, Arbitrary } from '../../test/utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('ModalManager Security (XSS) PBT', () => {
    it('never renders unescaped HTML tags from string inputs', () => {
        const env = typeof global !== 'undefined' ? global : window;
        if (!env.document) {
            const createElement = (tag) => {
                const el = {
                    tagName: tag.toUpperCase(),
                    className: '',
                    style: {},
                    children: [],
                    appendChild: (child) => el.children.push(child),
                    querySelector: function() { return this; },
                    _innerHTML: '',
                    get innerHTML() { return this._innerHTML; },
                    set innerHTML(val) { this._innerHTML = val; }
                };
                return el;
            };
            env.document = {
                createElement,
                body: createElement('body')
            };
        }

        assertProperty(
            [Arbitrary.string(1, 100), Arbitrary.string(1, 100)],
            (title, label) => {
                const manager = new ModalManager();
                let appendedModal = null;
                manager.overlay.appendChild = (el) => { appendedModal = el; };
                manager.show = (modal) => { manager.overlay.appendChild(modal); };
                manager.prompt(title, label);

                if (!appendedModal) return false;

                const html = appendedModal.innerHTML;

                if (title.includes('<') && html.includes(title)) return false;
                if (label.includes('<') && html.includes(label)) return false;

                return true;
            }
        );
    });
});
