/**
 * JPEG Decoder - Main class that orchestrates the complete decoding pipeline
 * 
 * Decodes baseline sequential DCT JPEG files with Huffman coding.
 * Supports grayscale and color images with various chroma subsampling (4:4:4, 4:2:2, 4:2:0).
 */

import { parseFileStructure, MARKERS } from '../utils/marker-parser.js';
import { parseAllHuffmanTables } from './decoder/huffman-parser.js';
import { parseAllQuantizationTables } from './decoder/quantization-parser.js';
import { parseFrameHeader } from './decoder/frame-parser.js';
import { parseScanHeader } from './decoder/scan-parser.js';
import { BitReader } from '../utils/bit-reader.js';
import { decodeBlock } from './decoder/huffman-decoder.js';
import { inverseZigZag } from './decoder/inverse-zigzag.js';
import { dequantize } from './decoder/dequantization.js';
import { idctPureRef, idctOptimizedRef, idctFastAAN } from './decoder/idct-spec.js';
import { idctAAN, idctNaive } from './decoder/idct.js';
import { upsampleChroma } from './decoder/upsampling.js';
import { assembleBlocks, componentsToImageData, grayscaleToImageData } from './decoder/block-assembly.js';

import { parseSpiffHeader } from './decoder/spiff-parser.js';
import { Jsteg } from './steganography/jsteg.js';

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
        this.jfif = null;
        this.spiff = null;
    }

    hardreset() {
        this.reset();
        this.idctMethod = idctPureRef;
        this.dequantizeMethod = dequantize;
    }

    /**
     * Set the Dequantization implementation to use
     * @param {Function} method - Dequantization function
     */
    setDequantizationMethod(method) {
        if (typeof method === 'function') {
            this.dequantizeMethod = method;
        } else {
            throw new Error('setDequantizationMethod expects a function');
        }
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

        // Parse APP0 (JFIF)
        if (segments.has('APP0')) {
            const app0Segments = segments.get('APP0');
            for (const segment of app0Segments) {
                // Check for JFIF identifier: 0x4A 0x46 0x49 0x46 0x00
                if (segment.data.length >= 5 &&
                    segment.data[0] === 0x4A && segment.data[1] === 0x46 &&
                    segment.data[2] === 0x49 && segment.data[3] === 0x46 &&
                    segment.data[4] === 0x00) {

                    const view = new DataView(segment.data.buffer, segment.data.byteOffset, segment.data.byteLength);
                    this.jfif = {
                        version: { major: segment.data[5], minor: segment.data[6] },
                        densityUnits: segment.data[7],
                        xDensity: view.getUint16(8, false),
                        yDensity: view.getUint16(10, false),
                        thumbWidth: segment.data[12],
                        thumbHeight: segment.data[13]
                    };
                }
            }
        }

        // Parse APP8 (SPIFF)
        if (segments.has('APP8')) {
            const app8Segments = segments.get('APP8');
            for (const segment of app8Segments) {
                try {
                    this.spiff = parseSpiffHeader(segment.data);
                } catch (e) {
                    console.warn('Failed to parse APP8 (SPIFF) segment:', e.message);
                }
            }
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

        // Parse frame header (SOF0 or SOF2)
        let sofData = null;
        if (segments.has('SOF0')) {
            sofData = segments.get('SOF0')[0].data;
        } else if (segments.has('SOF2')) {
            sofData = segments.get('SOF2')[0].data;
        } else {
            throw new Error('Unsupported JPEG: Missing SOF0 or SOF2 marker');
        }

        this.frameHeader = parseFrameHeader(sofData);
        this.frameHeader.sofType = segments.has('SOF2') ? 0xC2 : 0xC0;
        this.initializeComponents();

        // Phase 2: Decode entropy-coded data (Scans)
        // We need to process SOS segments in order of appearance
        // The 'segments' map doesn't preserve order of different marker types relative to each other if we iterate keys.
        // But parseFileStructure returns a Map where values are arrays of segments.
        // We need to iterate the original file or rely on the fact that we need to process all SOS segments.
        // Actually, parseFileStructure might not be enough if we need strict ordering of DQT/DHT vs SOS.
        // But usually DQT/DHT are before SOS.
        // Multiple SOS segments are in the 'SOS' array in order.

        if (!segments.has('SOS')) {
            throw new Error('Invalid JPEG: Missing SOS marker');
        }

        const sosSegments = segments.get('SOS');
        for (const sosSegment of sosSegments) {
            const scanHeader = parseScanHeader(sosSegment.data, this.frameHeader);
            const scanData = sosSegment.scanData;

            if (!scanData) {
                throw new Error('Invalid JPEG: Missing scan data');
            }

            this.decodeScan(scanData, scanHeader);
        }

        // Steganography: Attempt to extract secret data BEFORE assembleImage
        // We need to extract from the quantized coefficients, not after dequantization/IDCT
        let extractedSecretData = null;
        try {
            const allBlocks = [];
            // Must match encoder order: All blocks of Comp 1, then Comp 2, then Comp 3...
            // Iterate components in frame header order
            for (const comp of this.frameHeader.components) {
                const compData = this.components[comp.id];
                if (compData && compData.blocks) {
                    allBlocks.push(...compData.blocks);
                }
            }

            extractedSecretData = Jsteg.extract(allBlocks);
            if (extractedSecretData) {
                console.log(`Extracted secret data: ${extractedSecretData.length} bytes`);
            }
        } catch (e) {
            console.warn('Failed to extract secret data:', e);
        }

        // Phase 3: Reconstruct and assemble image
        const result = this.assembleImage();

        // Add extracted data to result
        if (extractedSecretData) {
            result.secretData = extractedSecretData;
        }

        return result;
    }

    initializeComponents() {
        const { mcuCols, mcuRows } = this.frameHeader;

        this.components = {};
        for (const comp of this.frameHeader.components) {
            const blocksH = mcuCols * comp.hSampling;
            const blocksV = mcuRows * comp.vSampling;
            const totalBlocks = blocksH * blocksV;

            if (totalBlocks <= 0 || totalBlocks > 1000000 || !Number.isFinite(totalBlocks)) {
                throw new Error(`Invalid block count: ${totalBlocks} (blocksH=${blocksH}, blocksV=${blocksV})`);
            }

            this.components[comp.id] = {
                blocks: new Array(totalBlocks), // Will be filled with Int32Array(64)
                blocksH,
                blocksV,
                hSampling: comp.hSampling,
                vSampling: comp.vSampling,
                dcPredictor: 0 // Maintain DC predictor per component across scans? No, reset per scan usually.
                // Wait, DC predictor is reset at start of scan (or restart interval).
            };

            // Pre-allocate blocks? Or allocate on demand?
            // On demand is fine, but we need to know if it exists to update it.
            // Let's pre-allocate to avoid checks.
            for (let i = 0; i < totalBlocks; i++) {
                this.components[comp.id].blocks[i] = new Int32Array(64);
            }
        }
    }

    /**
     * Decode entropy-coded scan data
     * 
     * @param {Uint8Array} scanData - Raw scan data bytes
     * @param {Object} scanHeader - Parsed scan header
     */
    decodeScan(scanData, scanHeader) {
        const bitReader = new BitReader(scanData);
        const { mcuCols, mcuRows } = this.frameHeader;
        const totalMCUs = mcuCols * mcuRows;

        const { Ss, Se, Ah, Al } = scanHeader;

        // DC predictors are reset at the start of the scan
        const dcPredictors = new Array(this.frameHeader.components.length).fill(0);

        // Decode MCUs
        for (let mcuIndex = 0; mcuIndex < totalMCUs; mcuIndex++) {
            for (const scanComp of scanHeader.components) {
                const frameComp = this.frameHeader.components.find(c => c.id === scanComp.selector);

                if (!frameComp) {
                    throw new Error(`Scan component ${scanComp.selector} not found in frame header`);
                }

                const dcTable = this.huffmanTables.get(`0_${scanComp.dcTableId}`);
                const acTable = this.huffmanTables.get(`1_${scanComp.acTableId}`);

                // Note: dcTable is needed only if Ss=0. acTable only if Se>0.
                // But we check existence anyway.
                if (Ss === 0 && !dcTable) {
                    throw new Error(`Missing DC Huffman table for component ${scanComp.selector}`);
                }
                if (Se > 0 && !acTable) {
                    throw new Error(`Missing AC Huffman table for component ${scanComp.selector}`);
                }

                // Decode blocks for this component in this MCU
                const blocksInMCU = frameComp.hSampling * frameComp.vSampling;
                for (let i = 0; i < blocksInMCU; i++) {
                    const compIndex = this.frameHeader.components.findIndex(c => c.id === scanComp.selector);

                    // Calculate block index
                    const mcuRow = Math.floor(mcuIndex / mcuCols);
                    const mcuCol = mcuIndex % mcuCols;
                    const blockRow = mcuRow * frameComp.vSampling + Math.floor(i / frameComp.hSampling);
                    const blockCol = mcuCol * frameComp.hSampling + (i % frameComp.hSampling);
                    const blockIndex = blockRow * this.components[scanComp.selector].blocksH + blockCol;

                    const block = this.components[scanComp.selector].blocks[blockIndex];

                    const { dc } = decodeBlock(
                        bitReader,
                        dcTable,
                        acTable,
                        dcPredictors[compIndex],
                        block,
                        Ss,
                        Se
                    );

                    // Update predictor only if we decoded DC (Ss=0)
                    if (Ss === 0) {
                        dcPredictors[compIndex] = dc;
                    }
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
            // Reusable buffers to avoid allocation per block
            const tempDequant = new Float32Array(64);
            // Note: idctFastAAN modifies its input in-place, so we can't reuse tempZigZag for it
            // For other IDCT methods, reuse the buffer for performance
            const canReuseZigZagBuffer = this.idctMethod !== idctFastAAN;
            const tempZigZag = canReuseZigZagBuffer ? new Float32Array(64) : null;

            // Process each block
            const processedBlocks = compData.blocks.map(block => {
                // Dequantize (BEFORE inverse zigzag)
                // The quantization table is in ZigZag order, and the block is in ZigZag order
                // Use reusable buffer
                const dequantized = this.dequantizeMethod(block, quantTable, tempDequant);

                // Inverse zigzag
                // If using Fast AAN (which modifies in-place), allocate fresh buffer per block
                // Otherwise, reuse the buffer
                const block2D = inverseZigZag(dequantized, tempZigZag);

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
                return {
                    data: cropped,
                    width,
                    height,
                    metadata: {
                        width: yComp.width,
                        height: yComp.height,
                        components: components.length,
                        colorSpace: 'Grayscale',
                        progressive: this.frameHeader.sofType === 0xC2,
                        chromaSubsampling: '4:4:4'
                    }
                };
            }

            return {
                data: fullImageData,
                width: yComp.width,
                height: yComp.height,
                metadata: {
                    width: yComp.width,
                    height: yComp.height,
                    components: components.length,
                    colorSpace: 'Grayscale',
                    progressive: this.frameHeader.sofType === 0xC2,
                    chromaSubsampling: '4:4:4'
                }
            };
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
                return {
                    data: cropped,
                    width,
                    height,
                    metadata: {
                        width: yComp.width,
                        height: yComp.height,
                        components: components.length,
                        colorSpace: 'YCbCr',
                        progressive: this.frameHeader.sofType === 0xC2,
                        chromaSubsampling: this.getChromaSubsamplingString(components)
                    }
                };
            }

            return {
                data: fullImageData,
                width: yComp.width,
                height: yComp.height,
                metadata: {
                    width: yComp.width,
                    height: yComp.height,
                    components: components.length,
                    colorSpace: 'YCbCr',
                    progressive: this.frameHeader.sofType === 0xC2,
                    chromaSubsampling: this.getChromaSubsamplingString(components)
                }
            };
        }
    }

    getChromaSubsamplingString(components) {
        const y = components[0];
        const cb = components[1];
        const cr = components[2];

        if (y.hSampling === 1 && y.vSampling === 1 && cb.hSampling === 1 && cb.vSampling === 1 && cr.hSampling === 1 && cr.vSampling === 1) {
            return '4:4:4';
        } else if (y.hSampling === 2 && y.vSampling === 1 && cb.hSampling === 1 && cb.vSampling === 1 && cr.hSampling === 1 && cr.vSampling === 1) {
            return '4:2:2';
        } else if (y.hSampling === 2 && y.vSampling === 2 && cb.hSampling === 1 && cb.vSampling === 1 && cr.hSampling === 1 && cr.vSampling === 1) {
            return '4:2:0';
        } else {
            return `${y.hSampling}x${y.vSampling},${cb.hSampling}x${cb.vSampling},${cr.hSampling}x${cr.vSampling}`;
        }
    }
}
