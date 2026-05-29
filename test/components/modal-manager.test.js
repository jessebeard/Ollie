import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import fs from 'fs';

let ModalManager;

describe('ModalManager XSS Vulnerability', () => {
    it('should escape input in showForm and prevent breakout', async () => {
        // Evaluate ModalManager within test scope to avoid cross-env issues
        const source = fs.readFileSync('app/components/vault/components/modal-manager.js', 'utf-8')
           .replace('export class ModalManager', 'class ModalManager');

        const globalScope = { document: {
                body: { appendChild: () => {} },
                createElement: () => ({
                    style: {},
                    querySelector: () => ({ focus: () => {} })
                })
            }, window: {} };

        ModalManager = new Function('global', `
           with(global) {
              ${source}
              return ModalManager;
           }
        `)(globalScope);


        await assertProperty([Arbitrary.string(1, 50)], async (payload) => {
            const manager = new ModalManager();

            let capturedHtml = '';
            manager.overlay.appendChild = (el) => {
                capturedHtml = el.innerHTML;
            };

            // Don't await prompt since it blocks test. showForm populates DOM synchronously.
            manager.showForm('Edit', [{name: 'username'}], { username: payload });

            // Since we escaped it properly, the actual string in the DOM
            // should not be exactly `value="${payload}"` if it had dangerous characters.
            // Wait, we need to test that " or < don't break out.
            // If the payload contains structural characters, it will be escaped.
            // Thus, we check that `value="<payload>"` doesn't appear when payload has those chars.
            // But if the payload is just "abc", it won't be escaped and `value="abc"` WILL appear.
            // So we should assert that ANY structural character breakout fails.

            // To do this simply, we test the absence of literal unescaped characters in the context.
            // We just ensure `value="${payload}"` doesn't exist IF payload contains dangerous chars.
            const dangerous = /[&<>"']/;
            if (dangerous.test(payload)) {
                const maliciousBreakout = `value="${payload}"`;
                const isBreakoutMissing = !capturedHtml.includes(maliciousBreakout);
                expect(isBreakoutMissing).toBe(true);
                return isBreakoutMissing;
            }
            return true;
        });
    });
});
