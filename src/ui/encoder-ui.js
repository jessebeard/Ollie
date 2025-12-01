/**
 * Encoder UI logic
 */
import { JpegEncoder } from '../core/jpeg-encoder.js';

export function initEncoderUI() {
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

            const progressiveCheckbox = document.getElementById('progressive-checkbox');
            const isProgressive = progressiveCheckbox ? progressiveCheckbox.checked : false;

            // Read secret data if selected
            const secretInput = document.getElementById('secret-input');
            let secretData = null;
            if (secretInput && secretInput.files.length > 0) {
                const secretFile = secretInput.files[0];
                const buffer = await secretFile.arrayBuffer();
                secretData = new Uint8Array(buffer);
                console.log(`Loaded secret data: ${secretData.length} bytes`);
            }

            const passwordInput = document.getElementById('encrypt-password');
            const password = passwordInput ? passwordInput.value : null;

            const encoder = new JpegEncoder(90, {
                progressive: isProgressive,
                secretData: secretData,
                password: password
            });
            const jpegBytes = await encoder.encode(imageData);

            const blob = new Blob([jpegBytes.buffer], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            const resImg = new Image();
            resImg.onload = () => {
                processedCanvas.width = resImg.width;
                processedCanvas.height = resImg.height;
                const pCtx = processedCanvas.getContext('2d');
                pCtx.drawImage(resImg, 0, 0);
                statusDiv.textContent = `Encoded! Size: ${jpegBytes.length} bytes`;

                // Enable download
                const downloadBtn = document.getElementById('download-link');
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'encoded_image.jpg';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                };
                downloadBtn.style.display = 'inline-block';

                // Update Encoder Info Pane
                document.getElementById('encoder-info-size').textContent = `${jpegBytes.length} bytes`;
                document.getElementById('encoder-info-dims').textContent = `${resImg.width}x${resImg.height}`;
                document.getElementById('encoder-info-colorspace').textContent = 'YCbCr';
                document.getElementById('encoder-info-progressive').textContent = isProgressive ? 'Yes' : 'No';
                document.getElementById('encoder-info-chroma').textContent = '4:4:4';
            };
            resImg.src = url;
        } catch (e) {
            console.error(e);
            statusDiv.textContent = 'Error: ' + e.message;
        }
    });
}
