import { renderQrOnCanvas } from './qr-canvas.js';

/**
 * Multi-Step Guided Onboarding Wizard for new vault creation.
 */
export class OnboardingWizard {
    /**
     * @param {object} modalManager - Host ModalManager instance
     */
    constructor(modalManager) {
        this.modals = modalManager;
    }

    /**
     * Shows the 3-step onboarding wizard.
     * @param {object} [options={}]
     * @returns {Promise<object|null>}
     */
    show(options = {}) {
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

                this.modals.show(modal);

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
                        enableTotp = !!(totpCheck && totpCheck.checked);
                        if (qrPreview) qrPreview.style.display = enableTotp ? 'block' : 'none';
                        if (enableTotp && options.generateQr) {
                            const [qrData, qrErr] = await options.generateQr();
                            if (!qrErr && qrData) {
                                enrolledSecret = qrData.secret;
                                enrolledUri = qrData.uri;
                                if (uriText) uriText.textContent = enrolledUri;
                                if (qrCanvas) {
                                    renderQrOnCanvas(qrCanvas, enrolledUri);
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
                            const p1El = modal.querySelector('#wzMasterPass');
                            const p2El = modal.querySelector('#wzConfirmPass');
                            const p1 = p1El ? p1El.value : '';
                            const p2 = p2El ? p2El.value : '';
                            if (!p1 || p1.length === 0) {
                                this.modals.showToast('Master password cannot be empty', 'error');
                                return;
                            }
                            if (p1 !== p2) {
                                this.modals.showToast('Passwords do not match', 'error');
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
                        this.modals.hide();
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
                        this.modals.hide();
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
                        this.modals.hide();
                        resolve(null);
                    };
                }
            };

            renderStep();
        });
    }
}
