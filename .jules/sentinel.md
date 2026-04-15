## 2025-02-20 - [Insecure Pseudo-Random Number Generation]

**Vulnerability:** The `ChunkManager` and `PasswordVault` classes were using `Math.random()` to generate Unique IDs. `Math.random()` is a cryptographically weak PRNG and is not suitable for generating secure IDs, making them predictable.

**Learning:** When creating unique identifiers for secure contexts (like vault IDs or chunk IDs for steganography), predictable randomness can lead to collisions or guessing attacks. `Math.random()` should never be used for security-critical ID generation.

**Prevention:** Always use a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG), such as `crypto.randomUUID()` in Node.js/Browsers, to generate unique identifiers in security-sensitive applications.
