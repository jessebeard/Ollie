import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';

describe('ModalManager Security - XSS Prevention', () => {
    it('should sanitize HTML in showForm initialValues and fields to prevent XSS', async () => {
        // Only run the test if global document exists, because runner.js injects it.
        // It's safe to skip if run directly.
        if (typeof document === 'undefined') return;

        const { ModalManager } = await import('../../app/components/vault/components/modal-manager.js');
        const manager = new ModalManager();

        await assertProperty(
            [{
                generate: () => {
                    const payloads = [
                        `<script>alert(1)</script>`,
                        `"><img src=x onerror=alert(1)>`,
                        `" onfocus="alert(1)" autofocus="`,
                        `' onfocus='alert(1)' autofocus='`,
                        `&lt;script&gt;`,
                        `\x00\x00`
                    ];
                    const base = payloads[Math.floor(Math.random() * payloads.length)];
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+<>?:"{}|~`\'-=;.,/[]';
                    let str = '';
                    for (let i = 0; i < 20; i++) str += chars.charAt(Math.floor(Math.random() * chars.length));
                    return base + str;
                },
                shrink: (v) => [v.substring(0, Math.floor(v.length / 2))]
            }],
            (fuzzedInput) => {
                const fields = [
                    { name: fuzzedInput, label: fuzzedInput, type: 'text' },
                    { name: 'notes', label: 'Notes', type: 'textarea' }
                ];

                const initialValues = {};
                initialValues[fuzzedInput] = fuzzedInput;
                initialValues['notes'] = fuzzedInput;

                let capturedHtml = '';
                const originalAppend = manager.overlay.appendChild;
                manager.overlay.appendChild = (el) => {
                    capturedHtml = el.innerHTML;
                };

                manager.showForm(fuzzedInput, fields, initialValues);

                manager.overlay.appendChild = originalAppend;
                manager.hide();

                // Abstract property check instead of exact string matches:
                // No unescaped <, >, or bare ' onfocus=' pattern
                expect(capturedHtml.includes('<script>')).toBe(false);
                expect(capturedHtml.includes('" onerror=')).toBe(false);
                expect(capturedHtml.includes('" onfocus=')).toBe(false);
                expect(capturedHtml.includes("' onfocus=")).toBe(false);

                // For exact payloads
                expect(capturedHtml.includes(' autofocus="')).toBe(false);
            },
            100
        );
    });

    it('should sanitize HTML in prompt, confirm, and showAlert to prevent XSS', async () => {
        if (typeof document === 'undefined') return;

        const { ModalManager } = await import('../../app/components/vault/components/modal-manager.js');
        const manager = new ModalManager();

        await assertProperty(
            [{
                generate: () => {
                    const payloads = [
                        `<script>alert(1)</script>`,
                        `"><img src=x onerror=alert(1)>`,
                        `" onfocus="alert(1)" autofocus="`
                    ];
                    return payloads[Math.floor(Math.random() * payloads.length)];
                },
                shrink: (v) => []
            }],
            (fuzzedInput) => {
                const methodsToTest = [
                    () => manager.prompt(fuzzedInput, fuzzedInput, fuzzedInput),
                    () => manager.confirm(fuzzedInput),
                    () => manager.showAlert(fuzzedInput, fuzzedInput, fuzzedInput)
                ];

                for (const triggerMethod of methodsToTest) {
                    let capturedHtml = '';
                    const originalAppend = manager.overlay.appendChild;
                    manager.overlay.appendChild = (el) => {
                        capturedHtml = el.innerHTML;
                    };

                    triggerMethod();

                    manager.overlay.appendChild = originalAppend;
                    manager.hide();

                    expect(capturedHtml.includes('<script>')).toBe(false);
                    expect(capturedHtml.includes('" onerror=')).toBe(false);
                    expect(capturedHtml.includes('" onfocus=')).toBe(false);
                    expect(capturedHtml.includes("' onfocus=")).toBe(false);
                }
            },
            30
        );
    });
});
