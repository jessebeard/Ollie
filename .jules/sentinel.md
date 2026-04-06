## 2024-05-24 - [Insecure Randomness in ID Generation]
**Vulnerability:** `Math.random()` was used to generate UUIDs in `PasswordVault` and `ChunkManager`.
**Learning:** `Math.random()` is not cryptographically secure and can produce predictable values, weakening the security guarantees of generated IDs.
**Prevention:** Use `cryptoInstance.randomUUID()` from `src/information-theory/cryptography/crypto-compat.js` for all secure unique identifier generation instead of `Math.random()`.
