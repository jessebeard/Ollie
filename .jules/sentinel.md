## 2023-10-27 - [Medium] Fix insecure ID generation

**Vulnerability:** Weak randomness from `Math.random()` was used to generate vault entry IDs and chunk IDs, which can lead to predictability and potential ID collisions.
**Learning:** `Math.random()` is cryptographically insecure and should not be used for ID generation in a security context.
**Prevention:** Use `crypto.randomUUID()` provided by the Web Crypto API.