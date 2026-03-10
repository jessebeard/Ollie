/**
 * Quantization Table Parser - Parses DQT (Define Quantization Table) segments
 * 
 * DQT segment format (JPEG spec lines 71-77):
 * - Lq (16 bits): Segment length
 * - Loop while bytes remaining:
 *   - Pq_Tq (8 bits): Precision (high 4 bits) | Table ID (low 4 bits)
 *   - Elements (64 × 8 or 16 bits): Quantization values in zigzag order
 */

/**
 * Parse a single quantization table from DQT segment data
 * @param {Uint8Array} data - DQT segment data (without marker and length)
 * @param {number} offset - Offset within the segment data
 * @returns {[{table: Int32Array, id: number, precision: number, nextOffset: number}, null] | [null, Error]}
 */
export function parseQuantizationTable(data, offset = 0) {
    if (offset >= data.length) {
        return [null, new Error('Invalid DQT offset')];
    }

    const pqTq = data[offset];
    const precision = (pqTq >> 4) & 0x0F;
    const tableId = pqTq & 0x0F;

    if (precision !== 0 && precision !== 1) {
        return [null, new Error(`Invalid quantization table precision: ${precision}`)];
    }

    if (tableId > 3) {
        return [null, new Error(`Invalid quantization table ID: ${tableId}`)];
    }

    const elementSize = precision === 0 ? 1 : 2;
    const tableSize = 64 * elementSize;

    if (offset + 1 + tableSize > data.length) {
        return [null, new Error('Incomplete quantization table data')];
    }

    const table = new Int32Array(64);
    let dataOffset = offset + 1;

    for (let i = 0; i < 64; i++) {
        if (precision === 0) {

            table[i] = data[dataOffset];
            dataOffset += 1;
        } else {

            table[i] = (data[dataOffset] << 8) | data[dataOffset + 1];
            dataOffset += 2;
        }
    }

    return [{
        table,
        id: tableId,
        precision,
        nextOffset: dataOffset
    }, null];
}

/**
 * Parse all quantization tables from a DQT segment
 * @param {Uint8Array} segmentData - DQT segment data (without marker and length)
 * @returns {[Map<number, Int32Array>, null] | [null, Error]}
 */
export function parseAllQuantizationTables(segmentData) {
    const tables = new Map();
    let offset = 0;

    while (offset < segmentData.length) {
        const [result, err] = parseQuantizationTable(segmentData, offset);
        if (err) return [null, err];
        tables.set(result.id, result.table);
        offset = result.nextOffset;
    }

    return [tables, null];
}

/**
 * Parse quantization tables from multiple DQT segments
 * @param {Array<{data: Uint8Array}>} dqtSegments - Array of DQT segment objects
 * @returns {[Map<number, Int32Array>, null] | [null, Error]}
 */
export function parseQuantizationTablesFromSegments(dqtSegments) {
    const allTables = new Map();

    for (const segment of dqtSegments) {
        const [tables, err] = parseAllQuantizationTables(segment.data);
        if (err) return [null, err];

        for (const [id, table] of tables) {
            allTables.set(id, table);
        }
    }

    return [allTables, null];
}
