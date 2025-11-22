/**
 * Block Assembly - Assemble decoded 8x8 blocks into full image
 * 
 * This module handles:
 * - Placing blocks in correct positions
 * - MCU interleaving
 * - Cropping to actual image dimensions
 * - Converting to RGBA ImageData format
 */

/**
 * Assemble 8x8 blocks into a full component plane
 * 
 * @param {Array<Float32Array>} blocks - Array of 8x8 blocks (64 elements each)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} blocksPerRow - Number of blocks per row
 * @returns {Float32Array} Assembled component data
 */
export function assembleBlocks(blocks, width, height, blocksPerRow) {
    const result = new Float32Array(width * height);

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex];
        const blockRow = Math.floor(blockIndex / blocksPerRow);
        const blockCol = blockIndex % blocksPerRow;

        const startY = blockRow * 8;
        const startX = blockCol * 8;

        // Copy block data to result, handling edge cases
        for (let y = 0; y < 8 && startY + y < height; y++) {
            for (let x = 0; x < 8 && startX + x < width; x++) {
                const blockOffset = y * 8 + x;
                const imageOffset = (startY + y) * width + (startX + x);
                result[imageOffset] = block[blockOffset];
            }
        }
    }

    return result;
}

/**
 * Convert YCbCr components to RGBA ImageData
 * 
 * @param {Float32Array} yData - Y component
 * @param {Float32Array} cbData - Cb component
 * @param {Float32Array} crData - Cr component
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Uint8ClampedArray} RGBA pixel data
 */
export function componentsToImageData(yData, cbData, crData, width, height) {
    const imageData = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < width * height; i++) {
        const y = yData[i];
        const cb = cbData[i];
        const cr = crData[i];

        // YCbCr to RGB conversion (JFIF standard)
        const r = y + 1.402 * (cr - 128);
        const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
        const b = y + 1.772 * (cb - 128);

        // Clamp and store RGBA
        const offset = i * 4;
        imageData[offset + 0] = Math.max(0, Math.min(255, Math.round(r)));
        imageData[offset + 1] = Math.max(0, Math.min(255, Math.round(g)));
        imageData[offset + 2] = Math.max(0, Math.min(255, Math.round(b)));
        imageData[offset + 3] = 255; // Alpha
    }

    return imageData;
}

/**
 * Convert grayscale component to RGBA ImageData
 * 
 * @param {Float32Array} yData - Y component (grayscale)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Uint8ClampedArray} RGBA pixel data
 */
export function grayscaleToImageData(yData, width, height) {
    const imageData = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < width * height; i++) {
        const gray = Math.max(0, Math.min(255, Math.round(yData[i])));
        const offset = i * 4;
        imageData[offset + 0] = gray;
        imageData[offset + 1] = gray;
        imageData[offset + 2] = gray;
        imageData[offset + 3] = 255; // Alpha
    }

    return imageData;
}

/**
 * Crop image data to actual dimensions (remove padding)
 * 
 * @param {Uint8ClampedArray} imageData - RGBA pixel data
 * @param {number} paddedWidth - Width including padding
 * @param {number} paddedHeight - Height including padding
 * @param {number} actualWidth - Actual image width
 * @param {number} actualHeight - Actual image height
 * @returns {Uint8ClampedArray} Cropped RGBA pixel data
 */
export function cropImageData(imageData, paddedWidth, paddedHeight, actualWidth, actualHeight) {
    if (paddedWidth === actualWidth && paddedHeight === actualHeight) {
        return imageData;
    }

    const cropped = new Uint8ClampedArray(actualWidth * actualHeight * 4);

    for (let y = 0; y < actualHeight; y++) {
        for (let x = 0; x < actualWidth; x++) {
            const srcOffset = (y * paddedWidth + x) * 4;
            const dstOffset = (y * actualWidth + x) * 4;
            cropped[dstOffset + 0] = imageData[srcOffset + 0];
            cropped[dstOffset + 1] = imageData[srcOffset + 1];
            cropped[dstOffset + 2] = imageData[srcOffset + 2];
            cropped[dstOffset + 3] = imageData[srcOffset + 3];
        }
    }

    return cropped;
}
