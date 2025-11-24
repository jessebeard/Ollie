/**
 * Scan Header Parser - Parses SOS (Start of Scan) segment
 * 
 * SOS segment format (JPEG spec lines 57-69):
 * - Ls (16 bits): Scan header length
 * - Ns (8 bits): Number of components in scan
 * - For each component:
 *   - Cs (8 bits): Component selector
 *   - Td_Ta (8 bits): DC/AC table selectors (high 4: DC, low 4: AC)
 * - Ss (8 bits): Start of spectral selection (0 for sequential)
 * - Se (8 bits): End of spectral selection (63 for sequential)
 * - Ah_Al (8 bits): Successive approximation (0 for sequential)
 */

/**
 * Parse SOS scan header
 * @param {Uint8Array} segmentData - SOS segment data (without marker and length)
 * @returns {Object} Scan information
 */
export function parseScanHeader(segmentData) {
    if (segmentData.length < 4) {
        throw new Error('Invalid SOS segment: too short');
    }

    let offset = 0;

    // Parse number of components in scan (Ns)
    const numComponents = segmentData[offset++];

    if (numComponents < 1 || numComponents > 4) {
        throw new Error(`Invalid number of components in scan: ${numComponents}`);
    }

    // Validate remaining data length
    const expectedMinLength = 1 + (numComponents * 2) + 3;
    if (segmentData.length < expectedMinLength) {
        throw new Error('Incomplete SOS component data');
    }

    // Parse component specifications
    const components = [];

    for (let i = 0; i < numComponents; i++) {
        const componentSelector = segmentData[offset++];
        const tdTaByte = segmentData[offset++];
        const dcTableId = (tdTaByte >> 4) & 0x0F;
        const acTableId = tdTaByte & 0x0F;

        // Validate table IDs
        if (dcTableId > 3) {
            throw new Error(`Invalid DC table ID: ${dcTableId}`);
        }
        if (acTableId > 3) {
            throw new Error(`Invalid AC table ID: ${acTableId}`);
        }

        components.push({
            selector: componentSelector,
            dcTableId,
            acTableId
        });
    }

    // Parse spectral selection
    const Ss = segmentData[offset++];
    const Se = segmentData[offset++];

    // Parse successive approximation
    const ahAlByte = segmentData[offset++];
    const Ah = (ahAlByte >> 4) & 0x0F;
    const Al = ahAlByte & 0x0F;

    // Validation for progressive mode is removed to support it.
    // We trust the decoder to handle (or fail gracefully) if it doesn't support specific modes.

    return {
        numComponents,
        components,
        Ss,
        Se,
        Ah,
        Al
    };
}
