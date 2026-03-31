
## $(date +%Y-%m-%d) - Secure Unique Identifier Generation

**Vulnerability:** Weak, predictable random number generation used for unique IDs. `Math.random().toString(36)` was used in `app/vault.js`, `src/structures/vault/immutable-vault.js`, and `src/information-theory/steganography/chunk-manager.js` to generate supposedly unique identifiers.

**Learning:** `Math.random()` in JavaScript is not cryptographically secure and can be predictable, potentially leading to ID collisions or enabling attackers to guess generated IDs in a secure context like a password vault.

**Prevention:** Always use the Web Crypto API `crypto.randomUUID()` (or `cryptoInstance.randomUUID()` in this project via `crypto-compat.js`) for generating secure unique identifiers instead of rolling custom generators based on `Math.random()`. Added tests that mock `Math.random` to assert it is never called during ID generation.
