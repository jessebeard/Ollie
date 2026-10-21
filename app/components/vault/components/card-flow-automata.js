/**
 * CardFlowAutomata - State machine governing spatial card expansion and flow.
 *
 * Models and manages:
 *  - Edge States: EDGE_LEFT, EDGE_RIGHT, EDGE_INTERIOR, EDGE_SINGLE
 *  - Projection States: PROJECT_DOWN, PROJECT_UP
 *  - Lifecycle States: IDLE, SELECTING, EXPANDING, ANCHORING, STABILIZED
 *
 * Guarantees zero-drift scroll anchoring so cards remain stationary under the
 * user's focus when expanding/collapsing, regardless of layout wrapping or
 * asynchronous content resolution.
 */

export const EdgeState = {
    LEFT: 'edge-left',
    RIGHT: 'edge-right',
    INTERIOR: 'edge-interior',
    SINGLE: 'edge-single'
};

export const ProjectionState = {
    DOWN: 'project-down',
    UP: 'project-up'
};

export const FlowLifecycle = {
    IDLE: 'idle',
    SELECTING: 'selecting',
    EXPANDING: 'expanding',
    COLLAPSING: 'collapsing',
    ANCHORING: 'anchoring',
    STABILIZED: 'stabilized'
};

export class CardFlowAutomata {
    constructor(options = {}) {
        this.gridElement = options.gridElement || null;
        this.scrollContainer = options.scrollContainer || null;
        this.state = FlowLifecycle.IDLE;
        this.currentCardId = null;
        this.edgeState = null;
        this.projectionState = null;
        this.lastAnchorRect = null;
        this.lastTargetCard = null;
        this._settleRaf = null;
    }

    /**
     * Resolves the scrollable ancestor container for a given element.
     * @param {HTMLElement} el
     * @returns {HTMLElement|null}
     */
    getScrollContainer(el) {
        if (!el) return this.scrollContainer || null;
        let parent = el.parentElement || el.parentNode;
        while (parent) {
            if (parent.classList && (parent.classList.contains('vault-list-container') || parent.classList.contains('drop-zone'))) {
                return parent;
            }
            if (typeof window !== 'undefined' && window.getComputedStyle) {
                const style = window.getComputedStyle(parent);
                if (style && (style.overflowY === 'auto' || style.overflowY === 'scroll')) {
                    return parent;
                }
            }
            parent = parent.parentElement || parent.parentNode;
        }
        return this.scrollContainer || (typeof document !== 'undefined' ? (document.scrollingElement || document.documentElement || document.body) : null);
    }

    /**
     * Resolves the actual .password-grid container element.
     * @param {HTMLElement} gridEl
     * @returns {HTMLElement|null}
     */
    getGridElement(gridEl) {
        const root = gridEl || this.gridElement;
        if (!root) return null;
        if (root.classList && root.classList.contains('password-grid')) return root;
        if (typeof root.querySelector === 'function') {
            const found = root.querySelector('.password-grid');
            if (found) return found;
        }
        return root;
    }

    /**
     * Computes the number of columns in the grid layout.
     * @param {HTMLElement} gridEl
     * @returns {number}
     */
    getColumnCount(gridEl) {
        const grid = this.getGridElement(gridEl);
        if (!grid) return 2;

        if (typeof window !== 'undefined' && window.getComputedStyle) {
            const style = window.getComputedStyle(grid);
            if (style && style.gridTemplateColumns && style.gridTemplateColumns !== 'none') {
                const parts = style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
                if (parts.length > 0) return parts.length;
            }
        }

        // Measure based on grid container clientWidth
        if (typeof grid.clientWidth === 'number' && grid.clientWidth > 0) {
            const gap = 16;
            const minColWidth = 190;
            const cols = Math.floor((grid.clientWidth + gap) / (minColWidth + gap));
            if (cols >= 1) return cols;
        }

        // Measure distinct offsetLeft values across cards
        const cards = (typeof grid.querySelectorAll === 'function')
            ? Array.from(grid.querySelectorAll('.password-card'))
            : [];
        if (cards.length > 1) {
            const distinctLefts = new Set();
            for (const c of cards) {
                const left = (typeof c.offsetLeft === 'number')
                    ? c.offsetLeft
                    : (c.getBoundingClientRect ? c.getBoundingClientRect().left : null);
                if (left !== null && !isNaN(left)) {
                    distinctLefts.add(Math.round(left));
                }
            }
            if (distinctLefts.size > 1) {
                return distinctLefts.size;
            }
        }

        return 2;
    }

