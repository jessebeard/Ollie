import { encodeQR } from '../../../../src/codec/qr-encoder.js';

/**
 * Renders an arbitrary URI or byte payload as an aligned, scaled QR code onto a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string|Uint8Array} uri
 */
export function renderQrOnCanvas(canvas, uri) {
    if (!canvas || !uri) return;
    try {
        const bytes = typeof uri === 'string' ? new TextEncoder().encode(uri) : uri;
        const { size, modules } = encodeQR(bytes);
        if (!size || !modules) return;

        const quietZone = 2;
        const totalModules = size + quietZone * 2;
        const scale = Math.max(1, Math.floor(canvas.width / totalModules));
        const totalRenderWidth = totalModules * scale;
        const offsetX = Math.floor((canvas.width - totalRenderWidth) / 2);
        const offsetY = Math.floor((canvas.height - totalRenderWidth) / 2);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (modules[y * size + x]) {
                    ctx.fillRect(
                        offsetX + (x + quietZone) * scale,
                        offsetY + (y + quietZone) * scale,
                        scale,
                        scale
                    );
                }
            }
        }
    } catch (e) {
        console.error('Failed to render QR canvas:', e);
    }
}
