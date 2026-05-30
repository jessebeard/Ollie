import { describe, it, expect } from '../../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../../utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Extract ModalManager using eval
const ModalManagerStr = fs.readFileSync(path.join(__dirname, '../../../../app/components/vault/components/modal-manager.js'), 'utf8').replace('export class', 'class');

const domSetup = `
    const globalDocument = {
        createElement: () => ({
            style: {},
            className: '',
            appendChild: () => {},
            querySelector: () => ({ focus: () => {}, onclick: () => {}, onkeydown: () => {}, onsubmit: () => {} }),
            set innerHTML(v) { this._innerHTML = v; },
            get innerHTML() { return this._innerHTML; },
            get textContent() { return ''; },
            set textContent(v) {}
        }),
        body: { appendChild: () => {} }
    };
    if (typeof global !== 'undefined') {
        global.document = globalDocument;
    } else {
        var document = globalDocument;
    }
`;

eval(domSetup + ModalManagerStr + `
    global.ModalManager = ModalManager;
`);

describe('ModalManager XSS Vulnerability', () => {
    it('Property: ModalManager.prompt does not allow unescaped HTML injection', async () => {
        await assertProperty(
            [
                Arbitrary.string(0, 100).map(s => \`"><img src=x onerror="\${s}">\`),
                Arbitrary.string(0, 100).map(s => \`<script>\${s}</script>\`)
            ],
            (titlePayload, labelPayload) => {
                const manager = new ModalManager();
                const mockContainer = { appendChild: function(el) { this.child = el; }, style: {} };
                manager.overlay = mockContainer;

                manager.prompt(titlePayload, labelPayload);
                const html = mockContainer.child.innerHTML;

                // If it's vulnerable, the payload will be present verbatim
                return !html.includes(titlePayload) && !html.includes(labelPayload);
            },
            10
        );
    });
});
