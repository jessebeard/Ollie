import { rgbToYcbcr } from '../algebraic/colorspace/rgb-to-ycbcr.js';
import { padDimensions, padDimensions420, extractBlock } from '../algebraic/mappings/blocks.js';
import { forwardDCT } from '../algebraic/discrete-cosine/forward-dct.js';
import { quantize, QUANTIZATION_TABLE_LUMA, QUANTIZATION_TABLE_CHROMA, getScaledQuantizationTables } from '../algebraic/quantization/forward-quantization.js';
import { zigZag } from '../algebraic/mappings/forward-zigzag.js';
import { encodeBlock, DC_LUMA_TABLE, AC_LUMA_TABLE } from '../automata/entropy-coding/huffman-encoder-fsm.js';
import { BitWriter } from '../automata/bit-streams/bit-writer.js';
import { F5 } from '../information-theory/steganography/f5-syndrome.js';
import { downsampleBlock420, extractLumaBlocks420 } from '../algebraic/mappings/downsampling.js';

/**
 * JpegEncoder
 * 
 * This class implements a basic JPEG encoder.
 */
export class JpegEncoder {
    constructor(quality = 50, options = {}) {
        this.quality = quality;
        this.options = {
            writeSpiff: options.writeSpiff || false,
            progressive: options.progressive || false,
            secretData: options.secretData || null,
            subsampling: options.subsampling || '4:4:4', // '4:4:4' or '4:2:0'
            restartInterval: options.restartInterval || 0,
            ...options
        };
        // Store subsampling for methods that need it
        this.subsampling = this.options.subsampling;
    }

    /**
     * Flattens Y, Cb, Cr blocks into a single array for steganography.
     */
    flattenBlocks(blocks) {
        const yLen = blocks.Y.length;
        const cbLen = blocks.Cb.length;
        const crLen = blocks.Cr.length;
        const allBlocks = new Array(yLen + cbLen + crLen);
        let idx = 0;
        for (let i = 0; i < yLen; i++) allBlocks[idx++] = blocks.Y[i];
        for (let i = 0; i < cbLen; i++) allBlocks[idx++] = blocks.Cb[i];
        for (let i = 0; i < crLen; i++) allBlocks[idx++] = blocks.Cr[i];
        return allBlocks;
    }

    /**
     * Embeds secret data into blocks with automatic ECC fallback.
     */
    async embedSecretData(allBlocks) {
        const userEccSetting = this.options.metadata?.ecc;
        const userEccProfile = this.options.metadata?.eccProfile;

        let useEcc = userEccSetting !== false;
        let eccProfile = userEccProfile || 'Medium';

        console.log(`ECC settings: ecc=${useEcc}, profile=${eccProfile}`);

        let metadata = {
            ecc: useEcc,
            eccProfile: eccProfile,
            ...this.options.metadata
        };

        let capacity = F5.calculateCapacity(allBlocks, {
            format: 'container',
            metadata: metadata,
            ecc: useEcc,
            eccProfile: eccProfile,
            encrypted: !!this.options.password
        });

        // Auto-fallback to no-ECC if ECC capacity is insufficient
        if (capacity < this.options.secretData.length && useEcc && userEccSetting !== true) {
            console.log(`ECC capacity (${capacity} bytes) insufficient, trying without ECC...`);
            useEcc = false;
            metadata.ecc = false;
            capacity = F5.calculateCapacity(allBlocks, {
                format: 'container',
                metadata: metadata,
                ecc: false,
                encrypted: !!this.options.password
            });
            console.log(`No-ECC capacity: ${capacity} bytes`);
        }

        console.log(`Capacity: ${capacity} bytes, Data: ${this.options.secretData.length} bytes (ECC: ${useEcc})`);

        if (this.options.secretData.length > capacity) {
            return [null, new Error(`Secret data (${this.options.secretData.length} bytes) exceeds image capacity (${capacity} bytes). Try a larger image or smaller file.`)];
        }

        const result = await F5.embedContainer(allBlocks, this.options.secretData, metadata, { password: this.options.password });
        if (!result) {
            return [null, new Error('Failed to embed secret data into image.')];
        }
        return [true, null];
    }

