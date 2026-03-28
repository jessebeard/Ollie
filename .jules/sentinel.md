## 2024-03-28 - Insecure Randomness in ID Generation

**Vulnerability:** ID generation in `PasswordVault` (src/structures/vault/immutable-vault.js and app/vault.js) and `ChunkManager` (src/information-theory/steganography/chunk-manager.js) uses `Math.random()`. `Math.random()` is not cryptographically secure, leading to predictable IDs which can be exploited for tracking, prediction, or collision attacks.

**Learning:** Any identifier generation in a security-focused application should rely on secure entropy sources (Web Crypto API) rather than pseudo-random number generators meant for statistical purposes.

**Prevention:** Use `crypto.randomUUID()` or `crypto.getRandomValues()` for generating all IDs, salts, and tokens.
