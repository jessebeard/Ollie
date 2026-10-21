import { isSafeHttpUrl } from '../../../../src/utils/url-safety.js';
import { escapeHtml } from '../../../../src/utils/escape-html.js';
import { CardFlowAutomata, EdgeState, ProjectionState, FlowLifecycle } from './card-flow-automata.js';

export { CardFlowAutomata, EdgeState, ProjectionState, FlowLifecycle };

export class VaultView {
    constructor(element, eventBus) {
        this.element = element;
        this.events = eventBus;
        this.selectedId = null;
        this.viewMode = 'sidebar';
        this.currentEntries = [];
        this.automata = new CardFlowAutomata({ gridElement: element, scrollContainer: element });
        this._resizeRaf = null;

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            this._resizeHandler = () => {
                if (this._resizeRaf && typeof cancelAnimationFrame === 'function') {
                    cancelAnimationFrame(this._resizeRaf);
                }
                if (typeof requestAnimationFrame === 'function') {
                    this._resizeRaf = requestAnimationFrame(() => {
                        this._resizeRaf = null;
                        this.reanchor();
                    });
                } else {
                    this.reanchor();
                }
            };
            window.addEventListener('resize', this._resizeHandler);
        }
    }

    setViewMode(mode) {
        this.viewMode = mode;
        if (this.element && typeof this.element.querySelectorAll === 'function') {
            const cards = this.element.querySelectorAll('.password-card');
            for (const card of cards) {
                const isSelected = card.getAttribute('data-entry-id') === this.selectedId;
                if (isSelected && (mode === 'card' || mode === 'both')) {
                    card.classList.remove(
                        EdgeState.LEFT, EdgeState.RIGHT, EdgeState.INTERIOR, EdgeState.SINGLE,
                        ProjectionState.DOWN, ProjectionState.UP
                    );
                    card.classList.add('is-expanded');
                    const colCount = this.automata.getColumnCount(this.element);
                    const colIndex = this.automata.getCardColumnIndex(card, this.element, colCount);
                    const edgeState = this.automata.resolveEdgeState(colIndex, colCount);
                    const projectionState = this.automata.resolveProjectionState(card, this._getScrollContainer(card), this.element);
                    card.classList.add(edgeState, projectionState);
                    card.setAttribute('data-edge-state', edgeState.replace('edge-', ''));
                    card.setAttribute('data-projection-state', projectionState.replace('project-', ''));
                } else {
                    card.classList.remove('is-expanded', EdgeState.LEFT, EdgeState.RIGHT, EdgeState.INTERIOR, EdgeState.SINGLE, ProjectionState.DOWN, ProjectionState.UP);
                    card.removeAttribute('data-edge-state');
                    card.removeAttribute('data-projection-state');
                }
            }
        }
    }

    selectEntry(id, toggle = true) {
        const previousId = this.selectedId;
        const previousCard = (previousId && this.element && typeof this.element.querySelector === 'function')
            ? this.element.querySelector(`[data-entry-id="${previousId}"]`)
            : null;

        let nextId = id;
        if (toggle && this.selectedId === id) {
            nextId = null;
        }
        this.selectedId = nextId;

        const targetCard = (nextId && this.element && typeof this.element.querySelector === 'function')
            ? this.element.querySelector(`[data-entry-id="${nextId}"]`)
            : null;

        // Transition through the CardFlowAutomata state machine
        const transitionResult = this.automata.transition({
            selectedId: nextId,
            viewMode: this.viewMode,
            gridContainer: this.element,
            previousSelectedCard: previousCard,
            targetCard
        });

        // Also ensure all other unselected cards have selection/expansion removed
        if (this.element && typeof this.element.querySelectorAll === 'function') {
            const cards = this.element.querySelectorAll('.password-card');
            for (const card of cards) {
                const cardId = card.getAttribute('data-entry-id');
                if (cardId !== this.selectedId) {
                    card.classList.remove('is-selected', 'is-expanded');
                    card.setAttribute('aria-selected', 'false');
                }
            }
        }

        if (this.events) {
            this.events.emit('entry-selected', {
                id: this.selectedId,
                viewMode: this.viewMode,
                automata: this.automata,
                targetCard,
                transitionResult
            });
        }

        return transitionResult;
    }

    _getScrollContainer(el) {
        return this.automata.getScrollContainer(el);
    }

    reanchor() {
        if (!this.selectedId) return null;
        return this.automata.reanchor({
            selectedId: this.selectedId,
            gridContainer: this.element,
            viewMode: this.viewMode
        });
    }

    destroy() {
        if (this._resizeHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this._resizeRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._resizeRaf);
            this._resizeRaf = null;
        }
    }

    clearSelection() {
        this.selectEntry(null, false);
    }

    render(entries) {
        this.currentEntries = entries || [];
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
            selectedId: this.selectedId,
            viewMode: this.viewMode,
            onSelect: (id) => this.selectEntry(id),
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
        div.setAttribute('tabindex', '0');

        const isSelected = handlers.selectedId && handlers.selectedId === entry.id;
        if (isSelected) {
            div.classList.add('is-selected');
            div.setAttribute('aria-selected', 'true');
            if (handlers.viewMode === 'card' || handlers.viewMode === 'both') {
                div.classList.add('is-expanded');
            }
        } else {
            div.setAttribute('aria-selected', 'false');
        }

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
            <div class="card-tags" aria-label="Tags">
                ${(entry.tags || []).map(t => `<span class="tag">${escape(t)}</span>`).join('')}
            </div>
            <div class="card-expanded-content">
                <div class="totp-slot"></div>
                <div class="expanded-notes-slot"></div>
                <div class="expanded-meta-slot"></div>
            </div>
            <div class="card-actions">
                <button class="btn-copy" aria-label="Copy password for ${escape(entry.title || '')}">Copy Pass</button>
                <button class="btn-launch" data-url="${escape(entry.url || '')}" ${hasUrl ? '' : 'disabled'} aria-label="${hasUrl ? 'Launch URL for ' + escape(entry.title || '') : 'No URL provided'}">Launch</button>
            </div>
        `;

        div.addEventListener('click', (e) => {
            if (e.target && typeof e.target.closest === 'function') {
                if (e.target.closest('button, a, input, select, textarea, .totp-code')) {
                    return;
                }
            }
            if (handlers.onSelect) {
                handlers.onSelect(entry.id);
            }
        });

        div.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                if (e.target === div && handlers.onSelect) {
                    e.preventDefault();
                    handlers.onSelect(entry.id);
                }
            }
        });

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
