## 2024-04-01 - Insecure ID Generation using Math.random()

**Vulnerability:** Weak randomness using `Math.random()` in `PasswordVault.generateId()`, `app/vault.js generateId()`, and `ChunkManager.generateId()`. `Math.random()` is cryptographically insecure and predictable, which could allow attackers to predict IDs.

**Learning:** `Math.random()` should never be used for security-sensitive unique identifiers, as it does not generate true randomness and its seed can sometimes be deduced. The project has a compatible crypto library in `crypto-compat.js` which provides `randomUUID()`, the correct mechanism.

**Prevention:** Always use `crypto.randomUUID()` (or a webcrypto polyfill equivalent) for generating unique IDs, especially in secure contexts like Password Vault entries or chunk IDs.
