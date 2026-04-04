## 2024-04-04 - Insecure ID Generation

**Vulnerability:** `Math.random()` is used to generate IDs for vault entries and steganography chunk identifiers across `app/vault.js`, `src/structures/vault/immutable-vault.js` and `src/information-theory/steganography/chunk-manager.js`.

**Learning:** `Math.random()` is not cryptographically secure, and the resulting PRNG values can be predicted. It's often misused for unique identifier generation instead of `crypto.randomUUID()`.

**Prevention:** Always rely on Web Crypto APIs (or built-in `crypto` modules) for any form of unique ID generation related to secure contexts like vaults.
