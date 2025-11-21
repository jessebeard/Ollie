import { rgbToYcbcr } from './core/colorspace.js';
import { padDimensions, extractBlock } from './core/blocks.js';
import { forwardDCT } from './core/dct.js';
import { quantize, QUANTIZATION_TABLE_LUMA, QUANTIZATION_TABLE_CHROMA } from './core/quantization.js';
import { zigZag } from './core/zigzag.js';
import { encodeBlock, DC_LUMA_TABLE, AC_LUMA_TABLE } from './core/huffman.js';
import { BitWriter } from './utils/bit-writer.js';

export class JpegEncoder {
    constructor(quality = 50) {
        this.quality = quality;
    }

    encode(imageData) {
        console.log('JpegEncoder.encode called');
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        this.headers = [];
        const writer = new BitWriter();

        this.writeHeaders(writer, width, height);

        const padded = padDimensions(width, height);
        let prevDC_Y = 0;
        let prevDC_Cb = 0;
        let prevDC_Cr = 0;

        let blockCount = 0;
        for (let y = 0; y < padded.height; y += 8) {
            for (let x = 0; x < padded.width; x += 8) {
                blockCount++;
                if (blockCount % 10 === 0) console.log('Processing block ' + blockCount);

                const Y = new Float32Array(64);
                const Cb = new Float32Array(64);
                const Cr = new Float32Array(64);

                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 8; col++) {
                        const srcX = Math.min(x + col, width - 1);
                        const srcY = Math.min(y + row, height - 1);
                        const idx = (srcY * width + srcX) * 4;

                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];

                        const ycbcr = rgbToYcbcr(r, g, b);
                        Y[row * 8 + col] = ycbcr.y - 128;
                        Cb[row * 8 + col] = ycbcr.cb - 128;
                        Cr[row * 8 + col] = ycbcr.cr - 128;
                    }
                }

                prevDC_Y = this.processBlock(Y, prevDC_Y, QUANTIZATION_TABLE_LUMA, writer, DC_LUMA_TABLE, AC_LUMA_TABLE);
                prevDC_Cb = this.processBlock(Cb, prevDC_Cb, QUANTIZATION_TABLE_CHROMA, writer, DC_LUMA_TABLE, AC_LUMA_TABLE);
                prevDC_Cr = this.processBlock(Cr, prevDC_Cr, QUANTIZATION_TABLE_CHROMA, writer, DC_LUMA_TABLE, AC_LUMA_TABLE);
            }
        }

        console.log('Finished processing blocks, flushing writer');
        const body = writer.flush();
        console.log('Writer flushed, assembling file');
        return this.assembleFile(body);
    }

    processBlock(blockData, prevDC, qTable, writer, dcTable, acTable) {
        const dct = forwardDCT(blockData);
        const quantized = quantize(dct, qTable);
        const zigzagged = zigZag(quantized);
        return encodeBlock(zigzagged, prevDC, writer, dcTable, acTable);
    }

    writeHeaders(writer, width, height) {
        console.log('Writing headers...');
        this.headers = [];

        const writeByte = (b) => this.headers.push(b);
        const writeWord = (w) => {
            writeByte((w >> 8) & 0xFF);
            writeByte(w & 0xFF);
        };
        const writeArray = (arr) => {
            for (let i = 0; i < arr.length; i++) writeByte(arr[i]);
        };

        // SOI
        writeWord(0xFFD8);

        // APP0 (JFIF)
        writeWord(0xFFE0);
        writeWord(16);
        writeArray([0x4A, 0x46, 0x49, 0x46, 0x00]);
        writeWord(0x0101);
        writeByte(0);
        writeWord(1);
        writeWord(1);
        writeByte(0);
        writeByte(0);

        // DQT (Quantization Tables)
        writeWord(0xFFDB);
        writeWord(2 + 1 + 64);
        writeByte(0);
        const lumaZigZag = zigZag(QUANTIZATION_TABLE_LUMA);
        for (let i = 0; i < 64; i++) writeByte(lumaZigZag[i]);

        writeWord(0xFFDB);
        writeWord(2 + 1 + 64);
        writeByte(1);
        const chromaZigZag = zigZag(QUANTIZATION_TABLE_CHROMA);
        for (let i = 0; i < 64; i++) writeByte(chromaZigZag[i]);

        // SOF0 (Start of Frame, Baseline DCT)
        writeWord(0xFFC0);
        writeWord(8 + 3 * 3);
        writeByte(8);
        writeWord(height);
        writeWord(width);
        writeByte(3);

        writeByte(1);
        writeByte(0x11);
        writeByte(0);

        writeByte(2);
        writeByte(0x11);
        writeByte(1);

        writeByte(3);
        writeByte(0x11);
        writeByte(1);

        // DHT (Huffman Tables)
        this.writeDHT(writeByte, writeWord, writeArray, 0, 0, DC_LUMA_TABLE);
        this.writeDHT(writeByte, writeWord, writeArray, 0, 1, AC_LUMA_TABLE);

        // SOS (Start of Scan)
        writeWord(0xFFDA);
        writeWord(12);
        writeByte(3);

        writeByte(1);
        writeByte(0x00);

        writeByte(2);
        writeByte(0x00);

        writeByte(3);
        writeByte(0x00);

        writeByte(0);
        writeByte(63);
        writeByte(0);
    }

    writeDHT(writeByte, writeWord, writeArray, id, type, tableObj) {
        writeWord(0xFFC4);

        // DC has 17 elements [0-16], AC has 16 elements [1-16]  
        const dcCounts = type === 0 ?
            [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0] :
            [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];

        const dcValues = type === 0 ?
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] :
            [
                0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
                0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
                0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
                0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
                0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
                0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
                0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
                0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
                0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
                0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
                0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
                0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
                0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
                0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
                0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
                0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
                0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4,
                0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
                0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
                0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
                0xf9, 0xfa
            ];

        let totalLen = 2 + 1 + 16 + dcValues.length;
        console.log('writeDHT: type=' + type + ', id=' + id + ', totalLen=' + totalLen);
        writeWord(totalLen);
        writeByte((type << 4) | id);
        // DC array has index 0 that should be skipped, AC array starts at index for length 1
        writeArray(type === 0 ? dcCounts.slice(1) : dcCounts);
        writeArray(dcValues);
    }

    assembleFile(scanData) {
        const headers = new Uint8Array(this.headers);
        const totalLength = headers.length + scanData.length + 2;
        const file = new Uint8Array(totalLength);

        file.set(headers, 0);
        file.set(scanData, headers.length);

        file[totalLength - 2] = 0xFF;
        file[totalLength - 1] = 0xD9;

        console.log('Headers length:', headers.length);
        console.log('Scan data length:', scanData.length);
        console.log('Total JPEG file size:', totalLength, 'bytes');

        return file;
    }
}
