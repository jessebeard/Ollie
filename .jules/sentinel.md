## 2024-05-20 - Insecure random identifier generation

**Vulnerability:** Found `Math.random()` being used to generate IDs in `src/structures/vault/immutable-vault.js` and `app/vault.js`, and also in `src/information-theory/steganography/chunk-manager.js`. Using `Math.random()` is not cryptographically secure and can lead to predictable IDs, potentially compromising identifier unpredictability or uniqueness guarantees.

**Learning:** `Math.random()` is not cryptographically secure, and shouldn't be used for anything where randomness is important for security, such as unique identifiers. The project already has a Web Crypto API wrapper `cryptoInstance` that exposes a `randomUUID()` function that should be used instead.

**Prevention:** Always use `crypto.randomUUID()` or `crypto.getRandomValues()` for generating random identifiers, tokens, or UUIDs instead of `Math.random()`.
