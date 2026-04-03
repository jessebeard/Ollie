# Sentinel Learnings

## 2024-05-18 - Insecure Identifier Generation

**Vulnerability:** `Math.random` was being used to generate UUID-like IDs in both `ChunkManager.generateId()` and `PasswordVault.generateId()`. `Math.random` is an insecure pseudo-random number generator (PRNG) and its outputs are highly predictable, which can lead to ID collisions or allow attackers to guess generated chunk and vault identifiers.

**Learning:** When developing software that generates random IDs for sensitive data structures (like steganography chunk linking and password vault entries), secure PRNGs must be used. `Math.random` is for non-critical pseudo-randomness, not security-sensitive context.

**Prevention:** Always use the Web Crypto API, specifically `crypto.randomUUID()` (in this project, `cryptoInstance.randomUUID()` via the `crypto-compat.js` wrapper) when creating UUIDs or identifiers that require cryptographic randomness to prevent predictability and collisions.
