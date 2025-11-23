/**
 * JPEG Decoder - Main class that orchestrates the complete decoding pipeline
 * 
 * Decodes baseline sequential DCT JPEG files with Huffman coding.
 * Supports grayscale and color images with various chroma subsampling (4:4:4, 4:2:2, 4:2:0).
 */

import { parseFileStructure, MARKERS } from './utils/marker-parser.js';
import { parseAllHuffmanTables } from './core/decoder/huffman-parser.js';
import { parseAllQuantizationTables } from './core/decoder/quantization-parser.js';
import { parseFrameHeader } from './core/decoder/frame-parser.js';
import { parseScanHeader } from './core/decoder/scan-parser.js';
import { BitReader } from './utils/bit-reader.js';
import { decodeBlock } from './core/decoder/huffman-decoder.js';
import { inverseZigZag } from './core/decoder/inverse-zigzag.js';
import { dequantize } from './core/decoder/dequantization.js';
import { idctPureRef, idctOptimizedRef, idctFastAAN } from './core/decoder/idct-spec.js';
import { idctAAN, idctNaive } from './core/decoder/idct.js';
import { upsampleChroma } from './core/decoder/upsampling.js';
import { assembleBlocks, componentsToImageData, grayscaleToImageData } from './core/decoder/block-assembly.js';

export class JpegDecoder {
    constructor() {
        this.hardreset();
    }

    reset() {
        this.quantizationTables = new Map();
        this.huffmanTables = new Map();
        this.frameHeader = null;
        this.scanHeader = null;
        this.components = {};
    }

    hardreset() {
        this.reset();
        this.idctMethod = idctPureRef;
    }

    /**
     * Set the IDCT implementation to use
     * @param {Function} method - IDCT function
     */
    setIdctMethod(method) {
        if (typeof method === 'string') {
            switch (method) {
                case 'pureRef':
                    this.idctMethod = idctPureRef;
                    break;
                case 'optimizedRef':
                    this.idctMethod = idctOptimizedRef;
                    break;
                case 'fastAAN':
                    this.idctMethod = idctFastAAN;
                    break;
                case 'aan':
                    this.idctMethod = idctAAN;
                    break;
                case 'naive':
                    this.idctMethod = idctNaive;
                    break;
                default:
                    throw new Error(`Unknown IDCT method identifier: ${method}`);
            }
        } else if (typeof method === 'function') {
            this.idctMethod = method;
        } else {
            throw new Error('setIdctMethod expects a function or a known method identifier string');
        }
    }




    /**
     * Decode a JPEG byte array into ImageData
     * 
     * @param {Uint8Array} jpegBytes - JPEG file bytes
     * @returns {{data: Uint8ClampedArray, width: number, height: number}} ImageData-compatible object
     */
    decode(jpegBytes) {
        this.reset();

        // Phase 1: Parse file structure and headers
        const segments = parseFileStructure(jpegBytes);

        // Validate SOI marker
        if (!segments.has('SOI')) {
            throw new Error('Invalid JPEG: Missing SOI marker');
        }

        // Parse quantization tables (DQT)
        if (segments.has('DQT')) {
            const dqtSegments = segments.get('DQT');
            for (const segment of dqtSegments) {
                const tables = parseAllQuantizationTables(segment.data);
                for (const [id, table] of tables) {
                    this.quantizationTables.set(id, table);
                }
            }
        }

        // Parse Huffman tables (DHT)
        if (segments.has('DHT')) {
            const dhtSegments = segments.get('DHT');
            for (const segment of dhtSegments) {
                const tables = parseAllHuffmanTables(segment.data);
                for (const [key, table] of tables) {
                    this.huffmanTables.set(key, table);
                }
            }
        }

        // Parse frame header (SOF0)
        if (!segments.has('SOF0')) {
            throw new Error('Unsupported JPEG: Only baseline sequential DCT (SOF0) is supported');
        }
        this.frameHeader = parseFrameHeader(segments.get('SOF0')[0].data);

        // Parse scan header (SOS)
        if (!segments.has('SOS')) {
            throw new Error('Invalid JPEG: Missing SOS marker');
        }
        const sosSegment = segments.get('SOS')[0];
        this.scanHeader = parseScanHeader(sosSegment.data, this.frameHeader);

        // Phase 2: Decode entropy-coded data
        const scanData = sosSegment.scanData;
        if (!scanData) {
            throw new Error('Invalid JPEG: Missing scan data');
        }

        this.decodeScans(scanData);

        // Phase 3: Reconstruct and assemble image
        return this.assembleImage();
    }

