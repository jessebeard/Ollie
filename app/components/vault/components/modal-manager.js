import { escapeHtml } from '../../../../src/utils/escape-html.js';
import { decodeQR } from '../../../../src/codec/qr-decoder.js';
import { calculatePasswordStrength, generateStrongPassword } from '../../../../src/utils/password-strength.js';
import { renderQrOnCanvas } from './qr-canvas.js';
import { OnboardingWizard } from './onboarding-wizard.js';
import { ChangePasswordModal, TwoFactorSettingsModal, ShortcutsModal } from './vault-modals.js';

export { calculatePasswordStrength, generateStrongPassword, renderQrOnCanvas };

export class ModalManager {
    constructor() {
        this.overlay = this.createOverlay();
        if (typeof document !== 'undefined' && document.body && typeof document.body.appendChild === 'function' && this.overlay) {
            document.body.appendChild(this.overlay);
        }
        this.toastContainer = null;
    }

    createOverlay() {
        if (typeof document === 'undefined') return null;
        const el = document.createElement('div');
        el.className = 'modal-overlay';
        el.style.display = 'none';
        return el;
    }

    show(modal) {
        if (!this.overlay) return;
        this.hide();
        this.overlay.appendChild(modal);
        this.overlay.style.display = 'flex';

        const focusable = modal.querySelector('input, button');
        if (focusable && typeof focusable.focus === 'function') focusable.focus();
    }

    hide() {
        if (!this.overlay) return;
        this.overlay.style.display = 'none';
        this.overlay.innerHTML = '';
    }

    escape(str) {
        return escapeHtml(str);
    }

    /**
     * Non-blocking toast notification pill.
     * @param {string} message
     * @param {'info'|'success'|'error'|'warn'} [type='info']
     * @param {number} [duration=2500]
     */
    showToast(message, type = 'info', duration = 2500) {
        if (typeof document === 'undefined' || !document.body || typeof document.body.appendChild !== 'function') return;
        if (!this.toastContainer) {
            this.toastContainer = document.querySelector('.toast-container');
            if (!this.toastContainer) {
                this.toastContainer = document.createElement('div');
                this.toastContainer.className = 'toast-container';
                document.body.appendChild(this.toastContainer);
            }
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        if (typeof toast.setAttribute === 'function') toast.setAttribute('role', 'status');
        toast.innerHTML = `<span class="toast-text">${this.escape(message)}</span>`;

        if (this.toastContainer && typeof this.toastContainer.appendChild === 'function') {
            this.toastContainer.appendChild(toast);
        }

        setTimeout(() => {
            toast.classList.add('toast-fadeout');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * Generates a cryptographically strong random password.
     * @param {number} [length=20]
     * @returns {string}
     */
    generateStrongPassword(length = 20) {
        return generateStrongPassword(length);
    }

    /**
     * Calculates entropy and qualitative strength of a password string.
     * @param {string} pass
     * @returns {{ score: number, label: string, color: string, percent: number }}
     */
    static calculatePasswordStrength(pass) {
        return calculatePasswordStrength(pass);
    }

    /**
     * Renders an otpauth URI as a pixelated QR code onto a canvas.
     */
    renderQrOnCanvas(canvas, uri) {
        return renderQrOnCanvas(canvas, uri);
    }

    async prompt(title, label, type = 'text') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-dialog';
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>${this.escape(title)}</h3>
                    <button type="button" class="btn-icon close-btn" aria-label="Close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>${this.escape(label)}</label>
                        <input type="${this.escape(type)}" class="prompt-input form-control">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
                    <button type="button" class="btn btn-primary confirm-btn">OK</button>
                </div>
            `;

            this.show(modal);

            const cleanup = () => {
                this.hide();
            };

            const confirm = () => {
                const input = modal.querySelector('.prompt-input');
                const val = input ? input.value : '';
                cleanup();
                setTimeout(() => resolve(val), 50);
            };

            const cancel = () => {
                cleanup();
                setTimeout(() => resolve(null), 50);
            };

            const confirmBtn = modal.querySelector('.confirm-btn');
            if (confirmBtn) confirmBtn.onclick = confirm;
            const cancelBtn = modal.querySelector('.cancel-btn');
            if (cancelBtn) cancelBtn.onclick = cancel;
            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) closeBtn.onclick = cancel;

            const input = modal.querySelector('.prompt-input');
            if (input) {
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') confirm();
                    if (e.key === 'Escape') cancel();
                };
            }
        });
    }

    async confirm(message) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-dialog';
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>Confirmation</h3>
                    <button type="button" class="btn-icon close-btn" aria-label="Close">✕</button>
                </div>
                <div class="modal-body">
                    <p style="white-space: pre-line; line-height: 1.5; margin: 0;">${this.escape(message)}</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary cancel-btn">No</button>
                    <button type="button" class="btn btn-primary confirm-btn">Yes</button>
                </div>
            `;

            this.show(modal);

            const cleanup = () => {
                this.hide();
            };

            const confirmBtn = modal.querySelector('.confirm-btn');
            if (confirmBtn) {
                confirmBtn.onclick = () => {
                    cleanup();
                    setTimeout(() => resolve(true), 50);
                };
            }
            const cancel = () => {
                cleanup();
                setTimeout(() => resolve(false), 50);
            };
            const cancelBtn = modal.querySelector('.cancel-btn');
            if (cancelBtn) cancelBtn.onclick = cancel;
            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) closeBtn.onclick = cancel;
        });
    }

