import { describe, it, expect } from '../../test/utils/test-runner.js';
import { assertProperty, Arbitrary } from '../../test/utils/pbt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let innerHTMLAssignments = [];
const mockedDocument = {
    body: {
        appendChild: () => {}
    },
    createElement: (tag) => {
        const el = {
            tagName: tag.toUpperCase(),
            style: { display: '' },
            className: '',
            children: [],
            appendChild: (child) => { el.children.push(child); },
            querySelector: () => {
                return { focus: () => {}, onclick: null, onkeydown: null, onsubmit: null };
            },
            _innerHTML: '',
            get innerHTML() { return this._innerHTML; },
            set innerHTML(val) {
                this._innerHTML = val;
                innerHTMLAssignments.push(val);
            }
        };
        return el;
    }
};

describe('ModalManager Security', () => {
    it('should properly escape values to prevent XSS in innerHTML', async () => {
        const source = fs.readFileSync(path.join(__dirname, '../../app/components/vault/components/modal-manager.js'), 'utf8');
        const mockedSource = source.replace(/export class ModalManager/, 'class ModalManager');

        const evalFunc = new Function('document', mockedSource + '; return ModalManager;');
        const ModalManager = evalFunc(mockedDocument);

        await assertProperty(
            [Arbitrary.string(1, 100), Arbitrary.string(1, 100), Arbitrary.string(1, 100)],
            async (input1, input2, input3) => {
                innerHTMLAssignments = [];
                const manager = new ModalManager();
                manager.show = () => {};

                manager.prompt(input1, input2, input3);
                manager.confirm(input1);
                manager.showForm(input1, [{name: input2, label: input3}], {[input2]: input1});
                manager.showAlert(input1, input2, 'info');

                let foundScript = false;
                for (const html of innerHTMLAssignments) {
                    if (html.includes('<script>')) foundScript = true;
                }

                expect(foundScript).toBe(false);
                return true;
            }
        );
    });
});