    /**
     * Decode entropy-coded scan data
     * 
     * @param {Uint8Array} scanData - Raw scan data bytes
     */
    decodeScans(scanData) {
        const bitReader = new BitReader(scanData);
        const { mcuCols, mcuRows } = this.frameHeader;
        const totalMCUs = mcuCols * mcuRows;

        // Initialize component storage
        this.components = {};
        for (const comp of this.frameHeader.components) {
            const blocksH = mcuCols * comp.hSampling;
            const blocksV = mcuRows * comp.vSampling;
            const totalBlocks = blocksH * blocksV;

            if (totalBlocks <= 0 || totalBlocks > 1000000 || !Number.isFinite(totalBlocks)) {
                throw new Error(`Invalid block count: ${totalBlocks} (blocksH=${blocksH}, blocksV=${blocksV})`);
            }

            this.components[comp.id] = {
                blocks: new Array(totalBlocks),
                blocksH,
                blocksV,
                hSampling: comp.hSampling,
                vSampling: comp.vSampling
            };
        }

        // DC predictors (one per component)
        const dcPredictors = new Array(this.frameHeader.components.length).fill(0);

        // Decode MCUs
        for (let mcuIndex = 0; mcuIndex < totalMCUs; mcuIndex++) {
            for (const scanComp of this.scanHeader.components) {
                const frameComp = this.frameHeader.components.find(c => c.id === scanComp.selector);

                if (!frameComp) {
                    throw new Error(`Scan component ${scanComp.selector} not found in frame header`);
                }

                const dcTable = this.huffmanTables.get(`0_${scanComp.dcTableId}`);
                const acTable = this.huffmanTables.get(`1_${scanComp.acTableId}`);

                if (!dcTable || !acTable) {
                    throw new Error(`Missing Huffman table for component ${scanComp.selector}`);
                }

                // Decode blocks for this component in this MCU
                const blocksInMCU = frameComp.hSampling * frameComp.vSampling;
                for (let i = 0; i < blocksInMCU; i++) {
                    const compIndex = this.frameHeader.components.findIndex(c => c.id === scanComp.selector);
                    const { dc, block } = decodeBlock(bitReader, dcTable, acTable, dcPredictors[compIndex]);
                    dcPredictors[compIndex] = dc;

                    // Store block
                    const mcuRow = Math.floor(mcuIndex / mcuCols);
                    const mcuCol = mcuIndex % mcuCols;
                    const blockRow = mcuRow * frameComp.vSampling + Math.floor(i / frameComp.hSampling);
                    const blockCol = mcuCol * frameComp.hSampling + (i % frameComp.hSampling);
                    const blockIndex = blockRow * this.components[scanComp.selector].blocksH + blockCol;

                    this.components[scanComp.selector].blocks[blockIndex] = block;
                }
            }
        }
    }