    /**
     * Computes the 0-indexed column position of a card within the grid.
     * @param {HTMLElement} cardEl
     * @param {HTMLElement} gridEl
     * @param {number} columnCount
     * @returns {number}
     */
    getCardColumnIndex(cardEl, gridEl, columnCount) {
        if (columnCount <= 1 || !cardEl) return 0;
        const grid = this.getGridElement(gridEl);
        if (!grid || typeof grid.querySelectorAll !== 'function') return 0;

        const cards = Array.from(grid.querySelectorAll('.password-card'));
        const index = cards.indexOf(cardEl);
        if (index === -1) return 0;

        const cardRect = (typeof cardEl.getBoundingClientRect === 'function') ? cardEl.getBoundingClientRect() : null;
        const gridRect = (grid && typeof grid.getBoundingClientRect === 'function') ? grid.getBoundingClientRect() : null;

        if (cardRect && gridRect && gridRect.width > 0) {
            const relLeft = Math.max(0, cardRect.left - gridRect.left);
            const colWidth = gridRect.width / columnCount;
            const col = Math.floor((relLeft + 6) / colWidth);
            if (col >= 0 && col < columnCount) {
                return col;
            }
        }

        if (typeof cardEl.offsetLeft === 'number') {
            const rowCards = cards.filter(c => Math.abs((c.offsetTop || 0) - (cardEl.offsetTop || 0)) < 15);
            const colInRow = rowCards.indexOf(cardEl);
            if (colInRow !== -1) return Math.min(colInRow, columnCount - 1);
        }

        return index % columnCount;
    }

    /**
     * Resolves the EdgeState (LEFT, RIGHT, INTERIOR, SINGLE) given column index and count.
     * @param {number} colIndex
     * @param {number} columnCount
     * @returns {string}
     */
    resolveEdgeState(colIndex, columnCount) {
        if (columnCount <= 1) return EdgeState.SINGLE;
        if (colIndex === 0) return EdgeState.LEFT;
        if (colIndex >= columnCount - 1) return EdgeState.RIGHT;
        return EdgeState.INTERIOR;
    }

    /**
     * Computes the exact grid row, column, and span for all cards when a given card is expanded.
     * Simulates the deterministic CSS Grid row-major layout algorithm.
     *
     * @param {number} expandedIndex - The index of the card to expand (-1 if none)
     * @param {number} totalCards - Total number of cards
     * @param {number} colCount - Number of grid columns
     * @returns {{ row: number, col: number, span: number, totalRows: number, cards: Array<{ i: number, row: number, col: number, spanCols: number, spanRows: number }> }}
     */
    getCardSpatialLayout(expandedIndex, totalCards, colCount) {
        if (colCount <= 1 || totalCards <= 0) {
            let r = 1;
            const cardList = [];
            for (let i = 0; i < totalCards; i++) {
                const spanRows = (i === expandedIndex) ? 2 : 1;
                cardList.push({ i, row: r, col: 0, spanCols: 1, spanRows });
                r += spanRows;
            }
            const targetRow = (expandedIndex >= 0 && expandedIndex < totalCards) ? cardList[expandedIndex].row : 1;
            const targetSpan = (expandedIndex >= 0 && expandedIndex < totalCards) ? 2 : 1;
            return {
                row: targetRow,
                col: 0,
                span: targetSpan,
                totalRows: Math.max(1, r - 1),
                cards: cardList
            };
        }

        // 2D grid matrix: occupied[row][col]
        const occupied = [];
        const isOccupied = (r, c) => Boolean(occupied[r] && occupied[r][c]);
        const setOccupied = (r, c) => {
            if (!occupied[r]) occupied[r] = [];
            occupied[r][c] = true;
        };

        const cardList = [];
        let curR = 1;
        let curC = 0;
        let targetLayout = { row: 1, col: 0, span: (expandedIndex >= 0 ? 2 : 1), totalRows: 1 };

        for (let i = 0; i < totalCards; i++) {
            if (i === expandedIndex) {
                const spanCols = Math.min(2, colCount);
                const spanRows = 2;

                while (true) {
                    if (curC + spanCols > colCount) {
                        curR += 1;
                        curC = 0;
                    }
                    let fits = true;
                    for (let dr = 0; dr < spanRows; dr++) {
                        for (let dc = 0; dc < spanCols; dc++) {
                            if (isOccupied(curR + dr, curC + dc)) {
                                fits = false;
                                break;
                            }
                        }
                        if (!fits) break;
                    }
                    if (fits) break;
                    curC += 1;
                    if (curC >= colCount) {
                        curR += 1;
                        curC = 0;
                    }
                }

                for (let dr = 0; dr < spanRows; dr++) {
                    for (let dc = 0; dc < spanCols; dc++) {
                        setOccupied(curR + dr, curC + dc);
                    }
                }

                const item = { i, row: curR, col: curC, spanCols, spanRows };
                cardList.push(item);
                targetLayout.row = curR;
                targetLayout.col = curC;
                targetLayout.span = spanCols;

                curC += spanCols;
                if (curC >= colCount) {
                    curR += 1;
                    curC = 0;
                }
            } else {
                while (isOccupied(curR, curC)) {
                    curC += 1;
                    if (curC >= colCount) {
                        curR += 1;
                        curC = 0;
                    }
                }
                setOccupied(curR, curC);
                cardList.push({ i, row: curR, col: curC, spanCols: 1, spanRows: 1 });
                curC += 1;
                if (curC >= colCount) {
                    curR += 1;
                    curC = 0;
                }
            }
        }

        let maxR = curR;
        for (const item of cardList) {
            maxR = Math.max(maxR, item.row + item.spanRows - 1);
        }

        targetLayout.totalRows = maxR;
        targetLayout.cards = cardList;
        return targetLayout;
    }

