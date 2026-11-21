import { describe, it, expect } from '../../utils/test-runner.js';
import { calculatePinCoordinates, initPinnedGrid } from '../../../app/components/vault/components/pinned-grid.js';

describe('PinnedGrid Engine (O(1) Spatial Coordinate Math & Packing)', () => {
    describe('calculatePinCoordinates (O(1) Arithmetic)', () => {
        it('calculates 1-column layout coordinates with single-column pinning', () => {
            const c0 = calculatePinCoordinates(0, 1);
            expect(c0.row).toBe(1);
            expect(c0.col).toBe(1);

            const c1 = calculatePinCoordinates(1, 1);
            expect(c1.row).toBe(2);
            expect(c1.col).toBe(1);

            const c5 = calculatePinCoordinates(5, 1);
            expect(c5.row).toBe(6);
            expect(c5.col).toBe(1);
        });

        it('calculates 2-column layout coordinates and clamps right-edge cards left by 1', () => {
            // Index 0: row 1, col 1
            const c0 = calculatePinCoordinates(0, 2);
            expect(c0.row).toBe(1);
            expect(c0.col).toBe(1);

            // Index 1: row 1, col 2 -> right edge clamped to col 1
            const c1 = calculatePinCoordinates(1, 2);
            expect(c1.row).toBe(1);
            expect(c1.col).toBe(1);

            // Index 2: row 2, col 1
            const c2 = calculatePinCoordinates(2, 2);
            expect(c2.row).toBe(2);
            expect(c2.col).toBe(1);

            // Index 3: row 2, col 2 -> right edge clamped to col 1
            const c3 = calculatePinCoordinates(3, 2);
            expect(c3.row).toBe(2);
            expect(c3.col).toBe(1);
        });

        it('calculates 3-column layout coordinates correctly', () => {
            // Row 1: indices 0, 1, 2
            expect(calculatePinCoordinates(0, 3)).toEqual({ row: 1, col: 1 });
            expect(calculatePinCoordinates(1, 3)).toEqual({ row: 1, col: 2 });
            // index 2 is on right edge (col 3) -> clamped to col 2
            expect(calculatePinCoordinates(2, 3)).toEqual({ row: 1, col: 2 });

            // Row 2: indices 3, 4, 5
            expect(calculatePinCoordinates(3, 3)).toEqual({ row: 2, col: 1 });
            expect(calculatePinCoordinates(4, 3)).toEqual({ row: 2, col: 2 });
            expect(calculatePinCoordinates(5, 3)).toEqual({ row: 2, col: 2 });
        });

        it('calculates 4-column layout coordinates correctly', () => {
            expect(calculatePinCoordinates(0, 4)).toEqual({ row: 1, col: 1 });
            expect(calculatePinCoordinates(1, 4)).toEqual({ row: 1, col: 2 });
            expect(calculatePinCoordinates(2, 4)).toEqual({ row: 1, col: 3 });
            // index 3 is on right edge (col 4) -> clamped to col 3
            expect(calculatePinCoordinates(3, 4)).toEqual({ row: 1, col: 3 });
        });

        it('Property: 2-span coordinates never exceed grid columns or underflow row 1', () => {
            for (let cols = 1; cols <= 10; cols++) {
                for (let idx = 0; idx < 100; idx++) {
                    const coords = calculatePinCoordinates(idx, cols);
                    expect(coords.row >= 1).toBe(true);
                    expect(coords.col >= 1).toBe(true);
                    if (cols > 1) {
                        // A 2-span card placed at coords.col spans (col, col + 1)
                        // It must not overflow the total columns
                        expect(coords.col + 1 <= cols + 1).toBe(true);
                        expect(coords.col <= cols - 1).toBe(true);
                    } else {
                        expect(coords.col).toBe(1);
                    }
                }
            }
        });

        it('handles boundary and non-integer edge cases defensively', () => {
            expect(calculatePinCoordinates(-1, 3)).toEqual({ row: 1, col: 1 });
            expect(calculatePinCoordinates(0, 0)).toEqual({ row: 1, col: 1 });
            expect(calculatePinCoordinates(NaN, 3)).toEqual({ row: 1, col: 1 });
            expect(calculatePinCoordinates(2.7, 3)).toEqual({ row: 1, col: 2 }); // floored to 2
        });
    });

    describe('initPinnedGrid DOM lifecycle & event handling', () => {
        function createMockGrid(columnCount = 2, cardCount = 4) {
            const grid = document.createElement('div');
            grid.classList.add('password-grid');
            grid.clientWidth = columnCount * 240;

            const cards = [];
            for (let i = 0; i < cardCount; i++) {
                const card = document.createElement('div');
                card.classList.add('password-card');
                card.setAttribute('data-entry-id', `entry-${i}`);
                card.setAttribute('data-index', String(i));
                grid.appendChild(card);
                cards.push(card);
            }

            return { grid, cards };
        }

        it('initializes grid with null expandedCard', () => {
            const { grid } = createMockGrid(2, 4);
            const engine = initPinnedGrid(grid);
            expect(engine).not.toBeNull();
            expect(engine.expandedCard).toBeNull();
            expect(engine.expandedIndex).toBe(-1);
            engine.destroy();
        });

        it('toggles expansion on click and sets --pin-r and --pin-c', () => {
            const { grid, cards } = createMockGrid(2, 4);
            let selectedId = undefined;
            const engine = initPinnedGrid(grid, {
                onSelect: (id) => { selectedId = id; }
            });

            // Click card 0 (row 1, col 1)
            cards[0].dispatchEvent({
                type: 'click',
                target: cards[0],
                bubbles: true,
                stopPropagation: () => {}
            });

            expect(cards[0].classList.contains('is-expanded')).toBe(true);
            expect(cards[0].classList.contains('expanded')).toBe(true);
            expect(cards[0].style.getPropertyValue('--pin-r')).toBe('1');
            expect(cards[0].style.getPropertyValue('--pin-c')).toBe('1');
            expect(selectedId).toBe('entry-0');

            // Click card 0 again to collapse
            cards[0].dispatchEvent({
                type: 'click',
                target: cards[0],
                bubbles: true,
                stopPropagation: () => {}
            });

            expect(cards[0].classList.contains('is-expanded')).toBe(false);
            expect(cards[0].classList.contains('expanded')).toBe(false);
            expect(cards[0].style.getPropertyValue('--pin-r')).toBe('');
            expect(cards[0].style.getPropertyValue('--pin-c')).toBe('');
            expect(selectedId).toBeNull();

            engine.destroy();
        });

        it('clears previous card coordinates when clicking a different card', () => {
            const { grid, cards } = createMockGrid(2, 4);
            const engine = initPinnedGrid(grid);

            // Expand card 0
            cards[0].dispatchEvent({
                type: 'click',
                target: cards[0],
                bubbles: true,
                stopPropagation: () => {}
            });
            expect(cards[0].classList.contains('is-expanded')).toBe(true);

            // Expand card 3 (row 2, col 2 -> clamped to col 1)
            cards[3].dispatchEvent({
                type: 'click',
                target: cards[3],
                bubbles: true,
                stopPropagation: () => {}
            });

            // Card 0 must be collapsed and variables cleared
            expect(cards[0].classList.contains('is-expanded')).toBe(false);
            expect(cards[0].style.getPropertyValue('--pin-r')).toBe('');
            expect(cards[0].style.getPropertyValue('--pin-c')).toBe('');

            // Card 3 must be expanded
            expect(cards[3].classList.contains('is-expanded')).toBe(true);
            expect(cards[3].style.getPropertyValue('--pin-r')).toBe('2');
            expect(cards[3].style.getPropertyValue('--pin-c')).toBe('1');

            engine.destroy();
        });

        it('ignores click events originating from interactive child elements', () => {
            const { grid, cards } = createMockGrid(2, 4);
            const btn = document.createElement('button');
            btn.classList.add('btn-copy');
            cards[0].appendChild(btn);

            const engine = initPinnedGrid(grid);

            // Click the button inside the card
            btn.dispatchEvent({
                type: 'click',
                target: btn,
                bubbles: true,
                stopPropagation: () => {}
            });

            // Card 0 must NOT be expanded
            expect(cards[0].classList.contains('is-expanded')).toBe(false);
            expect(engine.expandedCard).toBeNull();

            engine.destroy();
        });

        it('executes state change inside document.startViewTransition when available', () => {
            const { grid, cards } = createMockGrid(2, 4);
            let transitionCalled = false;
            const originalStartViewTransition = document.startViewTransition;
            document.startViewTransition = (callback) => {
                transitionCalled = true;
                callback();
            };

            try {
                const engine = initPinnedGrid(grid);
                cards[1].dispatchEvent({
                    type: 'click',
                    target: cards[1],
                    bubbles: true,
                    stopPropagation: () => {}
                });

                expect(transitionCalled).toBe(true);
                expect(cards[1].classList.contains('is-expanded')).toBe(true);
                engine.destroy();
            } finally {
                document.startViewTransition = originalStartViewTransition;
            }
        });

        it('programmatic setExpandedCard and collapse methods work as expected', () => {
            const { grid, cards } = createMockGrid(2, 4);
            const engine = initPinnedGrid(grid);

            engine.setExpandedCard(cards[2]);
            expect(engine.expandedCard).toBe(cards[2]);
            expect(cards[2].classList.contains('is-expanded')).toBe(true);
            expect(cards[2].style.getPropertyValue('--pin-r')).toBe('2');
            expect(cards[2].style.getPropertyValue('--pin-c')).toBe('1');

            engine.collapse();
            expect(engine.expandedCard).toBeNull();
            expect(cards[2].classList.contains('is-expanded')).toBe(false);

            engine.destroy();
        });
    });
});
