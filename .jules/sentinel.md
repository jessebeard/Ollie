## 2024-05-23 - Fix Weak Randomness in ID Generation

**Vulnerability:** Weak randomness using `Math.random()` for UUID generation in `PasswordVault` and `ChunkManager`.

**Learning:** `Math.random()` is not cryptographically secure and predictable, which could lead to ID collisions or allow an attacker to predict IDs, potentially causing data overwriting, unauthorized access or tracking in systems that rely on UUID uniqueness or unpredictability.

**Prevention:** Always use the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) for generating unique identifiers, tokens, and any security-sensitive random values.