    /**
     * Calculates the exact number of tile slots that targetCard was offset
     * when prevCard was expanded above it.
     *
     * @param {number} prevExpandedIndex - Index of previously expanded card (-1 if none)
     * @param {number} targetIndex - Index of newly selected card
     * @param {number} colCount - Number of grid columns
     * @param {number} totalCards - Total number of cards
     * @returns {{ offsetTiles: number, rowDelta: number, colDelta: number, prevLayout: Object|null, cleanLayout: Object|null }}
     */
    calculateTileOffset(prevExpandedIndex, targetIndex, colCount, totalCards) {
        if (prevExpandedIndex < 0 || prevExpandedIndex === targetIndex || colCount <= 0 || totalCards <= 0) {
            return { offsetTiles: 0, rowDelta: 0, colDelta: 0, prevLayout: null, cleanLayout: null };
        }

        const prevLayout = this.getCardSpatialLayout(prevExpandedIndex, totalCards, colCount);
        const cleanLayout = this.getCardSpatialLayout(-1, totalCards, colCount);

        const prevTargetPos = (prevLayout.cards && prevLayout.cards[targetIndex]) || {
            row: 1,
            col: 0
        };
        const cleanTargetPos = (cleanLayout.cards && cleanLayout.cards[targetIndex]) || {
            row: Math.floor(targetIndex / colCount) + 1,
            col: targetIndex % colCount
        };

        const slotWithPrev = (prevTargetPos.row - 1) * colCount + prevTargetPos.col;
        const slotClean = (cleanTargetPos.row - 1) * colCount + cleanTargetPos.col;

        const offsetTiles = slotWithPrev - slotClean;
        const rowDelta = cleanTargetPos.row - prevTargetPos.row;
        const colDelta = cleanTargetPos.col - prevTargetPos.col;

        return {
            offsetTiles,
            rowDelta,
            colDelta,
            prevLayout: prevTargetPos,
            cleanLayout: cleanTargetPos
        };
    }

    /**
     * Checks if a card element is on the bottom edge of the physical card stack.
     * Evaluates against the entire rendered stack layout, independent of viewport.
     *
     * Handles non-square grid layouts where cards in the bottom two rows may appear
     * on the bottom edge (when there is no card below them in their column).
     * If the bottom is also the top (e.g. single-row layout or cards on the top row),
     * it is treated as the top and returns false so it projects downward.
     *
     * @param {HTMLElement} cardEl
     * @param {HTMLElement} [gridEl]
     * @returns {boolean}
     */
    isBottomRow(cardEl, gridEl) {
        if (!cardEl) return false;
        const grid = this.getGridElement(gridEl || cardEl.parentElement);
        if (!grid || typeof grid.querySelectorAll !== 'function') return false;

        const cards = Array.from(grid.querySelectorAll('.password-card'));
        if (cards.length <= 1) return false;

        const cardIndex = cards.indexOf(cardEl);
        if (cardIndex === -1) return false;

        const colCount = this.getColumnCount(grid);

        // Helper to get vertical coordinate
        const getY = (c) => {
            if (typeof c.offsetTop === 'number' && !isNaN(c.offsetTop)) return c.offsetTop;
            if (typeof c.getBoundingClientRect === 'function') {
                const r = c.getBoundingClientRect();
                if (r && typeof r.top === 'number') return r.top;
            }
            return 0;
        };

        // Helper to get horizontal coordinate
        const getX = (c) => {
            if (typeof c.offsetLeft === 'number' && !isNaN(c.offsetLeft)) return c.offsetLeft;
            if (typeof c.getBoundingClientRect === 'function') {
                const r = c.getBoundingClientRect();
                if (r && typeof r.left === 'number') return r.left;
            }
            return null;
        };

        const cardY = getY(cardEl);
        let minTop = Infinity;
        let maxTop = -Infinity;
        for (const c of cards) {
            const y = getY(c);
            if (y < minTop) minTop = y;
            if (y > maxTop) maxTop = y;
        }

        // Check if layout coordinates indicate multiple rows
        const hasMultiRowCoords = (maxTop - minTop >= 20);

        if (hasMultiRowCoords) {
            // "Also the bottom can be the top too, in which case it gets treated like the top."
            // Any card on the top row is treated as the top and projects DOWN
            if (Math.abs(cardY - minTop) < 15) {
                return false;
            }

            // If the card is at the physical max row, it is definitely on the bottom
            if (Math.abs(cardY - maxTop) < 15) {
                return true;
            }

            // For cards not on the max row (e.g. second-to-last row on a non-square bottom):
            // Check if there is any card below cardEl in the same column
            const cardX = getX(cardEl);
            const targetCol = this.getCardColumnIndex(cardEl, grid, colCount);

            let hasCardBelow = false;
            for (const c of cards) {
                if (c === cardEl) continue;
                const y = getY(c);
                if (y > cardY + 15) {
                    const cX = getX(c);
                    if (cardX !== null && cX !== null && Math.abs(cX - cardX) < 30) {
                        hasCardBelow = true;
                        break;
                    }
                    const cCol = this.getCardColumnIndex(c, grid, colCount);
                    if (cCol === targetCol) {
                        hasCardBelow = true;
                        break;
                    }
                }
            }

            return !hasCardBelow;
        }

        // Fallback for mock/test environments without layout engine: calculate by column index
        if (colCount > 0) {
            const totalRows = Math.ceil(cards.length / colCount);
            if (totalRows <= 1) return false;
            const cardRow = Math.floor(cardIndex / colCount);
            // Top row is treated like top
            if (cardRow === 0) return false;

            // A card is at the bottom of its column if there is no card in that column in the next row
            return (cardIndex + colCount >= cards.length);
        }

        return false;
    }

