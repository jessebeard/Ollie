## 2025-02-17 - [Insecure Randomness in Chunk Manager and Password Vault]

**Vulnerability:** The application used `Math.random()` to generate IDs for data chunks and password entries in `src/information-theory/steganography/chunk-manager.js` and `src/structures/vault/immutable-vault.js`.

**Learning:** `Math.random()` provides pseudorandom numbers that are cryptographically insecure, meaning they can be predicted by an attacker. For components like vaults and security chunks, generating predictable IDs could lead to deduplication issues, side-channel attacks, or enumeration vulnerabilities.

**Prevention:** Use cryptographically secure randomness via the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) for generating IDs and security keys to ensure randomness and unguessability.
