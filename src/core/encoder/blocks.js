
export function padDimensions(width, height) {
    return {
        width: Math.ceil(width / 8) * 8,
        height: Math.ceil(height / 8) * 8
    };
}

/**
 * Extracts an 8x8 block from a 2D array (flattened).
 * Handles padding by extending the edge pixels.
 * @param {ArrayLike} data - Flattened image channel data
 * @param {number} imgWidth - Original image width
 * @param {number} imgHeight - Original image height
 * @param {number} x - Block x offset (must be multiple of 8)
 * @param {number} y - Block y offset (must be multiple of 8)
 */
export function extractBlock(data, imgWidth, imgHeight, x, y) {
    const block = new Float32Array(64);

    for (let row = 0; row < 8; row++) {
        // Clamp source Y to image height
        const srcY = Math.min(y + row, imgHeight - 1);

        for (let col = 0; col < 8; col++) {
            // Clamp source X to image width
            const srcX = Math.min(x + col, imgWidth - 1);

            const srcIdx = srcY * imgWidth + srcX;
            block[row * 8 + col] = data[srcIdx];
        }
    }

    return block;
}
