import { escapeHtml } from '../../../../src/utils/escape-html.js';
import { renderQrOnCanvas } from './qr-canvas.js';

/**
 * Dialog for master password rotation with hardware benchmark calibration.
 */
export class ChangePasswordModal {
    constructor(modalManager) {
        this.modals = modalManager;
    }

    show(options = {}) {
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

            this.modals.show(modal);

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
                    if (benchStatus) benchStatus.textContent = 'Benchmarking...';
                    const [result, err] = await options.onBenchmark();
                    benchBtn.disabled = false;
                    if (err) {
                        if (benchStatus) benchStatus.textContent = 'Error: ' + err.message;
                    } else {
                        chosenIterations = result.recommendedIterations;
                        if (benchStatus) benchStatus.textContent = `Recommended: ${chosenIterations.toLocaleString()} iterations (~${result.estimatedUnlockMs}ms)`;
                        iterPills.forEach(p => p.classList.remove('active'));
                    }
                };
            }

            const form = modal.querySelector('form');
            if (form) {
                form.onsubmit = (e) => {
                    e.preventDefault();
                    const currentEl = modal.querySelector('#cpCurrent');
                    const nextEl = modal.querySelector('#cpNew');
                    const confirmEl = modal.querySelector('#cpConfirm');

                    const current = currentEl ? currentEl.value : '';
                    const next = nextEl ? nextEl.value : '';
                    const confirm = confirmEl ? confirmEl.value : '';

                    if (!next || next.length === 0) {
                        this.modals.showToast('New password cannot be empty', 'error');
                        return;
                    }
                    if (next !== confirm) {
                        this.modals.showToast('New passwords do not match', 'error');
                        return;
                    }

                    this.modals.hide();
                    resolve({
                        currentPassword: current,
                        newPassword: next,
                        iterations: chosenIterations
                    });
                };
            }

            const close = () => {
                this.modals.hide();
                resolve(null);
            };
            const cancelBtn = modal.querySelector('.cancel-btn');
            if (cancelBtn) cancelBtn.onclick = close;
            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) closeBtn.onclick = close;
        });
    }
}

/**
 * Dialog for configuring and viewing 2FA Tier B TOTP gate settings.
 */
export class TwoFactorSettingsModal {
    constructor(modalManager) {
        this.modals = modalManager;
    }

    show(options = {}) {
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
                            <p style="font-family: monospace; font-size: 0.75rem; word-break: break-all; margin-top: 0.5rem; color: var(--text-secondary);">${escapeHtml(enrolledUri)}</p>
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

            this.modals.show(modal);

            if (isEnrolled && enrolledUri) {
                const canvas = modal.querySelector('.settings-qr-canvas');
                if (canvas) renderQrOnCanvas(canvas, enrolledUri);
            }

            const enableBtn = modal.querySelector('.enable-2fa-btn');
            if (enableBtn) {
                enableBtn.onclick = () => {
                    this.modals.hide();
                    resolve({ action: 'enable' });
                };
            }

            const disableBtn = modal.querySelector('.disable-2fa-btn');
            if (disableBtn) {
                disableBtn.onclick = () => {
                    this.modals.hide();
                    resolve({ action: 'disable' });
                };
            }

            const close = () => {
                this.modals.hide();
                resolve(null);
            };
            const cancelBtn = modal.querySelector('.cancel-btn');
            if (cancelBtn) cancelBtn.onclick = close;
            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) closeBtn.onclick = close;
        });
    }
}

/**
 * Keyboard Shortcuts cheat-sheet modal.
 */
export class ShortcutsModal {
    constructor(modalManager) {
        this.modals = modalManager;
    }

    show() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-dialog modal-md';
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>⌨️ Keyboard Shortcuts</h3>
                    <button type="button" class="btn-icon close-btn" aria-label="Close">✕</button>
                </div>
                <div class="modal-body">
                    <table class="shortcuts-table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <tbody>
                            <tr style="border-bottom: 1px solid var(--border-subtle);"><td style="padding: 0.5rem 0;"><kbd>/</kbd></td><td style="color: var(--text-secondary);">Focus Search Bar</td></tr>
                            <tr style="border-bottom: 1px solid var(--border-subtle);"><td style="padding: 0.5rem 0;"><kbd>J</kbd> / <kbd>↓</kbd></td><td style="color: var(--text-secondary);">Select Next Card</td></tr>
                            <tr style="border-bottom: 1px solid var(--border-subtle);"><td style="padding: 0.5rem 0;"><kbd>K</kbd> / <kbd>↑</kbd></td><td style="color: var(--text-secondary);">Select Previous Card</td></tr>
                            <tr style="border-bottom: 1px solid var(--border-subtle);"><td style="padding: 0.5rem 0;"><kbd>Enter</kbd></td><td style="color: var(--text-secondary);">Open / Expand Card</td></tr>
                            <tr style="border-bottom: 1px solid var(--border-subtle);"><td style="padding: 0.5rem 0;"><kbd>Esc</kbd></td><td style="color: var(--text-secondary);">Deselect / Close Drawer / Dismiss Modal</td></tr>
                            <tr style="border-bottom: 1px solid var(--border-subtle);"><td style="padding: 0.5rem 0;"><kbd>C</kbd></td><td style="color: var(--text-secondary);">Copy Password of Selected Card</td></tr>
                            <tr style="border-bottom: 1px solid var(--border-subtle);"><td style="padding: 0.5rem 0;"><kbd>T</kbd></td><td style="color: var(--text-secondary);">Copy TOTP of Selected Card</td></tr>
                            <tr style="border-bottom: 1px solid var(--border-subtle);"><td style="padding: 0.5rem 0;"><kbd>Ctrl</kbd> + <kbd>N</kbd></td><td style="color: var(--text-secondary);">Add New Entry</td></tr>
                            <tr style="border-bottom: 1px solid var(--border-subtle);"><td style="padding: 0.5rem 0;"><kbd>Ctrl</kbd> + <kbd>S</kbd></td><td style="color: var(--text-secondary);">Save Vault To JPEGs</td></tr>
                            <tr><td style="padding: 0.5rem 0;"><kbd>?</kbd></td><td style="color: var(--text-secondary);">Show Shortcuts Cheat-Sheet</td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary close-modal-btn">Got It</button>
                </div>
            `;

            this.modals.show(modal);

            const close = () => {
                this.modals.hide();
                resolve(true);
            };
            const closeBtn = modal.querySelector('.close-btn');
            if (closeBtn) closeBtn.onclick = close;
            const gotItBtn = modal.querySelector('.close-modal-btn');
            if (gotItBtn) gotItBtn.onclick = close;
        });
    }
}
