import { JpegEncoder } from './jpeg-encoder.js';

function init() {
    const fileInput = document.getElementById('file-input');
    const originalCanvas = document.getElementById('original-canvas');
    const processedCanvas = document.getElementById('processed-canvas');
    const encodeBtn = document.getElementById('encode-btn');
    const statusDiv = document.getElementById('status');

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                originalCanvas.width = img.width;
                originalCanvas.height = img.height;
                const ctx = originalCanvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                statusDiv.textContent = 'Image loaded. Ready to encode.';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    encodeBtn.addEventListener('click', async () => {
        statusDiv.textContent = 'Encoding...';
        await new Promise(r => setTimeout(r, 10));

        try {
            const ctx = originalCanvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);

            const encoder = new JpegEncoder();
            const jpegBytes = encoder.encode(imageData);

            const blob = new Blob([jpegBytes.buffer], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            const resImg = new Image();
            resImg.onload = () => {
                processedCanvas.width = resImg.width;
                processedCanvas.height = resImg.height;
                const pCtx = processedCanvas.getContext('2d');
                pCtx.drawImage(resImg, 0, 0);
                statusDiv.textContent = `Encoded! Size: ${jpegBytes.length} bytes`;
            };
            resImg.src = url;
        } catch (e) {
            console.error(e);
            statusDiv.textContent = 'Error: ' + e.message;
        }
    });

    document.getElementById('test-btn').addEventListener('click', () => {
        console.log('Starting diagnostic...');
        statusDiv.textContent = 'Running diagnostic...';

        try {
            const width = 64;
            const height = 64;
            const data = new Uint8ClampedArray(width * height * 4);

            // Create a gradient
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    data[idx] = x * 4;     // R
                    data[idx + 1] = y * 4; // G
                    data[idx + 2] = 128;   // B
                    data[idx + 3] = 255;   // A
                }
            }

            // Show original
            originalCanvas.width = width;
            originalCanvas.height = height;
            const ctx = originalCanvas.getContext('2d');
            const imgDataObj = new ImageData(data, width, height);
            ctx.putImageData(imgDataObj, 0, 0);

            // Encode
            const encoder = new JpegEncoder();
            const jpegBytes = encoder.encode({ width, height, data });

            console.log('jpegBytes length:', jpegBytes.length);
            console.log('First 10 bytes:', Array.from(jpegBytes.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            console.log('Last 2 bytes:', Array.from(jpegBytes.slice(-2)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

            const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            const resImg = new Image();
            resImg.onload = () => {
                processedCanvas.width = resImg.width;
                processedCanvas.height = resImg.height;
                const pCtx = processedCanvas.getContext('2d');
                pCtx.drawImage(resImg, 0, 0);
                statusDiv.textContent = `Diagnostic Success! Size: ${jpegBytes.length} bytes`;
            };
            resImg.onerror = (e) => {
                console.error('Failed to load JPEG image', e);
                statusDiv.textContent = 'Diagnostic Failed: could not load image';
            };
            resImg.src = url;
        } catch (e) {
            console.error(e);
            statusDiv.textContent = 'Diagnostic Failed: ' + e.message;
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
