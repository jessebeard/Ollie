/**
 * Converts RGB to YCbCr.
 * Ranges:
 * R, G, B: [0, 255]
 * Y: [0, 255]
 * Cb, Cr: [0, 255] (centered at 128)
 */
export function rgbToYcbcr(r, g, b) {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;

    return {
        y: Math.max(0, Math.min(255, Math.round(y))),
        cb: Math.max(0, Math.min(255, Math.round(cb))),
        cr: Math.max(0, Math.min(255, Math.round(cr)))
    };
}

/**
 * Converts YCbCr to RGB using JFIF standard formulas
 * 
 * @param {number} y - Luminance [0, 255]
 * @param {number} cb - Blue chrominance [0, 255], centered at 128
 * @param {number} cr - Red chrominance [0, 255], centered at 128
 * @returns {{r: number, g: number, b: number}} RGB values [0, 255]
 */
export function ycbcrToRgb(y, cb, cr) {
    // JFIF conversion formulas
    const r = y + 1.402 * (cr - 128);
    const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
    const b = y + 1.772 * (cb - 128);

    // Clamp to valid range [0, 255]
    return {
        r: Math.max(0, Math.min(255, Math.round(r))),
        g: Math.max(0, Math.min(255, Math.round(g))),
        b: Math.max(0, Math.min(255, Math.round(b)))
    };
}

