
export function padDimensions(width, height) {
    return [{
        width: Math.ceil(width / 8) * 8,
        height: Math.ceil(height / 8) * 8
    }, null];
}

/**
 * Pads dimensions to a multiple of 16 for 4:2:0 subsampling.
 * In 4:2:0, MCUs are 16x16 pixels (2x2 luma blocks + 1 Cb + 1 Cr).
 */
export function padDimensions420(width, height) {
    return [{
        width: Math.ceil(width / 16) * 16,
        height: Math.ceil(height / 16) * 16
    }, null];
}

/**
 * Extracts an 8x8 block from a 2D array (flattened).
 * Handles padding by extending the edge pixels.
 * @param {ArrayLike} data - Flattened image channel data
 * @param {number} imgWidth - Original image width
 * @param {number} imgHeight - Original image height
 * @param {number} x - Block x offset (must be multiple of 8)
 * @param {number} y - Block y offset (must be multiple of 8)
 * @returns {[Float32Array, null]} 8x8 block as tuple
 */
export function extractBlock(data, imgWidth, imgHeight, x, y) {
    const block = new Float32Array(64);

    for (let row = 0; row < 8; row++) {

        const srcY = Math.min(y + row, imgHeight - 1);

        for (let col = 0; col < 8; col++) {

            const srcX = Math.min(x + col, imgWidth - 1);

            const srcIdx = srcY * imgWidth + srcX;
            block[row * 8 + col] = data[srcIdx];
        }
    }

    return [block, null];
}
