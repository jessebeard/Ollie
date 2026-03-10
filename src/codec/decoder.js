/**
 * JPEG Decoder - Main class that orchestrates the complete decoding pipeline
 * 
 * Decodes baseline sequential DCT JPEG files with Huffman coding.
 * Supports grayscale and color images with various chroma subsampling (4:4:4, 4:2:2, 4:2:0).
 */

import { parseFileStructure, MARKERS } from '../automata/parsers/marker-scanner.js';
import { parseAllHuffmanTables } from '../automata/parsers/dht-automaton.js';
import { parseAllQuantizationTables } from '../automata/parsers/dqt-automaton.js';
import { parseFrameHeader } from '../automata/parsers/sof-automaton.js';
import { parseScanHeader } from '../automata/parsers/sos-automaton.js';
import { BitReader } from '../automata/bit-streams/bit-reader.js';
import { decodeBlock } from '../automata/entropy-coding/huffman-decoder-fsm.js';
import { inverseZigZag } from '../algebraic/mappings/inverse-zigzag.js';
import { dequantize } from '../algebraic/quantization/inverse-quantization.js';
import { idctPureRef, idctOptimizedRef, idctFastAAN } from '../algebraic/discrete-cosine/inverse-dct-spec.js';
import { idctAAN, idctNaive } from '../algebraic/discrete-cosine/inverse-dct.js';
import { upsampleChroma } from '../algebraic/mappings/upsampling.js';
import { assembleBlocks, componentsToImageData, grayscaleToImageData } from '../algebraic/mappings/block-assembly.js';

