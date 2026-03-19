## 2024-05-20 - Replace Insecure Math.random for ID Generation

**Vulnerability:** Weak Randomness used for ID generation (`Math.random()`) in `ChunkManager` and `PasswordVault`.

**Learning:** `Math.random()` generates predictable values. Using it to generate critical IDs (like vault IDs or chunk IDs) can make them guessable, potentially allowing an attacker to exploit the steganography protocol or predict entries.

**Prevention:** Use Web Crypto APIs like `crypto.randomUUID()` or `crypto.getRandomValues()` instead of `Math.random()` anywhere random identifiers or cryptographic primitives are required.
