## 2026-05-04 - Insecure Randomness in UUID/ID generation
**Vulnerability:** `Math.random()` is used to generate IDs in `app/vault.js`, `src/structures/vault/immutable-vault.js` and `src/information-theory/steganography/chunk-manager.js`.
**Learning:** This is cryptographically insecure and predictable, which can be an issue especially for generating secure session or object IDs.
**Prevention:** Use `crypto.randomUUID()` (available in both modern browsers and Node.js >= 14.17.0 natively or via `crypto` module webcrypto interface) or `crypto.getRandomValues()` to generate random values and IDs securely.
