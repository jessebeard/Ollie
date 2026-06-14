import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { ModalManager } from '../../app/components/vault/components/modal-manager.js';

describe('ModalManager Security', () => {
    it('prevents XSS in prompts', async () => {
        const manager = new ModalManager();

        await assertProperty(
            [Arbitrary.string()],
            async (maliciousInput) => {
                const promise = manager.prompt(maliciousInput, maliciousInput);
                const modalHtml = manager.overlay.innerHTML;

                // simulate closing
                manager.hide();

                // Assert structural context breakout
                // We should not find <maliciousInput> structurally unescaped
                // If the input includes < or >, it shouldn't be rendered as-is
                if (maliciousInput.includes('<') || maliciousInput.includes('>')) {
                    if (modalHtml.includes(`<h3>${maliciousInput}</h3>`)) {
                        return false;
                    }
                }
                return true;
            }
        );
    });
});