    /**
     * Determines whether a card element is situated on the top row of the grid.
     * @param {HTMLElement} cardEl
     * @param {HTMLElement} [gridEl]
     * @returns {boolean}
     */
    _isTopRow(cardEl, gridEl) {
        if (!cardEl) return true;
        const grid = this.getGridElement(gridEl || cardEl.parentElement);
        if (!grid || typeof grid.querySelectorAll !== 'function') return false;

        const cards = Array.from(grid.querySelectorAll('.password-card'));
        if (cards.length <= 1) return true;

        const cardIndex = cards.indexOf(cardEl);
        if (cardIndex === -1) return false;

        const getY = (c) => {
            if (typeof c.offsetTop === 'number' && !isNaN(c.offsetTop)) return c.offsetTop;
            if (typeof c.getBoundingClientRect === 'function') {
                const r = c.getBoundingClientRect();
                if (r && typeof r.top === 'number') return r.top;
            }
            return 0;
        };

        const cardY = getY(cardEl);
        let minTop = Infinity;
        let maxTop = -Infinity;
        for (const c of cards) {
            const y = getY(c);
            if (y < minTop) minTop = y;
            if (y > maxTop) maxTop = y;
        }

        if (maxTop - minTop >= 20) {
            return Math.abs(cardY - minTop) < 15;
        }

        const colCount = this.getColumnCount(grid);
        if (colCount > 0) {
            return Math.floor(cardIndex / colCount) === 0;
        }

        return true;
    }

    /**
     * Resolves the ProjectionState (DOWN or UP) based on position, viewport bounds, and grid edge.
     *
     * Evaluates:
     *  1. Boundary rule: "the bottom can be the top too, in which case it gets treated like the top."
     *     Any card in the top row or single-row grids strictly projects DOWN.
     *  2. Viewport & position checking:
     *     Calculates clearances against visible scroll container / viewport bounds.
     *     If clearanceTop < 40, projects DOWN to prevent clipping off the top.
     *     If clearanceBottom < expandNeeded, projects UP into available headroom.
     *  3. Grid boundary:
     *     Checks if the card is on the bottom edge of the physical stack
     *     (including non-square layouts where exposed cards from bottom two rows appear on the bottom).
     *
     * @param {HTMLElement} cardEl
     * @param {HTMLElement} [scrollContainer]
     * @param {HTMLElement} [gridEl]
     * @returns {string}
     */
    resolveProjectionState(cardEl, scrollContainer, gridEl) {
        if (!cardEl) {
            return ProjectionState.DOWN;
        }

        const grid = this.getGridElement(gridEl || cardEl.parentElement);

        // Boundary condition: top row is treated as top -> projects DOWN
        if (this._isTopRow(cardEl, grid)) {
            return ProjectionState.DOWN;
        }

        // Viewport & position checking:
        // Adjust for viewport size and check card position relative to visible container/viewport.
        const sc = scrollContainer || this.getScrollContainer(cardEl);
        let clearanceTop = Infinity;
        let clearanceBottom = Infinity;
        let expandNeeded = 120;
        let hasGeometry = false;

        if (typeof cardEl.getBoundingClientRect === 'function') {
            const cardRect = cardEl.getBoundingClientRect();
            if (cardRect && (cardRect.height > 0 || cardRect.width > 0)) {
                hasGeometry = true;
                const cRect = (sc && typeof sc.getBoundingClientRect === 'function') ? sc.getBoundingClientRect() : null;
                const hasScHeight = Boolean(cRect && cRect.height > 0);
                const vTop = hasScHeight ? Math.max(0, cRect.top) : 0;
                const winH = (typeof window !== 'undefined' && typeof window.innerHeight === 'number') ? window.innerHeight : Infinity;
                const vBottom = hasScHeight ? Math.min(winH, cRect.bottom) : winH;

                clearanceTop = cardRect.top - vTop;
                clearanceBottom = vBottom - cardRect.bottom;
                expandNeeded = (cardRect.height > 0 ? cardRect.height * 0.85 : 120);

                // Near top edge of visible container/viewport -> must project DOWN
                if (clearanceTop < 40) {
                    return ProjectionState.DOWN;
                }

                // Insufficient clearance below in viewport -> project UP only when strictly clipped along the bottom edge
                const isInView = (cardRect.top < vBottom && cardRect.bottom > vTop);
                if (isInView && clearanceBottom < 30 && clearanceTop >= expandNeeded) {
                    return ProjectionState.UP;
                }
            }
        }

        // Check physical bottom edge against card stack
        // (including non-square grid layouts where cards from bottom two rows appear on the bottom)
        if (this.isBottomRow(cardEl, grid)) {
            if (hasGeometry && clearanceTop < 40) {
                return ProjectionState.DOWN;
            }
            return ProjectionState.UP;
        }

        return ProjectionState.DOWN;
    }