    async showAlert(title, message, type = 'info') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = `modal-dialog modal-alert modal-${type}`;
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>${this.escape(title)}</h3>
                    <button type="button" class="btn-icon close-btn" aria-label="Close">✕</button>
                </div>
                <div class="modal-body">
                    <p style="white-space: pre-line; line-height: 1.5; margin: 0;">${this.escape(message)}</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary ok-btn">OK</button>
                </div>
            `;

            this.show(modal);

            const cleanup = () => {
                this.hide();
                setTimeout(() => resolve(), 50);
            };

            const okBtn = modal.querySelector('.ok-btn');
            if (okBtn) okBtn.onclick = cleanup;
            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) closeBtn.onclick = cleanup;
        });
    }

    /**
     * Shows a rich dynamic form modal.
     */
    async showForm(title, fields, initialValues = {}, options = {}) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-dialog modal-lg';

            const inputsHtml = fields.map(field => {
                const val = initialValues[field.name] || '';
                const type = field.type || 'text';
                const label = field.label || field.name;
                const required = field.required ? 'required' : '';

                if (type === 'textarea') {
                    return `
                        <div class="form-group">
                            <label>${this.escape(label)}</label>
                            <textarea name="${this.escape(field.name)}" class="notes-textarea form-control" placeholder="Markdown documentation, notes, recovery keys..." ${required}>${this.escape(val)}</textarea>
                        </div>`;
                }

                if (field.name === 'password') {
                    return `
                        <div class="form-group">
                            <label>${this.escape(label)}</label>
                            <div class="password-input-group">
                                <input type="password" name="${this.escape(field.name)}" value="${this.escape(val)}" class="form-control password-input" ${required}>
                                <button type="button" class="btn-input-action toggle-reveal-btn" title="Show/Hide Password" aria-label="Show password">👁</button>
                                <button type="button" class="btn-input-action generate-pw-btn" title="Generate Strong Password" aria-label="Generate password">🎲</button>
                            </div>
                            <div class="password-strength-container">
                                <div class="password-strength-bar"><div class="strength-fill"></div></div>
                                <span class="strength-text"></span>
                            </div>
                        </div>`;
                }

                if (field.name === 'totp') {
                    return `
                        <div class="form-group">
                            <label>${this.escape(label)}</label>
                            <div class="totp-input-group">
                                <input type="text" name="${this.escape(field.name)}" value="${this.escape(val)}" placeholder="JBSWY3DPEHPK3PXP or otpauth://..." class="form-control totp-input" ${required}>
                                <button type="button" class="btn-input-action scan-qr-btn" title="Scan or Drop QR Code image">📷 Scan QR</button>
                            </div>
                            <div class="modal-qr-dropzone" style="display: none;">
                                <span>Drop QR code image here, paste, or click to browse</span>
                                <input type="file" accept="image/*" class="modal-qr-file-input" style="display: none;">
                            </div>
                        </div>`;
                }

                return `
                    <div class="form-group">
                        <label>${this.escape(label)}</label>
                        <input type="${this.escape(type)}" name="${this.escape(field.name)}" value="${this.escape(val)}" class="form-control" ${required}>
                    </div>`;
            }).join('');

            const deleteBtnHtml = options.showDelete
                ? `<button type="button" class="btn btn-danger delete-btn" style="margin-right: auto;">🗑️ Delete</button>`
                : '';

            modal.innerHTML = `
                <div class="modal-header">
                    <h3>${this.escape(title)}</h3>
                    <button type="button" class="btn-icon close-btn" aria-label="Close">✕</button>
                </div>
                <form id="dynamicForm" style="display: flex; flex-direction: column; flex: 1; overflow: hidden; margin: 0;">
                    <div class="modal-body">
                        ${inputsHtml}
                    </div>
                    <div class="modal-footer">
                        ${deleteBtnHtml}
                        <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
                        <button type="submit" class="btn btn-primary submit-btn">Save</button>
                    </div>
                </form>
            `;

            this.show(modal);

            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    this.hide();
                    resolve(null);
                };
            }

            // Password Reveal Toggle
            const toggleRevealBtn = modal.querySelector('.toggle-reveal-btn');
            const passwordInput = modal.querySelector('.password-input');
            if (toggleRevealBtn && passwordInput) {
                toggleRevealBtn.onclick = () => {
                    if (passwordInput.type === 'password') {
                        passwordInput.type = 'text';
                        toggleRevealBtn.textContent = '🙈';
                        toggleRevealBtn.setAttribute('aria-label', 'Hide password');
                    } else {
                        passwordInput.type = 'password';
                        toggleRevealBtn.textContent = '👁';
                        toggleRevealBtn.setAttribute('aria-label', 'Show password');
                    }
                };
            }

            // Password Strength and Generator
            const updateStrength = () => {
                if (!passwordInput) return;
                const val = passwordInput.value || '';
                const { label, color, percent } = ModalManager.calculatePasswordStrength(val);
                const fill = modal.querySelector('.strength-fill');
                const text = modal.querySelector('.strength-text');
                if (fill && fill.style) {
                    fill.style.width = `${percent}%`;
                    fill.style.backgroundColor = color;
                }
                if (text) {
                    text.textContent = val ? `Strength: ${label}` : '';
                    if (text.style) text.style.color = color;
                }
            };

            if (passwordInput) {
                passwordInput.addEventListener('input', updateStrength);
                updateStrength();
            }

            const generatePwBtn = modal.querySelector('.generate-pw-btn');
            if (generatePwBtn && passwordInput) {
                generatePwBtn.onclick = () => {
                    const generated = this.generateStrongPassword(20);
                    passwordInput.value = generated;
                    passwordInput.type = 'text';
                    if (toggleRevealBtn) toggleRevealBtn.textContent = '🙈';
                    updateStrength();
                    this.showToast('Generated strong 20-character password', 'success');
                };
            }

            // Modal QR Scan / Drop Integration
            const scanQrBtn = modal.querySelector('.scan-qr-btn');
            const qrDropzone = modal.querySelector('.modal-qr-dropzone');
            const qrFileInput = modal.querySelector('.modal-qr-file-input');
            const totpInput = modal.querySelector('.totp-input');

            if (scanQrBtn && qrDropzone && qrFileInput && totpInput) {
                const handleQrFile = async (file) => {
                    try {
                        let imageData = null;
                        if (file && file.imageData) {
                            imageData = file.imageData;
                        } else if (typeof createImageBitmap === 'function') {
                            const bmp = await createImageBitmap(file);
                            const canvas = document.createElement('canvas');
                            canvas.width = bmp.width;
                            canvas.height = bmp.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(bmp, 0, 0);
                            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                            bmp.close && bmp.close();
                        }

                        if (!imageData) {
                            throw new Error('Could not rasterize image');
                        }

                        const [decoded, decodeErr] = decodeQR(imageData);
                        if (decodeErr) {
                            this.showToast('Could not read QR code: ' + decodeErr.message, 'error');
                            return;
                        }

                        const text = new TextDecoder().decode(decoded.bytes).trim();
                        totpInput.value = text;
                        qrDropzone.style.display = 'none';
                        this.showToast('Scanned TOTP QR code successfully!', 'success');
                    } catch (err) {
                        this.showToast('QR scan failed: ' + err.message, 'error');
                    }
                };

                scanQrBtn.onclick = () => {
                    qrDropzone.style.display = qrDropzone.style.display === 'none' ? 'block' : 'none';
                };

                qrDropzone.onclick = () => qrFileInput.click();
                qrFileInput.onchange = () => {
                    if (qrFileInput.files[0]) handleQrFile(qrFileInput.files[0]);
                };

                qrDropzone.ondragover = (e) => e.preventDefault();
                qrDropzone.ondrop = (e) => {
                    e.preventDefault();
                    if (e.dataTransfer && e.dataTransfer.files[0]) {
                        handleQrFile(e.dataTransfer.files[0]);
                    }
                };
            }

            const cleanup = () => {
                this.hide();
            };

            // Delete Entry Button
            const deleteBtn = modal.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.onclick = () => {
                    cleanup();
                    setTimeout(() => resolve({ _action: 'delete' }), 50);
                };
            }

            const form = modal.querySelector('form');
            if (form) {
                form.onsubmit = (e) => {
                    e.preventDefault();
                    const formData = new FormData(form);
                    const data = {};
                    for (const [key, val] of formData.entries()) {
                        data[key] = val;
                    }

                    if (data.tags) {
                        data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
                    }

                    cleanup();
                    setTimeout(() => resolve(data), 50);
                };
            }

            const cancelBtn = modal.querySelector('.cancel-btn');
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    cleanup();
                    setTimeout(() => resolve(null), 50);
                };
            }
        });
    }

    /**
     * Guided Multi-step Onboarding Wizard for new vault creation.
     */
    async showOnboardingWizard(options = {}) {
        return new OnboardingWizard(this).show(options);
    }

    /**
     * Modal for changing the master password with live hardware benchmark calibration.
     */
    async showChangePasswordModal(options = {}) {
        return new ChangePasswordModal(this).show(options);
    }

    /**
     * Modal for viewing and configuring 2FA Tier B TOTP gate settings.
     */
    async show2FaSettingsModal(options = {}) {
        return new TwoFactorSettingsModal(this).show(options);
    }

    /**
     * Shows Keyboard Shortcuts cheat-sheet modal.
     */
    async showShortcutsModal() {
        return new ShortcutsModal(this).show();
    }
}
