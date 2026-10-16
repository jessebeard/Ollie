import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { Encryption } from '../../src/information-theory/cryptography/aes-gcm.js';
import { importHmacKey, signBytes, verifyBytes } from '../../src/information-theory/cryptography/hmac.js';
import { deriveStegoKeys } from '../../src/information-theory/cryptography/kdf-chain.js';
import { totp } from '../../src/information-theory/cryptography/totp.js';

describe('Crypto Dedicated PBT Suite', () => {
    it('Property: AES-GCM encrypt -> decrypt roundtrip preserves arbitrary byte payloads', async () => {
        const rawKey = new Uint8Array(32);
        globalThis.crypto.getRandomValues(rawKey);
        const cryptoKey = await globalThis.crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);

        await assertProperty(
            [Arbitrary.byteArray(0, 256)],
            async (payload) => {
                const [enc, encErr] = await Encryption.encrypt(payload, cryptoKey);
                expect(encErr).toBe(null);
                expect(enc.ciphertext.byteLength).toBe(payload.length + 16);

                const [recovered, decErr] = await Encryption.decrypt(enc.ciphertext, cryptoKey, enc.iv);
                expect(decErr).toBe(null);
                expect(Array.from(recovered)).toEqual(Array.from(payload));

                // Ciphertext tampering must fail closed
                if (enc.ciphertext.byteLength > 0) {
                    const tamperedCt = new Uint8Array(enc.ciphertext);
                    tamperedCt[0] ^= 1;
                    const [tamperedRec, tamperErr] = await Encryption.decrypt(tamperedCt, cryptoKey, enc.iv);
                    expect(tamperedRec).toBe(null);
                    expect(tamperErr !== null).toBe(true);
                }
            },
            40
        );
    });

    it('Property: HMAC verification strictly rejects single-bit tampering of message or signature', async () => {
        const hmacKeyBytes = new Uint8Array(32);
        globalThis.crypto.getRandomValues(hmacKeyBytes);
        const [key, keyErr] = await importHmacKey(hmacKeyBytes);
        expect(keyErr).toBe(null);

        await assertProperty(
            [Arbitrary.byteArray(1, 64), Arbitrary.integer(0, 7)],
            async (msg, bitIdx) => {
                const [sig, sigErr] = await signBytes(key, msg);
                expect(sigErr).toBe(null);
                const [cleanValid] = await verifyBytes(key, msg, sig);
                expect(cleanValid).toBe(true);

                // Tamper random message byte
                const msgByteIdx = Math.floor(Math.random() * msg.length);
                const tamperedMsg = new Uint8Array(msg);
                tamperedMsg[msgByteIdx] ^= (1 << bitIdx);
                const [msgValid] = await verifyBytes(key, tamperedMsg, sig);
                expect(msgValid).toBe(false);

                // Tamper random signature byte
                const sigByteIdx = Math.floor(Math.random() * sig.length);
                const tamperedSig = new Uint8Array(sig);
                tamperedSig[sigByteIdx] ^= (1 << bitIdx);
                const [sigValid] = await verifyBytes(key, msg, tamperedSig);
                expect(sigValid).toBe(false);
            },
            30
        );
    });

    it('Property: KDF chain enforces domain separation and determinism across password inputs', async () => {
        await assertProperty(
            [Arbitrary.string(8, 20), Arbitrary.byteArray(16, 16)],
            async (password, salt) => {
                const [keys1, err1] = await deriveStegoKeys(password, salt, { memorySize: 64, passes: 1 });
                expect(err1).toBe(null);
                expect(keys1.aesKey.length).toBe(32);
                expect(keys1.stcSeed.length).toBe(32);
                expect(Array.from(keys1.aesKey)).not.toEqual(Array.from(keys1.stcSeed));

                // Determinism check: same password and salt must produce identical keys
                const [keys2, err2] = await deriveStegoKeys(password, salt, { memorySize: 64, passes: 1 });
                expect(err2).toBe(null);
                expect(Array.from(keys1.aesKey)).toEqual(Array.from(keys2.aesKey));
                expect(Array.from(keys1.stcSeed)).toEqual(Array.from(keys2.stcSeed));
            },
            15
        );
    });

    it('Property: TOTP code remains strictly invariant across any offset within the 30-second window', async () => {
        const key = new TextEncoder().encode('12345678901234567890');
        await assertProperty(
            [Arbitrary.integer(1000, 20000), Arbitrary.integer(0, 29)],
            async (step, secondOffset) => {
                const baseTimestamp = step * 30;
                const offsetTimestamp = baseTimestamp + secondOffset;

                const [codeA, errA] = await totp(key, { now: baseTimestamp });
                const [codeB, errB] = await totp(key, { now: offsetTimestamp });

                expect(errA).toBe(null);
                expect(errB).toBe(null);
                expect(codeA).toBe(codeB);
                expect(/^\d{6}$/.test(codeA)).toBe(true);

                // Boundary check: the subsequent 30-second window must advance
                const [codeNext, errNext] = await totp(key, { now: baseTimestamp + 30 });
                expect(errNext).toBe(null);
                expect(codeNext).not.toBe(codeA);
            },
            30
        );
    });
});
