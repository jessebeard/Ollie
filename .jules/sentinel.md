## 2025-04-21 - [Insecure ID Generation]

**Vulnerability:** Found insecure ID generation relying on `Math.random()` in three locations (`app/vault.js`, `src/structures/vault/immutable-vault.js`, and `src/information-theory/steganography/chunk-manager.js`). This makes generated IDs predictable.

**Learning:** This existed because `Math.random()` is not cryptographically secure and was used for ID generation out of convenience instead of using standard UUIDs which are much more secure against collisions and predictability.

**Prevention:** To avoid this next time, always use the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) when generating unique IDs, session identifiers, or tokens, rather than relying on pseudo-random functions like `Math.random()`.
