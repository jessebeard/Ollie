import { it, describe, expect } from './utils/test-runner.js';
import { Arbitrary, assertProperty } from './utils/pbt.js';
import { ModalManager } from '../app/components/vault/components/modal-manager.js';

describe('ModalManager XSS Prevention', () => {
    it('should correctly escape HTML characters in prompt', async () => {
        const manager = new ModalManager();

        await assertProperty(
            [Arbitrary.string(1, 100), Arbitrary.string(1, 100)],
            (title, label) => {
                manager.prompt(title, label);
                const html = manager.overlay.innerHTML;

                // If the input has < or >, they should be escaped
                const hasRawTitle = title.includes('<') && html.includes('<h3>' + title + '</h3>');
                const hasRawLabel = label.includes('<') && html.includes('<label>' + label + '</label>');

                return !hasRawTitle && !hasRawLabel;
            }
        );
    });
});
