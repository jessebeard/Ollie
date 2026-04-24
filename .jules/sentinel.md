## 2024-04-24 - Cryptographically Insecure ID Generation

**Vulnerability:** Found `Math.random()` being used to generate UUIDs/unique IDs in `src/information-theory/steganography/chunk-manager.js`, `src/structures/vault/immutable-vault.js` and `app/vault.js`.

**Learning:** `Math.random()` is not cryptographically secure and can be predicted, leading to potential collisions or ID guessing attacks.

**Prevention:** Use the Web Crypto API (`crypto.randomUUID()`) to generate secure identifiers instead.
