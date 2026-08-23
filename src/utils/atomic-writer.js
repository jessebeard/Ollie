/**
 * Atomic multi-file writer with rollback.
 *
 * Writes every target only after confirming each step succeeded; if any write
 * fails partway through, every already-modified file is restored from its
 * original bytes so the caller's data set is never left half-mutated.
 */

/**
 * @typedef {Object} AtomicWriteTarget
 * @property {{name: string, createWritable: Function}} handle - Writable file handle
 * @property {Uint8Array} data - New content for the file
 */

/**
 * Writes all targets atomically. On success, returns the names that were
 * written. On failure, restores originals for everything already written
 * and returns a descriptive error (including which restorations failed).
 *
 * @param {AtomicWriteTarget[]} targets - Ordered write plan
 * @param {Map<string, ArrayBuffer|Uint8Array>} originalBytes - name -> pre-save content
 * @returns {Promise<[string[]|null, Error|null]>} Result tuple of [writtenNames, error]
 */
export async function writeAllWithRollback(targets, originalBytes) {
    const written = [];
    try {
        for (const { handle, data } of targets) {
            const writable = await handle.createWritable();
            await writable.write(data);
            await writable.close();
            written.push(handle);
        }
        return [written.map(h => h.name), null];
    } catch (writeError) {
        const failedRestores = [];
        let restored = 0;

        for (const handle of written) {
            try {
                const restore = await handle.createWritable();
                await restore.write(originalBytes.get(handle.name));
                await restore.close();
                restored++;
            } catch {
                failedRestores.push(handle.name);
            }
        }

        const outcome = failedRestores.length > 0
            ? `Rollback FAILED for ${failedRestores.length} file(s): ${failedRestores.join(', ')}`
            : `All ${restored} modified file(s) were restored.`;

        return [null, new Error(`Saving failed partway through. ${outcome} ${writeError.message}`)];
    }
}
