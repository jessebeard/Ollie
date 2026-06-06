import { describe, it, expect } from '../../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';

if (typeof document === 'undefined') {
    globalThis.document = {
        body: { appendChild: () => {} },
        createElement: (tag) => {
            return {
                tagName: tag.toUpperCase(),
                className: '',
                style: {},
                appendChild: () => {},
                querySelector: () => {
                    return { focus: () => {}, value: '', addEventListener: () => {}, onclick: null };
                },
                _innerHTML: '',
                get innerHTML() { return this._innerHTML; },
                set innerHTML(val) { this._innerHTML = val; }
            };
        }
    };
}

import { ModalManager } from '../../../app/components/vault/components/modal-manager.js';

function escape(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

describe('ModalManager (Security PBT)', () => {
    it('prevents XSS breakouts in form values and labels', async () => {
        await assertProperty(
            [Arbitrary.string(1, 100), Arbitrary.string(1, 100)],
            async (labelPayload, valuePayload) => {
                const manager = new ModalManager();
                let capturedHtml = '';

                manager.overlay.appendChild = (el) => {
                    capturedHtml = el.innerHTML;
                };

                const fields = [
                    { name: 'notes', type: 'textarea', label: labelPayload },
                    { name: 'username', type: 'text', label: labelPayload }
                ];
                const initialValues = { notes: valuePayload, username: valuePayload };

                manager.showForm('Edit', fields, initialValues);

                const expectedEscapedValue = escape(valuePayload);
                const expectedEscapedLabel = escape(labelPayload);

                const hasEscapedTextarea = capturedHtml.includes(`<textarea name="${escape('notes')}" class="form-control" >${expectedEscapedValue}</textarea>`);
                const hasEscapedInput = capturedHtml.includes(`value="${expectedEscapedValue}"`);
                const hasEscapedLabel = capturedHtml.includes(`<label>${expectedEscapedLabel}</label>`);

                const breakoutAttribute = `value="${valuePayload}"`;
                const breakoutTextarea = `>${valuePayload}</textarea>`;

                if (/[&<>"']/.test(valuePayload)) {
                    if (capturedHtml.includes(breakoutAttribute)) return false;
                    if (capturedHtml.includes(breakoutTextarea)) return false;
                }

                return hasEscapedTextarea && hasEscapedInput && hasEscapedLabel;
            }
        );
    });
});