    /**
     * Writes progressive or baseline scans.
     */
    writeScans(writer, blocks) {
        if (this.options.progressive) {
            this.writeScan(writer, blocks, 0, 0);
            this.writeScan(writer, blocks, 1, 63);
        } else {
            this.writeScan(writer, blocks, 0, 63);
        }
    }

    /**
     * Creates header writer helper functions.
     */
    createHeaderWriters() {
        this.headers = [];
        const writeByte = (b) => this.headers.push(b);
        const writeWord = (w) => {
            writeByte((w >> 8) & 0xFF);
            writeByte(w & 0xFF);
        };
        const writeArray = (arr) => {
            for (let i = 0; i < arr.length; i++) writeByte(arr[i]);
        };
        return { writeByte, writeWord, writeArray };
    }

    /**
     * Writes SOI, APP0 (JFIF), and optional SPIFF markers.
     */
    writeCommonHeaders(writeByte, writeWord, writeArray, width, height) {
        writeWord(0xFFD8);
        writeWord(0xFFE0);
        writeWord(16);
        writeArray([0x4A, 0x46, 0x49, 0x46, 0x00]);
        writeWord(0x0101);
        writeByte(0);
        writeWord(1);
        writeWord(1);
        writeByte(0);
        writeByte(0);

        if (this.options.writeSpiff) {
            writeWord(0xFFE8);
            writeWord(32);
            writeArray([0x53, 0x50, 0x49, 0x46, 0x46, 0x00]);
            writeByte(1); writeByte(2);
            writeByte(1);
            writeByte(3);
            writeByte((height >> 24) & 0xFF);
            writeByte((height >> 16) & 0xFF);
            writeByte((height >> 8) & 0xFF);
            writeByte(height & 0xFF);
            writeByte((width >> 24) & 0xFF);
            writeByte((width >> 16) & 0xFF);
            writeByte((width >> 8) & 0xFF);
            writeByte(width & 0xFF);
            writeByte(4);
            writeByte(8);
            writeByte(5);
            writeByte(1);
            writeWord(0); writeWord(72);
            writeWord(0); writeWord(72);
        }

        if (this.options.restartInterval > 0) {
            writeWord(0xFFDD);
            writeWord(4);
            writeWord(this.options.restartInterval);
        }
    }

