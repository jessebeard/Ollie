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
        return VaultView.createCard(entry, {
            onEdit: (id) => this.events.emit('edit-entry', id),
            onCopyPass: (id) => this.events.emit('copy-password', id),
            onLaunch: (url, id) => {
                if (!url) return;
                if (!isSafeHttpUrl(url)) {
                    this.events.emit('unsafe-url-blocked', { id, url });
                    return;
                }
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        });
    }

    static createCard(entry, handlers = {}) {
        const escape = (str) => escapeHtml(str);
        const div = document.createElement('div');
        div.className = 'password-card';
        div.setAttribute('role', 'article');
        div.setAttribute('data-entry-id', entry.id);
        const hasUrl = !!(entry.url && entry.url.trim());
        div.innerHTML = `
            <div class="card-header">
                <div class="card-icon" aria-hidden="true">${VaultView.getIcon(entry)}</div>
                <div class="card-title-group">
                    <h4>${escape(entry.title || 'Untitled')}</h4>
                    <span class="card-subtitle">${escape(entry.username || '')}</span>
                </div>
                <button class="btn-icon more-btn" aria-label="Edit ${escape(entry.title || '')}">⋯</button>
            </div>
            <div class="totp-slot"></div>
            <div class="card-tags" aria-label="Tags">
                ${(entry.tags || []).map(t => `<span class="tag">${escape(t)}</span>`).join('')}
            </div>
            <div class="card-actions">
                <button class="btn-copy" aria-label="Copy password for ${escape(entry.title || '')}">Copy Pass</button>
                <button class="btn-launch" data-url="${escape(entry.url || '')}" ${hasUrl ? '' : 'disabled'} aria-label="${hasUrl ? 'Launch URL for ' + escape(entry.title || '') : 'No URL provided'}">Launch</button>
            </div>
        `;

        const moreBtn = div.querySelector('.more-btn');
        if (moreBtn && handlers.onEdit) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handlers.onEdit(entry.id);
            });
        }

        const copyBtn = div.querySelector('.btn-copy');
        if (copyBtn && handlers.onCopyPass) {
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handlers.onCopyPass(entry.id);
            });
        }

        const launchBtn = div.querySelector('.btn-launch');
        if (launchBtn && handlers.onLaunch) {
            launchBtn.addEventListener('click', () => {
                handlers.onLaunch(entry.url, entry.id);
            });
        }

        return div;
    }

    static getIcon(_entry) {
        return '🔑';
    }

    getIcon(entry) {
        return VaultView.getIcon(entry);
    }

    escape(str) {
        return escapeHtml(str);
    }
}
