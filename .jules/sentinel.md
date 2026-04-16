
## 2024-05-20 - Insecure Randomness in UUID generation

**Vulnerability:** The application used `Math.random()` to generate UUIDs in `PasswordVault` and `ChunkManager`. `Math.random()` is not cryptographically secure and could lead to predictable IDs, allowing attackers to guess object references.

**Learning:** `Math.random()` was chosen due to browser-compatibility convenience instead of using standard web APIs.

**Prevention:** Always use `crypto.randomUUID()` for unique identifiers. Use `cryptoInstance` wrapper from `crypto-compat.js` for environment-independent secure randomness.
