## 2025-02-09 - Fix Insecure ID Generation

**Vulnerability:** Used `Math.random()` for generating UUID-like identifiers in `app/vault.js`, `src/structures/vault/immutable-vault.js`, and `src/information-theory/steganography/chunk-manager.js`.

**Learning:** `Math.random()` is not cryptographically secure and can lead to predictable IDs, ID collisions, or guessing attacks. This is specifically dangerous for objects like Vault entries or steganography chunks.

**Prevention:** Always use `cryptoInstance.randomUUID()` (or a webcrypto equivalent) for secure identifier generation instead of rolling custom logic using `Date.now()` and `Math.random()`.
