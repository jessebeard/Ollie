
import { isSafeHttpUrl } from '../../../../src/utils/url-safety.js';
import { escapeHtml } from '../../../../src/utils/escape-html.js';

export class VaultView {
    constructor(element, eventBus) {
        this.element = element;
        this.events = eventBus;
    }

    render(entries) {
        if (!entries || entries.length === 0) {
            this.renderEmpty();
            return;
        }

        this.renderList(entries);
    }

    renderEmpty() {
        this.element.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <img src="components/assets/ollie-animated.svg" alt="Ollie the Maine Coon Mascot" width="120" height="120" />
                </div>
                <h3>No Items Found</h3>
                <p>Try clearing filters or add a new password.</p>
            </div>
        `;
    }



    renderList(entries) {
        const grid = document.createElement('div');
        grid.className = 'password-grid';

        entries.forEach(entry => {
            const card = this.createCard(entry);
            grid.appendChild(card);
        });

        this.element.innerHTML = '';
        this.element.appendChild(grid);
    }

    createCard(entry) {
        const div = document.createElement('div');
        div.className = 'password-card';
        div.setAttribute('role', 'article');
        div.setAttribute('data-entry-id', entry.id);
        div.innerHTML = `
            <div class="card-header">
                <div class="card-icon" aria-hidden="true">${this.getIcon(entry)}</div>
                <div class="card-title-group">
                    <h4>${this.escape(entry.title)}</h4>
                    <span class="card-subtitle">${this.escape(entry.username)}</span>
                </div>
                <button class="btn-icon more-btn" aria-label="Edit ${this.escape(entry.title)}">⋯</button>
            </div>
            <div class="totp-slot"></div>
            <div class="card-tags" aria-label="Tags">
                ${(entry.tags || []).map(t => `<span class="tag">${this.escape(t)}</span>`).join('')}
            </div>
            <div class="card-actions">
                <button class="btn-copy" aria-label="Copy password for ${this.escape(entry.title)}">Copy Pass</button>
                <button class="btn-launch" data-url="${this.escape(entry.url)}" aria-label="Launch URL for ${this.escape(entry.title)}">Launch</button>
            </div>
        `;

        div.querySelector('.more-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.events.emit('edit-entry', entry.id);
        });

        div.querySelector('.btn-copy').addEventListener('click', (e) => {
            e.stopPropagation();
            this.events.emit('copy-password', entry.id);
        });

        div.querySelector('.btn-launch').addEventListener('click', () => {
            if (!entry.url) return;
            if (!isSafeHttpUrl(entry.url)) {
                this.events.emit('unsafe-url-blocked', { id: entry.id, url: entry.url });
                return;
            }
            window.open(entry.url, '_blank', 'noopener,noreferrer');
        });

        // QR scan toggle: checking it reveals an inline dropzone that
        // accepts a TOTP enrollment QR (drop, click-to-browse, or paste).
        const qrToggle = document.createElement('label');
        qrToggle.className = 'qr-scan-toggle';
        const qrCheck = document.createElement('input');
        qrCheck.type = 'checkbox';
        qrCheck.addEventListener('change', () => {
            const existing = div.querySelector('.qr-dropzone');
            if (qrCheck.checked && !existing) {
                const dz = document.createElement('div');
                dz.className = 'qr-dropzone';
                dz.setAttribute('role', 'button');
                dz.textContent = 'Drop QR image, click to browse, or paste';
                const picker = document.createElement('input');
                picker.type = 'file';
                picker.accept = 'image/*';
                picker.style.display = 'none';
                dz.addEventListener('click', () => picker.click());
                picker.addEventListener('change', () => {
                    if (picker.files[0]) this.events.emit('scan-qr-file', { id: entry.id, file: picker.files[0] });
                    qrCheck.checked = false;
                    dz.remove();
                });
                dz.addEventListener('dragover', (e) => e.preventDefault());
                dz.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (e.dataTransfer && e.dataTransfer.files[0]) {
                        this.events.emit('scan-qr-file', { id: entry.id, file: e.dataTransfer.files[0] });
                    }
                    qrCheck.checked = false;
                    dz.remove();
                });
                this._pasteTarget = (e) => {
                    if (e.clipboardData && e.clipboardData.files[0]) {
                        this.events.emit('scan-qr-file', { id: entry.id, file: e.clipboardData.files[0] });
                        qrCheck.checked = false;
                        dz.remove();
                        document.removeEventListener('paste', this._pasteTarget);
                    }
                };
                document.addEventListener('paste', this._pasteTarget);
                div.appendChild(dz);
            } else if (!qrCheck.checked && existing) {
                existing.remove();
                if (this._pasteTarget) {
                    document.removeEventListener('paste', this._pasteTarget);
                    this._pasteTarget = null;
                }
            }
        });
        qrToggle.appendChild(qrCheck);
        const toggleText = document.createElement('span');
        toggleText.textContent = ' Scan QR';
        qrToggle.appendChild(toggleText);
        div.appendChild(qrToggle);

        return div;
    }

    getIcon(_entry) {
        // Simple heuristic for icon
        return 'ðŸ”‘';
    }

    escape(str) {
        return escapeHtml(str);
    }
}
