## 2024-05-18 - [Weak PRNG ID Generation]
 **Vulnerability:** Weak PRNG used for ID generation
 **Learning:** `Math.random()` was used for generating UUIDs inside `PasswordVault`, which is cryptographically insecure and produces predictable outputs.
 **Prevention:** For secure unique identifier generation, use `cryptoInstance.randomUUID()` imported from `src/information-theory/cryptography/crypto-compat.js`. Do not use `Math.random()` for generating IDs.
