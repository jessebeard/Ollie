## 2024-05-24 - Secure ID Generation
**Vulnerability:** Use of predictable, non-cryptographic `Math.random()` to generate IDs and UUIDs across security-sensitive components (`app/vault.js`, `ChunkManager`, `ImmutableVault`).
**Learning:** `Math.random()` is cryptographically weak, exposing the application to predictable IDs which can be guessed or forced into collisions.
**Prevention:** Always use the globally available Web Crypto API (`crypto.randomUUID()`) or the project compatibility wrapper (`cryptoInstance.randomUUID()`) for generating secure, unique identifiers.
