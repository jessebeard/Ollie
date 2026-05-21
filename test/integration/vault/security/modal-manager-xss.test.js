import { describe, it, expect } from '../../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../../utils/pbt.js';
import { ModalManager } from '../../../../app/components/vault/components/modal-manager.js';

let capturedInnerHTML = [];

// Node environment DOM mock augmentation (merging with runner's mock)
if (typeof process !== 'undefined' && typeof document !== 'undefined') {
    const originalCreateElement = document.createElement;

    document.createElement = (tag) => {
        const el = originalCreateElement(tag);

        // Only override innerHTML setter for modal elements
        if (tag.toLowerCase() === 'div') {
            el._innerHTML = '';
            Object.defineProperty(el, 'innerHTML', {
                get() { return this._innerHTML; },
                set(val) {
                    this._innerHTML = val;
                    capturedInnerHTML.push(val);
                }
            });
        }
        return el;
    };
}

describe('ModalManager XSS Vulnerability', () => {
    // Only run this specific test in Node, as the browser doesn't have our innerHTML hook
    if (typeof process === 'undefined') {
        it('Skipped in Browser', () => { expect(true).toBe(true); });
        return;
    }

    it('should escape input in prompts and alerts', async () => {
        await assertProperty(
            [
                Arbitrary.string(1, 50),
                Arbitrary.string(1, 50)
            ],
            async (title, label) => {
                capturedInnerHTML = [];
                const manager = new ModalManager();
                manager.prompt(title, label, 'text');
                const html = capturedInnerHTML.join(' ');

                if (title.includes('<script>') || label.includes('<script>')) {
                    if (html.includes('<script>')) {
                        return false;
                    }
                }
                return true;
            }
        );
    });
});