    /**
     * Reconstruct and assemble final image
     * 
     * @returns {{data: Uint8ClampedArray, width: number, height: number}}
     */
    assembleImage() {
        const { width, height, components } = this.frameHeader;

        // Process each component: dequantize, IDCT, assemble
        const processedComponents = {};

        for (const comp of components) {
            const compData = this.components[comp.id];
            const quantTable = this.quantizationTables.get(comp.quantTableId);

            if (!quantTable) {
                throw new Error(`Missing quantization table ${comp.quantTableId}`);
            }

            // Process each block
            const processedBlocks = compData.blocks.map(block => {
                // Dequantize (BEFORE inverse zigzag)
                // The quantization table is in ZigZag order, and the block is in ZigZag order
                const dequantized = dequantize(block, quantTable);

                // Inverse zigzag
                const block2D = inverseZigZag(dequantized);

                // IDCT
                const spatial = this.idctMethod(block2D);

                // Level shift (+128) and Clamp
                for (let i = 0; i < 64; i++) {
                    const val = spatial[i] + 128;
                    spatial[i] = Math.max(0, Math.min(255, val));
                }

                return spatial;
            });


            // Assemble blocks into component plane
            // Use actual block dimensions, not target image dimensions
            const compWidth = compData.blocksH * 8;
            const compHeight = compData.blocksV * 8;

            processedComponents[comp.id] = {
                data: assembleBlocks(processedBlocks, compWidth, compHeight, compData.blocksH),
                width: compWidth,
                height: compHeight,
                hSampling: comp.hSampling,
                vSampling: comp.vSampling
            };
        }

        // Handle grayscale vs color
        if (components.length === 1) {
            // Grayscale
            const yComp = processedComponents[components[0].id];
            const fullImageData = grayscaleToImageData(yComp.data, yComp.width, yComp.height);

            // Crop to actual image dimensions if needed
            if (yComp.width !== width || yComp.height !== height) {
                const cropped = new Uint8ClampedArray(width * height * 4);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const srcOffset = (y * yComp.width + x) * 4;
                        const dstOffset = (y * width + x) * 4;
                        cropped[dstOffset + 0] = fullImageData[srcOffset + 0];
                        cropped[dstOffset + 1] = fullImageData[srcOffset + 1];
                        cropped[dstOffset + 2] = fullImageData[srcOffset + 2];
                        cropped[dstOffset + 3] = fullImageData[srcOffset + 3];
                    }
                }
                return { data: cropped, width, height };
            }

            return { data: fullImageData, width: yComp.width, height: yComp.height };
        } else {
            // Color - upsample chroma if needed
            // Standard JPEG component IDs: 1=Y, 2=Cb, 3=Cr
            const yComp = processedComponents[1];
            const cbComp = processedComponents[2];
            const crComp = processedComponents[3];

            const samplingFactors = {
                Y: { h: components[0].hSampling, v: components[0].vSampling, width: yComp.width, height: yComp.height },
                Cb: { h: components[1].hSampling, v: components[1].vSampling, width: cbComp.width, height: cbComp.height },
                Cr: { h: components[2].hSampling, v: components[2].vSampling, width: crComp.width, height: crComp.height }
            };

            // Upsample chroma to match Y component dimensions (not target image dimensions!)
            const upsampled = upsampleChroma(
                { Y: yComp.data, Cb: cbComp.data, Cr: crComp.data },
                samplingFactors,
                yComp.width,
                yComp.height
            );

            // Convert to RGBA using Y component dimensions
            const fullImageData = componentsToImageData(upsampled.Y, upsampled.Cb, upsampled.Cr, yComp.width, yComp.height);

            // Crop to actual image dimensions if needed
            if (yComp.width !== width || yComp.height !== height) {
                const cropped = new Uint8ClampedArray(width * height * 4);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const srcOffset = (y * yComp.width + x) * 4;
                        const dstOffset = (y * width + x) * 4;
                        cropped[dstOffset + 0] = fullImageData[srcOffset + 0];
                        cropped[dstOffset + 1] = fullImageData[srcOffset + 1];
                        cropped[dstOffset + 2] = fullImageData[srcOffset + 2];
                        cropped[dstOffset + 3] = fullImageData[srcOffset + 3];
                    }
                }
                return { data: cropped, width, height };
            }

            return { data: fullImageData, width: yComp.width, height: yComp.height };
        }
    }
}
