/**
 * Chroma Downsampling - Downsample chroma components for 4:2:0 encoding
 * 
 * For 4:2:0 subsampling, chroma (Cb/Cr) is sampled at half the resolution
 * of luma in both horizontal and vertical directions.
 */

/**
 * Downsample a 16x16 chroma region to an 8x8 block using averaging.
 * 
 * Each 2x2 region in the source is averaged to produce one output pixel.
 * This is the standard box filter approach for 4:2:0 downsampling.
 * 
 * @param {Float32Array} source - Chroma channel data
 * @param {number} srcWidth - Width of source image
 * @param {number} srcX - X offset in source (must be multiple of 16)
 * @param {number} srcY - Y offset in source (must be multiple of 16)
 * @param {number} imgWidth - Original image width (for edge clamping)
 * @param {number} imgHeight - Original image height (for edge clamping)
 * @returns {[Float32Array, null] | [null, Error]} 8x8 downsampled block as tuple
 */
export function downsampleBlock420(source, srcWidth, srcX, srcY, imgWidth, imgHeight) {
    const block = new Float32Array(64);

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            // Map to 2x2 region in source
            const sx = srcX + col * 2;
            const sy = srcY + row * 2;

            // Sample 4 pixels with edge clamping
            const x0 = Math.min(sx, imgWidth - 1);
            const x1 = Math.min(sx + 1, imgWidth - 1);
            const y0 = Math.min(sy, imgHeight - 1);
            const y1 = Math.min(sy + 1, imgHeight - 1);

            const v00 = source[y0 * srcWidth + x0];
            const v10 = source[y0 * srcWidth + x1];
            const v01 = source[y1 * srcWidth + x0];
            const v11 = source[y1 * srcWidth + x1];

            // Average the 2x2 region
            block[row * 8 + col] = (v00 + v10 + v01 + v11) / 4;
        }
    }

    return [block, null];
}

/**
 * Extract a 16x16 luma region as four 8x8 blocks in MCU order.
 * 
 * For 4:2:0, the Y component has 4 blocks per MCU arranged as:
 *   [0][1]
 *   [2][3]
 * 
 * @param {Float32Array} yChannel - Full Y channel data (level-shifted)
 * @param {number} srcWidth - Width of source image  
 * @param {number} srcX - X offset (must be multiple of 16)
 * @param {number} srcY - Y offset (must be multiple of 16)
 * @param {number} imgWidth - Original image width
 * @param {number} imgHeight - Original image height
 * @returns {[Float32Array[], null] | [null, Error]} Array of 4 blocks [Y0, Y1, Y2, Y3] as tuple
 */
export function extractLumaBlocks420(yChannel, srcWidth, srcX, srcY, imgWidth, imgHeight) {
    const blocks = [];

    // Block positions within the 16x16 MCU:
    // [0][1] - top row
    // [2][3] - bottom row
    const offsets = [
        [0, 0],   // Y0: top-left
        [8, 0],   // Y1: top-right
        [0, 8],   // Y2: bottom-left
        [8, 8]    // Y3: bottom-right
    ];

    for (const [dx, dy] of offsets) {
        const block = new Float32Array(64);

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const x = Math.min(srcX + dx + col, imgWidth - 1);
                const y = Math.min(srcY + dy + row, imgHeight - 1);
                block[row * 8 + col] = yChannel[y * srcWidth + x];
            }
        }

        blocks.push(block);
    }

    return [blocks, null];
}
