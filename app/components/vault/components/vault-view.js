
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
        div.innerHTML = `
            <div class="card-header">
                <div class="card-icon" aria-hidden="true">${this.getIcon(entry)}</div>
                <div class="card-title-group">
                    <h4>${this.escape(entry.title)}</h4>
                    <span class="card-subtitle">${this.escape(entry.username)}</span>
                </div>
                <button class="btn-icon more-btn" aria-label="Edit ${this.escape(entry.title)}">⋮</button>
            </div>
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

        div.querySelector('.btn-launch').addEventListener('click', (e) => {
            if (entry.url) {
                const safeUrl = this.sanitizeUrl(entry.url);
                window.open(safeUrl, '_blank');
            }
        });

        return div;
    }

    getIcon(entry) {
        // Simple heuristic for icon
        return '🔑';
    }

    sanitizeUrl(url) {
        try {
            // Strip out whitespace and control characters which could bypass simple string checks
            const cleanUrl = String(url).replace(/[\x00-\x20]/g, '');
            const parsed = new URL(cleanUrl);
            if (['javascript:', 'data:', 'vbscript:'].includes(parsed.protocol)) {
                return 'about:blank';
            }
            return url;
        } catch (e) {
            // If URL constructor fails, fall back to string checking
            const str = String(url).replace(/[\x00-\x20]/g, '').toLowerCase();
            if (str.startsWith('javascript:') || str.startsWith('data:') || str.startsWith('vbscript:')) {
                return 'about:blank';
            }
            return url;
        }
    }

    escape(str) {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
