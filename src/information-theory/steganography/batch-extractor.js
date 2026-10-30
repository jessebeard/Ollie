import { ChunkManager } from './chunk-manager.js';
import { verifyManifest, deriveMacKey, bindChunkRecords } from './carrier-manifest.js';
import { openEnvelope } from '../secret-sharing/css-envelope.js';
import { base64ToBytes } from '../../utils/encoding.js';
import { getCarrierPool } from '../../codec/carrier-pool.js';
import { StegoEngine } from './stego-engine.js';
import { unsealOpaque } from './opaque-container.js';
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
     * @param {Object} [options] - Options ({ multithreaded?: boolean, ... })
     * @returns {Promise<[Object|null, Error|null]>} Result tuple of [{data, filename, metadata}, error]
     */
    async extract(imageFiles, password, onProgress = null, options = {}) {
        const chunks = [];
        const manifests = [];
        const shares = [];
        const total = imageFiles.length;
        let firstMetadata = null;
        let completed = 0;

        const pool = getCarrierPool();
        const decodeTasks = imageFiles.map(async (file, _i) => {
            if (onProgress) {
                onProgress(completed, total, `Extracting from ${file.name}...`);
            }

            try {
                const arrayBuffer = await file.arrayBuffer();
                const jpegBuffer = /** @type {ArrayBuffer} */ (arrayBuffer.slice(0));
                const jpegBytes = new Uint8Array(jpegBuffer);

                const stcSeed = await StegoEngine.resolveSTCSeed(password);

                let outcome;
                if (options && options.multithreaded === false) {
                    outcome = await pool.fallbackHandler('extract-payload', {
                        jpegBytes,
                        stcSeed,
                        options
                    });
                } else {
                    outcome = await pool.dispatch(
                        'extract-payload',
                        { jpegBytes, stcSeed, options },
                        [jpegBuffer]
                    );
                }

                completed++;
                if (onProgress) {
                    onProgress(completed, total, `Extracted from ${file.name}`);
                }

                const [result, err] = outcome;
                if (err) return { file, result: null, error: err };

                if (result && result.candidateWires && result.candidateWires.length > 0) {
                    for (const wire of result.candidateWires) {
                        const [payload, unsealErr] = await unsealOpaque(wire, password, options.kdfOpts);
                        if (!unsealErr && payload) {
                            try {
                                const parsed = JSON.parse(new TextDecoder().decode(payload));
                                if (parsed && parsed.data) {
                                    const [rawBytes] = base64ToBytes(parsed.data);
                                    result.secretData = rawBytes;
                                    result.secretMetadata = parsed.metadata || null;
                                } else {
                                    result.secretData = payload;
                                }
                            } catch {
                                result.secretData = payload;
                            }
                            break;
                        }
                    }
                }

                return { file, result, error: null };
            } catch (error) {
                completed++;
                return { file, result: null, error };
            }
        });

        const decodedOutcomes = await Promise.all(decodeTasks);

        for (let i = 0; i < decodedOutcomes.length; i++) {
            const { file, result, error } = decodedOutcomes[i];
            if (error) {
                logger.error(`Failed to extract from ${file.name}:`, error);
                if (onProgress) {
                    onProgress(i + 1, total, `Error extracting from ${file.name}`);
                }
                continue;
            }

            if (result && result.secretData) {
                logger.debug(`File ${file.name}: Found secret data. Metadata:`, result.secretMetadata);
                if (result.secretMetadata && result.secretMetadata.chunk) {
                    const chunkMeta = result.secretMetadata.chunk;
                    logger.debug(`File ${file.name}: Valid chunk found. Index ${chunkMeta.index}/${chunkMeta.total}`);

                    if (chunkMeta.count && chunkMeta.count > 1 && chunkMeta.stripeSize) {
                        const stripeSize = chunkMeta.stripeSize;
                        for (let b = 0; b < chunkMeta.count; b++) {
                            const blockData = result.secretData.slice(b * stripeSize, (b + 1) * stripeSize);
                            chunks.push({
                                chunkId: chunkMeta.id,
                                index: (chunkMeta.startIndex !== undefined ? chunkMeta.startIndex : 0) + b,
                                total: chunkMeta.total,
                                data: blockData,
                                checksum: ChunkManager.calculateChecksum(blockData)
                            });
                        }
                    } else {
                        chunks.push({
                            chunkId: chunkMeta.id,
                            index: chunkMeta.startIndex !== undefined ? chunkMeta.startIndex : chunkMeta.index,
                            total: chunkMeta.total,
                            data: result.secretData,
                            checksum: ChunkManager.calculateChecksum(result.secretData)
                        });
                    }

                    if (result.secretMetadata.manifest) {
                        manifests.push(result.secretMetadata.manifest);
                        if (result.secretMetadata.manifest.shares) {
                            for (const s of result.secretMetadata.manifest.shares) {
                                shares.push(s);
                            }
                        } else if (result.secretMetadata.manifest.share) {
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

        let verifiedManifest = null;
        let ephemeralMacKey = null;
        let ephemeralSalt = null;

        for (const m of manifests) {
            let macKey = null;
            if (ephemeralMacKey && m.kdf && m.kdf.salt === ephemeralSalt) {
                macKey = ephemeralMacKey;
            } else if (m.kdf && typeof m.kdf.salt === 'string') {
                const [derived, keyErr] = await deriveMacKey(password, m.kdf);
                if (keyErr || !derived) {
                    return [null, new Error(`Manifest key derivation failed: ${keyErr?.message || 'unknown error'}`)];
                }
                ephemeralMacKey = derived;
                ephemeralSalt = m.kdf.salt;
                macKey = derived;
            }

            const [ok, verifyErr] = await verifyManifest(m, password, { macKey });
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
                const strip = (x) => { const c = { ...x }; delete c.share; delete c.shares; delete c.mac; return JSON.stringify(c); };
                if (strip(verifiedManifest) !== strip(m)) {
                    return [null, new Error('Carrier manifests disagree: carrier set was mixed or rolled back.')];
                }
            }
        }

        // Enforce manifest chunk integrity authentication (SEC-01)
        if (verifiedManifest.entries && verifiedManifest.entries.length > 0) {
            const uniqueRecordsByIndex = new Map();
            for (const c of chunks) {
                const existing = uniqueRecordsByIndex.get(c.index);
                if (!existing) {
                    uniqueRecordsByIndex.set(c.index, { index: c.index, checksum: c.checksum });
                } else if (existing.checksum !== c.checksum) {
                    return [null, new Error(`Conflicting coded stripes detected for chunk index ${c.index}.`)];
                }
            }
            const chunkRecords = Array.from(uniqueRecordsByIndex.values());
            const [, bindErr] = bindChunkRecords(chunkRecords, verifiedManifest, { subset: true });
            if (bindErr) {
                return [null, new Error(`Carrier manifest chunk authentication failed: ${bindErr.message}`)];
            }
        }

        // Threshold (CSS + erasure) mode: distinct coded stripes + key shares.
        // Replaces chunk reassembly with stripe reconstruction, DEK
        // recombination, and GCM opening. This is now the ONLY extraction path.
        if (verifiedManifest.share || verifiedManifest.shares || verifiedManifest.ec) {
            const ec = verifiedManifest.ec;
            const threshold = ec ? ec.k : (verifiedManifest.share ? verifiedManifest.share.threshold : verifiedManifest.shares[0].threshold);
            if (!ec || ec.k !== threshold) {
                return [null, new Error('Manifest is missing consistent erasure parameters for share mode.')];
            }

            // Unique key shares by index; same index must carry identical data.
            const sharesByIndex = new Map();
            for (const s of shares) {
                if (!s || !Number.isInteger(s.index) || typeof s.data !== 'string') {
                    return [null, new Error('Malformed key share detected.')];
                }
                const [shareBytes] = base64ToBytes(s.data);
                const existing = sharesByIndex.get(s.index);
                if (!existing) {
                    sharesByIndex.set(s.index, { index: s.index, data: shareBytes });
                } else if (existing.data.length !== shareBytes.length ||
                           existing.data.join() !== shareBytes.join()) {
                    return [null, new Error(`Conflicting key shares detected for share index ${s.index}.`) ];
                }
            }
            if (sharesByIndex.size < threshold) {
                return [null, new Error(
                    `Insufficient shares: ${sharesByIndex.size} unique across provided carriers, threshold is ${threshold}. Provide more carriers.`
                )];
            }

            // Unique coded stripes by chunk index; conflicting data rejected.
            const stripesByIndex = new Map();
            for (const c of chunks) {
                const existing = stripesByIndex.get(c.index);
                if (!existing) {
                    stripesByIndex.set(c.index, c);
                } else if (existing.checksum !== c.checksum ||
                           existing.data.join() !== c.data.join()) {
                    return [null, new Error(`Conflicting coded stripes detected for chunk index ${c.index}.`) ];
                }
            }
            if (stripesByIndex.size < ec.k) {
                return [null, new Error(
                    `Insufficient coded stripes: collected ${stripesByIndex.size} unique of ${ec.k} required blocks across ${imageFiles.length} carriers. Provide more carriers.`
                )];
            }

            const selected = Array.from(stripesByIndex.values()).sort((a, b) => a.index - b.index).slice(0, ec.k);
            const selectedShares = Array.from(sharesByIndex.values()).sort((a, b) => a.index - b.index).slice(0, ec.k);

            const { decodeErasure } = await import('../secret-sharing/cauchy-ec.js');
            const [envelopeBytes, decodeErr] = decodeErasure(
                selected.map(c => ({ index: c.index, data: c.data })),
                { k: ec.k, n: ec.n, size: ec.size }
            );
            if (decodeErr) return [null, new Error(`Erasure reconstruction failed: ${decodeErr.message}`)];

            const iv = envelopeBytes.slice(0, 12);
            const ciphertext = envelopeBytes.slice(12);
            const [plaintext, openErr] = await openEnvelope(
                { iv, ciphertext },
                selectedShares,
                { threshold, total: ec.n }
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
