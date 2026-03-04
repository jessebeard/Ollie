/**
 * Decoder UI logic
 */
import { JpegDecoder } from '../core/jpeg-decoder.js';
import { idctNaive, idctAAN } from '../core/decoder/idct.js';
import { idctPureRef, idctOptimizedRef, idctFastAAN } from '../core/decoder/idct-spec.js';
import { HuffmanTable } from '../core/decoder/huffman-parser.js';
import { BitReader } from '../utils/bit-reader.js';
import { dequantize, dequantizeBypass } from '../core/decoder/dequantization.js';

export function initDecoderUI() {
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

            const huffmanSelect = document.getElementById('huffman-method');
            if (huffmanSelect && huffmanSelect.value === 'naive') {
                HuffmanTable.setDecodeMethod('naive');
                console.log('Using Naive Huffman Decoding');
            } else {
                HuffmanTable.setDecodeMethod('optimized');
                console.log('Using Optimized Huffman Decoding');
            }

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

            const [result, err] = await decoder.decode(bytes, { password });
            if (err) throw err;

            decodedCanvas.width = result.width;
            decodedCanvas.height = result.height;
            const ctx = decodedCanvas.getContext('2d');
            const imageData = new ImageData(result.data, result.width, result.height);
            ctx.putImageData(imageData, 0, 0);

            decodeStatus.textContent = `Decoded! ${result.width}x${result.height}`;

            if (result.metadata) {
                document.getElementById('decoder-info-size').textContent = `${bytes.length} bytes`;
                document.getElementById('decoder-info-dims').textContent = `${result.metadata.width}x${result.metadata.height}`;
                document.getElementById('decoder-info-colorspace').textContent = result.metadata.colorSpace;
                document.getElementById('decoder-info-progressive').textContent = result.metadata.progressive ? 'Yes' : 'No';
                document.getElementById('decoder-info-chroma').textContent = result.metadata.chromaSubsampling;
            }

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
                    a.download = 'secret_data.bin';
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
}
