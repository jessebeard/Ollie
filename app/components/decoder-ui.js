// @ts-nocheck -- DOM-heavy UI; checkJs adoption pending (see tsconfig.json note)
/**
 * Decoder UI logic
 */
import { JpegDecoder } from '../../src/codec/decoder.js';
import { idctNaive, idctAAN } from '../../src/algebraic/discrete-cosine/inverse-dct.js';
import { idctPureRef, idctOptimizedRef, idctFastAAN } from '../../src/algebraic/discrete-cosine/inverse-dct-spec.js';
import { HuffmanTable } from '../../src/automata/parsers/dht-automaton.js';
import { BitReader } from '../../src/automata/bit-streams/bit-reader.js';
import { dequantize, dequantizeBypass } from '../../src/algebraic/quantization/inverse-quantization.js';
import { logger } from '../../../../src/utils/logger.js';

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
                        logger.debug('Using Pure Ref IDCT (Spec Formula)');
                        break;
                    case 'optimizedRef':
                        decoder.setIdctMethod(idctOptimizedRef);
                        logger.debug('Using Optimized Ref IDCT (Separable)');
                        break;
                    case 'fastAAN':
                        decoder.setIdctMethod(idctFastAAN);
                        logger.debug('Using Fast AAN IDCT');
                        break;
                    case 'aan':
                        decoder.setIdctMethod(idctAAN);
                        logger.debug('Using Legacy AAN IDCT');
                        break;
                    case 'naive':
                    default:
                        decoder.setIdctMethod(idctNaive);
                        logger.debug('Using Legacy Naive IDCT');
                        break;
                }
            }

            const dequantSelect = document.getElementById('dequant-method');
            if (dequantSelect) {
                if (dequantSelect.value === 'bypass') {
                    decoder.setDequantizationMethod(dequantizeBypass);
                    logger.debug('Using Bypass Dequantization');
                } else {
                    decoder.setDequantizationMethod(dequantize);
                    logger.debug('Using Standard Dequantization');
                }
            }

            const huffmanSelect = document.getElementById('huffman-method');
            if (huffmanSelect && huffmanSelect.value === 'naive') {
                HuffmanTable.setDecodeMethod('naive');
                logger.debug('Using Naive Huffman Decoding');
            } else {
                HuffmanTable.setDecodeMethod('optimized');
                logger.debug('Using Optimized Huffman Decoding');
            }

            const bitReaderSelect = document.getElementById('bitreader-method');
            if (bitReaderSelect && bitReaderSelect.value === 'naive') {
                BitReader.setMode('naive');
                logger.debug('Using Naive BitReader');
            } else {
                BitReader.setMode('optimized');
                logger.debug('Using Optimized BitReader');
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
            logger.error(e);
            decodeStatus.textContent = 'Error: ' + e.message;
        }
    });
}
