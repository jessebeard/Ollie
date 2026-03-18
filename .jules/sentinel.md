## 2024-05-18 - Insecure Random ID Generation

**Vulnerability:** Weak randomness in ID generation (`Math.random()`) in `PasswordVault.generateId()` and `ChunkManager.generateId()`.
**Learning:** `Math.random()` does not provide cryptographically secure pseudorandom number generation, leading to predictable and potentially guessable IDs. This is especially risky in security contexts like vaults and steganography chunking.
**Prevention:** Always utilize the Web Crypto API (`crypto.randomUUID()`, `crypto.getRandomValues()`) for generating secure unique identifiers, rather than relying on pseudo-random functions like `Math.random()`.