    /**
     * Coordinates the transition of card selection and expansion.
     *
     * @param {Object} params
     * @param {string|null} params.selectedId
     * @param {string} params.viewMode
     * @param {HTMLElement} params.gridContainer
     * @param {HTMLElement|null} [params.previousSelectedCard]
     * @param {HTMLElement|null} [params.targetCard]
     * @returns {Object} transition details
     */
    transition({ selectedId, viewMode, gridContainer, previousSelectedCard, targetCard }) {
        this.state = FlowLifecycle.SELECTING;
        const grid = this.getGridElement(gridContainer || this.gridElement);

        // Deselection case
        if (!selectedId) {
            if (previousSelectedCard) {
                this._clearCardStates(previousSelectedCard);
            }
            this.currentCardId = null;
            this.edgeState = null;
            this.projectionState = null;
            this.lastAnchorRect = null;
            this.lastTargetCard = null;
            this.state = FlowLifecycle.IDLE;
            return { state: this.state, selectedId: null };
        }

        const target = targetCard || (grid && typeof grid.querySelector === 'function'
            ? grid.querySelector(`[data-entry-id="${selectedId}"]`)
            : null);

        if (!target) {
            this.state = FlowLifecycle.IDLE;
            return { state: this.state, selectedId };
        }

        const scrollContainer = this.getScrollContainer(target);

        // Capture target's visible coordinate BEFORE touching layout or measuring cards,
        // so scroll anchoring pins stationary to where the user actually clicked.
        const initialTargetRect = (typeof target.getBoundingClientRect === 'function')
            ? target.getBoundingClientRect()
            : null;
        const anchorRect = initialTargetRect;
        this.lastAnchorRect = anchorRect;
        this.lastTargetCard = target;
        this.currentCardId = selectedId;

        // Pre-measure cards and compute exact tile offset before collapsing previous card
        const cards = (grid && typeof grid.querySelectorAll === 'function')
            ? Array.from(grid.querySelectorAll('.password-card'))
            : [];
        const prevIndex = previousSelectedCard ? cards.indexOf(previousSelectedCard) : -1;
        const targetIndex = cards.indexOf(target);
        const colCount = this.getColumnCount(grid);
        const tileOffsetInfo = this.calculateTileOffset(prevIndex, targetIndex, colCount, cards.length);

        // Sample sibling positions before layout mutations so they can slide smoothly into place if displaced
        const siblingInitialRects = new Map();
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function' && !window.__TEST_RUNNER__) {
            for (const c of cards) {
                if (c !== target && typeof c.getBoundingClientRect === 'function') {
                    const r = c.getBoundingClientRect();
                    if (r && (r.width > 0 || r.height > 0)) {
                        siblingInitialRects.set(c, { left: r.left, top: r.top });
                    }
                }
            }
        }

        const gridRect = (grid && typeof grid.getBoundingClientRect === 'function')
            ? grid.getBoundingClientRect()
            : null;

        // Phase 1: Calculate spatial column and row index on click BEFORE clearing previous card
        let colIndex = 0;
        if (typeof target.offsetLeft === 'number' && !isNaN(target.offsetLeft) && target.offsetLeft >= 0 && gridRect && gridRect.width > 0 && colCount > 1) {
            const colWidth = gridRect.width / colCount;
            colIndex = Math.min(colCount - 1, Math.max(0, Math.floor((target.offsetLeft + 6) / colWidth)));
        } else if (initialTargetRect && gridRect && typeof initialTargetRect.left === 'number' && typeof gridRect.left === 'number' && colCount > 1 && gridRect.width > 0) {
            const relLeft = Math.max(0, initialTargetRect.left - gridRect.left);
            const colWidth = gridRect.width / colCount;
            colIndex = Math.min(colCount - 1, Math.max(0, Math.floor((relLeft + 6) / colWidth)));
        } else if (targetIndex !== -1 && colCount > 0) {
            colIndex = targetIndex % colCount;
        } else {
            colIndex = this.getCardColumnIndex(target, grid, colCount);
        }

        let rowIndex = 1;
        const cardH = (initialTargetRect && initialTargetRect.height > 0) ? initialTargetRect.height : (target.offsetHeight > 0 ? target.offsetHeight : 148);
        const gap = 14;
        const rowH = cardH + gap;

        if (typeof target.offsetTop === 'number' && !isNaN(target.offsetTop) && target.offsetTop > 0) {
            rowIndex = Math.max(1, Math.round(target.offsetTop / rowH) + 1);
        } else if (initialTargetRect && gridRect && initialTargetRect.height > 0 && gridRect.height > 0) {
            const isScrollContainer = (grid === scrollContainer || (grid.classList && grid.classList.contains('vault-list-container')));
            const scrollY = isScrollContainer && scrollContainer && typeof scrollContainer.scrollTop === 'number' ? scrollContainer.scrollTop : 0;
            const relTop = Math.max(0, (initialTargetRect.top - gridRect.top) + scrollY);
            rowIndex = Math.max(1, Math.round(relTop / rowH) + 1);
        } else if (targetIndex !== -1 && colCount > 0) {
            rowIndex = Math.floor(targetIndex / colCount) + 1;
        }

