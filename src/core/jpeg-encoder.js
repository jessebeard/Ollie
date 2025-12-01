import { rgbToYcbcr } from './encoder/colorspace.js';
import { padDimensions, extractBlock } from './encoder/blocks.js';
import { forwardDCT } from './encoder/dct.js';
import { quantize, QUANTIZATION_TABLE_LUMA, QUANTIZATION_TABLE_CHROMA } from './encoder/quantization.js';
import { zigZag } from './encoder/zigzag.js';
import { encodeBlock, DC_LUMA_TABLE, AC_LUMA_TABLE } from './encoder/huffman.js';
import { BitWriter } from '../utils/bit-writer.js';
import { Jsteg } from './steganography/jsteg.js';

/**
 * JpegEncoder
 * 
 * This class implements a basic JPEG encoder.
 */
export class JpegEncoder {
    constructor(quality = 50, options = {}) {
        this.quality = quality;
        this.options = {
            writeSpiff: options.writeSpiff || false, // Default to false as JFIF is more common
            progressive: options.progressive || false,
            secretData: options.secretData || null,
            ...options
        };
    }

    /**
     * Encodes the provided ImageData into a JPEG byte array.
     * @param {ImageData|Object} imageData - Object containing width, height, and data (RGBA).
     * @returns {Uint8Array} The raw JPEG file bytes.
     */
    async encode(imageData) {
        console.log('JpegEncoder.encode called');
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        this.headers = [];
        const writer = new BitWriter();

        // Write the standard JPEG markers (SOI, APP0, DQT, SOF0/SOF2, DHT)
        // Note: SOS is written per scan now
        this.writeHeaders(writer, width, height);

        const padded = padDimensions(width, height);

        // Collect all blocks first
        const blocks = {
            Y: [],
            Cb: [],
            Cr: []
        };

        let blockCount = 0;
        // Process the image in 8x8 blocks
        for (let y = 0; y < padded.height; y += 8) {
            for (let x = 0; x < padded.width; x += 8) {
                blockCount++;
                if (blockCount % 1000 === 0) console.log('Processing block ' + blockCount);

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

                        // Convert RGB to YCbCr.
                        const ycbcr = rgbToYcbcr(r, g, b);
                        Y[row * 8 + col] = ycbcr.y - 128;
                        Cb[row * 8 + col] = ycbcr.cb - 128;
                        Cr[row * 8 + col] = ycbcr.cr - 128;
                    }
                }

                blocks.Y.push(this.prepareBlock(Y, QUANTIZATION_TABLE_LUMA));
                blocks.Cb.push(this.prepareBlock(Cb, QUANTIZATION_TABLE_CHROMA));
                blocks.Cr.push(this.prepareBlock(Cr, QUANTIZATION_TABLE_CHROMA));
            }
        }



        // Steganography: Embed secret data if provided
        if (this.options.secretData) {
            console.log('Embedding secret data...');
            const allBlocks = [];
            // Flatten blocks for embedding. Order matters!
            // We must traverse in the same order as we write scans if we want to stream,
            // but here we have all blocks.
            // The decoder will reconstruct blocks and we can extract from them.
            // The order of blocks in `blocks.Y`, `blocks.Cb`, `blocks.Cr` matches the order they were created (raster scan of MCUs).
            // However, `writeScan` interleaves them per MCU.
            // Jsteg doesn't care about interleaving as long as we pass the blocks in a deterministic order.
            // Let's pass them in component order (all Y, then all Cb, then all Cr) OR interleaved?
            // If we pass them as [All Y, All Cb, All Cr], the decoder must extract in that order.
            // The decoder usually decodes MCU by MCU.
            // If we want to extract *after* decoding the whole image, we will have [All Y, All Cb, All Cr] arrays in the decoder components.
            // So passing [All Y, All Cb, All Cr] is easiest for post-decode extraction.

            allBlocks.push(...blocks.Y);
            allBlocks.push(...blocks.Cb);
            allBlocks.push(...blocks.Cr);

            const capacity = Jsteg.calculateCapacity(allBlocks);
            console.log(`Capacity: ${capacity} bytes, Data: ${this.options.secretData.length} bytes`);

            if (this.options.secretData.length > capacity) {
                throw new Error(`Secret data (${this.options.secretData.length} bytes) exceeds image capacity (${capacity} bytes). Try a larger image or smaller file.`);
            }

            if (!await Jsteg.embedContainer(allBlocks, this.options.secretData, { ecc: true }, { password: this.options.password })) {
                throw new Error('Failed to embed secret data into image.');
            }
        }

        console.log('Finished preparing blocks. Writing scans...');

        if (this.options.progressive) {
            // Scan 1: DC (Ss=0, Se=0, Ah=0, Al=0)
            this.writeScan(writer, blocks, 0, 0);
            // Scan 2: AC (Ss=1, Se=63, Ah=0, Al=0)
            this.writeScan(writer, blocks, 1, 63);
        } else {
            // Baseline: Single scan (Ss=0, Se=63)
            this.writeScan(writer, blocks, 0, 63);
        }

        console.log('Finished writing scans, flushing writer');
        const body = writer.flush();
        console.log('Writer flushed, assembling file');
        return this.assembleFile(body);
    }

    prepareBlock(blockData, qTable) {
        // 1. Forward DCT
        const dct = forwardDCT(blockData);
        // 2. Quantization
        const quantized = quantize(dct, qTable);
        // 3. ZigZag
        return zigZag(quantized);
    }

    writeScan(writer, blocks, Ss, Se) {
        console.log(`Writing Scan: Ss=${Ss}, Se=${Se}`);

        // Write SOS marker
        this.writeSOS(writer, Ss, Se);

        let prevDC_Y = 0;
        let prevDC_Cb = 0;
        let prevDC_Cr = 0;

        const numBlocks = blocks.Y.length;
        for (let i = 0; i < numBlocks; i++) {
            // Interleaved scan: Y, Cb, Cr for each MCU (assuming 1x1 subsampling for now as per loop above)
            // Note: The loop above generates 4:4:4 blocks (1 Y, 1 Cb, 1 Cr per 8x8 pixel area)

            prevDC_Y = encodeBlock(blocks.Y[i], prevDC_Y, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
            prevDC_Cb = encodeBlock(blocks.Cb[i], prevDC_Cb, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
            prevDC_Cr = encodeBlock(blocks.Cr[i], prevDC_Cr, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
        }
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

        // APP8 (SPIFF) - Optional
        if (this.options.writeSpiff) {
            writeWord(0xFFE8);
            // Length: 2 + 6 ("SPIFF\0") + 2 (ver) + 1 (prof) + 1 (comp) + 4 (h) + 4 (w) + 1 (color) + 1 (bps) + 1 (compr) + 1 (unit) + 4 (vRes) + 4 (hRes)
            // = 2 + 6 + 2 + 1 + 1 + 4 + 4 + 1 + 1 + 1 + 1 + 4 + 4 = 32 bytes total length field value
            writeWord(32);
            writeArray([0x53, 0x50, 0x49, 0x46, 0x46, 0x00]); // "SPIFF\0"
            writeByte(1); writeByte(2); // Version 1.2
            writeByte(1); // Profile ID (1 = Continuous-tone base)
            writeByte(3); // Component count (3 for YCbCr)

            // Height (4 bytes)
            writeByte((height >> 24) & 0xFF);
            writeByte((height >> 16) & 0xFF);
            writeByte((height >> 8) & 0xFF);
            writeByte(height & 0xFF);

            // Width (4 bytes)
            writeByte((width >> 24) & 0xFF);
            writeByte((width >> 16) & 0xFF);
            writeByte((width >> 8) & 0xFF);
            writeByte(width & 0xFF);

            writeByte(4); // Color space (4 = YCbCr 3 - ITU-R BT.601-1)
            writeByte(8);  // Bits per sample
            writeByte(5);  // Compression type (5 = JPEG)
            writeByte(1);  // Resolution units (1 = dpi)

            // Vertical resolution (72 dpi)
            writeWord(0); writeWord(72);

            // Horizontal resolution (72 dpi)
            writeWord(0); writeWord(72);
        }

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

        // SOF0 (Baseline) or SOF2 (Progressive)
        if (this.options.progressive) {
            writeWord(0xFFC2); // SOF2
        } else {
            writeWord(0xFFC0); // SOF0
        }

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
        // DHT (Huffman Tables)
        this.writeDHT(writeByte, writeWord, writeArray, 0, 0, DC_LUMA_TABLE);
        this.writeDHT(writeByte, writeWord, writeArray, 0, 1, AC_LUMA_TABLE);
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

    writeSOS(writer, Ss, Se) {
        // SOS (Start of Scan)
        // Use writeMarker/writeRawByte to avoid byte stuffing and ensure alignment
        writer.writeMarker(0xFFDA);

        // Length (12 bytes)
        writer.writeRawByte(0);
        writer.writeRawByte(12);

        writer.writeRawByte(3); // Component count

        writer.writeRawByte(1); writer.writeRawByte(0x00); // Y
        writer.writeRawByte(2); writer.writeRawByte(0x00); // Cb
        writer.writeRawByte(3); writer.writeRawByte(0x00); // Cr

        writer.writeRawByte(Ss);
        writer.writeRawByte(Se);
        writer.writeRawByte(0); // Ah=0, Al=0
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
