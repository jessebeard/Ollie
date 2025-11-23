/**
 * Chroma Upsampling - Upsample subsampled chroma components to match luma resolution
 * 
 * JPEG commonly uses chroma subsampling (4:2:0, 4:2:2) to reduce file size.
 * This module upsamples Cb and Cr components back to full resolution.
 */

/**
 * Upsample a component using nearest-neighbor interpolation
 * 
 * @param {Float32Array} component - Subsampled component data
 * @param {number} srcWidth - Width of subsampled data
 * @param {number} srcHeight - Height of subsampled data
 * @param {number} dstWidth - Target width
 * @param {number} dstHeight - Target height
 * @returns {Float32Array} Upsampled component data
 */
export function upsampleNearest(component, srcWidth, srcHeight, dstWidth, dstHeight) {
    const result = new Float32Array(dstWidth * dstHeight);

    const scaleX = (srcWidth - 1) / (dstWidth - 1);
    const scaleY = (srcHeight - 1) / (dstHeight - 1);

    for (let y = 0; y < dstHeight; y++) {
        for (let x = 0; x < dstWidth; x++) {
            const srcX = Math.floor(x * scaleX);
            const srcY = Math.floor(y * scaleY);
            const srcIndex = srcY * srcWidth + srcX;
            result[y * dstWidth + x] = component[srcIndex];
        }
    }

    return result;
}

/**
 * Upsample a component using bilinear interpolation
 * 
 * @param {Float32Array} component - Subsampled component data
 * @param {number} srcWidth - Width of subsampled data
 * @param {number} srcHeight - Height of subsampled data
 * @param {number} dstWidth - Target width
 * @param {number} dstHeight - Target height
 * @returns {Float32Array} Upsampled component data
 */
export function upsampleBilinear(component, srcWidth, srcHeight, dstWidth, dstHeight) {
    const result = new Float32Array(dstWidth * dstHeight);

    // Handle edge case where src dimensions are 1
    if (srcWidth === 1 && srcHeight === 1) {
        result.fill(component[0]);
        return result;
    }

    // JPEG uses centered sampling for chroma subsampling
    // Each chroma sample represents the CENTER of a 2x2 (or 2x1, 1x2) luma block
    // So we need to use centered coordinates, not edge-aligned
    const scaleX = srcWidth / dstWidth;
    const scaleY = srcHeight / dstHeight;

    for (let y = 0; y < dstHeight; y++) {
        for (let x = 0; x < dstWidth; x++) {
            // Map to centered source coordinates
            // Add 0.5 to dst coord to get center, multiply by scale, subtract 0.5 to get src pixel coord
            const srcX = (x + 0.5) * scaleX - 0.5;
            const srcY = (y + 0.5) * scaleY - 0.5;

            // Clamp to valid range
            const x0 = Math.max(0, Math.floor(srcX));
            const y0 = Math.max(0, Math.floor(srcY));
            const x1 = Math.min(x0 + 1, srcWidth - 1);
            const y1 = Math.min(y0 + 1, srcHeight - 1);

            const fx = Math.max(0, Math.min(1, srcX - x0));
            const fy = Math.max(0, Math.min(1, srcY - y0));

            // Bilinear interpolation
            const v00 = component[y0 * srcWidth + x0];
            const v10 = component[y0 * srcWidth + x1];
            const v01 = component[y1 * srcWidth + x0];
            const v11 = component[y1 * srcWidth + x1];

            const v0 = v00 * (1 - fx) + v10 * fx;
            const v1 = v01 * (1 - fx) + v11 * fx;
            const value = v0 * (1 - fy) + v1 * fy;

            result[y * dstWidth + x] = value;
        }
    }

    return result;
}

/**
 * Upsample chroma components based on sampling factors
 * 
 * @param {Object} components - Component data {Y, Cb, Cr}
 * @param {Object} samplingFactors - {Y: {h, v}, Cb: {h, v}, Cr: {h, v}}
 * @param {number} width - Full image width
 * @param {number} height - Full image height
 * @returns {Object} Upsampled components {Y, Cb, Cr}
 */
export function upsampleChroma(components, samplingFactors, width, height) {
    const maxH = Math.max(samplingFactors.Y.h, samplingFactors.Cb.h, samplingFactors.Cr.h);
    const maxV = Math.max(samplingFactors.Y.v, samplingFactors.Cb.v, samplingFactors.Cr.v);

    const result = {
        Y: components.Y,
        Cb: components.Cb,
        Cr: components.Cr
    };

    // Upsample Cb if needed
    if (samplingFactors.Cb.h < maxH || samplingFactors.Cb.v < maxV) {
        const cbWidth = Math.ceil(width / maxH) * samplingFactors.Cb.h;
        const cbHeight = Math.ceil(height / maxV) * samplingFactors.Cb.v;
        result.Cb = upsampleBilinear(components.Cb, cbWidth, cbHeight, width, height);
    }

    // Upsample Cr if needed
    if (samplingFactors.Cr.h < maxH || samplingFactors.Cr.v < maxV) {
        const crWidth = Math.ceil(width / maxH) * samplingFactors.Cr.h;
        const crHeight = Math.ceil(height / maxV) * samplingFactors.Cr.v;
        result.Cr = upsampleBilinear(components.Cr, crWidth, crHeight, width, height);
    }

    return result;
}