        // Phase 2: Resolve spatial state machines and bottom edge status on click
        const isBottom = this.isBottomRow(target, grid);
        this.edgeState = this.resolveEdgeState(colIndex, colCount);
        this.projectionState = this.resolveProjectionState(target, scrollContainer, grid);

        // Phase 3: Now collapse previous card so it reverts cleanly
        if (previousSelectedCard && previousSelectedCard !== target) {
            this._clearCardStates(previousSelectedCard);
            if (typeof target.offsetHeight === 'number') {
                void target.offsetHeight; // Force synchronous reflow to establish clean layout
            }
        }
        if (target.classList && target.classList.contains('is-expanded')) {
            this._clearCardStates(target);
            if (typeof target.offsetHeight === 'number') {
                void target.offsetHeight;
            }
        }

        this.state = FlowLifecycle.EXPANDING;

        // Phase 4: Apply selection & expansion to target
        target.classList.add('is-selected');
        target.setAttribute('aria-selected', 'true');

        const shouldExpand = (viewMode === 'card' || viewMode === 'both');
        if (shouldExpand) {
            target.classList.add('is-expanded');
            target.classList.add(this.edgeState);
            target.classList.add(this.projectionState);
            target.setAttribute('data-edge-state', this.edgeState.replace('edge-', ''));
            target.setAttribute('data-projection-state', this.projectionState.replace('project-', ''));

            // Pin explicit grid row and column coordinates to prevent cascading grid jumps
            if (target.style) {
                if (colCount <= 1) {
                    target.style.gridColumn = '1 / -1';
                } else if (this.edgeState === EdgeState.RIGHT) {
                    target.style.gridColumn = Math.max(1, colCount - 1) + ' / -1';
                } else if (this.edgeState === EdgeState.INTERIOR) {
                    target.style.gridColumn = (colIndex + 1) + ' / span 2';
                } else {
                    target.style.gridColumn = '1 / span 2';
                }

                target.style.gridRow = rowIndex + ' / span 2';
            }
        } else {
            target.classList.remove('is-expanded');
            if (target.style) {
                target.style.gridColumn = '';
                target.style.gridRow = '';
            }
        }

        // Phase 5: Immediate synchronous scroll anchoring
        let deltaY = 0;
        let deltaX = 0;
        if (anchorRect && typeof target.getBoundingClientRect === 'function') {
            const newRect = target.getBoundingClientRect();
            deltaY = (this.projectionState === ProjectionState.UP)
                ? (newRect.bottom - anchorRect.bottom)
                : (newRect.top - anchorRect.top);
            if (deltaY !== 0 && scrollContainer && typeof scrollContainer.scrollTop === 'number') {
                scrollContainer.scrollTop += deltaY;
            }

            // Viewport boundary correction:
            // When running in a browser and the window is not fullscreen or is height-constrained,
            // ensure the expanded card is brought cleanly into view and not clipped or off-screen.
            // For cards projecting UP or situated on the bottom row, the card is strictly anchored
            // such that its bottom edge remains on the bottom edge.
            if (this.projectionState !== ProjectionState.UP && !isBottom &&
                typeof window !== 'undefined' && typeof window.innerHeight === 'number' &&
                scrollContainer && typeof scrollContainer.getBoundingClientRect === 'function') {
                const currentRect = target.getBoundingClientRect();
                const scRect = scrollContainer.getBoundingClientRect();
                const vTop = Math.max(0, scRect.top);
                const winH = window.innerHeight;
                const vBottom = Math.min(winH, scRect.bottom);
                const vHeight = vBottom - vTop;
                const padding = 12;

                if (vHeight > 0 && currentRect && currentRect.height > 0) {
                    if (currentRect.height <= vHeight) {
                        if (currentRect.bottom > vBottom) {
                            const overflow = currentRect.bottom - (vBottom - padding);
                            scrollContainer.scrollTop += overflow;
                        } else if (currentRect.top < vTop) {
                            const underflow = currentRect.top - (vTop + padding);
                            scrollContainer.scrollTop += underflow;
                        }
                    } else {
                        // Card is taller than visible container viewport: align top to container top with padding
                        if (currentRect.top < vTop || currentRect.top > vTop + padding * 2) {
                            const alignTop = currentRect.top - (vTop + padding);
                            scrollContainer.scrollTop += alignTop;
                        }
                    }
                }
            }

            const postScrollRect = target.getBoundingClientRect();
            deltaX = anchorRect.left - postScrollRect.left;
        }

        // Phase 6: Smooth sliding animation for cards shifting horizontally or displaced by reflow
        if (typeof window !== 'undefined' && !window.__TEST_RUNNER__ && Math.abs(deltaX) > 4) {
            target.style.setProperty('--slide-dx', `${Math.round(deltaX)}px`);
            target.classList.add('is-sliding');
            if (typeof target.addEventListener === 'function') {
                target.addEventListener('animationend', () => {
                    target.classList.remove('is-sliding');
                    if (target.style && typeof target.style.removeProperty === 'function') {
                        target.style.removeProperty('--slide-dx');
                    }
                }, { once: true });
            }
        }

