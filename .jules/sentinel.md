## 2024-04-28 - Insecure ID Generation via Math.random()

**Vulnerability:** The functions `generateId()` in `app/vault.js`, `src/structures/vault/immutable-vault.js` and `ChunkManager.generateId()` use `Math.random()` to generate IDs / UUIDs. `Math.random()` is not cryptographically secure and the generated values can be predicted.
**Learning:** `Math.random()` is widely known to be a pseudo-random number generator that is not suitable for cryptographic purposes or for generating secure identifiers. The project already has `cryptoInstance` available from `src/information-theory/cryptography/crypto-compat.js` which provides `crypto.randomUUID()`.
**Prevention:** Always use the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) for generating secure random values and identifiers.
