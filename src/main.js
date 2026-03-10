/**
 * Main entry point for the JPEG Encoder/Decoder application.
 * Initializes UI modules.
 */
import { initEncoderUI } from '../app/components/encoder-ui.js';
import { initDecoderUI } from '../app/components/decoder-ui.js';
import { initTabs } from '../app/components/tabs.js';
import { JpegEncoder } from './codec/encoder.js';

function init() {
    
    initTabs();
    initEncoderUI();
    initDecoderUI();

    const testBtn = document.getElementById('test-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            const statusDiv = document.getElementById('status');
            const originalCanvas = document.getElementById('original-canvas');
            const processedCanvas = document.getElementById('processed-canvas');

            console.log('Starting diagnostic...');
            statusDiv.textContent = 'Running diagnostic...';

            try {
                const width = 64;
                const height = 64;
                const data = new Uint8ClampedArray(width * height * 4);

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        data[idx] = x * 4;     
                        data[idx + 1] = y * 4; 
                        data[idx + 2] = 128;   
                        data[idx + 3] = 255;   
                    }
                }

                originalCanvas.width = width;
                originalCanvas.height = height;
                const ctx = originalCanvas.getContext('2d');
                const imgDataObj = new ImageData(data, width, height);
                ctx.putImageData(imgDataObj, 0, 0);

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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
