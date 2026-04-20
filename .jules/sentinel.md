## 2024-05-18 - [Predictable Identifiers in Vault and Chunking]
 **Vulnerability:** Predictable `generateId()` implementations relying on `Math.random()` and sequential timestamp data were found in `ChunkManager`, `app/vault.js` and `immutable-vault.js`.
 **Learning:** Using `Math.random()` to generate security-sensitive identifiers (such as session chunks or vault records) is insecure and allows potential attackers to guess IDs and infer state.
 **Prevention:** Use the `crypto` or `webcrypto` API (`cryptoInstance.randomUUID()`) to generate cryptographically secure UUID v4 strings for all identifiers, avoiding `Math.random()`.
