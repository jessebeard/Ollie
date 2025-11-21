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
        y: Math.round(y),
        cb: Math.round(cb),
        cr: Math.round(cr)
    };
}

export function ycbcrToRgb(y, cb, cr) {
    // TODO: Implement inverse for verification if needed
    return { r: 0, g: 0, b: 0 };
}
