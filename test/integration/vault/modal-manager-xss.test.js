import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// We need to evaluate the file since we are mocking globals and ModalManager doesn't export for CJS well without a browser.
const sourceCode = fs.readFileSync(path.join(__dirname, '../../../app/components/vault/components/modal-manager.js'), 'utf-8');
const strippedSource = sourceCode.replace(/export class ModalManager/, 'class ModalManager');

describe('ModalManager XSS Property-Based Tests', () => {
    it('Property: modal-manager escapeHtml prevents XSS payloads', async () => {
        await assertProperty(
            [Arbitrary.string(1, 100), Arbitrary.string(1, 100)],
            async (titlePayload, valuePayload) => {
                const localGlobal = {
                    document: {
                        createElement: (tag) => {
                            if (tag === 'div') {
                                return {
                                    _innerHTML: '',
                                    set innerHTML(val) { this._innerHTML = val; },
                                    get innerHTML() { return this._innerHTML; },
                                    className: '',
                                    appendChild: () => {},
                                    querySelector: () => ({ focus: () => {}, onclick: () => {}, onkeydown: () => {} }),
                                    style: {}
                                };
                            }
                        },
                        body: { appendChild: () => {} }
                    }
                };

                const setupScript = `
                    const document = localGlobal.document;
                    ${strippedSource}
                    const manager = new ModalManager();
                    let capturedHtml = '';
                    manager.show = (modal) => { capturedHtml = modal.innerHTML; };
                    manager.showForm(titlePayload, [{ name: 'f1', label: 'l1', type: 'text' }], { f1: valuePayload });
                    return capturedHtml;
                `;

                const getHtml = new Function('localGlobal', 'titlePayload', 'valuePayload', setupScript);
                const html = getHtml(localGlobal, titlePayload, valuePayload);

                const hasRawTitle = html.includes('<h3>' + titlePayload + '</h3>');
                const hasRawValue = html.includes('value="' + valuePayload + '"');

                // If the payload contains characters that should be escaped, we should NOT see the exact raw payload in those specific structural positions.
                if (titlePayload.match(/[&<>"']/)) {
                    expect(hasRawTitle).toBe(false);
                }
                if (valuePayload.match(/[&<>"']/)) {
                    expect(hasRawValue).toBe(false);
                }
                return true;
            },
            50
        );
    });
});
