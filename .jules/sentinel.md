## 2025-04-02 - Sentinel: Replaced Insecure UUID Generation

**Vulnerability:** UUIDs were being generated using `Math.random` in multiple locations including `app/vault.js`, `src/structures/vault/immutable-vault.js` and `src/information-theory/steganography/chunk-manager.js`. `Math.random` is not cryptographically secure and could lead to predictable IDs, which is a security risk in a system handling sensitive vaults and secure data.

**Learning:** `Math.random` was being used out of convenience for string manipulation to construct UUID-like formats instead of using the proper cryptographic API.

**Prevention:** Use `cryptoInstance.randomUUID()` to properly generate secure version 4 UUIDs instead of building custom random ID generation functions.
