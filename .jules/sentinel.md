
## 2024-05-24 - [Insecure PRNG for UUID Generation]
 **Vulnerability:** Predictable UUID generation using `Math.random()` in `app/vault.js`, `src/information-theory/steganography/chunk-manager.js`, and `src/structures/vault/immutable-vault.js`.
 **Learning:** Developers commonly fall back to `Math.random()` for unique ID generation without realizing the security implications, especially in cryptographic or access control contexts where predictability leads to collision or bypass vulnerabilities.
 **Prevention:** Enforce the use of standard Web Crypto API functions (`crypto.randomUUID()`) for ID generation across the codebase. Implement tests that mock `Math.random()` to assert it is never called during ID creation.
