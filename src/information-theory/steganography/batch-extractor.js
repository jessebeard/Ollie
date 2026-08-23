import { ChunkManager } from './chunk-manager.js';
import { verifyManifest, bindChunkRecords } from './carrier-manifest.js';
import { openEnvelope } from '../secret-sharing/css-envelope.js';
import { base64ToBytes } from '../../utils/encoding.js';
import { JpegDecoder } from '../../codec/decoder.js';
import { logger } from '../../utils/logger.js';

/**
 * BatchExtractor - Handles extracting and reassembling data from multiple images
 */
export class BatchExtractor {
    /**
     * Extracts and reassembles data from multiple images
     * 
     * @param {Array<File>} imageFiles - List of image files
     * @param {string} [password] - Password for decryption
     * @param {Function} [onProgress] - Callback (current, total, status)
     * @returns {Promise<[Object|null, Error|null]>} Result tuple of [{data, filename, metadata}, error]
     */
    async extract(imageFiles, password, onProgress = null) {
        const chunks = [];
        const manifests = [];
        const shares = [];
        const total = imageFiles.length;
        let firstMetadata = null;

        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];
            if (onProgress) {
                onProgress(i, total, `Extracting from ${file.name}...`);
            }

            try {
                const arrayBuffer = await file.arrayBuffer();
                const jpegBytes = new Uint8Array(arrayBuffer);
                const decoder = new JpegDecoder();

                const [result, err] = await decoder.decode(jpegBytes, { password });
                if (err) throw err;

                if (result.secretData) {
                    logger.debug(`File ${file.name}: Found secret data. Metadata:`, result.secretMetadata);
                    if (result.secretMetadata && result.secretMetadata.chunk) {
                        const chunkMeta = result.secretMetadata.chunk;
                        logger.debug(`File ${file.name}: Valid chunk found. Index ${chunkMeta.index}/${chunkMeta.total}`);

                        chunks.push({
                            chunkId: chunkMeta.id,
                            index: chunkMeta.index,
                            total: chunkMeta.total,
                            data: result.secretData,
                            checksum: result.secretMetadata.checksum
                        });

                        if (result.secretMetadata.manifest) {
                            manifests.push(result.secretMetadata.manifest);
                            if (result.secretMetadata.manifest.share) {
                                shares.push(result.secretMetadata.manifest.share);
                            }
                        }

                        if (!firstMetadata) {
                            firstMetadata = result.secretMetadata;
                        }
                    } else {
                        logger.warn(`File ${file.name} has secret data but no chunk metadata. Ignoring.`);
                    }
                } else {
                    logger.debug(`File ${file.name}: No secret data found.`);
                }
            } catch (error) {
                logger.error(`Failed to extract from ${file.name}:`, error);
                if (onProgress) {
                    onProgress(i + 1, total, `Error extracting from ${file.name}`);
                }
            }
        }

        if (chunks.length === 0) {
            return [null, new Error('No valid chunks found in provided images.')];
        }

        // Manifest enforcement: every chunk-bearing carrier must carry a
        // manifest; all manifests must agree and authenticate under the
        // password. Legacy (manifest-less) sets fail closed.
        const carriersWithManifest = manifests.length;
        if (carriersWithManifest === 0 && chunks.length > 0) {
            return [null, new Error(
                'Carrier set has no tamper-protection manifest. ' +
                'These images were saved by an older Ollie version - re-save the vault to continue.'
            )];
        }
        if (carriersWithManifest > 0 && carriersWithManifest !== chunks.length) {
            return [null, new Error('Mixed carrier sets detected: some images lack a manifest. Load refused.')];
        }

        let verifiedManifest = null;
        for (const m of manifests) {
            const [ok, verifyErr] = await verifyManifest(m, password);
            if (verifyErr) return [null, new Error(`Manifest verification failed: ${verifyErr.message}`)];
            if (ok !== true) {
                return [null, new Error('Manifest authentication failed: wrong password or tampered carriers.')];
            }
            if (!verifiedManifest) {
                verifiedManifest = m;
            } else {
                // Agreement excludes the per-carrier share envelope and its
                // MAC - both are individually verified above and intentionally
                // distinct between carriers.
                const strip = (x) => { const c = { ...x }; delete c.share; delete c.mac; return JSON.stringify(c); };
                if (strip(verifiedManifest) !== strip(m)) {
                    return [null, new Error('Carrier manifests disagree: carrier set was mixed or rolled back.')];
                }
            }
        }

        // Cross-carrier swap defense: records from other saves fail binding.
        // (Threshold mode binds via envelope identity + MAC + GCM instead.)
        if (!verifiedManifest.share) {
            const recordsForBinding = chunks.map(c => ({ index: c.index, checksum: c.checksum }));
            const [, bindErr] = bindChunkRecords(recordsForBinding, verifiedManifest);
            if (bindErr) {
                return [null, bindErr];
            }
        }

        // Threshold (CSS) mode: replicated envelope + distinct key shares.
        // Replaces chunk reassembly with DEK reconstruction + GCM opening.
        if (verifiedManifest.share) {
            const threshold = verifiedManifest.share.threshold;

            if (shares.length !== chunks.length) {
                return [null, new Error('Mixed carrier sets detected: some images lack a key share. Load refused.')];
            }

            // Replicated envelopes must be byte-identical across carriers.
            const reference = chunks[0].data;
            for (const c of chunks) {
                if (c.data.length !== reference.length) {
                    return [null, new Error('Replicated envelopes differ in size across carriers.')];
                }
                for (let b = 0; b < c.data.length; b++) {
                    if (c.data[b] !== reference[b]) {
                        return [null, new Error('Replicated envelopes differ across carriers: mixed or tampered set.')];
                    }
                }
            }

            // Unique shares by index; same index must carry identical data.
            const byIndex = new Map();
            for (const s of shares) {
                if (!s || !Number.isInteger(s.index) || typeof s.data !== 'string') {
                    return [null, new Error('Malformed key share detected.')];
                }
                const [shareBytes] = base64ToBytes(s.data);
                const existing = byIndex.get(s.index);
                if (!existing) {
                    byIndex.set(s.index, { index: s.index, data: shareBytes });
                } else if (existing.data.length !== shareBytes.length ||
                           existing.data.join() !== shareBytes.join()) {
                    return [null, new Error(`Conflicting key shares detected for share index ${s.index}.`) ];
                }
            }
            if (byIndex.size < threshold) {
                return [null, new Error(
                    `Insufficient shares: ${byIndex.size} unique of ${chunks.length} carriers, threshold is ${threshold}. Provide more carriers.`
                )];
            }

            const iv = reference.slice(0, 12);
            const ciphertext = reference.slice(12);
            const [plaintext, openErr] = await openEnvelope(
                { iv, ciphertext },
                Array.from(byIndex.values()),
                { threshold }
            );
            if (openErr) return [null, openErr];

            return [{
                data: plaintext,
                filename: firstMetadata?.filename || 'vault.json',
                metadata: {
                    chunk: { id: verifiedManifest.chunkSetId, index: 0, total: 1 },
                    manifest: verifiedManifest
                }
            }, null];
        }

        const { group: completeGroup, error: groupError } = BatchExtractor.selectCompleteGroup(chunks, total);
        if (!completeGroup) {
            logger.warn(groupError.message);
            return [null, groupError];
        }
        if (completeGroup[0].chunkId !== verifiedManifest.chunkSetId) {
            return [null, new Error('Reassembled chunk set does not match the authenticated manifest.')];
        }

        if (onProgress) {
            onProgress(total, total, 'Reassembling...');
        }

        const [reassembled, reassembleErr] = ChunkManager.reassemble(completeGroup);
        if (reassembleErr) {
            return [null, reassembleErr];
        }

        return [{
            data: reassembled,
            filename: firstMetadata?.filename || 'vault.json',
            metadata: { chunk: completeGroup[0], manifest: verifiedManifest }
        }, null];
    }

    /**
     * Selects a complete, contiguous, duplicate-free chunk group from
     * carrier-extracted chunk records. All metadata here originates from
     * attacker-readable carriers, so every value is bounded before use.
     *
     * @param {Array<Object>} records - Extracted chunk records
     * @param {number} maxTotal - Upper bound for any plausible total (carrier file count)
     * @returns {{group: Array<Object>|null, error: Error|null}}
     */
    static selectCompleteGroup(records, maxTotal) {
        const groups = new Map();
        let bestError = new Error('No complete vault payload found across images.');

        for (const record of records) {
            if (!Number.isInteger(record.total) || !Number.isInteger(record.index)) continue;
            if (record.total < 1 || record.total > maxTotal || record.index < 0 || record.index >= record.total) continue;

            let group = groups.get(record.chunkId);
            if (!group) {
                group = [];
                groups.set(record.chunkId, group);
            }
            group.push(record);
        }

        for (const [chunkId, groupChunks] of groups.entries()) {
            const sorted = [...groupChunks].sort((a, b) => a.index - b.index);
            const expectedTotal = sorted[0].total;

            let duplicate = false;
            const presentIndices = new Set();
            for (const chunk of sorted) {
                if (presentIndices.has(chunk.index)) { duplicate = true; break; }
                presentIndices.add(chunk.index);
            }

            if (duplicate) {
                bestError = new Error(`Duplicate chunk indices in set ${chunkId}`);
                continue;
            }

            if (sorted.length !== expectedTotal) {
                const missingIndices = [];
                for (let i = 0; i < expectedTotal; i++) {
                    if (!presentIndices.has(i)) missingIndices.push(i);
                }
                bestError = new Error(
                    `Incomplete chunk set (ID ${chunkId}): expected ${expectedTotal}, got ${sorted.length}. Missing indices: [${missingIndices.join(', ')}]`
                );
                continue;
            }

            return { group: sorted, error: null };
        }

        return { group: null, error: bestError };
    }
}
