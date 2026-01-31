/**
 * Frame Header Parser - Parses SOF0 (Start of Frame, Baseline DCT) segment
 * 
 * SOF0 segment format (JPEG spec lines 42-55):
 * - Lf (16 bits): Frame header length
 * - P (8 bits): Sample precision (8 for baseline)
 * - Y (16 bits): Number of lines (height)
 * - X (16 bits): Number of samples per line (width)
 * - Nf (8 bits): Number of components (1=grayscale, 3=color)
 * - For each component:
 *   - C (8 bits): Component identifier
 *   - H_V (8 bits): Sampling factors (high 4 bits: H, low 4 bits: V)
 *   - Tq (8 bits): Quantization table selector
 */

/**
 * Parse SOF0 frame header
 * @param {Uint8Array} segmentData - SOF0 segment data (without marker and length)
 * @returns {Object} Frame information
 */
export function parseFrameHeader(segmentData) {
    if (segmentData.length < 6) {
        throw new Error('Invalid SOF0 segment: too short');
    }

    let offset = 0;

    const precision = segmentData[offset++];
    if (precision !== 8) {
        throw new Error(`Unsupported sample precision: ${precision} (baseline requires 8)`);
    }

    const height = (segmentData[offset] << 8) | segmentData[offset + 1];
    offset += 2;

    const width = (segmentData[offset] << 8) | segmentData[offset + 1];
    offset += 2;

    if (width === 0 || height === 0) {
        throw new Error(`Invalid image dimensions: ${width}x${height}`);
    }

    const numComponents = segmentData[offset++];

    if (numComponents !== 1 && numComponents !== 3) {
        throw new Error(`Unsupported number of components: ${numComponents} (expected 1 or 3)`);
    }

    const expectedLength = 6 + (numComponents * 3);
    if (segmentData.length < expectedLength) {
        throw new Error('Incomplete SOF0 component data');
    }

    const components = [];
    let maxH = 0, maxV = 0;

    for (let i = 0; i < numComponents; i++) {
        const componentId = segmentData[offset++];
        const hvByte = segmentData[offset++];
        const hSampling = (hvByte >> 4) & 0x0F;
        const vSampling = hvByte & 0x0F;
        const quantTableId = segmentData[offset++];

        if (hSampling < 1 || hSampling > 4 || vSampling < 1 || vSampling > 4) {
            throw new Error(`Invalid sampling factors: H=${hSampling}, V=${vSampling}`);
        }

        if (quantTableId > 3) {
            throw new Error(`Invalid quantization table ID: ${quantTableId}`);
        }

        components.push({
            id: componentId,
            hSampling,
            vSampling,
            quantTableId
        });

        maxH = Math.max(maxH, hSampling);
        maxV = Math.max(maxV, vSampling);
    }

    const mcuWidth = maxH * 8;
    const mcuHeight = maxV * 8;

    const mcuCols = Math.ceil(width / mcuWidth);
    const mcuRows = Math.ceil(height / mcuHeight);

    return {
        precision,
        width,
        height,
        numComponents,
        components,
        maxHSampling: maxH,
        maxVSampling: maxV,
        mcuWidth,
        mcuHeight,
        mcuCols,
        mcuRows
    };
}
