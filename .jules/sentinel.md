## 2024-05-24 - [Insecure ID Generation]

**Vulnerability:** Weak randomness in ID Generation (`Math.random()`)

**Learning:** `Math.random()` was being used for generating unique IDs in `ChunkManager.generateId()` and `PasswordVault.generateId()`. `Math.random()` is not cryptographically secure, and the outputs can be predicted or lead to collisions, breaking uniqueness guarantees or potentially allowing an attacker to predict IDs in an adversarial environment.

**Prevention:** Always use the Web Crypto API, specifically `crypto.randomUUID()` or `crypto.getRandomValues()` for unique identifiers. The fix uses `cryptoInstance.randomUUID()` imported from `src/information-theory/cryptography/crypto-compat.js` for secure and cross-environment generation.