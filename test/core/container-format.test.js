import { describe, it, expect } from '../utils/test-runner.js';
import { ContainerFormat, FLAGS } from '../../src/core/steganography/container-format.js';

describe('ContainerFormat', () => {
    describe('encode/decode roundtrip', () => {
        it('should encode and decode simple data', () => {
            const data = new TextEncoder().encode('Hello, World!');
            const metadata = { filename: 'test.txt', contentType: 'text/plain' };

            const container = ContainerFormat.encode(data, metadata);
            const decoded = ContainerFormat.decode(container);

            expect(decoded.data).toEqual(data);
            expect(decoded.metadata.filename).toBe('test.txt');
            expect(decoded.metadata.contentType).toBe('text/plain');
            expect(decoded.flags).toBe(0);
            expect(decoded.version).toBe(1);
        });

        it('should handle empty data', () => {
            const data = new Uint8Array(0);
            const metadata = { note: 'empty file' };

            const container = ContainerFormat.encode(data, metadata);
            const decoded = ContainerFormat.decode(container);

            expect(decoded.data.length).toBe(0);
            expect(decoded.metadata.note).toBe('empty file');
        });

        it('should handle empty metadata', () => {
            const data = new TextEncoder().encode('Data without metadata');

            const container = ContainerFormat.encode(data, {});
            const decoded = ContainerFormat.decode(container);

            expect(decoded.data).toEqual(data);
            expect(Object.keys(decoded.metadata).length).toBe(0);
        });

        it('should preserve flags', () => {
            const data = new Uint8Array([1, 2, 3]);
            const flags = FLAGS.ENCRYPTED | FLAGS.CHUNKED;

            const container = ContainerFormat.encode(data, {}, flags);
            const decoded = ContainerFormat.decode(container);

            expect(decoded.flags).toBe(flags);
            expect(decoded.flags & FLAGS.ENCRYPTED).toBeTruthy();
            expect(decoded.flags & FLAGS.CHUNKED).toBeTruthy();
            expect(decoded.flags & FLAGS.COMPRESSED).toBe(0);
        });
    });

    describe('metadata handling', () => {
        it('should handle complex metadata', () => {
            const data = new Uint8Array([42]);
            const metadata = {
                filename: 'secure.dat',
                contentType: 'application/octet-stream',
                created: 1701234567890,
                encryption: {
                    algorithm: 'AES-GCM',
                    salt: 'base64-salt',
                    iv: 'base64-iv'
                },
                chunk: {
                    id: 'uuid-1234',
                    index: 0,
                    total: 3
                }
            };

            const container = ContainerFormat.encode(data, metadata);
            const decoded = ContainerFormat.decode(container);

            expect(decoded.metadata.filename).toBe('secure.dat');
            expect(decoded.metadata.encryption.algorithm).toBe('AES-GCM');
            expect(decoded.metadata.chunk.total).toBe(3);
        });

        it('should reject metadata that is too large', () => {
            const data = new Uint8Array([1]);
            const hugeMetadata = { data: 'x'.repeat(70000) }; // > 65535 bytes when JSON encoded

            expect(() => {
                ContainerFormat.encode(data, hugeMetadata);
            }).toThrow(/Metadata too large/);
        });
    });

    describe('CRC32 integrity', () => {
        it('should detect corrupted data', () => {
            const data = new TextEncoder().encode('Original data');
            const container = ContainerFormat.encode(data, {});

            // Corrupt a byte in the payload
            container[container.length - 10] ^= 0xFF;

            expect(() => {
                ContainerFormat.decode(container);
            }).toThrow(/CRC mismatch/);
        });

        it('should detect corrupted metadata', () => {
            const data = new Uint8Array([1, 2, 3]);
            const metadata = { test: 'value' };
            const container = ContainerFormat.encode(data, metadata);

            // Corrupt a byte in the metadata section (after header)
            container[10] ^= 0xFF;

            expect(() => {
                ContainerFormat.decode(container);
            }).toThrow(/CRC mismatch/);
        });
    });

    describe('error handling', () => {
        it('should reject containers that are too small', () => {
            const tooSmall = new Uint8Array(5);

            expect(() => {
                ContainerFormat.decode(tooSmall);
            }).toThrow(/Container too small/);
        });

        it('should reject invalid magic bytes', () => {
            const invalid = new Uint8Array(20);
            invalid[0] = 0x00; // Wrong magic

            expect(() => {
                ContainerFormat.decode(invalid);
            }).toThrow(/Invalid magic bytes/);
        });

        it('should reject unsupported version', () => {
            const data = new Uint8Array([1, 2, 3]);
            let container = ContainerFormat.encode(data, {});

            // Change version byte (after magic bytes)
            container[4] = 99; // Unsupported version

            // Also need to fix CRC for this specific corruption
            const crc = ContainerFormat.crc32(container.subarray(0, container.length - 4));
            container[container.length - 4] = (crc >> 24) & 0xFF;
            container[container.length - 3] = (crc >> 16) & 0xFF;
            container[container.length - 2] = (crc >> 8) & 0xFF;
            container[container.length - 1] = crc & 0xFF;

            expect(() => {
                ContainerFormat.decode(container);
            }).toThrow(/Unsupported version/);
        });

        it('should reject truncated containers', () => {
            const data = new TextEncoder().encode('Full data here');
            const container = ContainerFormat.encode(data, { test: 'meta' });

            // Truncate the container
            const truncated = container.subarray(0, container.length - 10);

            expect(() => {
                ContainerFormat.decode(truncated);
            }).toThrow(/Container truncated/);
        });
    });

    describe('isContainer', () => {
        it('should detect valid containers', () => {
            const data = new Uint8Array([1, 2, 3]);
            const container = ContainerFormat.encode(data, {});

            expect(ContainerFormat.isContainer(container)).toBe(true);
        });

        it('should reject non-containers', () => {
            const notContainer = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

            expect(ContainerFormat.isContainer(notContainer)).toBe(false);
        });

        it('should handle data that is too small', () => {
            const tooSmall = new Uint8Array(2);

            expect(ContainerFormat.isContainer(tooSmall)).toBe(false);
        });
    });

    describe('large data', () => {
        it('should handle large payloads', () => {
            // Create 1MB of data
            const largeData = new Uint8Array(1024 * 1024);
            for (let i = 0; i < largeData.length; i++) {
                largeData[i] = i & 0xFF;
            }

            const metadata = { size: largeData.length };
            const container = ContainerFormat.encode(largeData, metadata);
            const decoded = ContainerFormat.decode(container);

            expect(decoded.data.length).toBe(largeData.length);
            expect(decoded.data).toEqual(largeData);
        });
    });
});
