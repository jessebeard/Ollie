/**
 * PinnedGrid - Native CSS Grid O(1) Pinned Card Layout Engine
 *
 * Utilizes the browser's native C++ dense packing cellular automaton (CSS Grid
 * `grid-auto-flow: row dense`) by pinning explicit coordinates (`--pin-r`, `--pin-c`)
 * exclusively onto the single active/expanded card.
 *
 * All standard 1x1 cards have no explicit coordinates and flow automatically in O(1).
 */

/**
 * Calculates 1-indexed (row, col) coordinates for a pinned 2-span card in O(1).
 *
 * If the card is positioned at the rightmost column (and cols > 1), it clamps
 * left by 1 column so the 2-span item stays within grid boundaries.
 *
 * @param {number} index - 0-indexed item index in the card collection
 * @param {number} cols - Current number of grid columns
 * @returns {{ row: number, col: number }}
 */
export function calculatePinCoordinates(index, cols) {
    if (typeof cols !== 'number' || isNaN(cols) || cols < 1) {
        return { row: 1, col: 1 };
    }
    const safeCols = Math.floor(cols);
    if (safeCols < 1) {
        return { row: 1, col: 1 };
    }

    const safeIndex = (typeof index === 'number' && !isNaN(index) && index >= 0)
        ? Math.floor(index)
        : 0;

    const baseRow = Math.floor(safeIndex / safeCols) + 1; // 1-indexed
    const baseCol = (safeIndex % safeCols) + 1;           // 1-indexed

    // Clamp left by 1 column if pinned on the right edge (and safeCols > 1)
    const pinnedCol = (safeCols > 1 && baseCol === safeCols)
        ? baseCol - 1
        : baseCol;

    return { row: baseRow, col: pinnedCol };
}

/**
 * Reads the active column count C directly from the computed CSS Grid engine
 * or fallback measurement.
 *
 * @param {HTMLElement} gridEl
 * @returns {number}
 */
export function getGridColumnCount(gridEl) {
    if (!gridEl) return 0;

    if (typeof window !== 'undefined' && window.getComputedStyle) {
        const style = window.getComputedStyle(gridEl);
        if (style && style.gridTemplateColumns && style.gridTemplateColumns !== 'none') {
            const cols = style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
            if (cols > 0) return cols;
        }
    }

    // Defensive fallback: inspect container width or children
    if (typeof gridEl.clientWidth === 'number' && gridEl.clientWidth > 0) {
        const gap = 14;
        const minColWidth = 220;
        const calculated = Math.floor((gridEl.clientWidth + gap) / (minColWidth + gap));
        if (calculated >= 1) return calculated;
    }

    return 1;
}

/**
 * Initializes O(1) Pinned Grid layout on a grid container.
 *
 * @param {HTMLElement} gridEl
 * @param {Object} [options]
 * @param {Function} [options.onSelect] - Callback when card is selected/deselected
 * @returns {Object} Controller handle with update, expand, collapse, and destroy
 */
export function initPinnedGrid(gridEl, options = {}) {
    let expandedCard = null;
    let expandedIndex = -1;
    let currentCols = 0;

    function getCols() {
        return getGridColumnCount(gridEl);
    }

    function updatePinCoordinates() {
        if (!expandedCard || currentCols <= 0 || expandedIndex < 0) return;

        const { row, col } = calculatePinCoordinates(expandedIndex, currentCols);

        expandedCard.style.setProperty('--pin-r', String(row));
        expandedCard.style.setProperty('--pin-c', String(col));
    }

    function collapseCard(notify = true) {
        if (!expandedCard) return;

        expandedCard.classList.remove('is-expanded', 'expanded');
        expandedCard.style.removeProperty('--pin-r');
        expandedCard.style.removeProperty('--pin-c');

        expandedCard = null;
        expandedIndex = -1;

        if (notify && options.onSelect) {
            options.onSelect(null);
        }
    }

    function expandCard(card, notify = true) {
        if (!card) return;

        if (expandedCard && expandedCard !== card) {
            expandedCard.classList.remove('is-expanded', 'expanded');
            expandedCard.style.removeProperty('--pin-r');
            expandedCard.style.removeProperty('--pin-c');
        }

        expandedCard = card;

        if (card.dataset && card.dataset.index !== undefined) {
            expandedIndex = Number(card.dataset.index);
        } else if (gridEl && typeof gridEl.querySelectorAll === 'function') {
            const cards = Array.from(gridEl.querySelectorAll('.password-card, .card'));
            expandedIndex = cards.indexOf(card);
        } else {
            expandedIndex = 0;
        }

        currentCols = getCols();
        updatePinCoordinates();

        card.classList.add('is-expanded', 'expanded');

        if (notify && options.onSelect) {
            const id = (card.getAttribute && card.getAttribute('data-entry-id')) || card.id || null;
            options.onSelect(id);
        }
    }

    // Click handler: O(1) toggle
    const clickHandler = (e) => {
        // Prevent expanding when clicking interactive controls (buttons, links, copy, TOTP)
        if (e.target && typeof e.target.closest === 'function') {
            if (e.target.closest('button, a, input, select, textarea, .totp-code, .totp-slot')) {
                return;
            }
        }

        const target = e.target;
        const clicked = (target && typeof target.closest === 'function')
            ? target.closest('.password-card, .card')
            : null;

        if (!clicked) return;

        const applyStateChange = () => {
            if (expandedCard === clicked) {
                collapseCard(true);
            } else {
                expandCard(clicked, true);
            }
        };

        if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
            document.startViewTransition(applyStateChange);
        } else {
            applyStateChange();
        }
    };

    if (gridEl && typeof gridEl.addEventListener === 'function') {
        gridEl.addEventListener('click', clickHandler);
    }

    // ResizeObserver: monitors column count changes when container resizes
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && gridEl) {
        ro = new ResizeObserver(() => {
            const nextCols = getCols();
            if (nextCols !== currentCols) {
                currentCols = nextCols;
                updatePinCoordinates();
            }
        });
        ro.observe(gridEl);
    }

    return {
        get expandedCard() { return expandedCard; },
        get expandedIndex() { return expandedIndex; },
        getColumnCount: getCols,
        updatePinCoordinates,
        setExpandedCard: (card) => expandCard(card, false),
        collapse: () => collapseCard(false),
        destroy: () => {
            if (gridEl && typeof gridEl.removeEventListener === 'function') {
                gridEl.removeEventListener('click', clickHandler);
            }
            if (ro) {
                ro.disconnect();
                ro = null;
            }
        }
    };
}