    /**
     * Writes SOF marker (SOF0 for baseline, SOF2 for progressive).
     * Sampling factors: 4:4:4 = 0x11 for all, 4:2:0 = 0x22 for Y, 0x11 for Cb/Cr
     */
    writeSOF(writeByte, writeWord, width, height, subsampling = '4:4:4') {
        writeWord(this.options.progressive ? 0xFFC2 : 0xFFC0);
        writeWord(8 + 3 * 3);
        writeByte(8);
        writeWord(height);
        writeWord(width);
        writeByte(3);

        if (subsampling === '4:2:0') {
            // Y: 2x2 sampling (4 blocks per MCU)
            writeByte(1); writeByte(0x22); writeByte(0);
            // Cb: 1x1 sampling (1 block per MCU)
            writeByte(2); writeByte(0x11); writeByte(1);
            // Cr: 1x1 sampling (1 block per MCU)
            writeByte(3); writeByte(0x11); writeByte(1);
        } else {
            // 4:4:4: all components 1x1
            writeByte(1); writeByte(0x11); writeByte(0);
            writeByte(2); writeByte(0x11); writeByte(1);
            writeByte(3); writeByte(0x11); writeByte(1);
        }
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

        const [qTables] = getScaledQuantizationTables(this.quality);

        this.writeHeaders(writer, width, height, qTables);

        const blocks = {
            Y: [],
            Cb: [],
            Cr: []
        };

        if (this.subsampling === '4:2:0') {
            // 4:2:0 mode: 16x16 MCUs, 4 Y blocks + 1 Cb + 1 Cr per MCU
            const [padded] = padDimensions420(width, height);
            let mcuCount = 0;

            for (let mcuY = 0; mcuY < padded.height; mcuY += 16) {
                for (let mcuX = 0; mcuX < padded.width; mcuX += 16) {
                    mcuCount++;
                    if (mcuCount % 500 === 0) console.log('Processing MCU ' + mcuCount);

                    // Extract 4 Y blocks (8x8 each) from the 16x16 MCU
                    // Order: [0][1]
                    //        [2][3]
                    const yOffsets = [[0, 0], [8, 0], [0, 8], [8, 8]];
                    for (const [dx, dy] of yOffsets) {
                        const Y = new Float32Array(64);
                        for (let row = 0; row < 8; row++) {
                            for (let col = 0; col < 8; col++) {
                                const srcX = Math.min(mcuX + dx + col, width - 1);
                                const srcY = Math.min(mcuY + dy + row, height - 1);
                                const idx = (srcY * width + srcX) * 4;
                                const r = data[idx];
                                const g = data[idx + 1];
                                const b = data[idx + 2];
                                const [ycbcr] = rgbToYcbcr(r, g, b);
                                Y[row * 8 + col] = ycbcr.y - 128;
                            }
                        }
                        blocks.Y.push(this.prepareBlock(Y, qTables.luma));
                    }

                    // Extract Cb and Cr from 16x16 region, downsample to 8x8
                    const Cb = new Float32Array(64);
                    const Cr = new Float32Array(64);
                    for (let row = 0; row < 8; row++) {
                        for (let col = 0; col < 8; col++) {
                            // Average 2x2 pixels
                            let sumCb = 0, sumCr = 0;
                            for (let dy = 0; dy < 2; dy++) {
                                for (let dx = 0; dx < 2; dx++) {
                                    const srcX = Math.min(mcuX + col * 2 + dx, width - 1);
                                    const srcY = Math.min(mcuY + row * 2 + dy, height - 1);
                                    const idx = (srcY * width + srcX) * 4;
                                    const r = data[idx];
                                    const g = data[idx + 1];
                                    const b = data[idx + 2];
                                    const [ycbcr] = rgbToYcbcr(r, g, b);
                                    sumCb += ycbcr.cb;
                                    sumCr += ycbcr.cr;
                                }
                            }
                            Cb[row * 8 + col] = (sumCb / 4) - 128;
                            Cr[row * 8 + col] = (sumCr / 4) - 128;
                        }
                    }
                    blocks.Cb.push(this.prepareBlock(Cb, qTables.chroma));
                    blocks.Cr.push(this.prepareBlock(Cr, qTables.chroma));
                }
            }
        } else {
            // 4:4:4 mode: 8x8 MCUs, 1 Y + 1 Cb + 1 Cr per MCU
            const [padded] = padDimensions(width, height);
            let blockCount = 0;

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

                            const [ycbcr] = rgbToYcbcr(r, g, b);
                            Y[row * 8 + col] = ycbcr.y - 128;
                            Cb[row * 8 + col] = ycbcr.cb - 128;
                            Cr[row * 8 + col] = ycbcr.cr - 128;
                        }
                    }

