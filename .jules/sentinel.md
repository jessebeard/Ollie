## 2025-02-13 - Insecure Randomness in UUID/ID generation

**Vulnerability:** Found `Math.random` being used to generate unique IDs (`generateId()`) in `src/information-theory/steganography/chunk-manager.js`, `src/structures/vault/immutable-vault.js`, and `app/vault.js`.
**Learning:** `Math.random()` is not cryptographically secure, which means generated IDs could be predictable. It is used here to generate identifiers and UUID-like strings.
**Prevention:** Always use the globally available Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) for generating secure IDs, especially within security-sensitive contexts.
