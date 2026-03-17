## 2024-05-18 - Fix weak randomness in ID generation

**Vulnerability:** Vault Entry IDs and Chunk Manager IDs were generated using `Math.random()` and `Date.now()`. `Math.random()` uses weak pseudo-random number generators (PRNG) which are not cryptographically secure, and predictable. This allows an attacker to predict generated IDs, leading to potential collisions, unauthorized access, or manipulation.

**Learning:** When developing secure systems, especially involving cryptography, file structures, and unique identifiers, always use Cryptographically Secure Pseudo-Random Number Generators (CSPRNGs) like the Web Crypto API's `crypto.randomUUID()` or `crypto.getRandomValues()`. `Math.random()` is only suitable for non-security operations like basic simulations or UI animations.

**Prevention:** To avoid this in the future, adhere to the established project convention: utilize `cryptoInstance` from `src/information-theory/cryptography/crypto-compat.js` for all random generation needs across environments. Enforce linting rules that flag or block `Math.random()` usage in security-sensitive scopes.
