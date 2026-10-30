import { describe, it, expect } from '../../utils/test-runner.js';
import { CardFlowAutomata, EdgeState, ProjectionState, FlowLifecycle } from '../../../app/components/vault/components/card-flow-automata.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';

// Ensure mock DOM element support in Node.js
if (typeof document === 'undefined') {
    class MockElement {
        constructor(tagName) {
            this.tagName = tagName.toUpperCase();
            this.className = '';
            this.classList = {
                _classes: new Set(),
                add: (...c) => c.forEach(x => this.classList._classes.add(x)),
                remove: (...c) => c.forEach(x => this.classList._classes.delete(x)),
                contains: (x) => Boolean(this.classList._classes.has(x) || (this.className && this.className.split(/\s+/).includes(x))),
                toggle: (x, force) => {
                    if (force !== undefined) {
                        if (force) this.classList._classes.add(x); else this.classList._classes.delete(x);
                    } else {
                        if (this.classList._classes.has(x)) this.classList._classes.delete(x); else this.classList._classes.add(x);
                    }
                }
            };
            this.style = {
                setProperty: (prop, val) => { this.style[prop] = String(val); },
                removeProperty: (prop) => { delete this.style[prop]; },
                getPropertyValue: (prop) => this.style[prop] || ''
            };
            this.attributes = {};
            this.dataset = {};
            this.children = [];
            this.scrollTop = 0;
            this.offsetTop = 0;
            this.offsetLeft = 0;
            this._rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
            this._handlers = {};
            this.addEventListener = (evt, h) => {
                this._handlers[evt] = this._handlers[evt] || [];
                this._handlers[evt].push(h);
            };
            this.removeEventListener = (evt, h) => {
                if (this._handlers[evt]) {
                    this._handlers[evt] = this._handlers[evt].filter(fn => fn !== h);
                }
            };
        }

        getBoundingClientRect() {
            return this._rect;
        }

        setAttribute(name, val) {
            this.attributes[name] = String(val);
            if (name.startsWith('data-')) {
                const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                this.dataset[key] = String(val);
            }
        }

        getAttribute(name) {
            return this.attributes[name] !== undefined ? this.attributes[name] : null;
        }

        removeAttribute(name) {
            delete this.attributes[name];
            if (name.startsWith('data-')) {
                const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                delete this.dataset[key];
            }
        }

        appendChild(child) {
            if (child) {
                child.parentNode = this;
                this.children.push(child);
            }
            return child;
        }

        querySelector(sel) {
            const match = (el) => {
                if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
                if (sel.startsWith('#')) return el.getAttribute('id') === sel.slice(1);
                if (sel.startsWith('[') && sel.includes('=')) {
                    const m = sel.match(/\[([a-zA-Z0-9-]+)="([^"]+)"\]/);
                    if (m) return el.getAttribute(m[1]) === m[2];
                }
                return el.tagName && el.tagName.toLowerCase() === sel.toLowerCase();
            };
            const search = (node) => {
                for (const child of node.children || []) {
                    if (match(child)) return child;
                    const found = search(child);
                    if (found) return found;
                }
                return null;
            };
            return search(this);
        }

        querySelectorAll(sel) {
            const results = [];
            const match = (el) => {
                if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
                if (sel.startsWith('[')) {
                    const m = sel.match(/\[([a-zA-Z0-9-]+)="([^"]+)"\]/);
                    if (m) return el.getAttribute(m[1]) === m[2];
                }
                return el.tagName && el.tagName.toLowerCase() === sel.toLowerCase();
            };
            const search = (node) => {
                for (const child of node.children || []) {
                    if (match(child)) results.push(child);
                    search(child);
                }
            };
            search(this);
            return results;
        }
    }

    global.document = global.document || {
        createElement: (tag) => new MockElement(tag)
    };
}

