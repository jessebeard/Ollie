import { escapeHtml } from '../../../../src/utils/escape-html.js';
import { decodeQR } from '../../../../src/codec/qr-decoder.js';
import { encodeQR } from '../../../../src/codec/qr-encoder.js';

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
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
        const bytes = new Uint8Array(length);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }

        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars[bytes[i] % chars.length];
        }
        return result;
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

            modal.querySelector('.confirm-btn').onclick = confirm;
            modal.querySelector('.cancel-btn').onclick = cancel;
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

            modal.querySelector('.confirm-btn').onclick = () => {
                cleanup();
                setTimeout(() => resolve(true), 50);
            };
            const cancel = () => {
                cleanup();
                setTimeout(() => resolve(false), 50);
            };
            modal.querySelector('.cancel-btn').onclick = cancel;
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

            modal.querySelector('.ok-btn').onclick = cleanup;
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

            // Password Generator
            const generatePwBtn = modal.querySelector('.generate-pw-btn');
            if (generatePwBtn && passwordInput) {
                generatePwBtn.onclick = () => {
                    const generated = this.generateStrongPassword(20);
                    passwordInput.value = generated;
                    passwordInput.type = 'text';
                    if (toggleRevealBtn) toggleRevealBtn.textContent = '🙈';
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

            modal.querySelector('.cancel-btn').onclick = () => {
                cleanup();
                setTimeout(() => resolve(null), 50);
            };
        });
    }

    /**
     * Guided Multi-step Onboarding Wizard for new vault creation.
     */
    async showOnboardingWizard(options = {}) {
        return new Promise((resolve) => {
            let currentStep = 1;
            let chosenPassword = '';
            let chosenIterations = 600000;
            let enableTotp = false;
            let enrolledSecret = null;
            let enrolledUri = null;

            const modal = document.createElement('div');
            modal.className = 'modal-dialog modal-wizard modal-lg';

            const renderStep = () => {
                let bodyHtml = '';
                if (currentStep === 1) {
                    bodyHtml = `
                        <div class="wizard-step">
                            <div class="wizard-header">
                                <h3>✨ Create New Vault</h3>
                                <p class="wizard-subtitle">Step 1 of 3: Master Password & Security Calibration</p>
                            </div>
                            <div class="form-group">
                                <label>Master Password</label>
                                <div class="password-input-group">
                                    <input type="password" id="wzMasterPass" class="form-control" placeholder="Enter a strong master password">
                                    <button type="button" class="btn-input-action wz-toggle-pass" aria-label="Show password">👁</button>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Confirm Master Password</label>
                                <input type="password" id="wzConfirmPass" class="form-control" placeholder="Re-enter your master password">
                            </div>
                            <div class="kdf-iteration-section">
                                <label>PBKDF2 Iteration Count (Cryptographic Work Factor)</label>
                                <div class="iteration-pills">
                                    <button type="button" class="iter-pill active" data-iter="600000">600k (OWASP)</button>
                                    <button type="button" class="iter-pill" data-iter="1000000">1M (Enhanced)</button>
                                    <button type="button" class="iter-pill" data-iter="2500000">2.5M (Paranoid)</button>
                                </div>
                                <div class="benchmark-container">
                                    <button type="button" class="btn btn-secondary wz-benchmark-btn">⚡ Benchmark My Device</button>
                                    <span class="benchmark-status" style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;"></span>
                                </div>
                            </div>
                        </div>
                    `;
                } else if (currentStep === 2) {
                    bodyHtml = `
                        <div class="wizard-step">
                            <div class="wizard-header">
                                <h3>🛡️ Second Factor Protection (Optional)</h3>
                                <p class="wizard-subtitle">Step 2 of 3: Tier B TOTP Security Gate</p>
                            </div>
                            <div class="totp-gate-disclaimer">
                                <p><strong>Disclaimer:</strong> This gate deters shoulder-surfing by requesting a rotating 6-digit code upon unlock.</p>
                            </div>
                            <div class="form-group" style="margin-top: 1rem;">
                                <label class="checkbox-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="checkbox" id="wzTotpCheck" ${enableTotp ? 'checked' : ''}>
                                    <span>Enable 6-digit Authenticator Gate on unlock</span>
                                </label>
                            </div>
                            <div class="wz-qr-preview" style="display: ${enableTotp ? 'block' : 'none'}; text-align: center; margin-top: 1rem;">
                                <canvas class="wz-qr-canvas" width="180" height="180" style="border: 4px solid #fff; border-radius: 6px;"></canvas>
                                <p class="wz-totp-uri" style="font-family: monospace; font-size: 0.75rem; word-break: break-all; margin-top: 0.5rem;"></p>
                            </div>
                        </div>
                    `;
                } else if (currentStep === 3) {
                    bodyHtml = `
                        <div class="wizard-step">
                            <div class="wizard-header">
                                <h3>🎉 Vault Ready!</h3>
                                <p class="wizard-subtitle">Step 3 of 3: How would you like to start?</p>
                            </div>
                            <div class="quick-action-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 1rem;">
                                <button type="button" class="btn btn-secondary quick-btn" data-action="add-entry" style="padding: 1rem; text-align: left;">
                                    <strong>➕ Add First Password</strong>
                                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Create a new login entry manually.</div>
                                </button>
                                <button type="button" class="btn btn-secondary quick-btn" data-action="import-csv" style="padding: 1rem; text-align: left;">
                                    <strong>📥 Import from CSV</strong>
                                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Bitwarden, Chrome, 1Password, etc.</div>
                                </button>
                            </div>
                        </div>
                    `;
                }

                modal.innerHTML = `
                    ${bodyHtml}
                    <div class="modal-actions" style="margin-top: 1.5rem;">
                        <button type="button" class="btn btn-secondary wz-cancel-btn">Cancel</button>
                        ${currentStep > 1 ? '<button type="button" class="btn btn-secondary wz-back-btn">Back</button>' : ''}
                        ${currentStep < 3
                            ? '<button type="button" class="btn btn-primary wz-next-btn">Next →</button>'
                            : '<button type="button" class="btn btn-primary wz-finish-btn">Finish</button>'}
                    </div>
                `;

                this.show(modal);

                // Wire Step 1 controls
                if (currentStep === 1) {
                    const passInput = modal.querySelector('#wzMasterPass');
                    const toggleBtn = modal.querySelector('.wz-toggle-pass');
                    if (passInput && toggleBtn) {
                        toggleBtn.onclick = () => {
                            passInput.type = passInput.type === 'password' ? 'text' : 'password';
                        };
                    }

                    const iterPills = modal.querySelectorAll('.iter-pill');
                    iterPills.forEach(pill => {
                        pill.onclick = () => {
                            iterPills.forEach(p => p.classList.remove('active'));
                            pill.classList.add('active');
                            chosenIterations = parseInt(pill.getAttribute('data-iter'), 10);
                        };
                    });

                    const benchBtn = modal.querySelector('.wz-benchmark-btn');
                    const benchStatus = modal.querySelector('.benchmark-status');
                    if (benchBtn && options.onBenchmark) {
                        benchBtn.onclick = async () => {
                            benchBtn.disabled = true;
                            benchStatus.textContent = 'Benchmarking CPU...';
                            const [result, err] = await options.onBenchmark();
                            benchBtn.disabled = false;
                            if (err) {
                                benchStatus.textContent = 'Benchmark error: ' + err.message;
                            } else {
                                chosenIterations = result.recommendedIterations;
                                benchStatus.textContent = `Recommended: ${chosenIterations.toLocaleString()} iterations (~${result.estimatedUnlockMs}ms)`;
                                iterPills.forEach(p => p.classList.remove('active'));
                            }
                        };
                    }
                }

                // Wire Step 2 controls
                if (currentStep === 2) {
                    const totpCheck = modal.querySelector('#wzTotpCheck');
                    const qrPreview = modal.querySelector('.wz-qr-preview');
                    const qrCanvas = modal.querySelector('.wz-qr-canvas');
                    const uriText = modal.querySelector('.wz-totp-uri');

                    const updateTotpState = async () => {
                        enableTotp = totpCheck.checked;
                        qrPreview.style.display = enableTotp ? 'block' : 'none';
                        if (enableTotp && options.generateQr) {
                            const [qrData, qrErr] = await options.generateQr();
                            if (!qrErr && qrData) {
                                enrolledSecret = qrData.secret;
                                enrolledUri = qrData.uri;
                                uriText.textContent = enrolledUri;
                                if (qrCanvas) {
                                    this.renderQrOnCanvas(qrCanvas, enrolledUri);
                                }
                            }
                        }
                    };

                    if (totpCheck) {
                        totpCheck.onchange = updateTotpState;
                        if (enableTotp) updateTotpState();
                    }
                }

                // Navigation
                const nextBtn = modal.querySelector('.wz-next-btn');
                if (nextBtn) {
                    nextBtn.onclick = () => {
                        if (currentStep === 1) {
                            const p1 = modal.querySelector('#wzMasterPass').value;
                            const p2 = modal.querySelector('#wzConfirmPass').value;
                            if (!p1 || p1.length === 0) {
                                this.showToast('Master password cannot be empty', 'error');
                                return;
                            }
                            if (p1 !== p2) {
                                this.showToast('Passwords do not match', 'error');
                                return;
                            }
                            chosenPassword = p1;
                        }
                        currentStep++;
                        renderStep();
                    };
                }

                const backBtn = modal.querySelector('.wz-back-btn');
                if (backBtn) {
                    backBtn.onclick = () => {
                        currentStep--;
                        renderStep();
                    };
                }

                const finishBtn = modal.querySelector('.wz-finish-btn');
                if (finishBtn) {
                    finishBtn.onclick = () => {
                        this.hide();
                        resolve({
                            password: chosenPassword,
                            iterations: chosenIterations,
                            enableTotp,
                            totpSecret: enrolledSecret,
                            totpUri: enrolledUri,
                            quickAction: null
                        });
                    };
                }

                const quickBtns = modal.querySelectorAll('.quick-btn');
                quickBtns.forEach(qb => {
                    qb.onclick = () => {
                        const action = qb.getAttribute('data-action');
                        this.hide();
                        resolve({
                            password: chosenPassword,
                            iterations: chosenIterations,
                            enableTotp,
                            totpSecret: enrolledSecret,
                            totpUri: enrolledUri,
                            quickAction: action
                        });
                    };
                });

                const cancelBtn = modal.querySelector('.wz-cancel-btn');
                if (cancelBtn) {
                    cancelBtn.onclick = () => {
                        this.hide();
                        resolve(null);
                    };
                }
            };

            renderStep();
        });
    }

    /**
     * Modal for changing the master password with live hardware benchmark calibration.
     */
    async showChangePasswordModal(options = {}) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-dialog modal-lg';

            let chosenIterations = options.currentIterations || 600000;

            modal.innerHTML = `
                <div class="modal-header">
                    <h3>🔑 Change Master Password</h3>
                    <button type="button" class="btn-icon close-btn" aria-label="Close">✕</button>
                </div>
                <form id="changePasswordForm" style="display: flex; flex-direction: column; flex: 1; overflow: hidden; margin: 0;">
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Current Master Password</label>
                            <input type="password" id="cpCurrent" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>New Master Password</label>
                            <input type="password" id="cpNew" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Confirm New Master Password</label>
                            <input type="password" id="cpConfirm" class="form-control" required>
                        </div>
                        <div class="kdf-iteration-section">
                            <label>PBKDF2 Iteration Count</label>
                            <div class="iteration-pills">
                                <button type="button" class="iter-pill ${chosenIterations === 600000 ? 'active' : ''}" data-iter="600000">600k (OWASP)</button>
                                <button type="button" class="iter-pill ${chosenIterations === 1000000 ? 'active' : ''}" data-iter="1000000">1M (Enhanced)</button>
                                <button type="button" class="iter-pill ${chosenIterations === 2500000 ? 'active' : ''}" data-iter="2500000">2.5M (Paranoid)</button>
                            </div>
                            <div class="benchmark-container">
                                <button type="button" class="btn btn-secondary cp-benchmark-btn">⚡ Benchmark My Device</button>
                                <span class="benchmark-status" style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;"></span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
                        <button type="submit" class="btn btn-primary submit-btn">Update Password</button>
                    </div>
                </form>
            `;

            this.show(modal);

            const iterPills = modal.querySelectorAll('.iter-pill');
            iterPills.forEach(pill => {
                pill.onclick = () => {
                    iterPills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    chosenIterations = parseInt(pill.getAttribute('data-iter'), 10);
                };
            });

            const benchBtn = modal.querySelector('.cp-benchmark-btn');
            const benchStatus = modal.querySelector('.benchmark-status');
            if (benchBtn && options.onBenchmark) {
                benchBtn.onclick = async () => {
                    benchBtn.disabled = true;
                    benchStatus.textContent = 'Benchmarking...';
                    const [result, err] = await options.onBenchmark();
                    benchBtn.disabled = false;
                    if (err) {
                        benchStatus.textContent = 'Error: ' + err.message;
                    } else {
                        chosenIterations = result.recommendedIterations;
                        benchStatus.textContent = `Recommended: ${chosenIterations.toLocaleString()} iterations (~${result.estimatedUnlockMs}ms)`;
                        iterPills.forEach(p => p.classList.remove('active'));
                    }
                };
            }

            const form = modal.querySelector('form');
            form.onsubmit = (e) => {
                e.preventDefault();
                const current = modal.querySelector('#cpCurrent').value;
                const next = modal.querySelector('#cpNew').value;
                const confirm = modal.querySelector('#cpConfirm').value;

                if (!next || next.length === 0) {
                    this.showToast('New password cannot be empty', 'error');
                    return;
                }
                if (next !== confirm) {
                    this.showToast('New passwords do not match', 'error');
                    return;
                }

                this.hide();
                resolve({
                    currentPassword: current,
                    newPassword: next,
                    iterations: chosenIterations
                });
            };

            const close = () => {
                this.hide();
                resolve(null);
            };
            modal.querySelector('.cancel-btn').onclick = close;
            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) closeBtn.onclick = close;
        });
    }

    /**
     * Modal for viewing and configuring 2FA Tier B TOTP gate settings.
     */
    async show2FaSettingsModal(options = {}) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-dialog modal-lg';

            const isEnrolled = options.isEnrolled;
            const enrolledUri = options.enrolledUri || '';

            modal.innerHTML = `
                <div class="modal-header">
                    <h3>🛡️ 2FA Security Gate Settings</h3>
                    <button type="button" class="btn-icon close-btn" aria-label="Close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="2fa-status-card" style="padding: 1rem; background: var(--bg-base); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                        <strong>Status:</strong> ${isEnrolled ? '<span style="color: var(--success);">Enabled</span>' : '<span style="color: var(--text-muted);">Disabled</span>'}
                        <p style="font-size: 0.825rem; color: var(--text-secondary); margin-top: 0.5rem; line-height: 1.45;">
                            ${isEnrolled ? 'A rotating 6-digit TOTP code is required to unlock this vault.' : 'No second-factor code is currently requested on unlock.'}
                        </p>
                    </div>
                    ${isEnrolled ? `
                        <div class="qr-display-section" style="text-align: center; margin: 1rem 0;">
                            <canvas class="settings-qr-canvas" width="180" height="180" style="border: 4px solid #fff; border-radius: var(--radius-sm);"></canvas>
                            <p style="font-family: monospace; font-size: 0.75rem; word-break: break-all; margin-top: 0.5rem; color: var(--text-secondary);">${this.escape(enrolledUri)}</p>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary cancel-btn">Close</button>
                    ${isEnrolled
                        ? '<button type="button" class="btn btn-danger disable-2fa-btn">Disable 2FA</button>'
                        : '<button type="button" class="btn btn-primary enable-2fa-btn">Enable 2FA Gate</button>'}
                </div>
            `;

            this.show(modal);

            if (isEnrolled && enrolledUri) {
                const canvas = modal.querySelector('.settings-qr-canvas');
                if (canvas) this.renderQrOnCanvas(canvas, enrolledUri);
            }

            const enableBtn = modal.querySelector('.enable-2fa-btn');
            if (enableBtn) {
                enableBtn.onclick = () => {
                    this.hide();
                    resolve({ action: 'enable' });
                };
            }

            const disableBtn = modal.querySelector('.disable-2fa-btn');
            if (disableBtn) {
                disableBtn.onclick = () => {
                    this.hide();
                    resolve({ action: 'disable' });
                };
            }

            const close = () => {
                this.hide();
                resolve(null);
            };
            modal.querySelector('.cancel-btn').onclick = close;
            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) closeBtn.onclick = close;
        });
    }

    /**
     * Renders an otpauth URI as a pixelated QR code onto a canvas.
     */
    renderQrOnCanvas(canvas, uri) {
        if (!canvas || !uri) return;
        try {
            const bytes = typeof uri === 'string' ? new TextEncoder().encode(uri) : uri;
            const { size, modules } = encodeQR(bytes);
            if (!size || !modules) return;

            const quietZone = 2;
            const totalModules = size + quietZone * 2;
            const scale = Math.max(1, Math.floor(canvas.width / totalModules));
            const totalRenderWidth = totalModules * scale;
            const offsetX = Math.floor((canvas.width - totalRenderWidth) / 2);
            const offsetY = Math.floor((canvas.height - totalRenderWidth) / 2);

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000';

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (modules[y * size + x]) {
                        ctx.fillRect(
                            offsetX + (x + quietZone) * scale,
                            offsetY + (y + quietZone) * scale,
                            scale,
                            scale
                        );
                    }
                }
            }
        } catch (e) {
            console.error('Failed to render QR canvas:', e);
        }
    }
}
