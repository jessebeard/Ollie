
export class VaultView {
    constructor(element, eventBus) {
        this.element = element;
        this.events = eventBus;
        this.activeTags = new Set();
    }

    render(entries) {
        if (!entries || entries.length === 0) {
            this.renderEmpty();
            return;
        }

        const filtered = this.filterEntries(entries);
        this.renderList(filtered);
    }

    renderEmpty() {
        this.element.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No Items Found</h3>
                <p>Try clearing filters or add a new password.</p>
            </div>
        `;
    }

    filterEntries(entries) {
        if (this.activeTags.size === 0) return entries;
        return entries.filter(e =>
            e.tags && Array.from(this.activeTags).every(tag => e.tags.includes(tag))
        );
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
        div.innerHTML = `
            <div class="card-header">
                <div class="card-icon">${this.getIcon(entry)}</div>
                <div class="card-title-group">
                    <h4>${this.escape(entry.title)}</h4>
                    <span class="card-subtitle">${this.escape(entry.username)}</span>
                </div>
                <button class="btn-icon more-btn">⋮</button>
            </div>
            <div class="card-tags">
                ${(entry.tags || []).map(t => `<span class="tag">${this.escape(t)}</span>`).join('')}
            </div>
            <div class="card-actions">
                <button class="btn-copy" data-val="${this.escape(entry.password)}">Copy Pass</button>
                <button class="btn-launch" data-url="${this.escape(entry.url)}">Launch</button>
            </div>
        `;

        div.querySelector('.more-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.events.emit('edit-entry', entry);
        });

        div.querySelector('.btn-copy').addEventListener('click', (e) => {
            e.stopPropagation();
            this.events.emit('copy-password', entry.password);
        });

        div.querySelector('.btn-launch').addEventListener('click', (e) => {
            if (entry.url) window.open(entry.url, '_blank');
        });

        return div;
    }

    getIcon(entry) {
        // Simple heuristic for icon
        return '🔑';
    }

    escape(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