        if (siblingInitialRects.size > 0 && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function' && !window.__TEST_RUNNER__) {
            const displaced = [];
            for (const c of cards) {
                if (c !== target && typeof c.getBoundingClientRect === 'function') {
                    const initial = siblingInitialRects.get(c);
                    if (initial) {
                        const cur = c.getBoundingClientRect();
                        const dx = initial.left - cur.left;
                        const dy = initial.top - cur.top;
                        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                            c.style.transition = 'none';
                            c.style.transform = `translate(${dx}px, ${dy}px)`;
                            displaced.push(c);
                        }
                    }
                }
            }
            if (displaced.length > 0) {
                if (grid && typeof grid.offsetHeight === 'number') {
                    void grid.offsetHeight; // Force reflow so invert transform applies before transition
                }
                window.requestAnimationFrame(() => {
                    for (const c of displaced) {
                        c.style.transition = 'transform 0.28s cubic-bezier(0.2, 0, 0, 1)';
                        c.style.transform = '';
                    }
                });
            }
        }

        this.state = FlowLifecycle.ANCHORING;

        return {
            state: this.state,
            selectedId,
            edgeState: this.edgeState,
            projectionState: this.projectionState,
            columnCount: colCount,
            columnIndex: colIndex,
            deltaY,
            deltaX,
            offsetTiles: tileOffsetInfo ? tileOffsetInfo.offsetTiles : 0,
            rowDelta: tileOffsetInfo ? tileOffsetInfo.rowDelta : 0,
            colDelta: tileOffsetInfo ? tileOffsetInfo.colDelta : 0
        };
    }

    /**
     * Re-evaluates edge state, projection state, and scroll anchoring
     * after container or viewport dimensions change (e.g. window resize).
     *
     * @param {Object} [params]
     * @param {string} [params.selectedId]
     * @param {HTMLElement} [params.gridContainer]
     * @param {HTMLElement} [params.targetCard]
     * @param {string} [params.viewMode]
     * @returns {Object|null}
     */
    reanchor(params = {}) {
        const selectedId = params.selectedId || this.currentCardId;
        if (!selectedId) return null;

        const grid = this.getGridElement(params.gridContainer || this.gridElement);
        const target = params.targetCard || (grid && typeof grid.querySelector === 'function'
            ? grid.querySelector(`[data-entry-id="${selectedId}"]`)
            : this.lastTargetCard);

        if (!target || !target.classList || !target.classList.contains('is-expanded')) {
            return null;
        }

        const scrollContainer = this.getScrollContainer(target);
        const colCount = this.getColumnCount(grid);
        const cards = (grid && typeof grid.querySelectorAll === 'function')
            ? Array.from(grid.querySelectorAll('.password-card'))
            : [];
        const cardIndex = cards.indexOf(target);
        const colIndex = (cardIndex !== -1 && colCount > 0)
            ? (cardIndex % colCount)
            : this.getCardColumnIndex(target, grid, colCount);
        const rowIndex = (cardIndex !== -1 && colCount > 0)
            ? (Math.floor(cardIndex / colCount) + 1)
            : 1;

        const newEdge = this.resolveEdgeState(colIndex, colCount);
        const newProj = this.resolveProjectionState(target, scrollContainer, grid);

        if (this.edgeState && this.edgeState !== newEdge) {
            target.classList.remove(this.edgeState);
        }
        if (this.projectionState && this.projectionState !== newProj) {
            target.classList.remove(this.projectionState);
        }

        target.classList.add(newEdge, newProj);
        target.setAttribute('data-edge-state', newEdge.replace('edge-', ''));
        target.setAttribute('data-projection-state', newProj.replace('project-', ''));

        this.edgeState = newEdge;
        this.projectionState = newProj;

        if (target.style) {
            if (colCount <= 1) {
                target.style.gridColumn = '1 / -1';
            } else if (newEdge === EdgeState.RIGHT) {
                target.style.gridColumn = Math.max(1, colCount - 1) + ' / -1';
            } else if (newEdge === EdgeState.INTERIOR) {
                target.style.gridColumn = (colIndex + 1) + ' / span 2';
            } else {
                target.style.gridColumn = '1 / span 2';
            }
            target.style.gridRow = rowIndex + ' / span 2';
        }

        let deltaY = 0;
        if (this.lastAnchorRect && typeof target.getBoundingClientRect === 'function') {
            const newRect = target.getBoundingClientRect();
            deltaY = (newProj === ProjectionState.UP)
                ? (newRect.bottom - this.lastAnchorRect.bottom)
                : (newRect.top - this.lastAnchorRect.top);

            if (deltaY !== 0 && scrollContainer && typeof scrollContainer.scrollTop === 'number') {
                scrollContainer.scrollTop += deltaY;
            }

            // Viewport boundary correction for non-fullscreen windows
            if (typeof window !== 'undefined' && typeof window.innerHeight === 'number' &&
                scrollContainer && typeof scrollContainer.getBoundingClientRect === 'function') {
                const currentRect = target.getBoundingClientRect();
                const scRect = scrollContainer.getBoundingClientRect();
                const vTop = Math.max(0, scRect.top);
                const winH = window.innerHeight;
                const vBottom = Math.min(winH, scRect.bottom);
                const vHeight = vBottom - vTop;
                const padding = 12;

                if (vHeight > 0 && currentRect && currentRect.height > 0) {
                    if (currentRect.height <= vHeight) {
                        if (currentRect.bottom > vBottom) {
                            scrollContainer.scrollTop += currentRect.bottom - (vBottom - padding);
                        } else if (currentRect.top < vTop) {
                            scrollContainer.scrollTop += currentRect.top - (vTop + padding);
                        }
                    } else if (currentRect.top < vTop || currentRect.top > vTop + padding * 2) {
                        scrollContainer.scrollTop += currentRect.top - (vTop + padding);
                    }
                }
            }

            this.lastAnchorRect = target.getBoundingClientRect();
        }

        return {
            selectedId,
            edgeState: newEdge,
            projectionState: newProj,
            columnCount: colCount,
            columnIndex: colIndex,
            deltaY
        };
    }

    /**
     * Asynchronous settlement pass.
     * Call after asynchronous content updates (e.g. notes decryption, TOTP injection, detailPane layout)
     * to eliminate any secondary layout drift.
     *
     * @param {HTMLElement} [cardEl]
     * @param {HTMLElement} [scrollContainer]
     * @returns {Object}
     */
    settle(cardEl, scrollContainer) {
        const target = cardEl || this.lastTargetCard;
        const anchorRect = this.lastAnchorRect;
        if (!target || !anchorRect || typeof target.getBoundingClientRect !== 'function') {
            this.state = FlowLifecycle.STABILIZED;
            return { settled: true, driftY: 0, state: this.state };
        }

        const container = scrollContainer || this.getScrollContainer(target);
        const settledRect = target.getBoundingClientRect();
        const driftY = (this.projectionState === ProjectionState.UP)
            ? (settledRect.bottom - anchorRect.bottom)
            : (settledRect.top - anchorRect.top);

        if (Math.abs(driftY) > 0.5 && container && typeof container.scrollTop === 'number') {
            container.scrollTop += driftY;
        }

        // Viewport boundary correction for non-fullscreen windows:
        // Do NOT apply to UP-projecting cards so bottom edge remains strictly pinned to bottom edge
        if (this.projectionState !== ProjectionState.UP &&
            typeof window !== 'undefined' && typeof window.innerHeight === 'number' &&
            container && typeof container.getBoundingClientRect === 'function') {
            const currentRect = target.getBoundingClientRect();
            const scRect = container.getBoundingClientRect();
            const vTop = Math.max(0, scRect.top);
            const winH = window.innerHeight;
            const vBottom = Math.min(winH, scRect.bottom);
            const vHeight = vBottom - vTop;
            const padding = 12;

            if (vHeight > 0 && currentRect && currentRect.height > 0) {
                if (currentRect.height <= vHeight) {
                    if (currentRect.bottom > vBottom) {
                        container.scrollTop += currentRect.bottom - (vBottom - padding);
                    } else if (currentRect.top < vTop) {
                        container.scrollTop += currentRect.top - (vTop + padding);
                    }
                } else if (currentRect.top < vTop || currentRect.top > vTop + padding * 2) {
                    container.scrollTop += currentRect.top - (vTop + padding);
                }
            }
        }

        this.lastAnchorRect = (typeof target.getBoundingClientRect === 'function')
            ? target.getBoundingClientRect()
            : anchorRect;
        this.state = FlowLifecycle.STABILIZED;
        return { settled: true, driftY, state: this.state };
    }

    /**
     * Clears all state machine classes and attributes from a card element.
     * @param {HTMLElement} cardEl
     * @private
     */
    _clearCardStates(cardEl) {
        if (!cardEl) return;
        const stateClasses = [
            'is-selected',
            'is-expanded',
            'is-sliding',
            EdgeState.LEFT,
            EdgeState.RIGHT,
            EdgeState.INTERIOR,
            EdgeState.SINGLE,
            ProjectionState.DOWN,
            ProjectionState.UP
        ];

        cardEl.classList.remove(...stateClasses);

        if (cardEl.className) {
            const toRemove = new Set(stateClasses);
            cardEl.className = cardEl.className
                .split(/\s+/)
                .filter(c => c && !toRemove.has(c))
                .join(' ');
        }

        cardEl.setAttribute('aria-selected', 'false');
        cardEl.removeAttribute('data-edge-state');
        cardEl.removeAttribute('data-projection-state');

        if (cardEl.style) {
            cardEl.style.gridRow = '';
            cardEl.style.gridColumn = '';
            if (typeof cardEl.style.removeProperty === 'function') {
                cardEl.style.removeProperty('--slide-dx');
            }
            cardEl.style.transform = '';
            cardEl.style.transition = '';
        }
    }

    /**
     * Resets the automata state.
     */
    reset() {
        if (this._settleRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._settleRaf);
            this._settleRaf = null;
        }
        this.state = FlowLifecycle.IDLE;
        this.currentCardId = null;
        this.edgeState = null;
        this.projectionState = null;
        this.lastAnchorRect = null;
        this.lastTargetCard = null;
    }
}
