/**
 * Integration tests for the JpegEncoder.
 * These tests verify that the encoder produces valid JPEG structures (SOI, EOI markers)
 * and can handle different image sizes.
 */
import { describe, it, expect } from '../../test/utils/test-runner.js';
import { JpegEncoder } from '../../src/core/jpeg-encoder.js';

describe('JpegEncoder Integration', () => {
    it('encodes a small 8x8 white block without errors', () => {
        const width = 8;
        const height = 8;
        const data = new Uint8Array(width * height * 4);

        // Fill with white (255, 255, 255, 255)
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255;     // R
            data[i + 1] = 255; // G
            data[i + 2] = 255; // B
            data[i + 3] = 255; // A
        }

        const imageData = { width, height, data };
        const encoder = new JpegEncoder();
        const jpegBytes = encoder.encode(imageData);

        expect(jpegBytes).toBeDefined();
        expect(jpegBytes.length).toBeGreaterThan(0);

        // Check for SOI (FF D8)
        expect(jpegBytes[0]).toBe(0xFF);
        expect(jpegBytes[1]).toBe(0xD8);

        // Check for EOI (FF D9) at the end
        expect(jpegBytes[jpegBytes.length - 2]).toBe(0xFF);
        expect(jpegBytes[jpegBytes.length - 1]).toBe(0xD9);
    });

    it('encodes a 16x16 image (multiple blocks)', () => {
        const width = 16;
        const height = 16;
        const data = new Uint8Array(width * height * 4);

        // Fill with random data
        for (let i = 0; i < data.length; i++) {
            data[i] = i % 255;
        }

        const imageData = { width, height, data };
        const encoder = new JpegEncoder();
        const jpegBytes = encoder.encode(imageData);

        expect(jpegBytes.length).toBeGreaterThan(0);
        expect(jpegBytes[0]).toBe(0xFF);
        expect(jpegBytes[1]).toBe(0xD8);
        expect(jpegBytes[jpegBytes.length - 2]).toBe(0xFF);
        expect(jpegBytes[jpegBytes.length - 1]).toBe(0xD9);
    });

    it('encodes an image with odd dimensions (padding check)', () => {
        const width = 9;
        const height = 9;
        const data = new Uint8Array(width * height * 4).fill(128);

        const imageData = { width, height, data };
        const encoder = new JpegEncoder();
        const jpegBytes = encoder.encode(imageData);

        expect(jpegBytes.length).toBeGreaterThan(0);
        // Should contain markers
        expect(jpegBytes[0]).toBe(0xFF);
        expect(jpegBytes[1]).toBe(0xD8);
    });

    it('encodes a 1x1 image', () => {
        const width = 1;
        const height = 1;
        const data = new Uint8Array([255, 0, 0, 255]); // Red pixel

        const imageData = { width, height, data };
        const encoder = new JpegEncoder();
        const jpegBytes = encoder.encode(imageData);

        expect(jpegBytes.length).toBeGreaterThan(0);
    });

    it('encodes a rectangular image (non-square)', () => {
        const width = 20;
        const height = 10;
        const data = new Uint8Array(width * height * 4).fill(200);

        const imageData = { width, height, data };
        const encoder = new JpegEncoder();
        const jpegBytes = encoder.encode(imageData);

        expect(jpegBytes.length).toBeGreaterThan(0);
    });

    it('produces valid headers', () => {
        const width = 8;
        const height = 8;
        const data = new Uint8Array(width * height * 4).fill(0);
        const encoder = new JpegEncoder();
        const jpegBytes = encoder.encode({ width, height, data });

        // Check for specific markers
        // SOI: FF D8
        expect(jpegBytes[0]).toBe(0xFF);
        expect(jpegBytes[1]).toBe(0xD8);

        // Find SOF0 (FF C0)
        let foundSOF0 = false;
        for (let i = 0; i < jpegBytes.length - 1; i++) {
            if (jpegBytes[i] === 0xFF && jpegBytes[i + 1] === 0xC0) {
                foundSOF0 = true;
                break;
            }
        }
        expect(foundSOF0).toBe(true);

        // Find SOS (FF DA)
        let foundSOS = false;
        for (let i = 0; i < jpegBytes.length - 1; i++) {
            if (jpegBytes[i] === 0xFF && jpegBytes[i + 1] === 0xDA) {
                foundSOS = true;
                break;
            }
        }
        expect(foundSOS).toBe(true);
    });
});
