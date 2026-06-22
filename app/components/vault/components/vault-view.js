
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
        if (!url) return 'about:blank';
        try {
            // Strip all control characters (\x00-\x1f, \x7f) to prevent bypasses,
            // but preserve spaces (\x20) within the URL itself so legitimate URLs aren't corrupted.
            let cleanUrl = String(url).replace(/[\x00-\x1f\x7f]/g, '');
            // Strip leading/trailing spaces explicitly (which URL constructor handles anyway, but good practice)
            cleanUrl = cleanUrl.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');

            // Use dummy base to correctly parse schemeless URLs (e.g. example.com)
            const parsed = new URL(cleanUrl, 'https://dummy.base');
            const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
            if (dangerousProtocols.includes(parsed.protocol.toLowerCase())) {
                return 'about:blank';
            }
            return cleanUrl;
        } catch (e) {
            return 'about:blank';
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