                    blocks.Y.push(this.prepareBlock(Y, qTables.luma));
                    blocks.Cb.push(this.prepareBlock(Cb, qTables.chroma));
                    blocks.Cr.push(this.prepareBlock(Cr, qTables.chroma));
                }
            }
        }

        if (this.options.secretData) {
            console.log('Embedding secret data...');
            let blocksForEmbedding = blocks;

            // CRITICAL FIX: Reorder 4:2:0 Y blocks to row-major order for embedding.
            // The encoder generates blocks in MCU-linear order, but the decoder reads them in row-major order.
            // We must embed into the row-major view so the data ends up in the correct visual blocks consistent with the decoder.
            if (this.subsampling === '4:2:0') {
                console.log('Reordering 4:2:0 blocks to row-major for embedding...');
                // We need the padded dimensions here. 'padded' variable is available in this scope?
                // Actually 'padded' is scoped to the if block above. We need to recalculate or access it.
                // We can use 'mcuCount' derived from blocks.Cb.length or recalculate.

                // Recalculate padded dimensions to be safe
                const [padded] = padDimensions420(width, height);
                const mcuCols = padded.width / 16;
                const blocksH = padded.width / 8;
                const blocksV = padded.height / 8;
                const rowMajorY = [];

                for (let r = 0; r < blocksV; r++) {
                    for (let c = 0; c < blocksH; c++) {
                        const mcuRow = Math.floor(r / 2);
                        const mcuCol = Math.floor(c / 2);
                        const mcuIndex = mcuRow * mcuCols + mcuCol;
                        const blockIndex = (r % 2) * 2 + (c % 2);

                        // blocks.Y is in MCU order: [MCU0_0, MCU0_1, MCU0_2, MCU0_3, MCU1_0...]
                        rowMajorY.push(blocks.Y[mcuIndex * 4 + blockIndex]);
                    }
                }

                // Use the row-major Y blocks for embedding (shared references)
                blocksForEmbedding = { Y: rowMajorY, Cb: blocks.Cb, Cr: blocks.Cr };
            }

            const [, embedErr] = await this.embedSecretData(this.flattenBlocks(blocksForEmbedding));
            if (embedErr) throw embedErr;
        }

        console.log('Finished preparing blocks. Writing scans...');
        this.writeScans(writer, blocks);

        console.log('Finished writing scans, flushing writer');
        const body = writer.flush();
        console.log('Writer flushed, assembling file');
        return this.assembleFile(body);
    }

    /**
     * Upsamples chroma blocks to match luma block count for 4:4:4 encoding.
     * 
     * For 4:2:0 subsampled images, Cb/Cr have 1/4 the blocks of Y.
     * This method duplicates chroma blocks to match the Y block count,
     * enabling simple 4:4:4 interleaving in writeScan().
     * 
     * @param {Object} blocks - { Y, Cb, Cr } block arrays
     * @returns {Object} Blocks with Cb/Cr upsampled to match Y count
     */
    upsampleChromaBlocks(blocks) {
        const yCount = blocks.Y.length;
        const cbCount = blocks.Cb.length;
        const crCount = blocks.Cr.length;

        // If already 4:4:4, no upsampling needed
        if (cbCount === yCount && crCount === yCount) {
            return blocks;
        }

        console.log(`Upsampling chroma: Y=${yCount}, Cb=${cbCount}, Cr=${crCount}`);

        // Calculate subsampling ratio (typically 4 for 4:2:0)
        const cbRatio = Math.round(yCount / cbCount);
        const crRatio = Math.round(yCount / crCount);

        // Upsample by duplicating blocks
        const upsampledCb = new Array(yCount);
        const upsampledCr = new Array(yCount);

        for (let i = 0; i < yCount; i++) {
            // Map Y block index to chroma block index
            upsampledCb[i] = blocks.Cb[Math.floor(i / cbRatio)] || blocks.Cb[cbCount - 1];
            upsampledCr[i] = blocks.Cr[Math.floor(i / crRatio)] || blocks.Cr[crCount - 1];
        }

        return {
            Y: blocks.Y,
            Cb: upsampledCb,
            Cr: upsampledCr
        };
    }

    /**
     * Encodes JPEG from pre-calculated DCT coefficients (lossless path).
     * 
     * This method enables lossless transcoding by accepting coefficients directly,
     * bypassing the lossy DCT and quantization steps.
     * 
     * @param {Object} coefficients - Component coefficients from decoder (indexed by component ID)
     * @param {Map} quantizationTables - Original quantization tables to preserve
     * @param {Object} metadata - { width, height, chromaSubsampling? }
     * @returns {Promise<Uint8Array>} The raw JPEG file bytes
     */
    async encodeCoefficients(coefficients, quantizationTables, metadata) {
        console.log('JpegEncoder.encodeCoefficients called');
        const { width, height } = metadata;

        // Detect component IDs dynamically (e.g. 1,2,3 or 0,1,2)
        const compIds = Object.keys(coefficients).map(id => parseInt(id, 10)).sort((a, b) => a - b);

        if (compIds.length < 3) {
            console.warn(`Warning: Image has fewer than 3 components (${compIds.length}). Grayscale not fully supported in simple encoder yet.`);
            // Fallback for grayscale might be needed, but assuming mostly YCbCr for now
        }

        const idY = compIds[0];
        const idCb = compIds[1];
        const idCr = compIds[2];

        console.log(`Using component IDs: Y=${idY}, Cb=${idCb}, Cr=${idCr}`);

        // Detect subsampling from block counts
        const yCount = coefficients[idY].blocks.length;
        const cbCount = coefficients[idCb].blocks.length;
        const crCount = coefficients[idCr].blocks.length;

        // Determine source subsampling
        if (yCount === cbCount * 4 && yCount === crCount * 4) {
            this.subsampling = '4:2:0';
            console.log('Detected 4:2:0 subsampling (preserving)');
        } else if (yCount === cbCount && yCount === crCount) {
            this.subsampling = '4:4:4';
            console.log('Detected 4:4:4 subsampling');
        } else {
            // If subsampling ratio doesn't match standard, fall back to upsampling to 4:4:4
            console.log(`Non-standard subsampling detected (Y=${yCount}, Cb=${cbCount}, Cr=${crCount}), upsampling to 4:4:4`);
            this.subsampling = '4:4:4';
        }

        this.headers = [];
        const writer = new BitWriter();

        this.writeHeadersWithTables(writer, width, height, quantizationTables);

        let blocks = {
            Y: coefficients[idY].blocks,
            Cb: coefficients[idCb].blocks,
            Cr: coefficients[idCr].blocks,
            // Store blocksH for row-major indexing in writeScan
            blocksH: coefficients[idY].blocksH
        };

        // Only upsample if we're outputting 4:4:4 but have subsampled input
        if (this.subsampling === '4:4:4' && yCount !== cbCount) {
            blocks = this.upsampleChromaBlocks(blocks);
        }

        if (this.options.secretData) {
            console.log('Embedding secret data into coefficients...');
            const [, embedErr] = await this.embedSecretData(this.flattenBlocks(blocks));
            if (embedErr) throw embedErr;
        }

        console.log('Writing scans from coefficients...');
        this.writeScans(writer, blocks);

        console.log('Flushing writer...');
        const body = writer.flush();
        return this.assembleFile(body);
    }

    prepareBlock(blockData, qTable) {

        const [dct] = forwardDCT(blockData);

        const [quantized] = quantize(dct, qTable);

        const [zigzagged] = zigZag(quantized);
        return zigzagged;
    }

    writeScan(writer, blocks, Ss, Se) {
        console.log(`Writing Scan: Ss=${Ss}, Se=${Se}, subsampling=${this.subsampling}`);

        this.writeSOS(writer, Ss, Se);

        let prevDC_Y = 0;
        let prevDC_Cb = 0;
        let prevDC_Cr = 0;

        let mcusSinceRestart = 0;
        let expectedRstMarker = 0;

        const handleRestart = () => {
            if (this.options.restartInterval > 0 && mcusSinceRestart === this.options.restartInterval) {
                writer.writeMarker(0xFFD0 + expectedRstMarker);
                expectedRstMarker = (expectedRstMarker + 1) % 8;
                mcusSinceRestart = 0;
                prevDC_Y = 0;
                prevDC_Cb = 0;
                prevDC_Cr = 0;
            }
        };

        if (this.subsampling === '4:2:0') {
            // 4:2:0: Each MCU has 4 Y blocks + 1 Cb + 1 Cr
            const numMCUs = blocks.Cb.length; // Cb/Cr count = MCU count

            // Check if blocks have row-major storage (from decoder via encodeCoefficients)
            // vs MCU-linear storage (from encode())
            const blocksH = blocks.blocksH; // Will be undefined for MCU-linear storage

            if (blocksH) {
                // Row-major storage: compute correct indices
                const mcuCols = blocksH / 2; // Y blocksH = mcuCols * 2
                console.log(`4:2:0 encoding (row-major): numMCUs=${numMCUs}, blocksH=${blocksH}, mcuCols=${mcuCols}`);

                for (let mcu = 0; mcu < numMCUs; mcu++) {
                    handleRestart();
                    const mcuRow = Math.floor(mcu / mcuCols);
                    const mcuCol = mcu % mcuCols;

                    // Encode 4 Y blocks per MCU in correct order
                    for (let j = 0; j < 4; j++) {
                        const blockRow = mcuRow * 2 + Math.floor(j / 2);
                        const blockCol = mcuCol * 2 + (j % 2);
                        const yIndex = blockRow * blocksH + blockCol;
                        [prevDC_Y] = encodeBlock(blocks.Y[yIndex], prevDC_Y, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
                    }
                    [prevDC_Cb] = encodeBlock(blocks.Cb[mcu], prevDC_Cb, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
                    [prevDC_Cr] = encodeBlock(blocks.Cr[mcu], prevDC_Cr, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);

                    mcusSinceRestart++;
                }
            } else {
                // MCU-linear storage (from encode()): blocks already in correct order
                console.log(`4:2:0 encoding (MCU-linear): numMCUs=${numMCUs}`);

                for (let mcu = 0; mcu < numMCUs; mcu++) {
                    handleRestart();
                    for (let j = 0; j < 4; j++) {
                        [prevDC_Y] = encodeBlock(blocks.Y[mcu * 4 + j], prevDC_Y, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
                    }
                    [prevDC_Cb] = encodeBlock(blocks.Cb[mcu], prevDC_Cb, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
                    [prevDC_Cr] = encodeBlock(blocks.Cr[mcu], prevDC_Cr, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);

                    mcusSinceRestart++;
                }
            }
        } else {
            // 4:4:4: Each MCU has 1 Y + 1 Cb + 1 Cr
            const numBlocks = blocks.Y.length;
            for (let i = 0; i < numBlocks; i++) {
                handleRestart();
                [prevDC_Y] = encodeBlock(blocks.Y[i], prevDC_Y, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
                [prevDC_Cb] = encodeBlock(blocks.Cb[i], prevDC_Cb, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
                [prevDC_Cr] = encodeBlock(blocks.Cr[i], prevDC_Cr, writer, DC_LUMA_TABLE, AC_LUMA_TABLE, Ss, Se);
                mcusSinceRestart++;
            }
        }
    }

    writeHeaders(writer, width, height, qTables) {
        console.log('Writing headers...');
        const { writeByte, writeWord, writeArray } = this.createHeaderWriters();

        this.writeCommonHeaders(writeByte, writeWord, writeArray, width, height);

        writeWord(0xFFDB);
        writeWord(2 + 1 + 64);
        writeByte(0);
        const [lumaZigZag] = zigZag(qTables.luma);
        for (let i = 0; i < 64; i++) writeByte(lumaZigZag[i]);

        writeWord(0xFFDB);
        writeWord(2 + 1 + 64);
        writeByte(1);
        const [chromaZigZag] = zigZag(qTables.chroma);
        for (let i = 0; i < 64; i++) writeByte(chromaZigZag[i]);

        this.writeSOF(writeByte, writeWord, width, height, this.subsampling);
        this.writeDHT(writeByte, writeWord, writeArray, 0, 0, DC_LUMA_TABLE);
        this.writeDHT(writeByte, writeWord, writeArray, 0, 1, AC_LUMA_TABLE);
    }

    /**
     * Write headers with custom quantization tables (for lossless transcoding)
     */
    writeHeadersWithTables(writer, width, height, quantizationTables) {
        console.log('Writing headers with custom quantization tables...');
        const { writeByte, writeWord, writeArray } = this.createHeaderWriters();

        this.writeCommonHeaders(writeByte, writeWord, writeArray, width, height);

        const lumaTable = quantizationTables.get(0);
        const chromaTable = quantizationTables.get(1);

        if (lumaTable) {
            writeWord(0xFFDB);
            writeWord(2 + 1 + 64);
            writeByte(0);
            for (let i = 0; i < 64; i++) writeByte(lumaTable[i]);
        }

        if (chromaTable) {
            writeWord(0xFFDB);
            writeWord(2 + 1 + 64);
            writeByte(1);
            for (let i = 0; i < 64; i++) writeByte(chromaTable[i]);
        }

        this.writeSOF(writeByte, writeWord, width, height, this.subsampling);
        this.writeDHT(writeByte, writeWord, writeArray, 0, 0, DC_LUMA_TABLE);
        this.writeDHT(writeByte, writeWord, writeArray, 0, 1, AC_LUMA_TABLE);
    }

    writeDHT(writeByte, writeWord, writeArray, id, type, tableObj) {
        writeWord(0xFFC4);

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

        writeArray(type === 0 ? dcCounts.slice(1) : dcCounts);
        writeArray(dcValues);
    }

    writeSOS(writer, Ss, Se) {

        writer.writeMarker(0xFFDA);

        writer.writeRawByte(0);
        writer.writeRawByte(12);

        writer.writeRawByte(3);

        writer.writeRawByte(1); writer.writeRawByte(0x00);
        writer.writeRawByte(2); writer.writeRawByte(0x00);
        writer.writeRawByte(3); writer.writeRawByte(0x00);

        writer.writeRawByte(Ss);
        writer.writeRawByte(Se);
        writer.writeRawByte(0);
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
