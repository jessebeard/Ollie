## 2025-02-14 - Predictable PRNG used for sensitive ID generation

**Vulnerability:** Insecure, predictable ID generation using `Math.random()` and `Date.now()` was discovered in `app/vault.js`, `src/structures/vault/immutable-vault.js`, and `src/information-theory/steganography/chunk-manager.js`.

**Learning:** ID generation for password vaults and encrypted chunks must be resistant to collision and prediction. Relying on pseudo-random number generators like `Math.random()` inherently makes the generated keys or identifiers guessable, which degrades the security invariants of an encrypted steganography application.

**Prevention:** Always use cryptographically secure primitives from the Web Crypto API, such as `crypto.randomUUID()` or `crypto.getRandomValues()`, for any form of unique identifier or token generation in security-sensitive contexts.