describe('CardFlowAutomata (Spatial State Machine & Scroll Anchoring)', () => {
    it('initializes in IDLE state and resolves edge states correctly', () => {
        const automata = new CardFlowAutomata();
        expect(automata.state).toBe(FlowLifecycle.IDLE);

        // Single column layout
        expect(automata.resolveEdgeState(0, 1)).toBe(EdgeState.SINGLE);

        // 2-column layout (typical in "Both" mode)
        expect(automata.resolveEdgeState(0, 2)).toBe(EdgeState.LEFT);
        expect(automata.resolveEdgeState(1, 2)).toBe(EdgeState.RIGHT);

        // 3-column layout
        expect(automata.resolveEdgeState(0, 3)).toBe(EdgeState.LEFT);
        expect(automata.resolveEdgeState(1, 3)).toBe(EdgeState.INTERIOR);
        expect(automata.resolveEdgeState(2, 3)).toBe(EdgeState.RIGHT);
    });

    it('determines projection state based on card position in physical card stack', () => {
        const grid = document.createElement('div');
        grid.classList.add('password-grid');

        // Row 1
        const topCard1 = document.createElement('div');
        topCard1.classList.add('password-card');
        topCard1.offsetTop = 0;
        grid.appendChild(topCard1);

        const topCard2 = document.createElement('div');
        topCard2.classList.add('password-card');
        topCard2.offsetTop = 0;
        grid.appendChild(topCard2);

        // Row 2 (Physical bottom of the stack)
        const bottomCard1 = document.createElement('div');
        bottomCard1.classList.add('password-card');
        bottomCard1.offsetTop = 160;
        grid.appendChild(bottomCard1);

        const bottomCard2 = document.createElement('div');
        bottomCard2.classList.add('password-card');
        bottomCard2.offsetTop = 160;
        grid.appendChild(bottomCard2);

        const automata = new CardFlowAutomata({ gridElement: grid });

        // Physical bottom cards project UP, earlier rows project DOWN
        expect(automata.resolveProjectionState(topCard1, null, grid)).toBe(ProjectionState.DOWN);
        expect(automata.resolveProjectionState(topCard2, null, grid)).toBe(ProjectionState.DOWN);
        expect(automata.resolveProjectionState(bottomCard1, null, grid)).toBe(ProjectionState.UP);
        expect(automata.resolveProjectionState(bottomCard2, null, grid)).toBe(ProjectionState.UP);
    });

    it('transitions card selection, applies edge/projection classes, and records attributes', () => {
        const grid = document.createElement('div');
        grid.classList.add('password-grid');

        const card1 = document.createElement('div');
        card1.classList.add('password-card');
        card1.setAttribute('data-entry-id', 'card-1');
        card1.offsetTop = 0;
        card1.getBoundingClientRect = () => ({ top: 100, bottom: 220, height: 120 });
        grid.appendChild(card1);

        const card2 = document.createElement('div');
        card2.classList.add('password-card');
        card2.setAttribute('data-entry-id', 'card-2');
        card2.offsetTop = 0;
        card2.getBoundingClientRect = () => ({ top: 100, bottom: 220, height: 120 });
        grid.appendChild(card2);

        const automata = new CardFlowAutomata({ gridElement: grid });

        // Select card 2 (which is on the right edge of a 2-col row)
        const result = automata.transition({
            selectedId: 'card-2',
            viewMode: 'both',
            gridContainer: grid,
            targetCard: card2
        });

        expect(result.edgeState).toBe(EdgeState.RIGHT);
        expect(result.projectionState).toBe(ProjectionState.DOWN);
        expect(card2.classList.contains('is-selected')).toBe(true);
        expect(card2.classList.contains('is-expanded')).toBe(true);
        expect(card2.classList.contains('edge-right')).toBe(true);
        expect(card2.getAttribute('data-edge-state')).toBe('right');
        expect(card2.getAttribute('data-projection-state')).toBe('down');
    });

    it('cleans up previous card states when switching cards', () => {
        const grid = document.createElement('div');
        grid.classList.add('password-grid');

        const cardA = document.createElement('div');
        cardA.classList.add('password-card', 'is-selected', 'is-expanded', 'edge-left', 'project-down');
        cardA.setAttribute('data-entry-id', 'card-a');
        cardA.setAttribute('aria-selected', 'true');
        cardA.setAttribute('data-edge-state', 'left');
        cardA.setAttribute('data-projection-state', 'down');
        grid.appendChild(cardA);

        const cardB = document.createElement('div');
        cardB.classList.add('password-card');
        cardB.setAttribute('data-entry-id', 'card-b');
        cardB.getBoundingClientRect = () => ({ top: 300, bottom: 420, height: 120 });
        grid.appendChild(cardB);

        const automata = new CardFlowAutomata({ gridElement: grid });
        automata.transition({
            selectedId: 'card-b',
            viewMode: 'both',
            gridContainer: grid,
            previousSelectedCard: cardA,
            targetCard: cardB
        });

        // Assert Card A is fully cleaned up
        expect(cardA.classList.contains('is-selected')).toBe(false);
        expect(cardA.classList.contains('is-expanded')).toBe(false);
        expect(cardA.classList.contains('edge-left')).toBe(false);
        expect(cardA.getAttribute('aria-selected')).toBe('false');
        expect(cardA.getAttribute('data-edge-state')).toBe(null);

        // Assert Card B is now active
        expect(cardB.classList.contains('is-selected')).toBe(true);
        expect(cardB.classList.contains('is-expanded')).toBe(true);
    });

    it('guarantees zero-drift anchoring when selecting an element below an expanded card', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        container.scrollTop = 50;
        container.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800 });

        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        container.appendChild(grid);

        // Card A is above and currently expanded (taking 300px)
        const cardA = document.createElement('div');
        cardA.classList.add('password-card', 'is-selected', 'is-expanded');
        cardA.setAttribute('data-entry-id', 'card-a');
        grid.appendChild(cardA);

        // Card B is below Card A at initial viewport top = 450px
        const cardB = document.createElement('div');
        cardB.classList.add('password-card');
        cardB.setAttribute('data-entry-id', 'card-b');
        grid.appendChild(cardB);

        const cardBCoordTop = 450;
        cardB.getBoundingClientRect = () => ({
            top: cardBCoordTop,
            bottom: cardBCoordTop + 140,
            left: 0,
            right: 300,
            width: 300,
            height: 140
        });

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });

        // Phase 1: User clicks Card B below Card A.
        // Before transition: cardBCoordTop = 450.
        // Upon collapsing Card A: layout shifts Card B upward by 160px (top becomes 290).
        // Automata transition measures this reflow:
        let phase = 0;
        cardB.getBoundingClientRect = () => {
            phase++;
            // Call 1: initial anchor measurement (top = 450)
            // Call 2: after Card A collapsed & Card B expanded (top = 290)
            return {
                top: phase === 1 ? 450 : 290,
                bottom: (phase === 1 ? 450 : 290) + 280,
                left: 0,
                right: 300,
                width: 300,
                height: 280
            };
        };

        const result = automata.transition({
            selectedId: 'card-b',
            viewMode: 'both',
            gridContainer: grid,
            previousSelectedCard: cardA,
            targetCard: cardB
        });

        // deltaY = 290 - 450 = -160.
        // Container scrollTop was 50, now adjusted by -160 (or clamped/compensated).
        // 50 + (-160) = -110.
        expect(result.deltaY).toBe(-160);
        expect(container.scrollTop).toBe(-110);

        // Phase 2: Asynchronous settlement (notes decrypted, detailPane opened).
        // Suppose secondary reflow drifted cardB by another +25px.
        cardB.getBoundingClientRect = () => ({
            top: 475, // 25px drift from original 450 anchor
            bottom: 755,
            left: 0,
            right: 300,
            width: 300,
            height: 280
        });

        const settleResult = automata.settle(cardB, container);
        expect(settleResult.settled).toBe(true);
        expect(settleResult.driftY).toBe(25);
        // Container scrollTop adjusted by +25: -110 + 25 = -85
        expect(container.scrollTop).toBe(-85);
        expect(automata.state).toBe(FlowLifecycle.STABILIZED);
    });

    it('VaultView integration emits automata and transitionResult on selection', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');

        let emittedEvent = null;
        const fakeEvents = {
            emit: (name, payload) => {
                if (name === 'entry-selected') emittedEvent = payload;
            }
        };

        const view = new VaultView(container, fakeEvents);
        view.viewMode = 'both';

        const card = document.createElement('div');
        card.classList.add('password-card');
        card.setAttribute('data-entry-id', 'entry-42');
        card.getBoundingClientRect = () => ({ top: 200, bottom: 350, left: 0, right: 300, width: 300, height: 150 });
        container.appendChild(card);

        view.selectEntry('entry-42');

        expect(emittedEvent).not.toBe(null);
        expect(emittedEvent.id).toBe('entry-42');
        expect(emittedEvent.automata).toBe(view.automata);
        expect(emittedEvent.transitionResult).toBeDefined();
        expect(card.classList.contains('is-expanded')).toBe(true);
    });

    it('tracks spatial displacement and maintains zero-drift scroll anchoring without sliding', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        container.scrollTop = 0;
        container.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 600, width: 600, height: 800 });

        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 600;
        grid.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 600, width: 600, height: 800 });
        container.appendChild(grid);

        // Card A is expanded 2x2
        const cardA = document.createElement('div');
        cardA.classList.add('password-card', 'is-selected', 'is-expanded', 'edge-left');
        cardA.setAttribute('data-entry-id', 'card-a');
        grid.appendChild(cardA);

        // Card B was rendered in the right column at left = 310px while Card A was expanded
        const cardB = document.createElement('div');
        cardB.classList.add('password-card');
        cardB.setAttribute('data-entry-id', 'card-b');
        grid.appendChild(cardB);

        // Card C is in the row below Card B so Card B is an interior/middle-row card (projects DOWN)
        const cardC = document.createElement('div');
        cardC.classList.add('password-card');
        cardC.setAttribute('data-entry-id', 'card-c');
        cardC.offsetTop = 700;
        cardC.getBoundingClientRect = () => ({ top: 700, bottom: 840, left: 0, right: 280, width: 280, height: 140 });
        grid.appendChild(cardC);

        // First call: anchorRect (when user clicks Card B, it is at left = 310, top = 400)
        // Second call: after Card A collapsed and Card B expanded, Card B is placed at left = 0, top = 250
        let callCount = 0;
        cardB.getBoundingClientRect = () => {
            callCount++;
            if (callCount === 1) {
                return { top: 400, bottom: 540, left: 310, right: 590, width: 280, height: 140 };
            }
            return { top: 250, bottom: 530, left: 0, right: 590, width: 590, height: 280 };
        };

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });
        const result = automata.transition({
            selectedId: 'card-b',
            viewMode: 'both',
            gridContainer: grid,
            previousSelectedCard: cardA,
            targetCard: cardB
        });

        // Vertical displacement anchored: 250 - 400 = -150 -> container.scrollTop becomes -150
        expect(result.deltaY).toBe(-150);
        expect(container.scrollTop).toBe(-150);

        // Horizontal displacement detected: 310 - 0 = +310px
        expect(result.deltaX).toBe(310);

        // Does NOT apply translateX sliding animation: card expands from its spatial origin without horizontal jitter
        expect(cardB.style['--card-initial-transform']).toBeUndefined();
    });

    it('collapses previous card BEFORE spatial column resolution so target is not misclassified', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 500;
        grid.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 500, width: 500, height: 800 });
        container.appendChild(grid);

        const cardA = document.createElement('div');
        cardA.classList.add('password-card', 'is-selected', 'is-expanded', 'edge-left');
        cardA.setAttribute('data-entry-id', 'card-a');
        grid.appendChild(cardA);

        const cardB = document.createElement('div');
        cardB.classList.add('password-card');
        cardB.setAttribute('data-entry-id', 'card-b');
        grid.appendChild(cardB);

        // When cardA is collapsed, cardB is at index 1 in the 2-col grid (col 1 -> edge-right)
        cardB.getBoundingClientRect = () => ({ top: 200, bottom: 340, left: 260, right: 500, width: 240, height: 140 });

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });
        const result = automata.transition({
            selectedId: 'card-b',
            viewMode: 'both',
            gridContainer: grid,
            previousSelectedCard: cardA,
            targetCard: cardB
        });

        // Card A must be collapsed
        expect(cardA.classList.contains('is-expanded')).toBe(false);
        expect(cardA.classList.contains('is-selected')).toBe(false);

        // Card B must have edge-right applied
        expect(result.edgeState).toBe(EdgeState.RIGHT);
        expect(cardB.classList.contains('edge-right')).toBe(true);
        expect(cardB.getAttribute('data-edge-state')).toBe('right');
    });

    it('pins explicit gridRow and gridColumn on expanded card and clears them on previous card', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 600;
        grid.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 600, width: 600, height: 800 });
        container.appendChild(grid);

        const cardA = document.createElement('div');
        cardA.classList.add('password-card', 'is-selected', 'is-expanded', 'edge-left');
        cardA.style.gridRow = '1 / span 2';
        cardA.style.gridColumn = '1 / span 2';
        cardA.setAttribute('data-entry-id', 'card-a');
        grid.appendChild(cardA);

        const cardB = document.createElement('div');
        cardB.classList.add('password-card');
        cardB.setAttribute('data-entry-id', 'card-b');
        cardB.offsetTop = 324;
        cardB.getBoundingClientRect = () => ({ top: 324, bottom: 464, left: 0, right: 290, width: 290, height: 140 });
        grid.appendChild(cardB);

        // Card C below Card B ensures Card B is not on the bottom row (so it projects down to row 3)
        const cardC = document.createElement('div');
        cardC.classList.add('password-card');
        cardC.setAttribute('data-entry-id', 'card-c');
        cardC.offsetTop = 500;
        cardC.getBoundingClientRect = () => ({ top: 500, bottom: 640, left: 0, right: 290, width: 290, height: 140 });
        grid.appendChild(cardC);

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });
        automata.transition({
            selectedId: 'card-b',
            viewMode: 'both',
            gridContainer: grid,
            previousSelectedCard: cardA,
            targetCard: cardB
        });

        // Previous card A should have inline gridRow and gridColumn cleared
        expect(cardA.style.gridRow).toBe('');
        expect(cardA.style.gridColumn).toBe('');

        // Card B should have explicit gridRow and gridColumn pinned
        expect(cardB.style.gridRow).toBe('3 / span 2');
        expect(cardB.style.gridColumn).toBe('1 / span 2');
    });

    it('pins explicit gridRow with project-up offset when card is at bottom of the stack', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        container.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 600, width: 600, height: 800 });

        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 600;
        grid.getBoundingClientRect = () => ({ top: 0, bottom: 800, left: 0, right: 600, width: 600, height: 800 });
        container.appendChild(grid);

        // Row 1
        const cardA = document.createElement('div');
        cardA.classList.add('password-card');
        cardA.offsetTop = 0;
        cardA.getBoundingClientRect = () => ({ top: 0, bottom: 140, left: 0, right: 280, width: 280, height: 140 });
        grid.appendChild(cardA);

        const cardB = document.createElement('div');
        cardB.classList.add('password-card');
        cardB.offsetTop = 0;
        cardB.getBoundingClientRect = () => ({ top: 0, bottom: 140, left: 300, right: 580, width: 280, height: 140 });
        grid.appendChild(cardB);

        // Row 2 (Bottom Row of physical stack)
        const cardC = document.createElement('div');
        cardC.classList.add('password-card');
        cardC.setAttribute('data-entry-id', 'card-c');
        cardC.offsetTop = 160;
        cardC.getBoundingClientRect = () => ({ top: 160, bottom: 300, left: 0, right: 280, width: 280, height: 140 });
        grid.appendChild(cardC);

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });
        const result = automata.transition({
            selectedId: 'card-c',
            viewMode: 'both',
            gridContainer: grid,
            targetCard: cardC
        });

        expect(result.projectionState).toBe(ProjectionState.UP);
        // rowIndex = 2 -> gridRow = 2 / span 2 pinned naturally
        expect(cardC.style.gridRow).toBe('2 / span 2');
        expect(cardC.style.gridColumn).toBe('1 / span 2');
    });

    it('identifies bottom-row cards via isBottomRow and projects them UP', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        // Very tall container so clearanceBottom is huge (1500px)
        container.getBoundingClientRect = () => ({ top: 0, bottom: 2000, left: 0, right: 600, width: 600, height: 2000 });

        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 600;
        grid.getBoundingClientRect = () => ({ top: 0, bottom: 500, left: 0, right: 600, width: 600, height: 500 });
        container.appendChild(grid);

        // Row 1
        const card1 = document.createElement('div');
        card1.classList.add('password-card');
        card1.setAttribute('data-entry-id', 'c1');
        card1.offsetTop = 0;
        card1.getBoundingClientRect = () => ({ top: 0, bottom: 140, left: 0, right: 290, width: 290, height: 140 });
        grid.appendChild(card1);

        const card2 = document.createElement('div');
        card2.classList.add('password-card');
        card2.setAttribute('data-entry-id', 'c2');
        card2.offsetTop = 0;
        card2.getBoundingClientRect = () => ({ top: 0, bottom: 140, left: 300, right: 590, width: 290, height: 140 });
        grid.appendChild(card2);

        // Row 2 (Bottom Row)
        const card3 = document.createElement('div');
        card3.classList.add('password-card');
        card3.setAttribute('data-entry-id', 'c3');
        card3.offsetTop = 160;
        card3.getBoundingClientRect = () => ({ top: 160, bottom: 300, left: 0, right: 290, width: 290, height: 140 });
        grid.appendChild(card3);

        const card4 = document.createElement('div');
        card4.classList.add('password-card');
        card4.setAttribute('data-entry-id', 'c4');
        card4.offsetTop = 160;
        card4.getBoundingClientRect = () => ({ top: 160, bottom: 300, left: 300, right: 590, width: 290, height: 140 });
        grid.appendChild(card4);

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });

        expect(automata.isBottomRow(card1, grid)).toBe(false);
        expect(automata.isBottomRow(card2, grid)).toBe(false);
        expect(automata.isBottomRow(card3, grid)).toBe(true);
        expect(automata.isBottomRow(card4, grid)).toBe(true);

        // Even though container has huge bottom clearance (1700px), bottom-row cards must resolve to UP!
        expect(automata.resolveProjectionState(card1, container, grid)).toBe(ProjectionState.DOWN);
        expect(automata.resolveProjectionState(card3, container, grid)).toBe(ProjectionState.UP);
        expect(automata.resolveProjectionState(card4, container, grid)).toBe(ProjectionState.UP);

        // When card4 is selected in transition
        const res = automata.transition({
            selectedId: 'c4',
            viewMode: 'both',
            gridContainer: grid,
            targetCard: card4
        });
        expect(res.projectionState).toBe(ProjectionState.UP);
        expect(card4.classList.contains('project-up')).toBe(true);
        expect(card4.getAttribute('data-projection-state')).toBe('up');
    });

    it('anchors bottom edge of upward-projecting cards stationary during transition and settlement', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        container.scrollTop = 0;
        container.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800 });

        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 600;
        grid.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800 });
        container.appendChild(grid);

        // Row 1
        const card1 = document.createElement('div');
        card1.classList.add('password-card');
        card1.offsetTop = 0;
        grid.appendChild(card1);

        // Row 2 (Bottom Row)
        const card2 = document.createElement('div');
        card2.classList.add('password-card');
        card2.setAttribute('data-entry-id', 'card-bottom');
        card2.offsetTop = 200;

        // Initial unexpanded rect: bottom is at 340
        const currentRect = { top: 200, bottom: 340, left: 0, right: 290, width: 290, height: 140 };
        card2.getBoundingClientRect = () => currentRect;
        grid.appendChild(card2);

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });

        // When transition runs, target expands upward and its bottom moves slightly to 355
        // Anchor delta should adjust scrollTop by (355 - 340 = 15)
        const origTransition = automata.transition.bind(automata);
        // Simulate expansion enlarging the card's height from 140 to 300, shifting bottom
        let expanded = false;
        card2.getBoundingClientRect = () => {
            if (expanded) {
                return { top: 55, bottom: 355, left: 0, right: 600, width: 600, height: 300 };
            }
            return { top: 200, bottom: 340, left: 0, right: 290, width: 290, height: 140 };
        };

        const origAdd = card2.classList.add.bind(card2.classList);
        card2.classList.add = (...cls) => {
            origAdd(...cls);
            if (cls.includes('is-expanded')) {
                expanded = true;
            }
        };

        const result = automata.transition({
            selectedId: 'card-bottom',
            viewMode: 'both',
            gridContainer: grid,
            targetCard: card2
        });

        expect(result.projectionState).toBe(ProjectionState.UP);
        // Bottom was at 340, newRect.bottom was 355 -> deltaY was 15 -> container.scrollTop += 15
        expect(container.scrollTop).toBe(15);

        // Settle check
        // If content expands further and pushes bottom to 360, settle should detect driftY = 360 - 340 = 20
        card2.getBoundingClientRect = () => ({ top: 40, bottom: 360, left: 0, right: 600, width: 600, height: 300 });
        const settleRes = automata.settle(card2, container);
        expect(settleRes.settled).toBe(true);
        expect(settleRes.driftY).toBe(20);
        // container.scrollTop increased by driftY (15 + 20 = 35)
        expect(container.scrollTop).toBe(35);
    });

    it('handles non-square bottom layouts where cards from bottom two rows appear on the bottom', () => {
        const grid = document.createElement('div');
        grid.classList.add('password-grid');

        // 3-column layout with 7 cards total:
        // Row 1: cards 0, 1, 2
        // Row 2: cards 3, 4, 5
        // Row 3: card 6 (only in col 0)
        const cards = [];
        for (let i = 0; i < 7; i++) {
            const card = document.createElement('div');
            card.classList.add('password-card');
            card.setAttribute('data-entry-id', `entry-${i}`);
            const col = i % 3;
            const row = Math.floor(i / 3);
            card.offsetTop = row * 160;
            card.offsetLeft = col * 200;
            card.getBoundingClientRect = () => ({
                top: row * 160,
                bottom: row * 160 + 140,
                left: col * 200,
                right: col * 200 + 180,
                width: 180,
                height: 140
            });
            grid.appendChild(card);
            cards.push(card);
        }

        const automata = new CardFlowAutomata({ gridElement: grid });

        // Row 1 cards: top row -> project DOWN
        expect(automata.isBottomRow(cards[0], grid)).toBe(false);
        expect(automata.isBottomRow(cards[1], grid)).toBe(false);
        expect(automata.isBottomRow(cards[2], grid)).toBe(false);
        expect(automata.resolveProjectionState(cards[0], null, grid)).toBe(ProjectionState.DOWN);
        expect(automata.resolveProjectionState(cards[1], null, grid)).toBe(ProjectionState.DOWN);
        expect(automata.resolveProjectionState(cards[2], null, grid)).toBe(ProjectionState.DOWN);

        // Row 2 cards:
        // card 3 has card 6 below it in col 0 -> NOT bottom edge -> projects DOWN
        expect(automata.isBottomRow(cards[3], grid)).toBe(false);
        expect(automata.resolveProjectionState(cards[3], null, grid)).toBe(ProjectionState.DOWN);

        // card 4 is on col 1, row 2 (no card below it in col 1) -> IS bottom edge -> projects UP
        expect(automata.isBottomRow(cards[4], grid)).toBe(true);
        expect(automata.resolveProjectionState(cards[4], null, grid)).toBe(ProjectionState.UP);

        // card 5 is on col 2, row 2 (no card below it in col 2) -> IS bottom edge -> projects UP
        expect(automata.isBottomRow(cards[5], grid)).toBe(true);
        expect(automata.resolveProjectionState(cards[5], null, grid)).toBe(ProjectionState.UP);

        // Row 3 card:
        // card 6 is on bottom row -> IS bottom edge -> projects UP
        expect(automata.isBottomRow(cards[6], grid)).toBe(true);
        expect(automata.resolveProjectionState(cards[6], null, grid)).toBe(ProjectionState.UP);

        // Transition card 4 (second-to-last row on non-square bottom):
        // It must expand UP (into row 1) and occupy gridRow: 1 / span 2
        const res = automata.transition({
            selectedId: 'entry-4',
            viewMode: 'both',
            gridContainer: grid,
            targetCard: cards[4]
        });
        expect(res.projectionState).toBe(ProjectionState.UP);
        expect(cards[4].style.gridRow).toBe('2 / span 2');
        expect(cards[4].classList.contains('project-up')).toBe(true);
        expect(cards[4].getAttribute('data-projection-state')).toBe('up');
    });

    it('treats bottom row cards as top when bottom is also top (single row or top row cards)', () => {
        const grid = document.createElement('div');
        grid.classList.add('password-grid');

        // Single row with 2 cards in a 2-col grid
        const cardA = document.createElement('div');
        cardA.classList.add('password-card');
        cardA.offsetTop = 0;
        cardA.offsetLeft = 0;
        grid.appendChild(cardA);

        const cardB = document.createElement('div');
        cardB.classList.add('password-card');
        cardB.offsetTop = 0;
        cardB.offsetLeft = 250;
        grid.appendChild(cardB);

        const automata = new CardFlowAutomata({ gridElement: grid });

        // When bottom is also top, both cards must be treated as top (project DOWN)
        expect(automata.isBottomRow(cardA, grid)).toBe(false);
        expect(automata.isBottomRow(cardB, grid)).toBe(false);
        expect(automata.resolveProjectionState(cardA, null, grid)).toBe(ProjectionState.DOWN);
        expect(automata.resolveProjectionState(cardB, null, grid)).toBe(ProjectionState.DOWN);

        // 2-row layout where top row has cards with nothing below them
        // Row 1: cardA (col 0), cardB (col 1)
        // Row 2: cardC (col 0)
        const cardC = document.createElement('div');
        cardC.classList.add('password-card');
        cardC.offsetTop = 160;
        cardC.offsetLeft = 0;
        grid.appendChild(cardC);

        // cardB in col 1 has no card below it on row 2, but it is on the TOP row, so it gets treated like top!
        expect(automata.isBottomRow(cardA, grid)).toBe(false);
        expect(automata.isBottomRow(cardB, grid)).toBe(false);
        expect(automata.resolveProjectionState(cardB, null, grid)).toBe(ProjectionState.DOWN);

        // cardC is on row 2 (bottom row) and NOT top row, so it projects UP
        expect(automata.isBottomRow(cardC, grid)).toBe(true);
        expect(automata.resolveProjectionState(cardC, null, grid)).toBe(ProjectionState.UP);
    });

    it('pins selected card on bottom edge stationary during expansion without scroll drift when scrolled', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        container.scrollTop = 200;
        container.getBoundingClientRect = () => ({ top: 0, bottom: 800, height: 800 });

        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 600;
        grid.getBoundingClientRect = () => ({ top: -200, bottom: 1200, height: 1400 });
        container.appendChild(grid);

        // Row 1 (top = 0)
        const c1 = document.createElement('div');
        c1.classList.add('password-card');
        c1.offsetTop = 0;
        grid.appendChild(c1);

        // Row 2 (top = 160)
        const c2 = document.createElement('div');
        c2.classList.add('password-card');
        c2.offsetTop = 160;
        grid.appendChild(c2);

        // Row 3 (top = 320)
        const c3 = document.createElement('div');
        c3.classList.add('password-card');
        c3.setAttribute('data-entry-id', 'c3-bottom');
        c3.offsetTop = 320;
        // In viewport coordinates: top is 320 - 200 = 120, bottom is 120 + 140 = 260
        let expanded = false;
        c3.getBoundingClientRect = () => {
            if (expanded) {
                // Expanding UP: height becomes 280, bottom stays at 260!
                return { top: -20, bottom: 260, left: 0, right: 600, width: 600, height: 280 };
            }
            return { top: 120, bottom: 260, left: 0, right: 290, width: 290, height: 140 };
        };
        const origAdd = c3.classList.add.bind(c3.classList);
        c3.classList.add = (...cls) => {
            origAdd(...cls);
            if (cls.includes('is-expanded')) expanded = true;
        };
        grid.appendChild(c3);

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });
        const res = automata.transition({
            selectedId: 'c3-bottom',
            viewMode: 'both',
            gridContainer: grid,
            targetCard: c3
        });

        // Must resolve to UP
        expect(res.projectionState).toBe(ProjectionState.UP);
        // rowIndex is 3, natural gridRow is 3 / span 2
        expect(c3.style.gridRow).toBe('3 / span 2');
        // Bottom was at 260, after expansion stays at 260 -> deltaY = 0
        expect(res.deltaY).toBe(0);
        // Container scrollTop remains stable without drifting or jumping
        expect(container.scrollTop).toBe(200);
    });

    it('adjusts projection state dynamically based on viewport size and clearance', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        // Viewport bounds: top: 100, bottom: 600, height: 500
        container.getBoundingClientRect = () => ({ top: 100, bottom: 600, left: 0, right: 800, width: 800, height: 500 });

        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 800;
        container.appendChild(grid);

        // Row 1: top: 120, bottom: 260. clearanceTop = 20 (<40) -> always DOWN
        const card1 = document.createElement('div');
        card1.classList.add('password-card');
        card1.offsetTop = 0;
        card1.getBoundingClientRect = () => ({ top: 120, bottom: 260, left: 0, right: 260, width: 260, height: 140 });
        grid.appendChild(card1);

        // Row 2: top: 280, bottom: 420. clearanceBottom = 600 - 420 = 180 (>= 120) -> ample clearance -> DOWN
        const card2 = document.createElement('div');
        card2.classList.add('password-card');
        card2.offsetTop = 160;
        card2.getBoundingClientRect = () => ({ top: 280, bottom: 420, left: 0, right: 260, width: 260, height: 140 });
        grid.appendChild(card2);

        // Row 3: top: 440, bottom: 580. clearanceBottom = 600 - 580 = 20 (< 120) -> insufficient clearance -> UP
        const card3 = document.createElement('div');
        card3.classList.add('password-card');
        card3.offsetTop = 320;
        card3.getBoundingClientRect = () => ({ top: 440, bottom: 580, left: 0, right: 260, width: 260, height: 140 });
        grid.appendChild(card3);

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });

        // Row 1 near top boundary must project DOWN
        expect(automata.resolveProjectionState(card1, container, grid)).toBe(ProjectionState.DOWN);

        // Row 2 with ample clearance below must project DOWN
        expect(automata.resolveProjectionState(card2, container, grid)).toBe(ProjectionState.DOWN);

        // Row 3 along bottom edge of viewport with insufficient clearance must project UP
        expect(automata.resolveProjectionState(card3, container, grid)).toBe(ProjectionState.UP);
    });

    it('anchors bottom edge stationary when projecting up in viewport with scroll tracking', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        container.scrollTop = 100;
        container.getBoundingClientRect = () => ({ top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600 });

        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 800;
        container.appendChild(grid);

        // Row 1 cards
        const topCard1 = document.createElement('div');
        topCard1.classList.add('password-card');
        topCard1.offsetTop = 0;
        topCard1.getBoundingClientRect = () => ({ top: 100, bottom: 240, left: 0, right: 260, width: 260, height: 140 });
        grid.appendChild(topCard1);

        const card = document.createElement('div');
        card.classList.add('password-card');
        card.setAttribute('data-entry-id', 'test-anchor');
        card.offsetTop = 300;

        let expanded = false;
        card.getBoundingClientRect = () => {
            if (expanded) {
                // Expanded height is 280px; before scroll adjustment, bottom moves down by 140px (from 560 to 700)
                return { top: 420, bottom: 700, left: 0, right: 800, width: 800, height: 280 };
            }
            return { top: 420, bottom: 560, left: 0, right: 260, width: 260, height: 140 };
        };

        const origAdd = card.classList.add.bind(card.classList);
        card.classList.add = (...cls) => {
            origAdd(...cls);
            if (cls.includes('is-expanded')) expanded = true;
        };
        grid.appendChild(card);

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });
        const res = automata.transition({
            selectedId: 'test-anchor',
            viewMode: 'card',
            gridContainer: grid,
            targetCard: card
        });

        expect(res.projectionState).toBe(ProjectionState.UP);
        // deltaY = 700 - 560 = 140
        expect(res.deltaY).toBe(140);
        // Container scroll absorbed the vertical displacement (+140)
        expect(container.scrollTop).toBe(240);
    });

    it('reanchor recalculates spatial coordinates, edge state, and scroll anchoring on resize', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        container.getBoundingClientRect = () => ({ top: 100, bottom: 600, left: 0, right: 800, width: 800, height: 500 });

        const grid = document.createElement('div');
        grid.classList.add('password-grid');
        grid.clientWidth = 750; // 3 columns (750 + 16) / 206 = 3
        grid.getBoundingClientRect = () => ({ top: 100, bottom: 900, left: 0, right: 750, width: 750, height: 800 });
        container.appendChild(grid);

        // Populate grid with 6 cards (2 rows of 3 in a 3-col layout)
        const cards = [];
        for (let i = 0; i < 6; i++) {
            const c = document.createElement('div');
            c.classList.add('password-card');
            c.setAttribute('data-entry-id', `card-${i}`);
            c.offsetTop = Math.floor(i / 3) * 160;
            c.getBoundingClientRect = () => ({
                top: 100 + Math.floor(i / 3) * 160,
                bottom: 240 + Math.floor(i / 3) * 160,
                left: (i % 3) * 250,
                right: (i % 3) * 250 + 230,
                width: 230,
                height: 140
            });
            grid.appendChild(c);
            cards.push(c);
        }

        const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });

        // Select card 5 (index 5: col 2, row 2 in 3-col layout -> EdgeState.RIGHT, ProjectionState.UP)
        const transRes = automata.transition({
            selectedId: 'card-5',
            viewMode: 'card',
            gridContainer: grid,
            targetCard: cards[5]
        });

        expect(transRes.edgeState).toBe(EdgeState.RIGHT);
        expect(cards[5].classList.contains('edge-right')).toBe(true);

        // Simulate resize to 2 columns (e.g. grid width becomes 500px: (500+16)/206 = 2)
        grid.clientWidth = 500;
        grid.getBoundingClientRect = () => ({ top: 100, bottom: 1000, left: 0, right: 500, width: 500, height: 900 });

        // In 2-col layout: card 5 is index 5 -> 5 % 2 = 1 (col 1, row 3). col 1 in 2-col is EdgeState.RIGHT
        const reanchorRes = automata.reanchor({
            selectedId: 'card-5',
            gridContainer: grid,
            targetCard: cards[5]
        });

        expect(reanchorRes).not.toBeNull();
        expect(reanchorRes.columnCount).toBe(2);
        expect(reanchorRes.columnIndex).toBe(1);
        expect(reanchorRes.edgeState).toBe(EdgeState.RIGHT);
        expect(cards[5].style.gridRow).toBe('3 / span 2');

        // Simulate resize to 1 column (mobile layout, width becomes 300px: (300+16)/206 = 1)
        grid.clientWidth = 300;
        grid.getBoundingClientRect = () => ({ top: 100, bottom: 1500, left: 0, right: 300, width: 300, height: 1400 });

        const reanchorMobile = automata.reanchor({
            selectedId: 'card-5',
            gridContainer: grid,
            targetCard: cards[5]
        });

        expect(reanchorMobile).not.toBeNull();
        expect(reanchorMobile.columnCount).toBe(1);
        expect(reanchorMobile.columnIndex).toBe(0);
        expect(reanchorMobile.edgeState).toBe(EdgeState.SINGLE);
        expect(cards[5].classList.contains('edge-single')).toBe(true);
        expect(cards[5].classList.contains('edge-right')).toBe(false);
        expect(cards[5].style.gridColumn).toBe('1 / -1');
        expect(cards[5].style.gridRow).toBe('6 / span 2');
    });

    it('VaultView reanchor delegates cleanly to automata and handles window resize', () => {
        const container = document.createElement('div');
        container.classList.add('vault-list-container');
        const view = new VaultView(container, null);
        view.setViewMode('card');

        // No selection -> returns null safely
        expect(view.reanchor()).toBeNull();

        // Render 4 cards
        const entries = [
            { id: 'e0', title: 'Card 0' },
            { id: 'e1', title: 'Card 1' },
            { id: 'e2', title: 'Card 2' },
            { id: 'e3', title: 'Card 3' }
        ];
        view.render(entries);

        // Select entry 3
        view.selectEntry('e3');
        expect(view.selectedId).toBe('e3');

        // Call reanchor
        const res = view.reanchor();
        expect(res).not.toBeNull();
        expect(res.selectedId).toBe('e3');

        // Cleanup
        view.destroy();
    });

    it('calculates exact tile offset and spatial deltas when going from expanded above to expanded below', () => {
        const automata = new CardFlowAutomata();

        // 3-column grid, 12 cards: Card 0 expanded above -> Card 4 clicked below
        const offset3Col = automata.calculateTileOffset(0, 4, 3, 12);
        expect(offset3Col.offsetTiles).toBe(3);
        expect(offset3Col.rowDelta).toBe(-1); // Card 4 was pushed to row 3; on collapse returns to row 2
        expect(offset3Col.colDelta).toBe(0);

        // 2-column grid, 16 cards: Card 0 expanded above -> Card 5 clicked below
        const offset2Col = automata.calculateTileOffset(0, 5, 2, 16);
        expect(offset2Col.offsetTiles).toBe(3);
        expect(offset2Col.rowDelta).toBe(-2); // Card 5 was pushed to row 5; on collapse returns to row 3
        expect(offset2Col.colDelta).toBe(1);

        // 4-column grid, 16 cards: Card 1 expanded above -> Card 6 clicked below
        const offset4Col = automata.calculateTileOffset(1, 6, 4, 16);
        expect(offset4Col.offsetTiles).toBe(3);
        expect(offset4Col.rowDelta).toBe(-1);
        expect(offset4Col.colDelta).toBe(1);

        // 1-column grid: Card 0 expanded above -> Card 2 clicked below
        const offset1Col = automata.calculateTileOffset(0, 2, 1, 6);
        expect(offset1Col.offsetTiles).toBe(1);
        expect(offset1Col.rowDelta).toBe(-1);

        // No previous card or selecting the same card
        expect(automata.calculateTileOffset(-1, 4, 3, 12).offsetTiles).toBe(0);
        expect(automata.calculateTileOffset(4, 4, 3, 12).offsetTiles).toBe(0);
    });

    it('ensures expanded card visibility in non-fullscreen height-constrained viewports', () => {
        // Set up mock window with constrained height (non-fullscreen)
        const origWindow = global.window;
        global.window = {
            innerHeight: 500,
            getComputedStyle: () => ({ gridTemplateColumns: '280px 280px' })
        };

        try {
            const container = document.createElement('div');
            container.classList.add('vault-list-container');
            container.scrollTop = 0;
            // Visible container height is 250px (from top: 100 to bottom: 350)
            container.getBoundingClientRect = () => ({ top: 100, bottom: 350, left: 0, right: 600, width: 600, height: 250 });

            const grid = document.createElement('div');
            grid.classList.add('password-grid');
            grid.clientWidth = 600;
            grid.getBoundingClientRect = () => ({ top: 100, bottom: 1200, left: 0, right: 600, width: 600, height: 1100 });
            container.appendChild(grid);

            // Card below the fold: top: 400, bottom: 540
            const cardBelow = document.createElement('div');
            cardBelow.classList.add('password-card');
            cardBelow.setAttribute('data-entry-id', 'card-below');
            cardBelow.offsetTop = 300;
            cardBelow.getBoundingClientRect = () => ({
                top: 400 - container.scrollTop,
                bottom: 680 - container.scrollTop,
                left: 0,
                right: 600,
                width: 600,
                height: 280
            });
            grid.appendChild(cardBelow);

            const automata = new CardFlowAutomata({ gridElement: grid, scrollContainer: container });
            const res = automata.transition({
                selectedId: 'card-below',
                viewMode: 'card',
                gridContainer: grid,
                targetCard: cardBelow
            });

            // Container must have scrolled down to bring the card into visible bounds
            expect(container.scrollTop).toBeGreaterThan(0);
            expect(res.state).toBe(FlowLifecycle.ANCHORING);
        } finally {
            global.window = origWindow;
        }
    });
});
