import { JpegEncoder } from './core/jpeg-encoder.js';
import { JpegDecoder } from './core/jpeg-decoder.js';
import { idctNaive, idctAAN } from './core/decoder/idct.js';
import { idctPureRef, idctOptimizedRef, idctFastAAN } from './core/decoder/idct-spec.js';
import { HuffmanTable } from './core/decoder/huffman-parser.js';
import { BitReader } from './utils/bit-reader.js';
import { dequantize, dequantizeBypass } from './core/decoder/dequantization.js';

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
        // FileReader is asynchronous. We define what happens when it finishes reading.
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // We must wait for the image to load before we can draw it or get its dimensions.
                originalCanvas.width = img.width;
                originalCanvas.height = img.height;
                const ctx = originalCanvas.getContext('2d');
                // Draw the image onto the canvas so we can access its pixel data later.
                ctx.drawImage(img, 0, 0);
                statusDiv.textContent = 'Image loaded. Ready to encode.';
            };
            img.src = event.target.result;
        };
        // Start reading the file as a Data URL (base64 string), which can be used as an image source.
        reader.readAsDataURL(file);
    });

    encodeBtn.addEventListener('click', async () => {
        statusDiv.textContent = 'Encoding...';
        await new Promise(r => setTimeout(r, 10)); //pause the browser for repaint

        try {
            const ctx = originalCanvas.getContext('2d');
            // Extract raw RGBA pixel data from the canvas. This is what the encoder needs.
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

            // Convert the raw JPEG bytes into a Blob (Binary Large Object).
            const blob = new Blob([jpegBytes.buffer], { type: 'image/jpeg' });
            // Create a temporary URL pointing to this Blob so we can display it in an <img> tag.
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

    // Tab switching
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });

    // Decoder logic
    const decodeInput = document.getElementById('decode-input');
    const decodeBtn = document.getElementById('decode-btn');
    const decodeStatus = document.getElementById('decode-status');
    const decodedCanvas = document.getElementById('decoded-canvas');

    decodeBtn.addEventListener('click', async () => {
        const file = decodeInput.files[0];
        if (!file) {
            decodeStatus.textContent = 'Please select a JPEG file first.';
            return;
        }

        decodeStatus.textContent = 'Decoding...';
        await new Promise(r => setTimeout(r, 10));

        try {
            const arrayBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            const decoder = new JpegDecoder();

            // Configure IDCT method
            const idctSelect = document.getElementById('idct-method');
            if (idctSelect) {
                switch (idctSelect.value) {
                    case 'pureRef':
                        decoder.setIdctMethod(idctPureRef);
                        console.log('Using Pure Ref IDCT (Spec Formula)');
                        break;
                    case 'optimizedRef':
                        decoder.setIdctMethod(idctOptimizedRef);
                        console.log('Using Optimized Ref IDCT (Separable)');
                        break;
                    case 'fastAAN':
                        decoder.setIdctMethod(idctFastAAN);
                        console.log('Using Fast AAN IDCT');
                        break;
                    case 'aan':
                        decoder.setIdctMethod(idctAAN);
                        console.log('Using Legacy AAN IDCT');
                        break;
                    case 'naive':
                    default:
                        decoder.setIdctMethod(idctNaive);
                        console.log('Using Legacy Naive IDCT');
                        break;
                }
            }

            // Configure Dequantization method
            const dequantSelect = document.getElementById('dequant-method');
            if (dequantSelect) {
                if (dequantSelect.value === 'bypass') {
                    decoder.setDequantizationMethod(dequantizeBypass);
                    console.log('Using Bypass Dequantization');
                } else {
                    decoder.setDequantizationMethod(dequantize);
                    console.log('Using Standard Dequantization');
                }
            }

            // Configure Huffman method
            const huffmanSelect = document.getElementById('huffman-method');
            if (huffmanSelect && huffmanSelect.value === 'naive') {
                HuffmanTable.setDecodeMethod('naive');
                console.log('Using Naive Huffman Decoding');
            } else {
                HuffmanTable.setDecodeMethod('optimized');
                console.log('Using Optimized Huffman Decoding');
            }

            // Configure BitReader method
            const bitReaderSelect = document.getElementById('bitreader-method');
            if (bitReaderSelect && bitReaderSelect.value === 'naive') {
                BitReader.setMode('naive');
                console.log('Using Naive BitReader');
            } else {
                BitReader.setMode('optimized');
                console.log('Using Optimized BitReader');
            }

            const passwordInput = document.getElementById('decrypt-password');
            const password = passwordInput ? passwordInput.value : null;

            const result = await decoder.decode(bytes, { password });

            decodedCanvas.width = result.width;
            decodedCanvas.height = result.height;
            const ctx = decodedCanvas.getContext('2d');
            const imageData = new ImageData(result.data, result.width, result.height);
            ctx.putImageData(imageData, 0, 0);

            decodeStatus.textContent = `Decoded! ${result.width}x${result.height}`;

            // Update Info Pane
            if (result.metadata) {
                document.getElementById('decoder-info-size').textContent = `${bytes.length} bytes`;
                document.getElementById('decoder-info-dims').textContent = `${result.metadata.width}x${result.metadata.height}`;
                document.getElementById('decoder-info-colorspace').textContent = result.metadata.colorSpace;
                document.getElementById('decoder-info-progressive').textContent = result.metadata.progressive ? 'Yes' : 'No';
                document.getElementById('decoder-info-chroma').textContent = result.metadata.chromaSubsampling;
            }

            // Handle Secret Data
            const secretSection = document.getElementById('secret-data-section');
            const secretSize = document.getElementById('secret-data-size');
            const downloadSecretBtn = document.getElementById('download-secret-btn');

            if (result.secretData) {
                secretSection.style.display = 'block';
                secretSize.textContent = result.secretData.length;

                downloadSecretBtn.onclick = () => {
                    const blob = new Blob([result.secretData], { type: 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'secret_data.bin'; // We don't know the original filename/type
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                };
            } else {
                secretSection.style.display = 'none';
            }
        } catch (e) {
            console.error(e);
            decodeStatus.textContent = 'Error: ' + e.message;
        }
    });

    document.getElementById('test-btn').addEventListener('click', () => {
        console.log('Starting diagnostic...');
        statusDiv.textContent = 'Running diagnostic...';
        // ... existing diagnostic code ...
        try {
            const width = 64;
            const height = 64;
            const data = new Uint8ClampedArray(width * height * 4);

            // Create a gradient
            // Create a gradient pattern manually
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    // Calculate the index in the 1D array for the pixel at (x, y).
                    // Each pixel takes 4 bytes (R, G, B, A).
                    const idx = (y * width + x) * 4;
                    data[idx] = x * 4;     // Red increases with X
                    data[idx + 1] = y * 4; // Green increases with Y
                    data[idx + 2] = 128;   // Blue is constant
                    data[idx + 3] = 255;   // Alpha (opacity) is full
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