import { parseSpiffHeader } from '../automata/parsers/spiff-parser.js';
import { F5 } from '../information-theory/steganography/f5-syndrome.js';

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
        this.idctMethod = idctOptimizedRef;
        this.dequantizeMethod = dequantize;
    }

    /**
     * Set the Dequantization implementation to use
     * @param {Function} method - Dequantization function
     */
    setDequantizationMethod(method) {
        if (typeof method === 'function') {
            this.dequantizeMethod = method;
            return [true, null];
        } else {
            return [null, new Error('setDequantizationMethod expects a function')];
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
                    return [null, new Error(`Unknown IDCT method identifier: ${method}`)];
            }
        } else if (typeof method === 'function') {
            this.idctMethod = method;
        } else {
            return [null, new Error('setIdctMethod expects a function or a known method identifier string')];
        }
        return [true, null];
    }

    /**
     * Decode a JPEG byte array into ImageData
     * 
     * @param {Uint8Array} jpegBytes - JPEG file bytes
     * @param {Object} options - { password: '...' }
     * @returns {Promise<{data: Uint8ClampedArray, width: number, height: number, secretData: any}>} ImageData-compatible object
     */
    async decode(jpegBytes, options = {}) {
        this.reset();

        // Defensive Programming / Fast Failure:
        // Must strictly start with SOI Marker: FF D8
        if (!jpegBytes || jpegBytes.length < 2 || jpegBytes[0] !== 0xFF || jpegBytes[1] !== 0xD8) {
            return [null, new Error('Invalid JPEG signature: Missing SOI marker FF D8 at start of file')];
        }

        let segments;
        try {
            segments = parseFileStructure(jpegBytes);
        } catch (e) {
            return [null, e instanceof Error ? e : new Error(String(e))];
        }

        if (!segments.has('SOI')) {
            return [null, new Error('Invalid JPEG: Missing SOI marker')];
        }

        if (segments.has('APP0')) {
            const app0Segments = segments.get('APP0');
            for (const segment of app0Segments) {

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

        if (segments.has('APP8')) {
            const app8Segments = segments.get('APP8');
            for (const segment of app8Segments) {
                const [spiffResult, spiffErr] = parseSpiffHeader(segment.data);
                if (!spiffErr) {
                    this.spiff = spiffResult;
                } else {
                    console.warn('Failed to parse APP8 (SPIFF) segment:', spiffErr.message);
                }
            }
        }

        if (segments.has('DQT')) {
            const dqtSegments = segments.get('DQT');
            for (const segment of dqtSegments) {
                const [tables, dqtErr] = parseAllQuantizationTables(segment.data);
                if (dqtErr) return [null, dqtErr];
                for (const [id, table] of tables) {
                    this.quantizationTables.set(id, table);
                }
            }
        }

        if (segments.has('DRI')) {
            const driSegment = segments.get('DRI')[0];
            const view = new DataView(driSegment.data.buffer, driSegment.data.byteOffset, driSegment.data.byteLength);
            this.restartInterval = view.getUint16(0, false);
        } else {
            this.restartInterval = 0;
        }

        if (segments.has('DHT')) {
            const dhtSegments = segments.get('DHT');
            for (const segment of dhtSegments) {
                const [tables, dhtErr] = parseAllHuffmanTables(segment.data);
                if (dhtErr) return [null, dhtErr];
                for (const [key, table] of tables) {
                    this.huffmanTables.set(key, table);
                }
            }
        }

        let sofData = null;
        if (segments.has('SOF0')) {
            sofData = segments.get('SOF0')[0].data;
        } else if (segments.has('SOF2')) {
            sofData = segments.get('SOF2')[0].data;
        } else {
            return [null, new Error('Unsupported JPEG: Missing SOF0 or SOF2 marker')];
        }

        this.frameHeader = parseFrameHeader(sofData);
        if (this.frameHeader[1]) return [null, this.frameHeader[1]];
        this.frameHeader = this.frameHeader[0];
        this.frameHeader.sofType = segments.has('SOF2') ? 0xC2 : 0xC0;
        const initErr = this.initializeComponents();
        if (initErr) return [null, initErr];

        if (!segments.has('SOS')) {
            return [null, new Error('Invalid JPEG: Missing SOS marker')];
        }

        const sosSegments = segments.get('SOS');
        for (const sosSegment of sosSegments) {
            const [scanHeader, scanErr] = parseScanHeader(sosSegment.data, this.frameHeader);
            if (scanErr) return [null, scanErr];
            const scanData = sosSegment.scanData;

            if (!scanData) {
                return [null, new Error('Invalid JPEG: Missing scan data')];
            }

            const scanDecErr = this.decodeScan(scanData, scanHeader);
            if (scanDecErr) return [null, scanDecErr];
        }

        // Fast path: return raw coefficients without image reconstruction
        if (options.coefficientsOnly) {
            return [{
                width: this.frameHeader.width,
                height: this.frameHeader.height,
                coefficients: this.components,
                quantizationTables: this.quantizationTables,
                metadata: {
                    width: this.frameHeader.width,
                    height: this.frameHeader.height,
                    components: this.frameHeader.components.length,
                    progressive: this.frameHeader.sofType === 0xC2,
                    chromaSubsampling: this.frameHeader.components.length >= 3
                        ? this.getChromaSubsamplingString(this.frameHeader.components)
                        : '4:4:4'
                }
            }, null];
        }

        let extractedSecretData = null;

        if (!options.skipExtraction) {
            try {
                const allBlocks = [];

                for (const comp of this.frameHeader.components) {
                    const compData = this.components[comp.id];
                    if (compData && compData.blocks) {
                        // Avoid stack overflow with spread (...) for large block arrays
                        for (let i = 0; i < compData.blocks.length; i++) {
                            allBlocks.push(compData.blocks[i]);
                        }
                    }
                }

                extractedSecretData = await F5.extractAuto(allBlocks, options);
                if (extractedSecretData) {

                    if (extractedSecretData instanceof Uint8Array) {
                        console.log(`Extracted secret data (legacy): ${extractedSecretData.length} bytes`);
                    } else if (extractedSecretData.data) {
                        console.log(`Extracted secret data (container): ${extractedSecretData.data.length} bytes`);
                        console.log('Metadata:', extractedSecretData.metadata);

                    }
                }
            } catch (e) {
                console.warn('Failed to extract secret data:', e);
            }
        }

        const [result, assembleErr] = this.assembleImage();
        if (assembleErr) return [null, assembleErr];

        if (extractedSecretData) {
            if (extractedSecretData.metadata) {
                result.secretData = extractedSecretData.data;
                result.secretMetadata = extractedSecretData.metadata;
            } else {
                result.secretData = extractedSecretData;
            }
        }

        result.quantizationTables = this.quantizationTables;
        result.coefficients = this.components;

        return [result, null];
    }

    initializeComponents() {
        const { mcuCols, mcuRows } = this.frameHeader;

        this.components = {};
        for (const comp of this.frameHeader.components) {
            const blocksH = mcuCols * comp.hSampling;
            const blocksV = mcuRows * comp.vSampling;
            const totalBlocks = blocksH * blocksV;

            if (totalBlocks <= 0 || totalBlocks > 1000000 || !Number.isFinite(totalBlocks)) {
                return new Error(`Invalid block count: ${totalBlocks} (blocksH=${blocksH}, blocksV=${blocksV})`);
            }

            this.components[comp.id] = {
                blocks: new Array(totalBlocks),
                blocksH,
                blocksV,
                hSampling: comp.hSampling,
                vSampling: comp.vSampling,
                dcPredictor: 0

            };

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
        const restartInterval = this.restartInterval;
        const totalMCUs = mcuCols * mcuRows;

        const { Ss, Se, Ah, Al } = scanHeader;

        const dcPredictors = new Array(this.frameHeader.components.length).fill(0);

        let mcusSinceRestart = 0;
        let expectedRstMarker = 0xD0; // Start with RST0

        for (let mcuIndex = 0; mcuIndex < totalMCUs; mcuIndex++) {

            // Handle Restart Interval
            if (restartInterval > 0 && mcusSinceRestart === restartInterval) {
                // Align to byte boundary
                bitReader.alignToByte();

                // Consume fill bytes (0xFF) before the actual marker
                while (bitReader.byteOffset < bitReader.data.length && bitReader.data[bitReader.byteOffset] === 0xFF && bitReader.data[bitReader.byteOffset + 1] === 0xFF) {
                    bitReader.byteOffset++;
                }

                if (bitReader.byteOffset + 1 >= bitReader.data.length) {
                    return new Error("Unexpected end of data while looking for RST marker");
                }

                const ff = bitReader.data[bitReader.byteOffset];
                const marker = bitReader.data[bitReader.byteOffset + 1];

                if (ff !== 0xFF || marker !== expectedRstMarker) {
                    console.warn(`RST mismatch: Found 0x${ff.toString(16)} 0x${marker.toString(16)}, Expected 0xFF 0x${expectedRstMarker.toString(16)} at MCU ${mcuIndex}`);

                    // Attempt to resync: Scan forward for the next RST marker
                    let foundMarker = false;
                    const SEARCH_LIMIT = 512;

                    for (let i = 0; i < SEARCH_LIMIT; i++) {
                        if (bitReader.byteOffset + i + 1 >= bitReader.data.length) break;

                        const b0 = bitReader.data[bitReader.byteOffset + i];
                        const b1 = bitReader.data[bitReader.byteOffset + i + 1];

                        if (b0 === 0xFF && b1 >= 0xD0 && b1 <= 0xD7) {
                            console.warn(`Resync: Found RST${b1 & 0x7} (0xFF${b1.toString(16)}) at offset +${i}`);
                            bitReader.byteOffset += (i + 2);
                            bitReader.bitOffset = 0;
                            expectedRstMarker = (b1 + 1);
                            if (expectedRstMarker > 0xD7) expectedRstMarker = 0xD0;
                            foundMarker = true;
                            break;
                        }
                    }

                    if (!foundMarker) {
                        console.error('Failed to resync: No RST marker found within search limit.');
                    }
                } else {
                    // Correct marker found, advance the pointers manually
                    bitReader.byteOffset += 2;
                    bitReader.bitOffset = 0;

                    expectedRstMarker++;
                    if (expectedRstMarker > 0xD7) expectedRstMarker = 0xD0;
                }

                // Always reset predictors after a restart interval
                dcPredictors.fill(0);
                mcusSinceRestart = 0;
                // DO NOT `continue` the loop, as we still need to process the current MCU index.
            }

            for (const scanComp of scanHeader.components) {
                const frameComp = this.frameHeader.components.find(c => c.id === scanComp.selector);

                if (!frameComp) {
                    return new Error(`Scan component ${scanComp.selector} not found in frame header`);
                }

                const dcTable = this.huffmanTables.get(`0_${scanComp.dcTableId}`);
                const acTable = this.huffmanTables.get(`1_${scanComp.acTableId}`);

                if (Ss === 0 && !dcTable) {
                    return new Error(`Missing DC Huffman table for component ${scanComp.selector}`);
                }
                if (Se > 0 && !acTable) {
                    return new Error(`Missing AC Huffman table for component ${scanComp.selector}`);
                }

                const blocksInMCU = frameComp.hSampling * frameComp.vSampling;
                for (let i = 0; i < blocksInMCU; i++) {
                    const compIndex = this.frameHeader.components.findIndex(c => c.id === scanComp.selector);

                    const mcuRow = Math.floor(mcuIndex / mcuCols);
                    const mcuCol = mcuIndex % mcuCols;
                    const blockRow = mcuRow * frameComp.vSampling + Math.floor(i / frameComp.hSampling);
                    const blockCol = mcuCol * frameComp.hSampling + (i % frameComp.hSampling);
                    const blockIndex = blockRow * this.components[scanComp.selector].blocksH + blockCol;

                    const block = this.components[scanComp.selector].blocks[blockIndex];

                    const [blockResult, blockErr] = decodeBlock(
                        bitReader,
                        dcTable,
                        acTable,
                        dcPredictors[compIndex],
                        block,
                        Ss,
                        Se
                    );
                    if (blockErr) return blockErr;

                    if (Ss === 0) {
                        dcPredictors[compIndex] = blockResult.dc;
                    }
                }
            }
            mcusSinceRestart++;
        }
    }

    /**
     * Reconstruct and assemble final image
     * 
     * @returns {{data: Uint8ClampedArray, width: number, height: number}}
     */
    assembleImage() {
        const { width, height, components } = this.frameHeader;

        const processedComponents = {};

        for (const comp of components) {
            const compData = this.components[comp.id];
            const quantTable = this.quantizationTables.get(comp.quantTableId);

            if (!quantTable) {
                return [null, new Error(`Missing quantization table ${comp.quantTableId}`)];
            }

            const tempDequant = new Float32Array(64);

            const canReuseZigZagBuffer = this.idctMethod !== idctFastAAN;
            const tempZigZag = canReuseZigZagBuffer ? new Float32Array(64) : null;

            const processedBlocks = compData.blocks.map(block => {

                const [dequantized, dqErr] = this.dequantizeMethod(block, quantTable, tempDequant);
                if (dqErr) throw dqErr;

                const [block2D, zigErr] = inverseZigZag(dequantized, tempZigZag);
                if (zigErr) throw zigErr;

                const [spatial, idctErr] = this.idctMethod(block2D);
                if (idctErr) throw idctErr;

                for (let i = 0; i < 64; i++) {
                    const val = spatial[i] + 128;
                    spatial[i] = Math.max(0, Math.min(255, val));
                }

                return spatial;
            });

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

        if (components.length === 1) {

            const yComp = processedComponents[components[0].id];
            const fullImageData = grayscaleToImageData(yComp.data, yComp.width, yComp.height);

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
                return [{
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
                }, null];
            }

            return [{
                data: fullImageData,
                width: yComp.width,
                height: yComp.height,
                metadata: {
                    width,
                    height,
                    components: components.length,
                    colorSpace: 'Grayscale',
                    progressive: this.frameHeader.sofType === 0xC2,
                    chromaSubsampling: '4:4:4'
                }
            }, null];
        } else {

            const yComp = processedComponents[components[0].id];
            const cbComp = processedComponents[components[1].id];
            const crComp = processedComponents[components[2].id];

            const samplingFactors = {
                Y: { h: components[0].hSampling, v: components[0].vSampling, width: yComp.width, height: yComp.height },
                Cb: { h: components[1].hSampling, v: components[1].vSampling, width: cbComp.width, height: cbComp.height },
                Cr: { h: components[2].hSampling, v: components[2].vSampling, width: crComp.width, height: crComp.height }
            };

            const upsampled = upsampleChroma(
                { Y: yComp.data, Cb: cbComp.data, Cr: crComp.data },
                samplingFactors,
                yComp.width,
                yComp.height
            );

            const fullImageData = componentsToImageData(upsampled.Y, upsampled.Cb, upsampled.Cr, yComp.width, yComp.height);

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
                return [{
                    data: cropped,
                    width,
                    height,
                    metadata: {
                        width,
                        height,
                        components: components.length,
                        colorSpace: 'YCbCr',
                        progressive: this.frameHeader.sofType === 0xC2,
                        chromaSubsampling: this.getChromaSubsamplingString(components)
                    }
                }, null];
            }

            return [{
                data: fullImageData,
                width: yComp.width,
                height: yComp.height,
                coefficients: this.components,
                metadata: {
                    width,
                    height,
                    components: components.length,
                    colorSpace: 'YCbCr',
                    progressive: this.frameHeader.sofType === 0xC2,
                    chromaSubsampling: this.getChromaSubsamplingString(components)
                }
            }, null];
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
