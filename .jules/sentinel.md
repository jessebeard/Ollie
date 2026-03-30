## 2024-05-24 - [Insecure ID Generation]

**Vulnerability:** Weak, predictable ID generation using `Math.random()` in `PasswordVault` (both `app/vault.js` and `src/structures/vault/immutable-vault.js`) and `ChunkManager` (`src/information-theory/steganography/chunk-manager.js`). Attackers could potentially predict record IDs or chunk IDs, leading to potential collisions or state manipulation in distributed vaults.

**Learning:** Using `Math.random()` for security-critical identifiers is an anti-pattern as it is not a cryptographically secure pseudo-random number generator (CSPRNG).

**Prevention:** Always use `crypto.randomUUID()` or `crypto.getRandomValues()` from the Web Crypto API (imported securely via `src/information-theory/cryptography/crypto-compat.js` in this codebase) for generating unique IDs.
