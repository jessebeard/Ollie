## 2024-04-18 - [Fix Insecure ID Generation]

**Vulnerability:** Weak randomness used for unique ID generation (`Math.random()` instead of Web Crypto API) in PasswordVault and ChunkManager.

**Learning:** `Math.random()` is not cryptographically secure and can lead to ID collisions or allow attackers to predict IDs.

**Prevention:** Use `crypto.randomUUID()` (or equivalent polyfills) for secure unique ID generation. Added a test that asserts `Math.random` is not called and validates the output format as a UUID v4.
